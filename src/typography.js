// Apply Czech nonbreaking spaces to visible HTML text at build/dev time.
// Attributes, comments and literal input/code content must stay unchanged.
export function czechTypography(html) {
  let inBody = false;
  let literalDepth = 0;
  return html.replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g, token => {
    if (token.startsWith('<!--')) return token;
    if (token.startsWith('<')) {
      if (/^<body\b/i.test(token)) inBody = true;
      if (/^<\/body\b/i.test(token)) inBody = false;
      if (inBody && /^<(script|style|textarea|pre|code)\b/i.test(token)) literalDepth++;
      if (inBody && /^<\/(script|style|textarea|pre|code)\b/i.test(token)) literalDepth--;
      return token;
    }
    if (!inBody || literalDepth) return token;
    return token.replace(/(?<![\p{L}\p{N}_])([aikosuvz])[ \t\r\n]+(?=\S)/giu, '$1\u00a0');
  });
}
