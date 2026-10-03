export function parseHexList(text: string): string[] {
  const matches = text.match(/#?\b[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
  return matches.map((m) => {
    let h = m.replace('#', '').toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join(''); // #0f0 -> #00ff00
    return '#' + h;
  });
}