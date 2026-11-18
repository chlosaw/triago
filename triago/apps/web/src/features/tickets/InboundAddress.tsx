import { useState } from 'react';

/** The organisation's own inbox: email sent here shows up in Pending as a drafted ticket. */
export function InboundAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context): the address stays selectable.
    }
  };

  return (
    <div className="inbound-box">
      <span className="mini-label">Try it with a real email</span>
      <p className="inbound-copy">
        Send anything to this address from your own inbox. It lands in Pending as a drafted ticket within seconds.
      </p>
      <div className="inbound-row">
        <a className="inbound-address" href={`mailto:${address}?subject=${encodeURIComponent('Help with my invoice')}`}>
          {address}
        </a>
        <button type="button" className="link-btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className="visually-hidden" role="status">
        {copied ? 'Address copied' : ''}
      </span>
    </div>
  );
}
