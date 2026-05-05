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
    name: 'searchDriveFiles',
    description:
      'Searches across all file types in Google Drive by name or content. ' +
      'Unlike searchDocuments (which only searches Google Docs), this tool finds Sheets, PDFs, ' +
      'presentations, folders, and any other Drive file. Supports filtering by MIME type, ' +
      'scoping to a specific folder subtree, controllable sort order, and pagination via pageToken.',
    parameters: z.object({
      query: z.string().min(1).describe('Search term to find in file names or content.'),
      searchIn: z
        .enum(['name', 'content', 'both'])
        .optional()
        .default('both')
        .describe(
          'Where to search: "name" matches file titles only, "content" searches inside files, ' +
            '"both" searches names and content (default).'
        ),
      mimeType: z
        .string()
        .optional()
        .describe(
          'Restrict search to a specific file type. ' +
            'Shortcuts: "document", "spreadsheet", "presentation", "folder", "form", "pdf", "zip". ' +
            'Or pass a full MIME type string.'
        ),
      folderId: z
        .string()
        .optional()
        .describe(
          'Restrict search to files inside this folder (and its subfolders). ' +
            'Use "root" for the top-level Drive. Omit to search all of Drive.'
        ),
      orderBy: z
        .enum(['name', 'modifiedTime', 'createdTime'])
        .optional()
        .default('modifiedTime')
        .describe('Field to sort results by.'),
      sortDirection: z
        .enum(['asc', 'desc'])
        .optional()
        .default('desc')
        .describe('Sort direction: "asc" for oldest first, "desc" for newest first (default).'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe('Maximum number of results to return per page (1-100).'),
      modifiedAfter: z
        .string()
        .optional()
        .describe(
          'Only return files modified after this date (ISO 8601 format, e.g. "2024-01-01").'
        ),
      pageToken: z
        .string()
        .optional()
        .describe(
          'Pagination token from a previous searchDriveFiles response. ' +
            'Pass this to retrieve the next page of results.'
        ),
    }),
    execute: async (args, { log }) => {
      const drive = await getDriveClient();
      log.info(
        `Searching Drive files for: "${args.query}" in ${args.searchIn}, ` +
          `mimeType=${args.mimeType || 'any'}, folder=${args.folderId || 'all'}, ` +
          `orderBy=${args.orderBy} ${args.sortDirection}`
      );

      try {
        const conditions: string[] = ['trashed=false'];

        // Search term
        if (args.searchIn === 'name') {
          conditions.push(`name contains '${escapeDriveQuery(args.query)}'`);
        } else if (args.searchIn === 'content') {
          conditions.push(`fullText contains '${escapeDriveQuery(args.query)}'`);
        } else {
          conditions.push(
            `(name contains '${escapeDriveQuery(args.query)}' or fullText contains '${escapeDriveQuery(args.query)}')`
          );
        }

        // Resolve MIME type shortcut or use value as-is
        if (args.mimeType) {
          const resolved = MIME_TYPE_SHORTCUTS[args.mimeType] ?? args.mimeType;
          conditions.push(`mimeType='${escapeDriveQuery(resolved)}'`);
        }

        // Scope to a specific folder (searches within the folder subtree via fullText,
        // but Drive API does not support recursive parent filtering natively — using
        // ancestor query instead which covers all descendants)
        if (args.folderId) {
          conditions.push(`'${escapeDriveQuery(args.folderId)}' in ancestors`);
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
          pageToken: args.pageToken,
          fields:
            'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners(displayName,emailAddress),parents)',
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

        const result: Record<string, unknown> = { files, total: files.length };
        if (response.data.nextPageToken) {
          result.nextPageToken = response.data.nextPageToken;
          result.hasMore = true;
        } else {
          result.hasMore = false;
        }

        return JSON.stringify(result, null, 2);
      } catch (error: any) {
        log.error(`Error searching Drive files: ${error.message || error}`);
        if (error.code === 403)
          throw new UserError(
            'Permission denied. Make sure you have granted Google Drive access to the application.'
          );
        throw new UserError(`Failed to search files: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
