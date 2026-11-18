import busboy from 'busboy';
import type { Request } from 'express';
import PostalMime, { type Address } from 'postal-mime';
import { HttpError } from '../../lib/errors.js';
import { InboundEmailPayload, slugFromAddress } from './inbound.service.js';

/**
 * Adapter for SendGrid Inbound Parse. SendGrid posts each email as
 * multipart/form-data, either as separate fields (default) or, with
 * "POST the raw, full MIME message" enabled, as the whole message in `email`.
 * Raw mode is recommended: the MIME parser then handles every charset and encoding.
 */

/** Large enough for a support email in raw mode; attachments push past it and are refused. */
const MAX_FIELD_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;

export type Fields = Record<string, Buffer>;

/** Why an email was not turned into a ticket; reported back with a 200 so SendGrid does not retry. */
export type DropReason = 'too_large' | 'too_long' | 'no_recipient' | 'unreadable' | 'spam';

/**
 * Reads the form fields as raw bytes. busboy decodes as latin1, which maps each
 * byte to one character, so the original bytes can be recovered and decoded with
 * the charset SendGrid reports. Attachments arrive as files and are skipped.
 */
export function readFields(req: Request): Promise<{ fields: Fields; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: req.headers,
        defCharset: 'latin1',
        defParamCharset: 'utf8',
        limits: { fieldSize: MAX_FIELD_BYTES, fields: 100, files: 50, fileSize: 1 }
      });
    } catch {
      reject(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected multipart/form-data from SendGrid.'));
      return;
    }

    const fields: Fields = {};
    let truncated = false;
    parser.on('field', (name, value, info) => {
      if (info.valueTruncated) truncated = true;
      fields[name] = Buffer.from(value, 'latin1');
    });
    parser.on('file', (_name, stream) => stream.resume());
    parser.on('error', reject);
    parser.on('close', () => resolve({ fields, truncated }));
    req.pipe(parser);
  });
}

/** Turns SendGrid's fields into the payload the rest of the inbound pipeline takes. */
export async function toPayload(fields: Fields): Promise<InboundEmailPayload | DropReason> {
  const charsets = parseJson<Record<string, string>>(fields.charsets) ?? {};
  const field = (name: string) => decode(fields[name], charsets[name]);

  const spamScore = Number(field('spam_score'));
  if (Number.isFinite(spamScore) && spamScore >= 5) return 'spam';

  // The SMTP envelope says which of our addresses the mail was actually delivered to.
  const envelope = parseJson<{ to?: string[]; from?: string }>(fields.envelope);
  const to = (envelope?.to ?? splitAddresses(field('to'))).find((address) => slugFromAddress(address) !== null);
  if (!to) return 'no_recipient';

  let email: { fromName: string; fromEmail: string; subject: string; text: string; messageId?: string };
  if (fields.email) {
    try {
      const parsed = await PostalMime.parse(new Uint8Array(fields.email));
      const sender = mailbox(parsed.from);
      email = {
        fromName: sender?.name ?? '',
        fromEmail: sender?.address ?? envelope?.from ?? '',
        subject: parsed.subject ?? '',
        text: parsed.text ?? htmlToText(parsed.html ?? ''),
        messageId: parsed.messageId
      };
    } catch {
      return 'unreadable';
    }
  } else {
    const from = parseFromHeader(field('from'));
    email = {
      fromName: from.name,
      fromEmail: from.address || envelope?.from || '',
      subject: field('subject'),
      text: field('text') || htmlToText(field('html')),
      messageId: headerValue(field('headers'), 'message-id')
    };
  }

  const text = email.text.trim();
  if (text.length > MAX_TEXT_CHARS) return 'too_long';

  const result = InboundEmailPayload.safeParse({
    to,
    from: { email: email.fromEmail, name: email.fromName },
    subject: email.subject,
    text,
    messageId: email.messageId || undefined
  });
  return result.success ? result.data : 'unreadable';
}

function decode(bytes: Buffer | undefined, charset = 'utf-8'): string {
  if (!bytes) return '';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // Unknown charset label: UTF-8 is the best guess.
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function parseJson<T>(bytes: Buffer | undefined): T | null {
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString('utf8')) as T;
  } catch {
    return null;
  }
}

function mailbox(address: Address | undefined): { name: string; address: string } | null {
  return address && 'address' in address && address.address ? { name: address.name, address: address.address } : null;
}

/** "Sender Name <sender@example.com>" or a bare address. */
export function parseFromHeader(value: string): { name: string; address: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { name: match[1]!.trim(), address: match[2]!.trim() };
  return { name: '', address: value.trim() };
}

function splitAddresses(value: string): string[] {
  return value
    .split(',')
    .map((part) => parseFromHeader(part).address)
    .filter(Boolean);
}

/** The value of one header from a raw header block, with folded lines joined. */
export function headerValue(headers: string, name: string): string | undefined {
  const unfolded = headers.replace(/\r?\n[ \t]+/g, ' ');
  const line = unfolded.split(/\r?\n/).find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line?.slice(name.length + 1).trim() || undefined;
}

/** Enough HTML-to-text for HTML-only mail: drop markup, keep line breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n');
}
