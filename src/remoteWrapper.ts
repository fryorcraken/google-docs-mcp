import { AsyncLocalStorage } from 'node:async_hooks';
import { getAuthSession, requireAuth, UserError } from 'fastmcp';
import type { FastMCP } from 'fastmcp';
import { google, docs_v1, drive_v3, sheets_v4, script_v1, gmail_v1, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { logger } from './logger.js';

export interface RequestClients {
  accessToken: string;
  auth: OAuth2Client;
  docs: docs_v1.Docs;
  sheets: sheets_v4.Sheets;
  drive: drive_v3.Drive;
  script: script_v1.Script;
  gmail: gmail_v1.Gmail;
  calendar: calendar_v3.Calendar;
}

export const requestClients = new AsyncLocalStorage<RequestClients>();

const allowedDomains = (process.env.ALLOWED_DOMAINS || '').split(',').filter(Boolean);

function checkDomain(idToken?: string): boolean {
  if (allowedDomains.length === 0) return true;
  if (!idToken) return false;

  const payload = idToken.split('.')[1];
  if (!payload) return false;
  try {
    const { hd } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return hd ? allowedDomains.includes(hd) : false;
  } catch {
    return false;
  }
}

function createClients(accessToken: string, refreshToken?: string): RequestClients {
  const auth = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return {
    accessToken,
    auth,
    docs: google.docs({ version: 'v1', auth }),
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
    script: google.script({ version: 'v1', auth }),
    gmail: google.gmail({ version: 'v1', auth }),
    calendar: google.calendar({ version: 'v3', auth }),
  };
}

type AddToolArg = Parameters<FastMCP['addTool']>[0];

const wrappedServers = new WeakSet<FastMCP>();

/**
 * Wraps server.addTool() so that in remote (httpStream) mode every tool
 * automatically gets: auth enforcement, domain restriction, and per-request
 * Google API clients via AsyncLocalStorage. Zero changes to tool files.
 */
export function wrapServerForRemote(server: FastMCP): void {
  if (wrappedServers.has(server)) return;
  wrappedServers.add(server);
  const previousAddTool = server.addTool.bind(server);

  (server as unknown as { addTool: (tool: AddToolArg) => void }).addTool = (
    toolDef: AddToolArg
  ) => {
    const originalExecute = toolDef.execute;
    previousAddTool({
      ...toolDef,
      canAccess: toolDef.canAccess
        ? (auth: any) => requireAuth(auth) && (toolDef.canAccess as Function)(auth)
        : requireAuth,
      execute: async (args: any, context: any) => {
        const { accessToken, refreshToken, idToken } = getAuthSession(context.session);
        if (!checkDomain(idToken)) {
          throw new UserError('Your Google account domain is not allowed on this server.');
        }

        const clients = createClients(accessToken, refreshToken);
        return requestClients.run(clients, () => originalExecute(args, context));
      },
    });
  };

  if (allowedDomains.length > 0) {
    logger.info(`Remote mode: domain restriction active for [${allowedDomains.join(', ')}]`);
  }
}
