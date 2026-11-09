import { Fragment, type ReactNode } from "react";
import { safeExternalHref } from "@officehub/ui";

/** Inline: **bold**, _italic_, `code`, [text](url). Links render only for http(s) via safeExternalHref (SEC-09); otherwise just the text. Everything else is plain text (React escapes it; no HTML is ever injected). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\[[^\]]*\]\([^)\s]*\)|\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("[")) {
      const lm = /^\[([^\]]*)\]\(([^)\s]*)\)$/.exec(t)!;
      const href = safeExternalHref(lm[2]);
      out.push(
        href ? (
          <a key={i++} href={href} target="_blank" rel="noreferrer noopener">
            {lm[1]}
          </a>
        ) : (
          lm[1]
        ),
      );
    } else if (t.startsWith("**")) out.push(<strong key={i++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={i++}>{t.slice(1, -1)}</code>);
    else out.push(<em key={i++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Tiny, safe markdown for the handoff pack: headings, bullet lists, blockquotes, paragraphs. */
export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list}</ul>);
    if (quote.length) blocks.push(<blockquote key={`q${blocks.length}`}>{quote.join(" ")}</blockquote>);
    list = [];
    quote = [];
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    const q = /^\s+>\s?(.*)$/.exec(line) ?? /^>\s?(.*)$/.exec(line);
    if (q) {
      quote.push(q[1]!);
      return;
    }
    if (li) {
      if (quote.length) flush();
      list.push(<li key={idx}>{inline(li[1]!)}</li>);
      return;
    }
    flush();
    if (h) {
      const level = h[1]!.length;
      const Tag = (level === 1 ? "h1" : "h2") as "h1" | "h2";
      blocks.push(<Tag key={idx}>{inline(h[2]!)}</Tag>);
    } else if (line.trim()) blocks.push(<p key={idx} className="my-2 text-oh-sm">{inline(line)}</p>);
  });
  flush();
  return (
    <div className="oh-prose text-oh-sm">
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}
