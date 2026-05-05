import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDriveClient } from '../../clients.js';
import { escapeDriveQuery } from '../../driveQueryUtils.js';

/**
 * Convenience shortcuts for common MIME types.
 * Users can also pass any full MIME type string directly.
 */
const MIME_TYPE_SHORTCUTS: Record<string, string> = {
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
  folder: 'application/vnd.google-apps.folder',
  form: 'application/vnd.google-apps.form',
  pdf: 'application/pdf',
  zip: 'application/zip',
};

export function register(server: FastMCP) {
  server.addTool({
    name: 'listDriveFiles',
    description:
      'Lists files across Google Drive with optional filtering by type, folder, and ownership. ' +
      'Unlike listDocuments (which only returns Google Docs), this tool works with all file types ' +
      '(Sheets, PDFs, images, folders, etc.) and supports sort direction and size-based ordering. ' +
      'Use mimeType shortcuts: "document", "spreadsheet", "presentation", "folder", "form", "pdf", "zip" ' +
      'or pass any full MIME type string.',
    parameters: z.object({
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum number of files to return (1-100).'),
      mimeType: z
        .string()
        .optional()
        .describe(
          'Filter by file type. Shortcuts: "document", "spreadsheet", "presentation", ' +
            '"folder", "form", "pdf", "zip". Or pass a full MIME type (e.g. "image/png").'
        ),
      folderId: z
        .string()
        .optional()
        .describe(
          'Only return files directly inside this folder. Use "root" for the top-level Drive. ' +
            'Omit to search across all folders.'
        ),
      orderBy: z
        .enum(['name', 'modifiedTime', 'createdTime', 'quotaBytesUsed'])
        .optional()
        .default('modifiedTime')
        .describe(
          'Field to sort results by. "quotaBytesUsed" sorts by file size (note: Google-native files report 0).'
        ),
      sortDirection: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe(
          'Sort direction: "asc" for oldest/smallest first, "desc" for newest/largest first.'
        ),
      ownedByMe: z
        .boolean()
        .optional()
        .describe('If true, only return files owned by the authenticated user.'),
      sharedWithMe: z
        .boolean()
        .optional()
        .describe(
          'If true, only return files shared with the authenticated user (excludes files they own). ' +
            'Cannot be combined with ownedByMe.'
        ),
      modifiedAfter: z
        .string()
        .optional()
        .describe(
          'Only return files modified after this date (ISO 8601 format, e.g. "2024-01-01").'
        ),
    }),
    execute: async (args, { log }) => {
      if (args.ownedByMe && args.sharedWithMe) {
        throw new UserError('ownedByMe and sharedWithMe cannot both be true.');
      }

      const drive = await getDriveClient();
      log.info(
        `Listing Drive files. mimeType=${args.mimeType || 'any'}, folder=${args.folderId || 'all'}, ` +
          `orderBy=${args.orderBy} ${args.sortDirection}, ownedByMe=${args.ownedByMe}, sharedWithMe=${args.sharedWithMe}`
      );

      try {
        const conditions: string[] = ['trashed=false'];

        // Resolve MIME type shortcut or use value as-is
        if (args.mimeType) {
          const resolved = MIME_TYPE_SHORTCUTS[args.mimeType] ?? args.mimeType;
          conditions.push(`mimeType='${escapeDriveQuery(resolved)}'`);
        }

        // Scope to a specific folder
        if (args.folderId) {
          conditions.push(`'${escapeDriveQuery(args.folderId)}' in parents`);
        }

        // Ownership filter
        if (args.ownedByMe) {
          conditions.push(`'me' in owners`);
        } else if (args.sharedWithMe) {
          conditions.push(`sharedWithMe=true`);
        }

        // Date filter
        if (args.modifiedAfter) {
          const cutoff = new Date(args.modifiedAfter).toISOString();
          conditions.push(`modifiedTime > '${escapeDriveQuery(cutoff)}'`);
        }

        const queryString = conditions.join(' and ');
        const orderByParam = args.sortDirection === 'desc' ? `${args.orderBy} desc` : args.orderBy;

        const response = await drive.files.list({
          q: queryString,
          pageSize: args.maxResults,
          orderBy: orderByParam,
          fields:
            'files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners(displayName,emailAddress))',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const files = (response.data.files || []).map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size != null ? Number(file.size) : null,
          modifiedTime: file.modifiedTime,
          createdTime: file.createdTime,
          owner: file.owners?.[0]?.displayName || null,
          url: file.webViewLink,
        }));

        return JSON.stringify({ files, total: files.length }, null, 2);
      } catch (error: any) {
        log.error(`Error listing Drive files: ${error.message || error}`);
        if (error.code === 403)
          throw new UserError(
            'Permission denied. Make sure you have granted Google Drive access to the application.'
          );
        throw new UserError(`Failed to list files: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
