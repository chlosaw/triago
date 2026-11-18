import type { Member, TicketEvent } from '@triago/shared';
import { describe, expect, it } from 'vitest';
import { describeEvent } from './describeEvent';

const members: Member[] = [{ id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'admin' }];
const event = (type: string, data: Record<string, unknown> = {}): TicketEvent => ({
  id: '1',
  type,
  actor: 'Ada',
  data,
  createdAt: '2026-11-12T10:00:00Z'
});

describe('activity descriptions', () => {
  it('says which classifier drafted an imported email', () => {
    expect(describeEvent(event('created', { source: 'email', classifier: 'groq' }), members)).toBe(
      'imported the email; AI drafted the ticket'
    );
    expect(describeEvent(event('created', { source: 'manual' }), members)).toBe('created the ticket');
  });

  it('lists the corrections made when accepting a draft', () => {
    const accepted = event('accepted', { corrections: { priority: { from: 'medium', to: 'urgent' } } });
    expect(describeEvent(accepted, members)).toBe('accepted the draft with corrections: priority Medium → Urgent');
  });

  it('names assignees and status labels', () => {
    expect(describeEvent(event('field_changed', { field: 'assigneeId', from: null, to: 'u1' }), members)).toBe(
      'assigned it to Ada'
    );
    expect(describeEvent(event('field_changed', { field: 'status', from: 'open', to: 'waiting' }), members)).toBe(
      'changed status from Open to Waiting on customer'
    );
  });
});
