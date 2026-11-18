import type { Category, Priority } from '@triago/shared';

export interface InboundEmail {
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
}

export interface Classification {
  title: string;
  summary: string;
  category: Category;
  priority: Priority;
  /** 0–1: how sure the classifier is about category and priority. */
  confidence: number;
}

/**
 * Keyword classifier used until the LLM classifier lands. It keeps the same
 * contract so the swap does not touch callers.
 */
export function classify(email: InboundEmail): Classification {
  const text = `${email.subject} ${email.body}`.toLowerCase();
  const signals: boolean[] = [];
  const match = (pattern: RegExp) => {
    const hit = pattern.test(text);
    signals.push(hit);
    return hit;
  };

  const category: Category = match(/invoice|charge|refund|billing|currency|payment/)
    ? 'billing'
    : match(/error|500|fail|never arrives|broken|alert|crash|bug|down for|blank page|can't load|cannot load/)
      ? 'bug'
      : match(/could we|any chance|would be great|feature|export|access to/)
        ? 'request'
        : 'question';

  // Low first, so "not urgent" is not read as "urgent".
  const priority: Priority = match(/small ask|not urgent|whenever|no rush/)
    ? 'low'
    : match(/urgent|outage|down for everyone|all orders|500/)
      ? 'urgent'
      : match(/alert|three times|following up|again/)
        ? 'high'
        : 'medium';

  const title = email.subject
    .replace(/^((re|fwd?):\s*)+/i, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim();
  const hits = signals.filter(Boolean).length;

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    summary: email.body.replace(/\s+/g, ' ').trim().slice(0, 240),
    category,
    priority,
    confidence: Math.min(0.55 + hits * 0.15, 0.9)
  };
}
