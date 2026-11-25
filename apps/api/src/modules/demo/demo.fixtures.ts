import type { Tx } from '../../lib/db.js';
import { insertTicket, type NewTicket } from '../tickets/tickets.service.js';

// Ages are stored relative to "now" and turned into dates when a sandbox is
// created, so a long-running server still produces a fresh-looking week.
const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);
const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);

type Aged<T> = Omit<T, 'receivedAt'> & { ageHours: number };

/** Emails waiting in the triage queue, each with an AI draft. */
const QUEUE: Aged<NewTicket>[] = [
  {
    title: 'Checkout fails with a 500 when a coupon is applied',
    summary:
      'All coupon orders fail at payment with a 500 since this morning; about 40 lost checkouts in two hours. Orders without a coupon are fine.',
    category: 'bug',
    priority: 'urgent',
    aiConfidence: 0.94,
    requesterName: 'Dana Ortiz',
    requesterEmail: 'dana@brightloom.shop',
    ageHours: 0.4,
    body: 'Hi team,\n\nSince this morning every order that uses a coupon code fails at the last step with a 500 error. Orders without a coupon go through fine. About 40 failed checkouts in two hours, so this is urgent for us.\n\nRepro: add any item, apply SPRING10, click Pay.\n\nThanks,\nDana',
    source: 'email'
  },
  {
    title: 'Invoices ignore the workspace currency setting',
    summary: 'Invoices render in USD although the workspace currency is EUR. Second time the customer has asked.',
    category: 'billing',
    priority: 'high',
    aiConfidence: 0.86,
    requesterName: 'Jo Kim',
    requesterEmail: 'jo.kim@fernway.io',
    ageHours: 1.5,
    body: 'Following up: our invoices still show USD even though the workspace is set to EUR. Our accountant flagged it again this morning.',
    source: 'email'
  },
  {
    title: 'Export the board to CSV',
    summary: 'Finance wants a weekly CSV snapshot with key, title, status, assignee and created date.',
    category: 'request',
    priority: 'low',
    aiConfidence: 0.88,
    requesterName: 'Priya Nair',
    requesterEmail: 'priya@northwind.app',
    ageHours: 3,
    body: "Hey, finance wants a weekly snapshot of what's in each column. A CSV with key, title, status, assignee and created date would cover it. Not urgent, but it would save me copying things into a sheet every Friday.",
    source: 'email'
  },
  {
    title: 'Grant Marco Bellini write access to staging',
    summary: 'New platform team member needs write access to the staging project; currently view-only.',
    category: 'request',
    priority: 'medium',
    aiConfidence: 0.9,
    requesterName: 'Marco Bellini',
    requesterEmail: 'marco@brightloom.shop',
    ageHours: 20,
    body: 'Hi, I joined the platform team on Monday. Can someone give me write access to the staging project? Right now I can only view tickets.',
    source: 'email'
  },
  {
    title: 'Is there an API rate limit for exports?',
    summary: 'Customer asks whether bulk export calls are rate limited before building a nightly job.',
    category: 'question',
    priority: 'low',
    aiConfidence: 0.62,
    requesterName: 'Tomás Reyes',
    requesterEmail: 'tomas@quillhq.com',
    ageHours: 26,
    body: "We're planning a nightly job that pulls all tickets through the API. Before we build it: is there a rate limit on the export endpoints?",
    source: 'email'
  }
];

/** Already-triaged tickets, spread over the last week so the dashboard has history. */
type HistoryRow = Required<Pick<NewTicket, 'title' | 'category' | 'priority' | 'status'>> & {
  hours: number;
  triageMinutes: number;
};

