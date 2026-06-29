export const TEXT_OVERLAY_DESIGN_WIDTH = 720;
export const DEFAULT_TEXT_OVERLAY_MARGIN = 90;
export const TEXT_OVERLAY_CJK_FONT_FAMILY = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';

const CJK_TEXT_REGEX = /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/u;

export function containsCjkGlyphs(text: string): boolean {
  return CJK_TEXT_REGEX.test(text);
}

function wrapWhitespaceParagraph(paragraph: string, maxChars: number): string {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (line.length === 0) {
      line = word;
    } else if (line.length + 1 + word.length <= maxChars) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.join('\n');
}

function wrapCharacterParagraph(paragraph: string, maxChars: number): string {
  const chars = Array.from(paragraph);
  if (chars.length <= maxChars) return paragraph;

  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += maxChars) {
    lines.push(chars.slice(i, i + maxChars).join(''));
  }
  return lines.join('\n');
}

export function wrapTextToWidth(text: string, maxChars: number): string {
  return text
    .split('\n')
    .map((paragraph) => {
      if (!paragraph) return '';
      if (!/\s/u.test(paragraph)) {
        return wrapCharacterParagraph(paragraph, maxChars);
      }
      return wrapWhitespaceParagraph(paragraph, maxChars);
    })
    .join('\n');
}

export function wrapByWordCount(text: string, wordsPerLine: number): string {
  return text
    .split('\n')
    .map((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length <= wordsPerLine) return paragraph;

      const lines: string[] = [];
      for (let i = 0; i < words.length; i += wordsPerLine) {
        lines.push(words.slice(i, i + wordsPerLine).join(' '));
      }
      return lines.join('\n');
    })
    .join('\n');
}

export function wrapTextForOverlay(
  raw: string,
  wordsPerLine: number | undefined,
  paddingLeft: number,
  paddingRight: number,
  fontSize: number,
  designWidth = TEXT_OVERLAY_DESIGN_WIDTH,
): string {
  const wpl = wordsPerLine ?? 0;
  if (wpl > 0) {
    return wrapByWordCount(raw, wpl);
  }

  const effectiveLeft = paddingLeft > 0 ? paddingLeft : DEFAULT_TEXT_OVERLAY_MARGIN;
  const effectiveRight = paddingRight > 0 ? paddingRight : DEFAULT_TEXT_OVERLAY_MARGIN;
  const availableWidth = designWidth - effectiveLeft - effectiveRight;
  const charWidth = containsCjkGlyphs(raw) ? fontSize : fontSize * 0.55;
  const maxChars = Math.max(5, Math.floor(availableWidth / charWidth));
  return wrapTextToWidth(raw, maxChars);
}
