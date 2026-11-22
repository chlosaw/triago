import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Markdown } from '../components/Markdown';
import { htmlToMarkdown, markdownToHtml, parseInline, parseMarkdown } from './markdown';

/** Markdown → editor HTML → Markdown, the trip a description makes through the visual editor. */
const roundTrip = (md: string) => {
  const div = document.createElement('div');
  div.innerHTML = markdownToHtml(md);
  return htmlToMarkdown(div);
};

describe('description Markdown', () => {
  it('parses the inline formatting the toolbar offers', () => {
    expect(parseInline('**b** *i* ++u++ `c` {color:red}r{color} [t](https://x.io)')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'i' }] },
      { type: 'text', text: ' ' },
      { type: 'u', children: [{ type: 'text', text: 'u' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'color', color: 'red', children: [{ type: 'text', text: 'r' }] },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://x.io', children: [{ type: 'text', text: 't' }] }
    ]);
  });

  it('parses blocks: headings, lists, quotes, code and rules', () => {
    const blocks = parseMarkdown('# Title\n\n- a\n- b\n\n1. one\n\n> quoted\n\n```\nx < y\n```\n\n---\n\nplain');
    expect(blocks.map((b) => b.type)).toEqual(['h', 'ul', 'ol', 'quote', 'pre', 'hr', 'p']);
  });

  it('never turns text into HTML, and refuses unsafe links', () => {
    const html = markdownToHtml('<img src=x onerror=alert(1)> [click](javascript:alert(1)) {color:url(x)}t{color}');
    // The tag is shown as text, never parsed: no real <img> element, no javascript: link.
    const parsed = document.createElement('div');
    parsed.innerHTML = html;
    expect(parsed.querySelector('img, script, [onerror]')).toBeNull();
    expect(parsed.querySelector('a')).toBeNull();
    expect(html).toContain('&lt;img');

    const { container } = render(
      createElement(Markdown, { source: '<script>alert(1)</script> [x](javascript:alert(1))' })
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('keeps snake_case and lone asterisks as text', () => {
    expect(parseInline('user_name and 2 * 3')).toEqual([{ type: 'text', text: 'user_name and 2 * 3' }]);
  });

  it('survives a trip through the visual editor unchanged', () => {
    for (const md of [
      'Export **fails** for *large* files.',
      'Line one\nline two',
      '# Steps\n\n1. Open settings\n2. Click ++export++\n\n- [Logs](https://example.com/logs)\n- {color:red}Blocked{color}',
      '> Customer said this\n\n```\nError 500\n```\n\n---\n\nThanks',
      'Literal \\*stars\\* and `code`'
    ]) {
      expect(roundTrip(md), md).toBe(md);
    }
  });

  it('reads formatting the browser adds while editing', () => {
    const div = document.createElement('div');
    div.innerHTML =
      'First line<div><b>bold</b> and <font color="#c9372c">red</font></div><div><br></div><div>New paragraph</div>';
    expect(htmlToMarkdown(div)).toBe('First line\n**bold** and {color:red}red{color}\n\nNew paragraph');
  });
});