const HISTORY = [
  {
    title: 'Webhook retries fire twice on timeout',
    category: 'bug',
    priority: 'high',
    status: 'open',
    hours: 30,
    triageMinutes: 6
  },
  {
    title: 'Add SSO for the Fernway workspace',
    category: 'request',
    priority: 'medium',
    status: 'waiting',
    hours: 52,
    triageMinutes: 14
  },
  {
    title: "Customer can't download PDF receipts",
    category: 'billing',
    priority: 'medium',
    status: 'open',
    hours: 75,
    triageMinutes: 3
  },
  {
    title: 'Queue list loses scroll position after approve',
    category: 'bug',
    priority: 'low',
    status: 'resolved',
    hours: 98,
    triageMinutes: 9
  },
  {
    title: 'Bulk-assign tickets from the queue',
    category: 'request',
    priority: 'medium',
    status: 'open',
    hours: 120,
    triageMinutes: 4
  },
  {
    title: 'Refund for a cancelled annual plan',
    category: 'billing',
    priority: 'high',
    status: 'closed',
    hours: 140,
    triageMinutes: 2
  },
  {
    title: 'Where do I change notification emails?',
    category: 'question',
    priority: 'low',
    status: 'closed',
    hours: 150,
    triageMinutes: 5
  },
  {
    title: 'Newsletter: October product update',
    category: 'question',
    priority: 'low',
    status: 'dismissed',
    hours: 44,
    triageMinutes: 1
  }
] satisfies HistoryRow[];

/**
 * Emails the AI already turned into tickets, spread over the last month.
 * Most are still unresolved so the status table has plenty to work through.
 */
type EmailTicket = HistoryRow & { requesterName: string; requesterEmail: string; aiConfidence: number; body: string };

