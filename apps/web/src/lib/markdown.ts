/**
 * The small Markdown dialect ticket descriptions are written in:
 *
 *   **bold**  *italic*  ++underline++  `code`  {color:red}text{color}  [text](https://…)
 *   # Heading (1–3)   - bullet   1. numbered   > quote   ``` code block ```   ---
 *
 * One parser, two outputs: React elements for display (text is never injected as
 * HTML) and escaped HTML for the editor's visual mode. Links must be http(s) or
 * mailto; anything else stays plain text.
 */

export const TEXT_COLORS = {
  red: '#c9372c',
  orange: '#c25100',
  green: '#1f845a',
  blue: '#0c66e4',
  purple: '#6e5dc6',
  gray: '#626f86'
} as const;
export type TextColor = keyof typeof TEXT_COLORS;

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em' | 'u'; children: Inline[] }
  | { type: 'color'; color: TextColor; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'br' };

export type Block =
  | { type: 'p'; children: Inline[] }
  | { type: 'h'; level: 1 | 2 | 3; children: Inline[] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'pre'; text: string }
  | { type: 'hr' };

const ESCAPABLE = '\\*_+`[]{}()#>-.!';

export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(trimmed) ? trimmed : null;
}

const isColor = (name: string): name is TextColor => Object.hasOwn(TEXT_COLORS, name);

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  const wrap = (marker: string, i: number) => {
    const end = source.indexOf(marker, i + marker.length);
    return end > i + marker.length ? end : -1;
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const ch = source[i]!;

    if (ch === '\\' && i + 1 < source.length && ESCAPABLE.includes(source[i + 1]!)) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      flush();
      out.push({ type: 'br' });
      i += 1;
      continue;
    }
    if (ch === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: 'code', text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith('**') || rest.startsWith('++')) {
      const marker = rest.slice(0, 2);
      const end = wrap(marker, i);
      if (end !== -1) {
        flush();
        out.push({ type: marker === '**' ? 'strong' : 'u', children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' || (ch === '_' && !/\w/.test(source[i - 1] ?? ''))) {
      const end = source.indexOf(ch, i + 1);
      const closesWord = ch === '*' || !/\w/.test(source[end + 1] ?? '');
      if (end > i + 1 && closesWord && source[i + 1] !== ' ') {
        flush();
        out.push({ type: 'em', children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '{') {
      const open = /^\{color:([a-z]+)\}/.exec(rest);
      const end = open ? source.indexOf('{color}', i + open[0].length) : -1;
      if (open && end !== -1 && isColor(open[1]!)) {
        flush();
        out.push({
          type: 'color',
          color: open[1] as TextColor,
          children: parseInline(source.slice(i + open[0].length, end))
        });
        i = end + '{color}'.length;
        continue;
      }
    }
    if (ch === '[') {
      const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
      const href = link ? safeHref(link[2]!) : null;
      if (link && href) {
        flush();
        out.push({ type: 'link', href, children: parseInline(link[1]!) });
        i += link[0].length;
        continue;
      }
    }
    if ((ch === 'h' || ch === 'm') && !/\w/.test(source[i - 1] ?? '')) {
      const bare = /^(?:https?:\/\/|mailto:)[^\s<]+/i.exec(rest);
      if (bare) {
        const url = bare[0].replace(/[.,;:!?)\]]+$/, '');
        const href = safeHref(url);
        if (href) {
          flush();
          out.push({ type: 'link', href, children: [{ type: 'text', text: url }] });
          i += url.length;
          continue;
        }
      }
    }
    text += ch;
    i += 1;
  }
  flush();
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const collect = (test: (line: string) => boolean, strip: (line: string) => string) => {
    const items: string[] = [];
    while (i < lines.length && test(lines[i]!)) items.push(strip(lines[i++]!));
    return items;
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      i += 1;
      const code: string[] = [];
      while (i < lines.length && !lines[i]!.startsWith('```')) code.push(lines[i++]!);
      i += 1; // closing fence (or end)
      blocks.push({ type: 'pre', text: code.join('\n') });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'h', level: heading[1]!.length as 1 | 2 | 3, children: parseInline(heading[2]!) });
      i += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted = collect(
        (l) => /^>\s?/.test(l),
        (l) => l.replace(/^>\s?/, '')
      );
      blocks.push({ type: 'quote', children: parseInline(quoted.join('\n')) });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = collect(
        (l) => /^[-*]\s+/.test(l),
        (l) => l.replace(/^[-*]\s+/, '')
      );
      blocks.push({ type: 'ul', items: items.map(parseInline) });
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items = collect(
        (l) => /^\d+[.)]\s+/.test(l),
        (l) => l.replace(/^\d+[.)]\s+/, '')
      );
      blocks.push({ type: 'ol', items: items.map(parseInline) });
      continue;
    }
    const paragraph = collect(
      (l) => Boolean(l.trim()) && !/^(```|#{1,3}\s|>|[-*]\s|\d+[.)]\s|-{3,}\s*$|\*{3,}\s*$)/.test(l),
      (l) => l
    );
    blocks.push({ type: 'p', children: parseInline(paragraph.join('\n')) });
  }
  return blocks;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return escapeHtml(node.text);
        case 'br':
          return '<br>';
        case 'code':
          return `<code>${escapeHtml(node.text)}</code>`;
        case 'strong':
          return `<strong>${inlineHtml(node.children)}</strong>`;
        case 'em':
          return `<em>${inlineHtml(node.children)}</em>`;
        case 'u':
          return `<u>${inlineHtml(node.children)}</u>`;
        case 'color':
          return `<span class="md-color md-${node.color}" data-color="${node.color}">${inlineHtml(node.children)}</span>`;
        case 'link':
          return `<a href="${escapeHtml(node.href)}">${inlineHtml(node.children)}</a>`;
      }
    })
    .join('');
}

/** Escaped HTML, for the editor's visual mode. */
export function markdownToHtml(source: string): string {
  return parseMarkdown(source)
    .map((block) => {
      switch (block.type) {
        case 'p':
          return `<p>${inlineHtml(block.children)}</p>`;
        case 'h':
          return `<h${block.level}>${inlineHtml(block.children)}</h${block.level}>`;
        case 'ul':
        case 'ol':
          return `<${block.type}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${block.type}>`;
        case 'quote':
          return `<blockquote>${inlineHtml(block.children)}</blockquote>`;
        case 'pre':
          return `<pre>${escapeHtml(block.text)}</pre>`;
        case 'hr':
          return '<hr>';
      }
    })
    .join('');
}

/** Escapes characters that would otherwise start formatting. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_`[\]{}])/g, '\\$1').replace(/\+\+/g, '\\+\\+');
}

