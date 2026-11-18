import { describe, expect, it, vi } from 'vitest';
import { draftTicket, GroqError, type ChatClient, type ChatResponse } from '../src/modules/emails/llm-classifier.js';

const email = {
  fromName: 'Ines',
  fromEmail: 'ines@paperkite.io',
  subject: 'URGENT: dashboard down for everyone',
  body: 'Nobody can load the dashboard since 10:05.'
};

/** A stand-in client whose chat() resolves or rejects as the test needs. */
function fakeClient(chat: () => Promise<ChatResponse>) {
  const spy = vi.fn(chat);
  return { client: { chat: spy } as ChatClient, chat: spy };
}

const answer = (content: unknown, finish_reason = 'stop') =>
  Promise.resolve({
    choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) }, finish_reason }]
  });

describe('draftTicket', () => {
  it("uses the model's draft, trimmed and with confidence kept within 0–1", async () => {
    const { client, chat } = fakeClient(() =>
      answer({
        title: '  Dashboard outage  ',
        summary: 'All users see a blank page.',
        category: 'bug',
        priority: 'urgent',
        confidence: 1.4
      })
    );
    const draft = await draftTicket(email, client);

    expect(draft).toEqual({
      title: 'Dashboard outage',
      summary: 'All users see a blank page.',
      category: 'bug',
      priority: 'urgent',
      confidence: 1,
      classifier: 'groq'
    });
    // The email reaches the model JSON-encoded inside one tag, after the system prompt.
    const [request] = chat.mock.calls[0] as unknown as [{ messages: { content: string }[] }];
    expect(request.messages[1]!.content).toBe(
      `<email>${JSON.stringify({ from: 'Ines <ines@paperkite.io>', subject: email.subject, body: email.body })}</email>`
    );
  });

  it('falls back to keyword rules when the answer is cut off', async () => {
    const { client } = fakeClient(() => answer('{"title": "Dash', 'length'));
    expect(await draftTicket(email, client)).toMatchObject({
      classifier: 'keywords',
      category: 'bug',
      priority: 'urgent'
    });
  });

  it('falls back when the answer is not valid JSON or has the wrong shape', async () => {
    for (const content of ['not json', { title: 'Outage', category: 'outage' }]) {
      const { client } = fakeClient(() => answer(content));
      expect(await draftTicket(email, client)).toMatchObject({ classifier: 'keywords' });
    }
  });

  it('falls back to keyword rules when the API fails', async () => {
    for (const error of [new GroqError(429), new TypeError('fetch failed')]) {
      const { client } = fakeClient(() => Promise.reject(error));
      expect(await draftTicket(email, client)).toMatchObject({ classifier: 'keywords' });
    }
  });

  it('falls back when the answer has an empty title', async () => {
    const { client } = fakeClient(() =>
      answer({ title: '   ', summary: '', category: 'bug', priority: 'high', confidence: 0.8 })
    );
    expect(await draftTicket(email, client)).toMatchObject({ classifier: 'keywords' });
  });

  it('uses keyword rules without an API key', async () => {
    expect(await draftTicket(email, null)).toMatchObject({
      classifier: 'keywords',
      title: 'URGENT: dashboard down for everyone'
    });
  });
});
