import React from 'react';
import katex from 'katex';

interface MathTextProps {
  text: string;
  className?: string;
}

function sanitizeRawArtifacts(input: string): string {
  return input
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\\n(?![a-zA-Z])/g, '\n')
    // Ensure set difference braces like \setminus {1} or ℝ \ {1} render visible curly braces \{1\}
    .replace(/(\\setminus|∖)\s*\{\s*([^{}\\]+?)\s*\}/g, '\\setminus \\{$2\\}')
    .replace(/(\bR|\\mathbb\{R\})\s*\\\s*\{\s*([^{}\\]+?)\s*\}/g, '$1 \\setminus \\{$2\\}')
    // Fix 3-vertex angle notation \vec{ABC} or \vec{B'AB} -> \widehat{...}
    .replace(/\\vec\{([A-Z]'?[A-Z]'?[A-Z]'?)\}/g, '\\widehat{$1}');
}

export const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  if (!text) return null;
  const cleaned = sanitizeRawArtifacts(text);

  // Check if text contains a multi-line Markdown pipe table
  if (cleaned.includes('|') && cleaned.includes('\n')) {
    const lines = cleaned.split('\n');
    const blocks: { kind: 'text' | 'table'; lines: string[] }[] = [];
    let current: { kind: 'text' | 'table'; lines: string[] } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      const isTableRow =
        trimmed.startsWith('|') &&
        trimmed.endsWith('|') &&
        trimmed.split('|').length >= 3;
      const nextKind = isTableRow ? 'table' : 'text';
      if (!current || current.kind !== nextKind) {
        if (current) blocks.push(current);
        current = { kind: nextKind, lines: [line] };
      } else {
        current.lines.push(line);
      }
    }
    if (current) blocks.push(current);

    if (blocks.some((b) => b.kind === 'table' && b.lines.length >= 2)) {
      return (
        <span className={`block space-y-2 ${className}`}>
          {blocks.map((blk, bIdx) => {
            if (blk.kind === 'table' && blk.lines.length >= 2) {
              const dataRows = blk.lines
                .map((l) =>
                  l
                    .trim()
                    .replace(/^\|/, '')
                    .replace(/\|$/, '')
                    .split('|')
                    .map((c) => c.trim())
                )
                .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));

              return (
                <div key={`md-tbl-${bIdx}`} className="my-2 overflow-x-auto">
                  <table className="w-full border-collapse rounded-[8px] border border-[#CBD5E1] text-center text-[13.5px] dark:border-slate-700">
                    <tbody>
                      {dataRows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={
                            rIdx === 0
                              ? 'bg-[#F1F5F9] font-semibold text-[#0F172A] dark:bg-slate-800 dark:text-slate-100'
                              : 'bg-white text-[#334155] dark:bg-slate-900 dark:text-slate-200'
                          }
                        >
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="border border-[#CBD5E1] px-3 py-1.5 text-center dark:border-slate-700"
                            >
                              <MathText text={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            return (
              <span key={`md-txt-${bIdx}`} className="block">
                <MathText text={blk.lines.join('\n').replace(/\|/g, '∣')} />
              </span>
            );
          })}
        </span>
      );
    }
  }

  // Split by $$...$$ first, then $...$
  const tokens: { type: 'text' | 'block' | 'inline'; content: string }[] = [];
  const blockRegex = /\$\$([\s\S]*?)\$\$/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(cleaned)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: 'text', content: cleaned.slice(lastIdx, match.index) });
    }
    tokens.push({ type: 'block', content: match[1] });
    lastIdx = blockRegex.lastIndex;
  }
  if (lastIdx < cleaned.length) {
    tokens.push({ type: 'text', content: cleaned.slice(lastIdx) });
  }

  const finalNodes: React.ReactNode[] = [];
  tokens.forEach((tok, tIdx) => {
    if (tok.type === 'block') {
      try {
        const html = katex.renderToString(tok.content.trim(), {
          displayMode: true,
          throwOnError: false,
          strict: false,
        });
        finalNodes.push(
          <span
            key={`b-${tIdx}`}
            className="math-block-scroll my-1.5 block w-full max-w-full py-0.5 text-center"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        finalNodes.push(<span key={`b-${tIdx}`}>{tok.content}</span>);
      }
      return;
    }

    // Parse inline $...$
    const inlineRegex = /\$([^$]+?)\$/g;
    let iLast = 0;
    let iMatch: RegExpExecArray | null;
    while ((iMatch = inlineRegex.exec(tok.content)) !== null) {
      if (iMatch.index > iLast) {
        finalNodes.push(
          <React.Fragment key={`t-${tIdx}-${iLast}`}>
            {tok.content.slice(iLast, iMatch.index)}
          </React.Fragment>
        );
      }
      try {
        const html = katex.renderToString(iMatch[1].trim(), {
          displayMode: false,
          throwOnError: false,
          strict: false,
        });
        finalNodes.push(
          <span
            key={`i-${tIdx}-${iMatch.index}`}
            className="px-0.5 align-baseline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        finalNodes.push(<span key={`i-${tIdx}-${iMatch.index}`}>{iMatch[1]}</span>);
      }
      iLast = inlineRegex.lastIndex;
    }
    if (iLast < tok.content.length) {
      finalNodes.push(
        <React.Fragment key={`t-end-${tIdx}-${iLast}`}>
          {tok.content.slice(iLast)}
        </React.Fragment>
      );
    }
  });

  return <span className={className}>{finalNodes}</span>;
};
