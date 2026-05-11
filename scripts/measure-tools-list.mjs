#!/usr/bin/env node
// Measures the token cost of the tools/list payload.
// Usage:
//   node scripts/measure-tools-list.mjs
//   GOOGLE_MCP_SCOPES=docs node scripts/measure-tools-list.mjs
//   MCP_LAZY_TOOLS=1 node scripts/measure-tools-list.mjs

import { FastMCP } from 'fastmcp';
import {
  buildCachedToolsListPayload,
  collectToolsWhileRegistering,
} from '../dist/cachedToolsList.js';
import { registerAllTools } from '../dist/tools/index.js';
import { finalizeLazyMode, isLazyModeEnabled, startLazyCapture } from '../dist/lazyMode.js';

const server = new FastMCP({ name: 'measure', version: '0.0.0' });
const collected = [];
collectToolsWhileRegistering(server, collected);

const lazy = isLazyModeEnabled();
let underlyingCount = 0;
if (lazy) {
  const realAddTool = server.addTool.bind(server);
  const registry = startLazyCapture(server);
  registerAllTools(server);
  underlyingCount = registry.all.length;
  finalizeLazyMode(server, registry, realAddTool);
} else {
  registerAllTools(server);
}

const payload = await buildCachedToolsListPayload(collected);
const json = JSON.stringify(payload);
const bytes = Buffer.byteLength(json, 'utf8');
const approxTokens = Math.ceil(bytes / 4);

console.log(`Mode: ${lazy ? 'lazy' : 'eager'}`);
if (lazy) console.log(`Underlying tools (hidden): ${underlyingCount}`);
console.log(`Tools exposed in tools/list: ${payload.tools.length}`);
console.log(`Payload bytes: ${bytes.toLocaleString()}`);
console.log(`~Tokens (bytes/4): ${approxTokens.toLocaleString()}`);

const byTotal = [...payload.tools]
  .map((t) => ({
    name: t.name,
    totalBytes: Buffer.byteLength(JSON.stringify(t), 'utf8'),
    descBytes: Buffer.byteLength(t.description ?? '', 'utf8'),
  }))
  .sort((a, b) => b.totalBytes - a.totalBytes)
  .slice(0, 10);

console.log('\nTop 10 total (desc + schema) sizes (bytes):');
for (const t of byTotal)
  console.log(
    `  ${String(t.totalBytes).padStart(5)} (${String(t.descBytes).padStart(4)} desc) ${t.name}`
  );

process.exit(0);