const HEX_TO_COLOR = new Map<string, TextColor>(
  Object.entries(TEXT_COLORS).map(([name, hex]) => [hex, name as TextColor])
);

/** "rgb(201, 55, 44)" or "#C9372C" → a palette name, if it is one. */
function colorName(value: string | null): TextColor | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (isColor(v)) return v;
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(v);
  const hex = rgb
    ? `#${rgb
        .slice(1, 4)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')}`
    : v;
  return HEX_TO_COLOR.get(hex) ?? null;
}

/** The editor's HTML back to Markdown. Unknown elements keep their text and lose their formatting. */
export function htmlToMarkdown(root: HTMLElement): string {
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeMarkdown((node.textContent ?? '').replace(/\u00a0/g, ' '));
    if (!(node instanceof HTMLElement)) return '';
    const inner = () => Array.from(node.childNodes).map(inline).join('');
    const tag = node.tagName;
    if (tag === 'BR') return '\n';
    if (tag === 'B' || tag === 'STRONG') return wrapIf('**', inner());
    if (tag === 'I' || tag === 'EM') return wrapIf('*', inner());
    if (tag === 'U' || tag === 'INS') return wrapIf('++', inner());
    if (tag === 'CODE') return `\`${node.textContent ?? ''}\``;
    if (tag === 'A') {
      const href = safeHref(node.getAttribute('href') ?? '');
      const text = inner();
      return href && text ? `[${text}](${href})` : text;
    }
    const color = colorName(node.getAttribute('data-color') ?? node.getAttribute('color') ?? node.style?.color ?? null);
    if (color) {
      const text = inner();
      return text.trim() ? `{color:${color}}${text}{color}` : text;
    }
    if (node.style?.fontWeight === 'bold' || Number(node.style?.fontWeight) >= 600) return wrapIf('**', inner());
    if (node.style?.fontStyle === 'italic') return wrapIf('*', inner());
    if (node.style?.textDecorationLine === 'underline' || node.style?.textDecoration === 'underline') {
      return wrapIf('++', inner());
    }
    return inner();
  };
  const wrapIf = (marker: string, text: string) => {
    const match = /^(\s*)(.*?)(\s*)$/s.exec(text)!;
    return match[2] ? `${match[1]}${marker}${match[2]}${marker}${match[3]}` : text;
  };

  const lines: string[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length) {
      lines.push(paragraph.join('').replace(/\n+$/, ''), '');
      paragraph = [];
    }
  };
  const block = (node: Node) => {
    if (!(node instanceof HTMLElement)) {
      paragraph.push(inline(node));
      return;
    }
    const tag = node.tagName;
    if (tag === 'UL' || tag === 'OL') {
      endParagraph();
      Array.from(node.children).forEach((li, index) => {
        lines.push(`${tag === 'UL' ? '-' : `${index + 1}.`} ${inline(li).replace(/\n+/g, ' ').trim()}`);
      });
      lines.push('');
    } else if (/^H[1-6]$/.test(tag)) {
      endParagraph();
      const level = Math.min(3, Number(tag[1]));
      lines.push(`${'#'.repeat(level)} ${inline(node).replace(/\n+/g, ' ').trim()}`, '');
    } else if (tag === 'PRE') {
      endParagraph();
      lines.push('```', (node.textContent ?? '').replace(/\n$/, ''), '```', '');
    } else if (tag === 'BLOCKQUOTE') {
      endParagraph();
      lines.push(
        ...inline(node)
          .trim()
          .split('\n')
          .map((l) => `> ${l}`),
        ''
      );
    } else if (tag === 'HR') {
      endParagraph();
      lines.push('---', '');
    } else if (tag === 'P' || tag === 'DIV') {
      // Each editor line is a <div>; consecutive lines stay one paragraph, an empty line ends it.
      const text = inline(node);
      if (!text.trim()) endParagraph();
      else if (tag === 'P') {
        endParagraph();
        paragraph.push(text);
        endParagraph();
      } else paragraph.push((paragraph.length ? '\n' : '') + text);
    } else {
      paragraph.push(inline(node));
    }
  };
  Array.from(root.childNodes).forEach(block);
  endParagraph();
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
