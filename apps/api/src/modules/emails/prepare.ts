/**
 * Trims an email down to what the AI needs before it is sent to the model:
 * no quoted reply chain, no signature, no legal footer, and a hard length cap.
 * Only the model's copy is trimmed; the ticket keeps the full email.
 */

/** About 2,000 tokens: plenty to classify a support email, and a fixed ceiling on cost. */
export const MAX_MODEL_CHARS = 8_000;

/** Lines where the quoted earlier conversation starts. Everything from here down is history. */
const REPLY_HEADERS = [
  // Gmail / Apple Mail: "On Mon, 3 Nov 2026 at 09:12, Grace <grace@x.io> wrote:" (sometimes wrapped).
  /^On\b[^\n]{0,300}(?:\n[^\n]{0,300})?\bwrote:[ \t]*$/m,
  // Outlook.
  /^-{2,}\s*Original Message\s*-{2,}[ \t]*$/im,
  /^_{10,}[ \t]*\n(?:From|Von|De):/m,
  /^From:[^\n]+\n(?:Sent|Date):[^\n]+\n(?:To|Subject):/m
];

/** Where a signature or mobile footer starts. */
const SIGNATURE_STARTS = [
  /^--[ \t]?$/m, // the standard "-- " delimiter
  /^Sent from my (?:iPhone|iPad|Android|Samsung|mobile)[^\n]*$/im,
  /^Get Outlook for [^\n]*$/im
];

/** Legal footers, cut only when they sit in the last part of the email. */
const DISCLAIMER =
  /^(?:CONFIDENTIALITY NOTICE|DISCLAIMER|This (?:e-?mail|message) (?:and any attachments )?(?:is|are|may be) (?:confidential|intended))/im;

function cutAt(text: string, pattern: RegExp, minKeep = 0): string {
  const match = pattern.exec(text);
  return match && match.index >= minKeep ? text.slice(0, match.index) : text;
}

export function prepareForModel(body: string): string {
  const original = body.replace(/\r\n?/g, '\n');
  let text = original;

  for (const pattern of REPLY_HEADERS) text = cutAt(text, pattern);
  // Inline quotes ("> earlier text") anywhere that's left.
  text = text
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
  for (const pattern of SIGNATURE_STARTS) text = cutAt(text, pattern);
  // A disclaimer in the first 60% is more likely the message itself, so leave it.
  text = cutAt(text, DISCLAIMER, Math.floor(text.length * 0.6));

  text = text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // An email that was nothing but a quote: better to send the quote than nothing.
  if (!text) text = original.trim();

  return text.length > MAX_MODEL_CHARS ? `${text.slice(0, MAX_MODEL_CHARS)}\n[…email shortened for triage]` : text;
}

/**
 * Phrases that try to instruct an AI rather than describe a problem. A match does
 * not block anything (the model is told to ignore such text, and its answer is
 * schema-checked); it lowers the draft's confidence and tells the agent to look closer.
 */
const INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts?|rules)/i,
  /\b(?:system|developer)\s+prompt\b/i,
  /\byou\s+are\s+now\s+(?:a|an|in)\b/i,
  /\b(?:set|mark|change)\s+(?:the\s+)?(?:priority|category|confidence)\s+(?:to|as)\b/i,
  /\bnew\s+instructions\s*:/i,
  /<\/?\s*(?:system|assistant|instructions?)\s*>/i
];

export function looksLikePromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
