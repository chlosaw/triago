import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type Inline } from '../lib/markdown';

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={index}>{node.text}</Fragment>;
      case 'br':
        return <br key={index} />;
      case 'code':
        return <code key={index}>{node.text}</code>;
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>;
      case 'u':
        return <u key={index}>{renderInline(node.children)}</u>;
      case 'color':
        return (
          <span key={index} className={`md-color md-${node.color}`}>
            {renderInline(node.children)}
          </span>
        );
      case 'link':
        return (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

/** Renders a description written in Triago's Markdown. Text is never inserted as HTML. */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  return (
    <div className={`markdown ${className}`}>
      {parseMarkdown(source).map((block, index) => {
        switch (block.type) {
          case 'p':
            return <p key={index}>{renderInline(block.children)}</p>;
          case 'h': {
            const Tag = `h${block.level + 2}` as 'h3' | 'h4' | 'h5';
            return <Tag key={index}>{renderInline(block.children)}</Tag>;
          }
          case 'ul':
            return (
              <ul key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case 'quote':
            return <blockquote key={index}>{renderInline(block.children)}</blockquote>;
          case 'pre':
            return <pre key={index}>{block.text}</pre>;
          case 'hr':
            return <hr key={index} />;
        }
      })}
    </div>
  );
}
