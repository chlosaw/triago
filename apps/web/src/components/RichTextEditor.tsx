import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { htmlToMarkdown, markdownToHtml, TEXT_COLORS, type TextColor } from '../lib/markdown';

/**
 * A description editor with a formatting toolbar and two tabs, like Jira's:
 * Visual (formatted, editable) and Text (the Markdown underneath). The value is
 * always Markdown. Visual mode uses the browser's built-in editing commands;
 * pasted content is always inserted as plain text, so no outside HTML gets in.
 */

type Mode = 'visual' | 'text';

const EMOJI = [
  '👍',
  '👎',
  '😀',
  '🙂',
  '😕',
  '😢',
  '🎉',
  '✅',
  '❌',
  '⚠️',
  '🔥',
  '🐛',
  '💡',
  '📎',
  '📌',
  '⏳',
  '🚀',
  '❓',
  '🙏',
  '👀'
];

const INSERT_ITEMS = ['Divider', 'Code block', 'Quote', "Today's date"] as const;

const BLOCK_STYLES = [
  { value: 'p', label: 'Normal text', md: '' },
  { value: 'h1', label: 'Heading 1', md: '# ' },
  { value: 'h2', label: 'Heading 2', md: '## ' },
  { value: 'h3', label: 'Heading 3', md: '### ' },
  { value: 'pre', label: 'Code block', md: '' },
  { value: 'blockquote', label: 'Quote', md: '> ' }
] as const;

// execCommand is deprecated but is still the one cross-browser way to drive a contentEditable,
// and it keeps the browser's own undo history working.
const exec = (command: string, value?: string) => document.execCommand(command, false, value);

