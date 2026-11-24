import { Fragment } from 'react';

const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text, keyPrefix) {
  const parts = String(text).split(inlinePattern).filter((part) => part !== '');
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const href = linkMatch[2];
      const safe = /^https?:\/\//i.test(href) || href.startsWith('/');
      if (safe) {
        return (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {linkMatch[1]}
          </a>
        );
      }
      return <span key={key}>{linkMatch[1]}</span>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export default function Markdown({ content = '' }) {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  let blockKey = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().startsWith('```')) {
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre className="md-code" key={`b-${blockKey}`}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      blockKey += 1;
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#{1,3}\s/, '');
      const Tag = `h${level + 1}`;
      blocks.push(
        <Tag key={`b-${blockKey}`} className="md-heading">
          {renderInline(text, `h-${blockKey}`)}
        </Tag>,
      );
      blockKey += 1;
      index += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        quote.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push(
        <blockquote key={`b-${blockKey}`}>{renderInline(quote.join(' '), `q-${blockKey}`)}</blockquote>,
      );
      blockKey += 1;
      continue;
    }

    if (/^-\s\[[ xX]\]\s/.test(line)) {
      const items = [];
      while (index < lines.length && /^-\s\[[ xX]\]\s/.test(lines[index])) {
        const checked = /^-\s\[[xX]\]/.test(lines[index]);
        const text = lines[index].replace(/^-\s\[[ xX]\]\s/, '');
        items.push({ checked, text });
        index += 1;
      }
      blocks.push(
        <ul className="md-checklist" key={`b-${blockKey}`}>
          {items.map((item, itemIndex) => (
            <li key={`i-${blockKey}-${itemIndex}`} className={item.checked ? 'checked' : ''}>
              <span className="md-check" aria-hidden="true">
                {item.checked ? '✓' : ''}
              </span>
              <span>{renderInline(item.text, `c-${blockKey}-${itemIndex}`)}</span>
            </li>
          ))}
        </ul>,
      );
      blockKey += 1;
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s/.test(lines[index]) && !/^-\s\[[ xX]\]/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s/, ''));
        index += 1;
      }
      blocks.push(
        <ul key={`b-${blockKey}`}>
          {items.map((item, itemIndex) => (
            <li key={`i-${blockKey}-${itemIndex}`}>
              {renderInline(item, `li-${blockKey}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      blockKey += 1;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s/, ''));
        index += 1;
      }
      blocks.push(
        <ol key={`b-${blockKey}`}>
          {items.map((item, itemIndex) => (
            <li key={`i-${blockKey}-${itemIndex}`}>
              {renderInline(item, `li-${blockKey}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      blockKey += 1;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^#{1,3}\s/.test(lines[index]) &&
      !/^[-*]\s/.test(lines[index]) &&
      !/^\d+\.\s/.test(lines[index]) &&
      !lines[index].startsWith('> ') &&
      !lines[index].trim().startsWith('```')
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`b-${blockKey}`}>
        {paragraph.map((paragraphLine, lineIndex) => (
          <Fragment key={`l-${blockKey}-${lineIndex}`}>
            {lineIndex > 0 && <br />}
            {renderInline(paragraphLine, `p-${blockKey}-${lineIndex}`)}
          </Fragment>
        ))}
      </p>,
    );
    blockKey += 1;
  }

  if (!blocks.length) {
    return <p className="md-empty">—</p>;
  }

  return <div className="markdown-body">{blocks}</div>;
}
