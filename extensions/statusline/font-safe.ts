export function fontSafeLines(lines: string[]): string[] {
  return lines.map((line) => line.replace(/[\ue0b1\ue0b4]/g, "|"));
}
