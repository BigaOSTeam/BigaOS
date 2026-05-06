/**
 * Parse a .txt translation file with key=value format.
 * Lines starting with # are comments. Empty lines are skipped.
 *
 * The literal escape sequences `\n` and `\\` are interpreted in values so a
 * single line in the file can express multi-paragraph copy (used by
 * tutorial cards and similar). Other backslash sequences pass through
 * unchanged.
 */
export function parseTxt(content: string): Record<string, string> {
  const translations: Record<string, string> = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const raw = trimmed.substring(eqIndex + 1).trim();
    if (key) {
      translations[key] = raw.replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    }
  }
  return translations;
}
