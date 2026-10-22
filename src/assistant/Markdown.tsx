import type { ReactNode } from "react";

// Minimal, safe markdown for assistant replies: paragraphs, **bold**, `code`,
// bullet and numbered lists, and pipe tables. Builds React nodes, never HTML.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**") ? <strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong> : <code key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    // Table: header row, separator row, body rows.
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(cells(lines[i++]!));
      const numeric = head.map((_, c) => rows.length > 0 && rows.every((r) => /^-?[\d.,]+\s*(h|%)?$/.test(r[c] ?? "")));
      blocks.push(
        <div className="table-wrap md-table" key={k++}>
          <table className="table">
            <thead>
              <tr>
                {head.map((h, c) => (
                  <th key={c} className={numeric[c] ? "right" : undefined}>
                    {inline(h, `h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, c) => (
                    <td key={c} className={numeric[c] ? "right num" : undefined}>
                      {inline(r[c] ?? "", `c${ri}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*•])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*([-*•])\s+/).test(lines[i]!)) {
        items.push(lines[i]!.replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*([-*•])\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `l${k}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      blocks.push(<h4 key={k++}>{inline(heading[1]!, `hd${k}`)}</h4>);
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!) && !lines[i]!.trim().startsWith("|") && !/^#{1,4}\s/.test(lines[i]!)) {
      para.push(lines[i++]!);
    }
    // A stray line that matched no block (e.g. a lone "|") is shown as text.
    if (!para.length) para.push(lines[i++]!);
    blocks.push(<p key={k++}>{inline(para.join(" "), `p${k}`)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
