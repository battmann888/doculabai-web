/**
 * Detect the dominant font-family used in a rendered document.
 * Falls back to empty string so edits keep the original inline font.
 */
export function detectDocumentFont(container: HTMLElement | null): string {
  if (!container) return '';

  const counts = new Map<string, number>();
  const nodes = container.querySelectorAll<HTMLElement>(
    'p, span, td, th, li, h1, h2, h3, h4, h5, h6, a, div',
  );

  for (const el of Array.from(nodes)) {
    const text = el.textContent?.trim() || '';
    if (text.length < 2) continue;

    const family = window.getComputedStyle(el).fontFamily;
    const primary = normalizeFontFamily(family);
    if (!primary) continue;

    // Weight longer text runs higher — better signal of body font
    counts.set(primary, (counts.get(primary) || 0) + text.length);
  }

  let best = '';
  let bestScore = 0;
  for (const [name, score] of counts) {
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }

  return best;
}

export function normalizeFontFamily(family: string): string {
  if (!family) return '';
  const first = family.split(',')[0]?.trim() || '';
  return first.replace(/^['"]|['"]$/g, '');
}

/** Built-in edit font choices; document font is prepended dynamically. */
export const STANDARD_FONTS = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Calibri', label: 'Calibri' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
] as const;
