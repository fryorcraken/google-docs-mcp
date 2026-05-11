// src/lazyMode.ts
//
// Opt-in lazy tool discovery. When `MCP_LAZY_TOOLS=1` is set, the
// server exposes only three meta-tools (searchTools, describeTool,
// callTool) at MCP's tools/list. The ~128 real tools are captured into
// an in-memory registry and reachable only via callTool.
//
// Why: tools/list ships every tool's full Zod-derived JSON schema to
// the model on session init. At 128 tools that is ~32k tokens of
// passive context — paid even when the agent never touches the MCP.
// Lazy mode drops that to ~1-2k tokens, at the cost of one extra
// round-trip when the model needs to invoke a tool.

import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { toJsonSchema } from 'xsschema';
import { logger } from './logger.js';

type AddToolArg = Parameters<FastMCP['addTool']>[0];
type ExecuteFn = NonNullable<AddToolArg['execute']>;

export interface CapturedTool {
  name: string;
  description?: string;
  parameters?: AddToolArg['parameters'];
  annotations?: AddToolArg['annotations'];
  execute: ExecuteFn;
  /** Domain bucket (docs, sheets, drive, gmail, calendar, slides, utils). */
  domain: string;
}

export interface LazyRegistry {
  byName: Map<string, CapturedTool>;
  /** Insertion order — searchTools returns results in this order. */
  all: CapturedTool[];
}

const wrappedServers = new WeakSet<FastMCP>();

/**
 * Returns true when the env var is set to anything truthy.
 * Accepts `1`, `true`, `yes`, `on` (case-insensitive). Empty/unset = off.
 */
