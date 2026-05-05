import { gmail_v1 } from 'googleapis';

export function findHeaderValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | null {
  if (!headers) return null;
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

export function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for any non-ASCII content in headers.
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

export interface MimeMessageOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
}

export function buildMimeMessage(opts: MimeMessageOptions): string {
  const lines: string[] = [];
  lines.push(`To: ${opts.to.join(', ')}`);
  if (opts.cc && opts.cc.length > 0) lines.push(`Cc: ${opts.cc.join(', ')}`);
  if (opts.bcc && opts.bcc.length > 0) lines.push(`Bcc: ${opts.bcc.join(', ')}`);
  lines.push(`Subject: ${encodeHeader(opts.subject)}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: 8bit');
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push('');
  lines.push(opts.body);
  return lines.join('\r\n');
}

export function encodeRawMessage(mime: string): string {
  return Buffer.from(mime, 'utf-8').toString('base64url');
}

/**
 * Fetches the original message and returns the headers needed to build a
 * threaded reply (Message-Id for In-Reply-To, References chain, threadId).
 */
export async function getReplyContext(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<{ threadId: string | undefined; inReplyTo: string | null; references: string | null }> {
  const original = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['Message-Id', 'References', 'Subject'],
  });
  const threadId = original.data.threadId ?? undefined;
  const origHeaders = original.data.payload?.headers;
  const inReplyTo = findHeaderValue(origHeaders, 'Message-Id');
  const origRefs = findHeaderValue(origHeaders, 'References');
  const references = [origRefs, inReplyTo].filter(Boolean).join(' ') || null;
  return { threadId, inReplyTo, references };
}

export interface DraftRequestArgs {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  replyToMessageId?: string;
}

/**
 * Resolves reply threading context (if any), builds the MIME message, and
 * returns the base64url-encoded raw + threadId ready for messages.send,
 * drafts.create, or drafts.update. Centralizes the compose pipeline so all
 * three call sites stay in sync on threading and MIME formatting.
 */
export async function prepareMimeRequest(
  gmail: gmail_v1.Gmail,
  args: DraftRequestArgs
): Promise<{ raw: string; threadId: string | undefined; toList: string[] }> {
  const toList = Array.isArray(args.to) ? args.to : [args.to];
  let threadId: string | undefined;
  let inReplyTo: string | null = null;
  let references: string | null = null;

  if (args.replyToMessageId) {
    const ctx = await getReplyContext(gmail, args.replyToMessageId);
    threadId = ctx.threadId;
    inReplyTo = ctx.inReplyTo;
    references = ctx.references;
  }

  const raw = encodeRawMessage(
    buildMimeMessage({
      to: toList,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      body: args.body,
      inReplyTo,
      references,
    })
  );

  return { raw, threadId, toList };
}

export function decodeBase64Url(data?: string | null): string {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf-8');
}

/**
 * Walks a Gmail message payload tree and accumulates all text/plain and
 * text/html parts. Returns both representations so callers can pick the
 * one they want (text for processing, html for display).
 */
export function extractMessageBody(payload?: gmail_v1.Schema$MessagePart): {
  text: string;
  html: string;
} {
  let text = '';
  let html = '';
  if (!payload) return { text, html };
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    const mime = part.mimeType ?? '';
    if (mime === 'text/plain' && part.body?.data) text += decodeBase64Url(part.body.data);
    else if (mime === 'text/html' && part.body?.data) html += decodeBase64Url(part.body.data);
    if (part.parts) for (const sub of part.parts) walk(sub);
  };
  walk(payload);
  return { text, html };
}

export function extractDomain(fromHeader: string | null): string | null {
  if (!fromHeader) return null;
  const match = fromHeader.match(/<?([^@<>\s]+)@([^>\s]+)>?/);
  return match ? match[2].toLowerCase() : null;
}
