import type { InboundEmail } from './classifier.js';

/**
 * Stand-in mailbox for "sync" until Gmail is connected. Each message has a
 * stable id so a sync never imports it twice into the same organisation.
 */
export const SAMPLE_MAILBOX: (InboundEmail & { id: string })[] = [
  {
    id: 'sample-1',
    fromName: 'Sam Ruiz',
    fromEmail: 'sam.ruiz@fernway.io',
    subject: 'Password reset email never arrives',
    body: "I've tried resetting my password three times today and no email shows up, not even in spam. My address is sam.ruiz@fernway.io."
  },
  {
    id: 'sample-2',
    fromName: 'Lena Vogt',
    fromEmail: 'lena@nightowl.co',
    subject: 'Dark mode for the queue?',
    body: 'Small ask: our night shift works the queue and the bright screen is rough. Any chance of a dark theme?'
  },
  {
    id: 'sample-3',
    fromName: 'Omar Haddad',
    fromEmail: 'omar@tillpoint.com',
    subject: 'Charged twice for October',
    body: 'Hello, our card was charged twice for the October invoice (INV-2291). Could you refund the duplicate payment?'
  },
  {
    id: 'sample-4',
    fromName: 'Grace Liu',
    fromEmail: 'grace.liu@harbor.dev',
    subject: 'How do I add a second admin?',
    body: 'We have a new team lead starting next week. Where in the settings do I give her admin rights?'
  },
  {
    id: 'sample-5',
    fromName: 'Ines Duarte',
    fromEmail: 'ines@paperkite.io',
    subject: 'URGENT: dashboard down for everyone',
    body: 'Nobody on our team can load the dashboard since 10:05. We get a blank page and a spinner. This is blocking our whole support shift.'
  },
  {
    id: 'sample-6',
    fromName: 'Ben Okoro',
    fromEmail: 'ben.okoro@lumenfield.com',
    subject: 'Re: refund for the annual plan',
    body: 'Following up again on the refund we discussed last week. The charge is still on our card statement.'
  },
  {
    id: 'sample-7',
    fromName: 'Hana Sato',
    fromEmail: 'hana@kintsugi.studio',
    subject: 'Would be great to have Slack notifications',
    body: 'Not urgent, but it would be great if new urgent tickets could ping a Slack channel. We live in Slack.'
  },
  {
    id: 'sample-8',
    fromName: 'Leo Martin',
    fromEmail: 'leo@northpier.co',
    subject: 'Fwd: CSV export has the wrong date format',
    body: 'Forwarding from our finance lead: exported dates come out as MM/DD/YYYY, but our workspace is set to DD/MM/YYYY. Imports into our accounting tool fail.'
  }
];
