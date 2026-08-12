const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ||
  'http://localhost:8001';

/**
 * Send the edited document HTML to the backend to be converted into a proper
 * .docx file, then trigger a browser download.
 */
export async function downloadAsDocx(
  container: HTMLElement,
  fileName: string,
): Promise<void> {
  const html = serializeStyledDocument(container);
  const res = await fetch(`${API_BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, fileName }),
  });

  if (!res.ok) {
    throw new Error('Export failed');
  }

  const blob = await res.blob();
  if (blob.size < 1000) {
    throw new Error('Export returned an invalid or empty document.');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/\.docx$/i, '') + '-edited.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function serializeStyledDocument(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  const originalElements = [container, ...Array.from(container.querySelectorAll<HTMLElement>('*'))];
  const clonedElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
  const styleProperties = [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-decoration',
    'text-align',
    'color',
    'background-color',
    'line-height',
    'vertical-align',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-color',
  ];

  originalElements.forEach((original, index) => {
    const target = clonedElements[index];
    if (!target) return;
    const computed = window.getComputedStyle(original);
    for (const property of styleProperties) {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    }
    target.removeAttribute('class');
  });

  return clone.innerHTML;
}
