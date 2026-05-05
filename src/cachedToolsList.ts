// FastMCP's default tools/list handler runs toJsonSchema() for every tool on every request.
// Hosts that poll tools/list frequently (or many concurrent sessions) then burn a full CPU core.
// We precompute the list once before stdio connects, then replace the handler to return that snapshot.

import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FastMCP } from 'fastmcp';
import { toJsonSchema } from 'xsschema';
import { logger } from './logger.js';

type AddToolArg = Parameters<FastMCP['addTool']>[0];

export function collectToolsWhileRegistering(server: FastMCP, out: AddToolArg[]): void {
  const add = server.addTool.bind(server);
  (server as unknown as { addTool: (tool: AddToolArg) => void }).addTool = (tool) => {
    out.push(tool);
    add(tool);
  };
}

export async function buildCachedToolsListPayload(tools: AddToolArg[]) {
  return {
    tools: await Promise.all(
      tools.map(async (tool) => ({
        annotations: tool.annotations,
        description: tool.description,
        inputSchema: tool.parameters
          ? await toJsonSchema(tool.parameters)
          : {
              additionalProperties: false,
              properties: {},
              type: 'object' as const,
            },
        name: tool.name,
      }))
    ),
  };
}

export function installCachedToolsListHandler(
  server: FastMCP,
  listPayload: Awaited<ReturnType<typeof buildCachedToolsListPayload>>
): void {
  const session = server.sessions[0];
  if (!session) {
    logger.warn('No MCP session; skipping tools/list cache install.');
    return;
  }

  session.server.setRequestHandler(ListToolsRequestSchema, async () => listPayload);
  logger.debug(`Installed cached tools/list (${listPayload.tools.length} tools).`);
}