const AI_TICKETS = [
  {
    title: 'Password reset email never arrives',
    category: 'bug',
    priority: 'high',
    status: 'open',
    hours: 2.5,
    triageMinutes: 4,
    aiConfidence: 0.93,
    requesterName: 'Lena Fischer',
    requesterEmail: 'lena@kaltbrew.de',
    body: "Hi, I've requested a password reset three times in the last hour and nothing has arrived, not even in spam. I'm locked out of the admin account."
  },
  {
    title: 'Charged twice for the November invoice',
    category: 'billing',
    priority: 'urgent',
    status: 'open',
    hours: 5,
    triageMinutes: 3,
    aiConfidence: 0.96,
    requesterName: 'Sam Okafor',
    requesterEmail: 'sam@lumenpay.co',
    body: 'Our card was charged twice for invoice INV-2291 this morning. Please refund the duplicate as soon as you can.'
  },
  {
    title: 'Add a dark mode to the customer portal',
    category: 'request',
    priority: 'low',
    status: 'open',
    hours: 7,
    triageMinutes: 11,
    aiConfidence: 0.84,
    requesterName: 'Aiko Tanaka',
    requesterEmail: 'aiko@mosslight.jp',
    body: 'Several of our customers work night shifts and have asked whether the portal could get a dark mode.'
  },
  {
    title: 'Can we change the ticket prefix?',
    category: 'question',
    priority: 'low',
    status: 'waiting',
    hours: 9,
    triageMinutes: 6,
    aiConfidence: 0.79,
    requesterName: 'Ravi Menon',
    requesterEmail: 'ravi@stackpine.io',
    body: 'We rebranded last month. Is it possible to change our ticket prefix from SPN to STK without losing history?'
  },
  {
    title: 'Attachments over 10 MB fail to upload',
    category: 'bug',
    priority: 'medium',
    status: 'open',
    hours: 14,
    triageMinutes: 8,
    aiConfidence: 0.91,
    requesterName: 'Elena Rossi',
    requesterEmail: 'elena@verdeo.it',
    body: 'When a customer replies with a PDF larger than about 10 MB the attachment is silently dropped.'
  },
  {
    title: 'Slack notifications stopped after reconnecting',
    category: 'bug',
    priority: 'high',
    status: 'open',
    hours: 19,
    triageMinutes: 5,
    aiConfidence: 0.88,
    requesterName: 'Noah Brooks',
    requesterEmail: 'noah@harborline.com',
    body: 'We reconnected the Slack integration yesterday and since then no new ticket alerts have come through.'
  },
  {
    title: 'Request for a SOC 2 report',
    category: 'request',
    priority: 'medium',
    status: 'waiting',
    hours: 28,
    triageMinutes: 22,
    aiConfidence: 0.82,
    requesterName: 'Grace Liu',
    requesterEmail: 'grace@ledgerly.ai',
    body: 'Our security team needs your latest SOC 2 Type II report before renewal. Can you share it under NDA?'
  },
  {
    title: 'Upgrade from Starter to Team mid-cycle',
    category: 'billing',
    priority: 'medium',
    status: 'open',
    hours: 34,
    triageMinutes: 9,
    aiConfidence: 0.87,
    requesterName: 'Omar Haddad',
    requesterEmail: 'omar@sandcastle.studio',
    body: "We'd like to upgrade to the Team plan today. Will we be charged the full month or a prorated amount?"
  },
  {
    title: 'Search does not find tickets by requester email',
    category: 'bug',
    priority: 'medium',
    status: 'open',
    hours: 46,
    triageMinutes: 12,
    aiConfidence: 0.9,
    requesterName: 'Chloé Martin',
    requesterEmail: 'chloe@atelierdix.fr',
    body: 'Typing a full customer email into search returns nothing, even though their tickets exist.'
  },
  {
    title: 'How do I export audit logs?',
    category: 'question',
    priority: 'low',
    status: 'waiting',
    hours: 58,
    triageMinutes: 7,
    aiConfidence: 0.76,
    requesterName: 'Ben Carter',
    requesterEmail: 'ben@fieldnote.app',
    body: 'Compliance asked for a log of who changed what last quarter. Is there a way to export audit logs?'
  },
  {
    title: 'Mobile app crashes when opening a ticket',
    category: 'bug',
    priority: 'urgent',
    status: 'open',
    hours: 66,
    triageMinutes: 2,
    aiConfidence: 0.95,
    requesterName: 'Maya Patel',
    requesterEmail: 'maya@tidewell.health',
    body: 'Since the last iOS update the app crashes every time I tap a ticket. Android colleagues are fine.'
  },
  {
    title: 'Add Spanish to the reply templates',
    category: 'request',
    priority: 'low',
    status: 'open',
    hours: 90,
    triageMinutes: 15,
    aiConfidence: 0.83,
    requesterName: 'Diego Alvarez',
    requesterEmail: 'diego@solmarket.mx',
    body: 'Half of our customers write in Spanish. Could the reply templates support a Spanish version?'
  },
  {
    title: 'VAT number missing on invoices',
    category: 'billing',
    priority: 'high',
    status: 'waiting',
    hours: 110,
    triageMinutes: 6,
    aiConfidence: 0.89,
    requesterName: 'Anna Kowalski',
    requesterEmail: 'anna@brzozatech.pl',
    body: 'Our VAT number is saved in billing settings but does not appear on the generated invoices.'
  },
  {
    title: 'Remove a former employee from the workspace',
    category: 'request',
    priority: 'medium',
    status: 'closed',
    hours: 130,
    triageMinutes: 3,
    aiConfidence: 0.92,
    requesterName: 'Tom Wright',
    requesterEmail: 'tom@oakfield.co.uk',
    body: "Jamie left the company last week. Please remove their access; I can't find the option."
  },
  {
    title: 'Tickets assigned to the wrong team after rule change',
    category: 'bug',
    priority: 'high',
    status: 'open',
    hours: 180,
    triageMinutes: 10,
    aiConfidence: 0.86,
    requesterName: 'Fatima Zahra',
    requesterEmail: 'fatima@atlasride.ma',
    body: 'After editing our routing rules, billing tickets started landing with the tech team.'
  },
  {
    title: 'Is there a discount for nonprofits?',
    category: 'question',
    priority: 'low',
    status: 'closed',
    hours: 210,
    triageMinutes: 18,
    aiConfidence: 0.8,
    requesterName: 'Hannah Lee',
    requesterEmail: 'hannah@greenroots.org',
    body: "We're a registered nonprofit. Do you offer any discount on the Team plan?"
  },
  {
    title: 'Webhook payload missing the priority field',
    category: 'bug',
    priority: 'medium',
    status: 'open',
    hours: 250,
    triageMinutes: 7,
    aiConfidence: 0.9,
    requesterName: 'Lucas Silva',
    requesterEmail: 'lucas@pontual.com.br',
    body: "The ticket.updated webhook doesn't include priority, so our dashboard can't sort by it."
  },
  {
    title: 'Bulk close tickets older than 90 days',
    category: 'request',
    priority: 'low',
    status: 'waiting',
    hours: 300,
    triageMinutes: 25,
    aiConfidence: 0.78,
    requesterName: 'Erik Lindqvist',
    requesterEmail: 'erik@fjordlabs.se',
    body: 'We have hundreds of stale tickets from the migration. Can we close everything older than 90 days in one go?'
  },
  {
    title: 'Refund request after accidental annual renewal',
    category: 'billing',
    priority: 'high',
    status: 'resolved',
    hours: 360,
    triageMinutes: 4,
    aiConfidence: 0.94,
    requesterName: 'Olivia Grant',
    requesterEmail: 'olivia@meadowco.com',
    body: 'Our plan auto-renewed for a year but we meant to switch to monthly. Can this be refunded?'
  },
  {
    title: 'SSO login loops back to the sign-in page',
    category: 'bug',
    priority: 'urgent',
    status: 'open',
    hours: 420,
    triageMinutes: 3,
    aiConfidence: 0.92,
    requesterName: 'Kenji Watanabe',
    requesterEmail: 'kenji@hikari.dev',
    body: 'Users signing in with Okta get redirected back to the login page endlessly.'
  },
  {
    title: 'Which regions do you host data in?',
    category: 'question',
    priority: 'medium',
    status: 'closed',
    hours: 480,
    triageMinutes: 9,
    aiConfidence: 0.81,
    requesterName: 'Sophie Dubois',
    requesterEmail: 'sophie@clairvue.eu',
    body: 'For GDPR purposes, can you confirm whether our data is stored in the EU?'
  },
  {
    title: 'Custom fields on the ticket form',
    category: 'request',
    priority: 'medium',
    status: 'open',
    hours: 540,
    triageMinutes: 14,
    aiConfidence: 0.85,
    requesterName: 'Jack Morrison',
    requesterEmail: 'jack@ironbark.au',
    body: "We'd like to ask customers for an order number on the contact form. Are custom fields possible?"
  },
  {
    title: 'Duplicate tickets created from one email thread',
    category: 'bug',
    priority: 'medium',
    status: 'waiting',
    hours: 600,
    triageMinutes: 8,
    aiConfidence: 0.87,
    requesterName: 'Isla Murray',
    requesterEmail: 'isla@thistle.scot',
    body: 'When a customer replies to their own email, a second ticket is created instead of adding to the first.'
  },
  {
    title: 'Change the billing email address',
    category: 'billing',
    priority: 'low',
    status: 'closed',
    hours: 660,
    triageMinutes: 5,
    aiConfidence: 0.9,
    requesterName: 'Peter Novak',
    requesterEmail: 'peter@vltava.cz',
    body: 'Please send future invoices to accounts@vltava.cz instead of my personal address.'
  },
  {
    title: 'Report showing first response time per agent',
    category: 'request',
    priority: 'medium',
    status: 'open',
    hours: 700,
    triageMinutes: 20,
    aiConfidence: 0.83,
    requesterName: 'Zara Ahmed',
    requesterEmail: 'zara@brightpath.ae',
    body: 'Managers want a report of first response time broken down by agent. Is this on the roadmap?'
  }
] satisfies EmailTicket[];

