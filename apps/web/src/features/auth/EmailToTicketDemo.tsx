/**
 * The product in one loop: a customer email arrives, the AI drafts a ticket from it,
 * and a person approves it. Built from markup rather than a video so it stays sharp,
 * light and readable. With reduced motion it is a still picture of all three steps.
 */
export function EmailToTicketDemo() {
  return (
    <figure className="e2t" aria-label="How Triago works: an email becomes a drafted ticket that you approve">
      <div className="e2t-email">
        <div className="e2t-label">
          <MailIcon /> New email
        </div>
        <div className="e2t-from">
          <strong>Sam Okafor</strong> <span>sam@lumenpay.co</span>
        </div>
        <div className="e2t-subject">charged twice??</div>
        <p className="e2t-body">
          Our card was charged twice for invoice INV-2291 this morning. Please refund the duplicate as soon as you can.
        </p>
      </div>

      <div className="e2t-arrow" aria-hidden="true">
        <span className="e2t-chip">
          <SparkIcon /> AI drafts a ticket
        </span>
      </div>

      <div className="e2t-ticket">
        <div className="e2t-ticket-top">
          <span className="e2t-key">BRT-42</span>
          <span className="e2t-tag e2t-billing">Billing</span>
          <span className="e2t-tag e2t-urgent">Urgent</span>
          <span className="e2t-confidence">96% sure</span>
        </div>
        <div className="e2t-title">Charged twice for the November invoice</div>
        <p className="e2t-summary">Duplicate charge on INV-2291; the customer wants the second payment refunded.</p>
        <div className="e2t-actions">
          <span className="e2t-accept">Accept</span>
          <span className="e2t-edit">Edit</span>
          <span className="e2t-approved">
            <CheckIcon /> Approved by you
          </span>
        </div>
      </div>
      <figcaption className="visually-hidden">
        An email from Sam Okafor about a double charge becomes a billing ticket with urgent priority, which an agent
        approves.
      </figcaption>
    </figure>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