/** Toolbar buttons keep the editor's selection: they act on mouse down, before focus moves. */
function Tool({
  label,
  onPress,
  children,
  expanded
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      className={`rte-tool ${expanded ? 'is-open' : ''}`}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      onMouseDown={(event) => {
        event.preventDefault();
        onPress();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPress();
        }
      }}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  labelledBy,
  placeholder = '',
  minHeight = 160
}: {
  value: string;
  onChange: (markdown: string) => void;
  labelledBy?: string;
  placeholder?: string;
  minHeight?: number;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>('visual');
  const [menu, setMenu] = useState<null | 'style' | 'color' | 'emoji' | 'insert' | 'link'>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const visual = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const saved = useRef<Range | null>(null);
  // The last Markdown this editor produced; anything else is an outside change to show.
  const emitted = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'visual' || !visual.current || value === emitted.current) return;
    visual.current.innerHTML = markdownToHtml(value);
    emitted.current = value;
  }, [value, mode]);

  const emitFromVisual = () => {
    if (!visual.current) return;
    const md = htmlToMarkdown(visual.current);
    emitted.current = md;
    onChange(md);
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    saved.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  };
  const restoreSelection = () => {
    visual.current?.focus();
    if (saved.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(saved.current);
    }
  };

  /** Text mode: replaces the selection through the browser, so Ctrl+Z still works. */
  const replaceSelection = (make: (selected: string) => string) => {
    const area = text.current;
    if (!area) return;
    area.focus();
    const selected = area.value.slice(area.selectionStart, area.selectionEnd);
    if (!exec('insertText', make(selected))) {
      // Fallback for browsers without insertText on textareas.
      const start = area.selectionStart;
      const next = area.value.slice(0, start) + make(selected) + area.value.slice(area.selectionEnd);
      onChange(next);
    }
  };
  const prefixLines = (prefix: (index: number) => string) => {
    const area = text.current;
    if (!area) return;
    // Extend the selection to whole lines first.
    const start = area.value.lastIndexOf('\n', area.selectionStart - 1) + 1;
    let end = area.value.indexOf('\n', area.selectionEnd);
    if (end === -1) end = area.value.length;
    area.setSelectionRange(start, end);
    replaceSelection((lines) =>
      lines
        .split('\n')
        .map((line, index) => prefix(index) + line.replace(/^(#{1,3} |> |[-*] |\d+\. )/, ''))
        .join('\n')
    );
  };

  const act = {
    bold: () => (mode === 'visual' ? exec('bold') : replaceSelection((s) => `**${s || 'bold text'}**`)),
    italic: () => (mode === 'visual' ? exec('italic') : replaceSelection((s) => `*${s || 'italic text'}*`)),
    underline: () => (mode === 'visual' ? exec('underline') : replaceSelection((s) => `++${s || 'underlined text'}++`)),
    bullets: () => (mode === 'visual' ? exec('insertUnorderedList') : prefixLines(() => '- ')),
    numbers: () => (mode === 'visual' ? exec('insertOrderedList') : prefixLines((i) => `${i + 1}. `)),
    color: (color: TextColor | null) => {
      if (mode === 'visual') {
        restoreSelection();
        exec('styleWithCSS', 'false');
        exec('foreColor', color ? TEXT_COLORS[color] : getComputedStyle(visual.current!).color);
      } else if (color) {
        replaceSelection((s) => `{color:${color}}${s || 'coloured text'}{color}`);
      }
    },
    style: (style: (typeof BLOCK_STYLES)[number]) => {
      if (mode === 'visual') {
        restoreSelection();
        exec('formatBlock', `<${style.value}>`);
      } else if (style.value === 'pre') {
        replaceSelection((s) => `\n\`\`\`\n${s || 'code'}\n\`\`\`\n`);
      } else {
        prefixLines(() => style.md);
      }
    },
    insert: (content: string) => {
      if (mode === 'visual') {
        restoreSelection();
        exec('insertText', content);
      } else {
        replaceSelection(() => content);
      }
    },
    rule: () =>
      mode === 'visual' ? (restoreSelection(), exec('insertHorizontalRule')) : replaceSelection(() => '\n---\n'),
    link: (url: string) => {
      const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
      if (mode === 'visual') {
        restoreSelection();
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) exec('createLink', href);
        else {
          const escape = (v: string) =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          exec('insertHTML', `<a href="${escape(href)}">${escape(href)}</a>`);
        }
      } else {
        replaceSelection((s) => `[${s || href}](${href})`);
      }
    },
    undo: () => {
      (mode === 'visual' ? visual.current : text.current)?.focus();
      exec('undo');
    },
    redo: () => {
      (mode === 'visual' ? visual.current : text.current)?.focus();
      exec('redo');
    }
  };

  /** Runs a toolbar action at click time, then closes menus and records the result. */
  const run = (fn: () => void) => {
    fn();
    setMenu(null);
    if (mode === 'visual') emitFromVisual();
  };
  /** Opens or closes a menu, remembering where the cursor was so the action lands there. */
  const toggleMenu = (name: NonNullable<typeof menu>) => {
    if (mode === 'visual') saveSelection();
    setMenu((open) => (open === name ? null : name));
  };

  const chevron = (
    <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        <div className="rte-group rte-menu-wrap">
          <Tool label="Text style" expanded={menu === 'style'} onPress={() => toggleMenu('style')}>
            <span className="rte-style-label">Style</span>
            {chevron}
          </Tool>
          {menu === 'style' && (
            <div className="rte-menu" role="menu">
              {BLOCK_STYLES.map((style) => (
                <button
                  key={style.value}
                  type="button"
                  role="menuitem"
                  className={`rte-menu-item rte-style-${style.value}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    run(() => act.style(style));
                  }}
                >
                  {style.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="rte-sep" />
        <div className="rte-group">
          <Tool label="Bold (Ctrl+B)" onPress={() => run(act.bold)}>
            <strong>B</strong>
          </Tool>
          <Tool label="Italic (Ctrl+I)" onPress={() => run(act.italic)}>
            <em className="rte-italic">I</em>
          </Tool>
          <Tool label="Underline (Ctrl+U)" onPress={() => run(act.underline)}>
            <u>U</u>
          </Tool>
          <div className="rte-menu-wrap">
            <Tool label="Text colour" expanded={menu === 'color'} onPress={() => toggleMenu('color')}>
              <span className="rte-color-a">A</span>
              {chevron}
            </Tool>
            {menu === 'color' && (
              <div className="rte-menu rte-swatches" role="menu">
                {(Object.keys(TEXT_COLORS) as TextColor[]).map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="menuitem"
                    className="rte-swatch"
                    style={{ background: TEXT_COLORS[color] }}
                    aria-label={color}
                    title={color}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      run(() => act.color(color));
                    }}
                  />
                ))}
                {mode === 'visual' && (
                  <button
                    type="button"
                    role="menuitem"
                    className="rte-menu-item"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      run(() => act.color(null));
                    }}
                  >
                    Default colour
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <span className="rte-sep" />
        <div className="rte-group rte-menu-wrap">
          <Tool label="Link" expanded={menu === 'link'} onPress={() => toggleMenu('link')}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
              <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
            {chevron}
          </Tool>
          {menu === 'link' && (
            <form
              className="rte-menu rte-link-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (linkUrl.trim()) run(() => act.link(linkUrl.trim()));
                setLinkUrl('');
              }}
            >
              <label className="form-label" htmlFor={`${id}-link`}>
                Paste or type a link
              </label>
              <input
                id={`${id}-link`}
                className="input"
                autoFocus
                placeholder="https://…"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                Insert
              </button>
            </form>
          )}
        </div>
        <span className="rte-sep" />
        <div className="rte-group">
          <Tool label="Bulleted list" onPress={() => run(act.bullets)}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M9 6h11M9 12h11M9 18h11" />
              <circle cx="4.5" cy="6" r="1" fill="currentColor" />
              <circle cx="4.5" cy="12" r="1" fill="currentColor" />
              <circle cx="4.5" cy="18" r="1" fill="currentColor" />
            </svg>
          </Tool>
          <Tool label="Numbered list" onPress={() => run(act.numbers)}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10 6h10M10 12h10M10 18h10" />
              <path d="M4 5h1.5v4M3.5 9h3M3.5 14.5c0-1 2.8-1 2.8.2 0 .8-2.8 1.6-2.8 2.8h3" strokeWidth="1.4" />
            </svg>
          </Tool>
        </div>
        <span className="rte-sep" />
        <div className="rte-group rte-menu-wrap">
          <Tool label="Emoji" expanded={menu === 'emoji'} onPress={() => toggleMenu('emoji')}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
              <circle cx="9" cy="10" r="0.6" fill="currentColor" />
              <circle cx="15" cy="10" r="0.6" fill="currentColor" />
            </svg>
            {chevron}
          </Tool>
          {menu === 'emoji' && (
            <div className="rte-menu rte-emoji" role="menu">
              {EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  className="rte-emoji-btn"
                  aria-label={emoji}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    run(() => act.insert(emoji));
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rte-group rte-menu-wrap">
          <Tool label="Insert" expanded={menu === 'insert'} onPress={() => toggleMenu('insert')}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {chevron}
          </Tool>
          {menu === 'insert' && (
            <div className="rte-menu" role="menu">
              {INSERT_ITEMS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="menuitem"
                  className="rte-menu-item"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    run(() => {
                      if (item === 'Divider') act.rule();
                      else if (item === 'Code block') act.style(BLOCK_STYLES[4]);
                      else if (item === 'Quote') act.style(BLOCK_STYLES[5]);
                      else act.insert(new Date().toLocaleDateString());
                    });
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {mode === 'visual' ? (
        <div
          ref={visual}
          className="rte-area rte-visual markdown"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelledBy}
          data-placeholder={placeholder}
          data-empty={value.trim() ? undefined : 'true'}
          spellCheck
          style={{ minHeight }}
          onInput={emitFromVisual}
          onBlur={emitFromVisual}
          onPaste={(event) => {
            // Plain text only: never let pasted HTML (scripts, styles, tracking pixels) in.
            event.preventDefault();
            exec('insertText', event.clipboardData.getData('text/plain'));
          }}
          onDrop={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
              event.preventDefault();
              saveSelection();
              setMenu('link');
            }
          }}
        />
      ) : (
        <textarea
          ref={text}
          className="rte-area rte-text"
          aria-labelledby={labelledBy}
          placeholder={placeholder}
          spellCheck
          style={{ minHeight }}
          value={value}
          onChange={(event) => {
            emitted.current = null;
            onChange(event.target.value);
          }}
        />
      )}

      <div className="rte-footer">
        <div className="rte-tabs" role="tablist" aria-label="Editor mode">
          {(['visual', 'text'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              className={`rte-tab ${mode === tab ? 'is-active' : ''}`}
              onClick={() => {
                if (mode === 'visual') emitFromVisual();
                emitted.current = null; // re-render the visual view from the Markdown
                setMenu(null);
                setMode(tab);
              }}
            >
              {tab === 'visual' ? 'Visual' : 'Text'}
            </button>
          ))}
        </div>
        <div className="rte-history">
          <Tool label="Undo" onPress={() => run(act.undo)}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
          </Tool>
          <Tool label="Redo" onPress={() => run(act.redo)}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H10a6 6 0 0 0 0 12h3" />
            </svg>
          </Tool>
        </div>
      </div>
    </div>
  );
}
