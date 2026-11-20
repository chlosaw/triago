import { TicketLink } from '@triago/shared';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';

/** Hostname for display, e.g. "github.com"; falls back to the raw URL. */
function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** A list of related links with an "add link" row. Validates with the API's schema. */
export function LinksEditor({
  links,
  onChange,
  disabled
}: {
  links: TicketLink[];
  onChange: (links: TicketLink[]) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const id = useId();

  const add = (event?: FormEvent) => {
    event?.preventDefault();
    const candidate = url.trim() && !/^https?:\/\//i.test(url.trim()) ? `https://${url.trim()}` : url.trim();
    const result = TicketLink.safeParse({ url: candidate, title });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Check the link.');
      return;
    }
    if (links.length >= 20) {
      setError('Add at most 20 links.');
      return;
    }
    onChange([...links, result.data]);
    setUrl('');
    setTitle('');
    setError('');
  };

  // Enter adds the link instead of submitting the surrounding form.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  };

  return (
    <div className="links-editor">
      {links.length > 0 && (
        <ul className="link-list">
          {links.map((link, index) => (
            <li key={`${link.url}-${index}`} className="link-item">
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.title || link.url}
              </a>
              <span className="link-host">{linkHost(link.url)}</span>
              {!disabled && (
                <button
                  type="button"
                  className="link-btn"
                  aria-label={`Remove link ${link.title || link.url}`}
                  onClick={() => onChange(links.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="link-add-row">
          <label className="visually-hidden" htmlFor={`${id}-url`}>
            Link URL
          </label>
          <input
            id={`${id}-url`}
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setUrl(event.target.value);
              setError('');
            }}
            onKeyDown={onKeyDown}
          />
          <label className="visually-hidden" htmlFor={`${id}-title`}>
            Link text
          </label>
          <input
            id={`${id}-title`}
            className="input"
            placeholder="Link text (optional)"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="btn btn-secondary" disabled={!url.trim()} onClick={() => add()}>
            Add link
          </button>
        </div>
      )}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
