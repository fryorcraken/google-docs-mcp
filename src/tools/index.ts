// src/tools/index.ts
import type { FastMCP } from 'fastmcp';
import { ALL_DOMAINS, parseEnabledDomains } from '../scopeConfig.js';
import { logger } from '../logger.js';

/**
 * Registers tools for every domain enabled by `GOOGLE_MCP_SCOPES` (or
 * every domain when the env var is unset).
 *
 * The scope-domain registry lives in `src/scopeConfig.ts` so that both
 * the OAuth flow (`src/auth.ts`) and tool registration here stay in
 * lockstep — request a scope iff register that domain's tools.
 */
export function registerAllTools(server: FastMCP) {
  const enabled = parseEnabledDomains(process.env.GOOGLE_MCP_SCOPES);
  for (const domain of enabled) {
    ALL_DOMAINS[domain].register(server);
  }
  if (process.env.GOOGLE_MCP_SCOPES?.trim()) {
    logger.info(`Tool registration limited via GOOGLE_MCP_SCOPES=${enabled.join(',')}`);
  }
}