const HISTORY_REQUESTERS = [
  'Iris Vogel',
  'Mateo Cruz',
  'Nadia Rahman',
  'Felix Bauer',
  'Ruth Adeyemi',
  'Owen Price',
  'Leah Cohen',
  'Mailchimp'
];

/** Fills an empty organisation with a realistic queue and ticket history. */
export async function seedOrganisation(tx: Tx, orgId: string, actorId: string): Promise<void> {
  const triaged: EmailTicket[] = [
    ...HISTORY.map((row, index) => ({
      ...row,
      requesterName: HISTORY_REQUESTERS[index % HISTORY_REQUESTERS.length]!,
      requesterEmail: '',
      aiConfidence: 0.85,
      body: `${row.title}.`
    })),
    ...AI_TICKETS
  ];
  // Oldest first, so ticket numbers follow arrival order.
  for (const { hours, triageMinutes, requesterEmail, ...ticket } of triaged.sort((a, b) => b.hours - a.hours)) {
    const receivedAt = hoursAgo(hours);
    await insertTicket(
      tx,
      orgId,
      {
        ...ticket,
        source: 'email',
        requesterEmail: requesterEmail || null,
        receivedAt,
        triagedAt: minutesAfter(receivedAt, triageMinutes)
      },
      actorId
    );
  }
  await insertTicket(
    tx,
    orgId,
    {
      title: 'Rotate the support inbox password',
      category: 'request',
      priority: 'medium',
      status: 'open',
      source: 'manual',
      receivedAt: hoursAgo(10),
      triagedAt: hoursAgo(10)
    },
    actorId
  );
  // Oldest first, so ticket numbers follow arrival order.
  for (const { ageHours, ...ticket } of [...QUEUE].reverse()) {
    await insertTicket(tx, orgId, { ...ticket, receivedAt: hoursAgo(ageHours) }, null);
  }
  await giveVisitorWork(tx, orgId, actorId);
}