export function isLazyModeEnabled(
  envValue: string | undefined = process.env.MCP_LAZY_TOOLS
): boolean {
  if (!envValue) return false;
  const v = envValue.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Replaces `server.addTool` with a capture function. Until you call
 * {@link finalizeLazyMode}, every `addTool` call lands in the registry
 * instead of the real server.
 *
 * Domain tagging: call {@link setCurrentDomain} before invoking a
 * domain's `register(server)` function so captured tools get a domain
 * label for searchTools filtering.
 */
export function startLazyCapture(server: FastMCP): LazyRegistry {
  if (wrappedServers.has(server)) {
    throw new Error('startLazyCapture: server already wrapped.');
  }
  wrappedServers.add(server);

  const registry: LazyRegistry = { byName: new Map(), all: [] };
  (server as unknown as { addTool: (tool: AddToolArg) => void }).addTool = (tool: AddToolArg) => {
    if (!tool.execute) {
      // Tools without execute can't be invoked via callTool. We still
      // capture them so describeTool shows them, but mark with a stub.
      logger.warn(`Lazy mode: tool ${tool.name} has no execute fn; calls will fail.`);
    }
    const captured: CapturedTool = {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      annotations: tool.annotations,
      execute:
        tool.execute ??
        (async () => {
          throw new UserError(`Tool ${tool.name} is not executable.`);
        }),
      domain: currentDomain ?? 'unknown',
    };
    if (registry.byName.has(captured.name)) {
      logger.warn(`Lazy mode: duplicate tool name "${captured.name}"; overwriting.`);
    }
    registry.byName.set(captured.name, captured);
    registry.all.push(captured);
  };

  return registry;
}

let currentDomain: string | undefined;

/**
 * Sets the domain label applied to subsequent `addTool` captures.
 * Wrap each domain's `register(server)` call with this so tools get
 * the right `docs` / `sheets` / `drive` / ... label.
 */
export function setCurrentDomain(domain: string | undefined): void {
  currentDomain = domain;
}

/**
 * After all domain registrations have run, call this to register the
 * three lazy meta-tools (searchTools, describeTool, callTool) on the
 * real server. We unwrap the captured addTool first so these go
 * through normally and become visible in tools/list.
 */
export function finalizeLazyMode(
  server: FastMCP,
  registry: LazyRegistry,
  outerAddTool: FastMCP['addTool']
): void {
  (server as unknown as { addTool: typeof outerAddTool }).addTool = outerAddTool;

  outerAddTool({
    name: 'searchTools',
    description:
      `Search the ${registry.all.length} hidden tools by keyword or domain. ` +
      `Returns matching tool names, one-line descriptions, and domains. ` +
      `Call describeTool to get a tool's parameter schema, then callTool to invoke it. ` +
      `Domains: docs, sheets, drive, gmail, calendar, slides, utils.`,
    parameters: z.object({
      query: z
        .string()
        .optional()
        .describe(
          'Keyword to match against tool name and description. Case-insensitive substring match. Omit to list all tools.'
        ),
      domain: z
        .string()
        .optional()
        .describe('Filter by domain: docs, sheets, drive, gmail, calendar, slides, utils.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(30)
        .describe('Maximum number of results to return.'),
    }),
    execute: async (args) => {
      const q = args.query?.toLowerCase().trim();
      const domain = args.domain?.toLowerCase().trim();
      const limit = args.limit ?? 30;

      const matches = registry.all.filter((t) => {
        if (domain && t.domain !== domain) return false;
        if (q) {
          const hay = `${t.name} ${t.description ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const truncated = matches.length > limit;
      const slice = matches.slice(0, limit);
      const lines = slice.map((t) => `- ${t.name} [${t.domain}] — ${oneLine(t.description)}`);
      const header = `${matches.length} match${matches.length === 1 ? '' : 'es'}${truncated ? ` (showing first ${limit})` : ''}.`;
      return `${header}\n${lines.join('\n')}`;
    },
  });

  outerAddTool({
    name: 'describeTool',
    description:
      'Returns the full description and parameter JSON Schema for one hidden tool by name. ' +
      'Use this after searchTools to learn how to call a specific tool, then invoke it via callTool.',
    parameters: z.object({
      name: z.string().describe('Tool name as returned by searchTools (e.g. "insertText").'),
    }),
    execute: async (args) => {
      const tool = registry.byName.get(args.name);
      if (!tool) {
        const hint = nearestNames(
          args.name,
          registry.all.map((t) => t.name)
        );
        throw new UserError(
          `Unknown tool "${args.name}".${hint.length ? ` Did you mean: ${hint.join(', ')}?` : ''} ` +
            `Use searchTools to find tool names.`
        );
      }
      const schema = tool.parameters
        ? await toJsonSchema(tool.parameters as any)
        : { type: 'object', properties: {}, additionalProperties: false };
      return JSON.stringify(
        {
          name: tool.name,
          domain: tool.domain,
          description: tool.description,
          inputSchema: schema,
        },
        null,
        2
      );
    },
  });

  outerAddTool({
    name: 'callTool',
    description:
      'Invokes a hidden tool by name with the given arguments. ' +
      "Use describeTool first to learn the tool's parameter schema. " +
      "Arguments are passed through unchanged; the tool's own schema validates them.",
    parameters: z.object({
      name: z.string().describe('Tool name as returned by searchTools.'),
      args: z
        .record(z.string(), z.any())
        .optional()
        .default({})
        .describe(
          "Arguments object matching the tool's inputSchema (see describeTool). Pass {} for no args."
        ),
    }),
    execute: async (input, ctx) => {
      const tool = registry.byName.get(input.name);
      if (!tool) {
        const hint = nearestNames(
          input.name,
          registry.all.map((t) => t.name)
        );
        throw new UserError(
          `Unknown tool "${input.name}".${hint.length ? ` Did you mean: ${hint.join(', ')}?` : ''} ` +
            `Use searchTools to find tool names.`
        );
      }
      // Validate args against the tool's Zod schema so callers get the
      // same error surface as a direct tool call would.
      let parsed: any = input.args ?? {};
      if (tool.parameters && typeof (tool.parameters as any).safeParse === 'function') {
        const result = (tool.parameters as any).safeParse(parsed);
        if (!result.success) {
          throw new UserError(
            `Invalid arguments for "${tool.name}": ${result.error.message}. ` +
              `Use describeTool("${tool.name}") to see the expected schema.`
          );
        }
        parsed = result.data;
      }
      return tool.execute(parsed, ctx);
    },
  });

  logger.info(
    `Lazy mode active: 3 meta-tools exposed, ${registry.all.length} real tools hidden behind callTool.`
  );
}

function oneLine(s: string | undefined): string {
  if (!s) return '';
  // Collapse to a single line and truncate so searchTools output stays
  // grep-able even if a tool ships a multi-paragraph description.
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? flat.slice(0, 137) + '...' : flat;
}

/**
 * Cheap Levenshtein-ish typo helper for "did you mean" hints. Returns
 * up to 3 close matches by simple prefix/substring overlap — good
 * enough for the common cases (typo, wrong case) without pulling a
 * fuzzy-matching dep.
 */
function nearestNames(query: string, all: string[]): string[] {
  const q = query.toLowerCase();
  const scored = all
    .map((name) => {
      const lower = name.toLowerCase();
      if (lower === q) return { name, score: 100 };
      if (lower.startsWith(q) || q.startsWith(lower)) return { name, score: 50 };
      if (lower.includes(q) || q.includes(lower)) return { name, score: 25 };
      return { name, score: 0 };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map((s) => s.name);
}
