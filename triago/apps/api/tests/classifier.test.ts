import { describe, expect, it } from 'vitest';
import { classify } from '../src/modules/emails/classifier.js';

const email = (subject: string, body = '') => ({ fromName: 'A', fromEmail: 'a@example.com', subject, body });

describe('classify', () => {
  it('reads "not urgent" as low priority', () => {
    expect(classify(email('Feature idea', 'Not urgent, but Slack alerts would be great.')).priority).toBe('low');
  });

  it('flags outages as urgent bugs', () => {
    expect(classify(email('Dashboard down for everyone', 'Blank page since 10:05.'))).toMatchObject({
      category: 'bug',
      priority: 'urgent'
    });
  });

  it('strips reply and tag prefixes from the title', () => {
    expect(classify(email('Re: Fwd: [ALERT] api latency high')).title).toBe('Api latency high');
  });
});
