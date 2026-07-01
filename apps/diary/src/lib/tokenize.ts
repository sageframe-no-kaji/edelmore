export interface Token {
  text: string;
  start: number;
  end: number;
  isWord: boolean;
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  if (text.length === 0) return tokens;

  const re = /(\s+)|(\S+)/g;
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const isWhitespace = match[1] !== undefined;
    tokens.push({
      text: match[0],
      start,
      end,
      isWord: !isWhitespace,
    });
    match = re.exec(text);
  }
  return tokens;
}

export function findWordIndex(tokens: Token[], charIndex: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const tok = tokens[mid];
    if (charIndex < tok.start) {
      hi = mid - 1;
    } else if (charIndex >= tok.end) {
      lo = mid + 1;
    } else {
      if (tok.isWord) return mid;
      for (let j = mid - 1; j >= 0; j--) {
        if (tokens[j].isWord) return j;
      }
      return -1;
    }
  }
  return -1;
}
