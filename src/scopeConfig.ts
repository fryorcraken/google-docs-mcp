// src/scopeConfig.ts
//
// Maps user-facing "domain" names (docs, drive, sheets, slides, gmail,
// calendar) to:
//   1. The OAuth scope strings the server should request on auth.
//   2. The tool-registration function to call at server startup.
//
// Default behavior (env unset): all domains are enabled — backward
// compatible with the pre-`GOOGLE_MCP_SCOPES` setup.
//
// Setting `GOOGLE_MCP_SCOPES=docs,drive` opts into a least-privilege
// posture: the OAuth flow requests only those scopes, and only those
// tools are registered. Users who don't need Gmail/Calendar/Slides
// access don't have to enable those APIs in their Cloud project or
// grant their write scopes.
import type { FastMCP } from 'fastmcp';
import { registerDocsTools } from './tools/docs/index.js';
import { registerDriveTools } from './tools/drive/index.js';
import { registerSheetsTools } from './tools/sheets/index.js';
import { registerUtilsTools } from './tools/utils/index.js';
import { registerGmailTools } from './tools/gmail/index.js';
import { registerCalendarTools } from './tools/calendar/index.js';
import { registerSlidesTools } from './tools/slides/index.js';

export interface DomainConfig {
  /** OAuth scope strings to request when this domain is enabled. */
  scopes: string[];
  /** Registers this domain's tools with the FastMCP server. */
  register: (server: FastMCP) => void;
}

/**
 * Authoritative registry of every domain the server supports.
 *
 * `script.external_request` is bundled under `docs` because the only
 * caller (insertImage's Apps Script integration) is a Docs feature.
 * - Opting OUT of `docs` also drops the Apps Script scope.
 * - Opting INTO `docs` always grants the Apps Script scope, even if
 *   the caller never uses local-image insertion. If you need
 *   docs-without-script, file an issue and we'll consider splitting
 *   `appsScript` as its own optional domain.
 */
export const ALL_DOMAINS: Record<string, DomainConfig> = {
  docs: {
    scopes: [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/script.external_request',
    ],
    register: (server) => {
      registerDocsTools(server);
      registerUtilsTools(server);
    },
  },
  drive: {
    scopes: ['https://www.googleapis.com/auth/drive'],
    register: registerDriveTools,
  },
  sheets: {
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    register: registerSheetsTools,
  },
  slides: {
    scopes: ['https://www.googleapis.com/auth/presentations'],
    register: registerSlidesTools,
  },
  gmail: {
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    register: registerGmailTools,
  },
  calendar: {
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    register: registerCalendarTools,
  },
};

/**
 * Parses `GOOGLE_MCP_SCOPES` env var (comma-separated domain names).
 *
 * - Unset / empty → every domain in {@link ALL_DOMAINS}, in registry order.
 * - Comma-separated names → those domains, deduped, in user-supplied order.
 * - Unknown names → throws (fail-loud rather than silently skipping).
 *
 * Domain names are case-insensitive and surrounding whitespace is stripped.
 */
export function parseEnabledDomains(envValue?: string): string[] {
  if (!envValue?.trim()) return Object.keys(ALL_DOMAINS);

  // Footgun guard: users sometimes assume the env var takes scope URLs
  // (because of the variable name) rather than short domain names. Detect
  // and bounce them with a clear hint before the unknown-domain throw.
  if (/^https?:\/\//i.test(envValue.trim())) {
    throw new Error(
      `GOOGLE_MCP_SCOPES looks like a scope URL — pass short domain names instead. ` +
        `Valid: ${Object.keys(ALL_DOMAINS).join(', ')}. ` +
        `Example: GOOGLE_MCP_SCOPES=docs,drive`
    );
  }

  const requested = envValue
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (requested.length === 0) return Object.keys(ALL_DOMAINS);

  const seen = new Set<string>();
  const deduped: string[] = [];
  const unknown: string[] = [];
  for (const d of requested) {
    if (!(d in ALL_DOMAINS)) {
      unknown.push(d);
      continue;
    }
    if (!seen.has(d)) {
      seen.add(d);
      deduped.push(d);
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `GOOGLE_MCP_SCOPES contains unknown domain(s): ${unknown.join(', ')}. ` +
        `Valid: ${Object.keys(ALL_DOMAINS).join(', ')}.`
    );
  }
  return deduped;
}

/**
 * Returns the deduped, ordered list of OAuth scope strings for the
 * given enabled domains.
 */
export function getEnabledScopes(domains: string[]): string[] {
  const scopes: string[] = [];
  const seen = new Set<string>();
  for (const domain of domains) {
    const config = ALL_DOMAINS[domain];
    if (!config) continue;
    for (const scope of config.scopes) {
      if (!seen.has(scope)) {
        seen.add(scope);
        scopes.push(scope);
      }
    }
  }
  return scopes;
}