/** Tickets assigned to the visitor, so "My tickets" on the dashboard is not empty. */
const VISITOR_TICKETS = [
  'Charged twice for the November invoice',
  'Password reset email never arrives',
  'Can we change the ticket prefix?',
  'Add a dark mode to the customer portal',
  'Webhook payload missing the priority field'
];

/**
 * Assigns the visitor a few tickets and gives one a real back-and-forth: the visitor
 * asked a question, the customer answered, and the next reply is the visitor's to write.
 */
async function giveVisitorWork(tx: Tx, orgId: string, visitorId: string): Promise<void> {
  const visitor = await tx.user.findUniqueOrThrow({ where: { id: visitorId }, select: { name: true } });
  const mine = await tx.ticket.findMany({
    where: { orgId, title: { in: VISITOR_TICKETS } },
    select: { id: true, title: true, receivedAt: true, requesterName: true, requesterEmail: true }
  });
  for (const ticket of mine) {
    await tx.ticket.update({ where: { id: ticket.id }, data: { assigneeId: visitorId } });
    await tx.ticketEvent.create({
      data: {
        orgId,
        ticketId: ticket.id,
        actorId: visitorId,
        type: 'field_changed',
        data: { field: 'assigneeId', from: null, to: visitorId },
        createdAt: minutesAfter(ticket.receivedAt, 8)
      }
    });
  }

  const charged = mine.find((ticket) => ticket.title === VISITOR_TICKETS[0]);
  if (!charged?.requesterEmail) return;
  const asked = minutesAfter(charged.receivedAt, 20);
  const answered = minutesAfter(charged.receivedAt, 75);
  const question = await tx.message.create({
    data: {
      orgId,
      ticketId: charged.id,
      kind: 'outbound',
      authorId: visitorId,
      fromName: visitor.name,
      body: 'Hi Sam,\n\nSorry about that. I can see two payments for INV-2291. Could you tell me the last four digits of the card, so I refund the right one?',
      createdAt: asked
    }
  });
  await tx.ticketEvent.create({
    data: {
      orgId,
      ticketId: charged.id,
      actorId: visitorId,
      type: 'replied',
      data: { messageId: question.id, sent: false },
      createdAt: asked
    }
  });
  await tx.message.create({
    data: {
      orgId,
      ticketId: charged.id,
      kind: 'inbound',
      fromName: charged.requesterName,
      fromEmail: charged.requesterEmail,
      body: "Thanks for the quick reply! It's the Visa ending 4417. Both payments are dated this morning, 09:12 and 09:13.",
      createdAt: answered
    }
  });
  await tx.ticketEvent.create({
    data: { orgId, ticketId: charged.id, actorId: null, type: 'customer_replied', data: {}, createdAt: answered }
  });
}
