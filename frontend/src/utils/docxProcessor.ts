import JSZip from 'jszip';
import { renderAsync } from 'docx-preview';
import type {
  DocSegment,
  SegmentDiff,
  AIOperation,
  TextFormatProps,
  ParagraphFormatProps,
  PageLayoutProps,
  OperationResult,
} from '@/types';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

type XmlDocument = Document;
type SegmentLocation = 'body' | 'header' | 'footer' | 'footnote' | 'endnote' | 'comment';

export interface EditableDocx {
  zip: JSZip;
  segments: DocSegment[];
  images: Record<string, string>;
  fontFamily: string;
}


const textPartPattern = /^word\/(?!_rels\/|media\/).+\.xml$/;

function textOf(element: Element): string {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, 't'))
    .map((node) => node.textContent || '')
    .join('');
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseXml(xml: string): XmlDocument {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('Dokumen DOCX berisi XML yang tidak valid.');
  return parsed;
}

function serializeXml(document: XmlDocument): string {
  return new XMLSerializer().serializeToString(document);
}

function locationForPart(part: string): SegmentLocation {
  if (/header\d+\.xml$/.test(part)) return 'header';
  if (/footer\d+\.xml$/.test(part)) return 'footer';
  if (/footnotes/.test(part)) return 'footnote';
  if (/endnotes/.test(part)) return 'endnote';
  if (/comments/.test(part)) return 'comment';
  return 'body';
}

function makeId(part: string, kind: string, index: number): string {
  return `${part}:${kind}:${index}`;
}

function segmentTypeForParagraph(paragraph: Element): DocSegment['type'] {
  const style = paragraph.getElementsByTagNameNS(WORD_NS, 'pStyle')[0];
  const styleName = style?.getAttributeNS(WORD_NS, 'val') || style?.getAttribute('w:val') || '';
  return /^heading\s*[1-9]|^heading[1-9]/i.test(styleName) ? 'heading' : 'paragraph';
}

async function getImageData(zip: JSZip, path: string): Promise<string> {
  const entry = zip.files[path];
  if (!entry) return '';
  const base64 = await entry.async('base64');
  const extension = path.split('.').pop()?.toLowerCase() || 'png';
  const mime = extension === 'jpg' || extension === 'jpeg'
    ? 'image/jpeg'
    : extension === 'gif'
      ? 'image/gif'
      : extension === 'svg'
        ? 'image/svg+xml'
        : extension === 'bmp'
          ? 'image/bmp'
          : extension === 'webp'
            ? 'image/webp'
            : 'image/png';
  return `data:${mime};base64,${base64}`;
}

function resolveRelationshipTarget(ownerPart: string, target: string): string {
  const base = ownerPart.slice(0, ownerPart.lastIndexOf('/') + 1);
  const joined = `${base}${target}`.replace(/\\/g, '/');
  const result: string[] = [];
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') result.pop();
    else result.push(part);
  }
  return result.join('/');
}

async function imagesForPart(
  zip: JSZip,
  part: string,
  source: XmlDocument,
  images: Record<string, string>,
  startPosition: number,
): Promise<DocSegment[]> {
  const relPath = `${part.slice(0, part.lastIndexOf('/') + 1)}_rels/${part.split('/').pop()}.rels`;
  const relEntry = zip.files[relPath];
  if (!relEntry) return [];
  const relations = parseXml(await relEntry.async('string'));
  const targets = new Map<string, string>();
  for (const relation of Array.from(relations.getElementsByTagNameNS(REL_NS, 'Relationship'))) {
    const id = relation.getAttribute('Id');
    const target = relation.getAttribute('Target');
    if (id && target && /\/image$/i.test(relation.getAttribute('Type') || '')) {
      targets.set(id, resolveRelationshipTarget(part, target));
    }
  }

  const embeds = Array.from(source.getElementsByTagNameNS('*', 'blip'))
    .map((node) => node.getAttributeNS(OFFICE_REL_NS, 'embed') || node.getAttribute('r:embed'))
    .filter((value): value is string => Boolean(value));
  const vmlEmbeds = Array.from(source.getElementsByTagNameNS('*', 'imagedata'))
    .map((node) => node.getAttributeNS(OFFICE_REL_NS, 'id') || node.getAttribute('r:id'))
    .filter((value): value is string => Boolean(value));

  return Promise.all([...embeds, ...vmlEmbeds].map(async (relId, index) => {
    const imagePath = targets.get(relId) || '';
    const src = imagePath ? await getImageData(zip, imagePath) : '';
    if (imagePath && src) images[imagePath] = src;
    return {
      id: makeId(part, 'image', index),
      type: 'image' as const,
      text: imagePath.split('/').pop() || '[Image]',
      position: startPosition + index,
      meta: { src, sourcePart: part, relationshipId: relId, imagePath, location: locationForPart(part) },
    };
  }));
}

function segmentsForPart(part: string, source: XmlDocument, position: number): DocSegment[] {
  const segments: DocSegment[] = [];
  const tables = Array.from(source.getElementsByTagNameNS(WORD_NS, 'tbl'));
  const tableSet = new Set(tables);
  const paragraphInTable = new Set<Element>();
  tables.forEach((table) => Array.from(table.getElementsByTagNameNS(WORD_NS, 'p')).forEach((p) => paragraphInTable.add(p)));

  tables.forEach((table, tableIndex) => {
    const rows = Array.from(table.getElementsByTagNameNS(WORD_NS, 'tr'));
    const cells = rows.map((row) => Array.from(row.getElementsByTagNameNS(WORD_NS, 'tc')).map(textOf));
    if (!cells.length) return;
    segments.push({
      id: makeId(part, 'table', tableIndex),
      type: 'table',
      text: cells.map((row) => row.join(' | ')).join('\n'),
      position: position + segments.length,
      meta: {
        rows: cells.length,
        cols: Math.max(...cells.map((row) => row.length)),
        cells,
        sourcePart: part,
        nodeIndex: tableIndex,
        location: locationForPart(part),
      },
    });
  });

  const paragraphs = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'));
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphInTable.has(paragraph)) return;
    const text = textOf(paragraph);
    if (!normalize(text)) return;
    segments.push({
      id: makeId(part, 'paragraph', paragraphIndex),
      type: segmentTypeForParagraph(paragraph),
      text,
      position: position + segments.length,
      meta: { sourcePart: part, nodeIndex: paragraphIndex, location: locationForPart(part) },
    });
  });
  void tableSet;
  return segments;
}

export async function openEditableDocx(file: File | Blob, preloadedBuffer?: ArrayBuffer): Promise<EditableDocx> {
  const zip = new JSZip();
  let arrayBuffer = preloadedBuffer;
  if (!arrayBuffer) {
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (err) {
      console.error('[openEditableDocx] Failed to read file.arrayBuffer():', err);
      throw new Error(`Failed to read file bytes: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    console.error('[openEditableDocx] File buffer is empty or zero-length.', {
      fileName: file instanceof File ? file.name : 'blob',
      fileSize: file.size,
      fileType: file.type,
    });
    throw new Error('File is empty or corrupted');
  }
  console.log('[openEditableDocx] Reading DOCX buffer:', {
    fileName: file instanceof File ? file.name : 'blob',
    byteLength: arrayBuffer.byteLength,
    fileSize: file.size,
    fileType: file.type,
  });
  const loaded = await zip.loadAsync(arrayBuffer);

  const segments: DocSegment[] = [];
  const images: Record<string, string> = {};
  const parts = Object.keys(loaded.files).filter((part) => textPartPattern.test(part));
  let position = 0;
  for (const part of parts) {
    const entry = loaded.files[part];
    if (!entry || entry.dir) continue;
    try {
      const xml = await entry.async('string');
      if (!xml || xml.trim().length === 0) continue;
      const document = parseXml(xml);
      const partSegments = segmentsForPart(part, document, position);
      const partImages = await imagesForPart(loaded, part, document, images, position);
      segments.push(...partSegments, ...partImages);
      position += partSegments.length + partImages.length;
    } catch (err) {
      console.warn(`Failed to parse part ${part}:`, err);
      continue;
    }
  }
  const documentXml = loaded.files['word/document.xml'];
  const fontFamily = documentXml ? await extractDocxFont(loaded) : '';
  return { zip: loaded, segments, images, fontFamily };
}

async function extractDocxFont(zip: JSZip): Promise<string> {
  const counts = new Map<string, number>();
  for (const path of ['word/styles.xml', 'word/document.xml']) {
    if (!zip.files[path]) continue;
    const source = parseXml(await zip.files[path].async('string'));
    for (const font of Array.from(source.getElementsByTagNameNS(WORD_NS, 'rFonts'))) {
      for (const attribute of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
        const value = font.getAttributeNS(WORD_NS, attribute) || font.getAttribute(`w:${attribute}`);
        if (value) counts.set(value, (counts.get(value) || 0) + (attribute === 'hAnsi' ? 3 : 1));
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function replaceTextInElement(element: Element, before: string, after: string): boolean {
  const nodes = Array.from(element.getElementsByTagNameNS(WORD_NS, 't'));
  const original = nodes.map((node) => node.textContent || '').join('');

  let start = original.indexOf(before);
  let effectiveBefore = before;
  let effectiveAfter = after;

  if (start < 0) {
    const normalizedOriginal = normalize(original);
    const normalizedBefore = normalize(before);
    const normalizedStart = normalizedOriginal.indexOf(normalizedBefore);
    if (normalizedStart < 0) return false;
    let rawOffset = 0;

    let found = false;
    let rawStart = -1;
    let rawEnd = -1;
    let cursor = 0;
    for (const node of nodes) {
      const value = node.textContent || '';
      const nodeStart = cursor;
      const nodeEnd = cursor + value.length;
      cursor = nodeEnd;
      const normalizedNode = normalize(value);
      const normalizedNodeStart = rawOffset;
      const normalizedNodeEnd = rawOffset + normalizedNode.length;
      rawOffset = normalizedNodeEnd;
      if (normalizedNodeEnd <= normalizedStart || normalizedNodeStart >= normalizedStart + normalizedBefore.length) continue;
      if (rawStart < 0) rawStart = nodeStart;
      rawEnd = nodeEnd;
      found = true;
    }
    if (!found) return false;
    start = rawStart;
    effectiveBefore = original.slice(rawStart, rawEnd);
    effectiveAfter = after;
  }

  const end = start + effectiveBefore.length;
  let cursor = 0;
  let inserted = false;
  nodes.forEach((node) => {
    const value = node.textContent || '';
    const nodeStart = cursor;
    const nodeEnd = cursor + value.length;
    cursor = nodeEnd;
    if (nodeEnd <= start || nodeStart >= end) return;
    const left = nodeStart < start ? value.slice(0, start - nodeStart) : '';
    const right = nodeEnd > end ? value.slice(end - nodeStart) : '';
    node.textContent = `${left}${inserted ? '' : effectiveAfter}${right}`;
    if (!inserted) inserted = true;
    if (/^\s|\s$/u.test(node.textContent || '')) node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  });
  return inserted;
}


async function getPartDocument(model: EditableDocx, part: string): Promise<XmlDocument> {
  const entry = model.zip.files[part];
  if (!entry) throw new Error(`Bagian dokumen tidak ditemukan: ${part}`);
  return parseXml(await entry.async('string'));
}

function nodesForSegment(source: XmlDocument, segment: DocSegment, diff: SegmentDiff): Element[] {
  if (segment.type === 'table') {
    const tables = Array.from(source.getElementsByTagNameNS(WORD_NS, 'tbl'));
    const table = tables[segment.meta?.nodeIndex ?? -1];
    if (!table) return [];
    const rows = Array.from(table.getElementsByTagNameNS(WORD_NS, 'tr'));
    if (diff.target?.row !== undefined && diff.target.column !== undefined) {
      const row = rows[diff.target.row];
      const cell = row ? Array.from(row.getElementsByTagNameNS(WORD_NS, 'tc'))[diff.target.column] || null : null;
      return cell ? [cell] : [];
    }
    const matches: Element[] = [];

    for (const row of rows) {
      const cells = Array.from(row.getElementsByTagNameNS(WORD_NS, 'tc'));
      for (const cell of cells) {
        if (textOf(cell).includes(diff.before)) matches.push(cell);
      }
    }
    return matches;
  }
  const para = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'))[segment.meta?.nodeIndex ?? -1];
  return para ? [para] : [];
}



export async function applyEditsToDocx(model: EditableDocx, diffs: SegmentDiff[]): Promise<string[]> {
  const applied = new Set<string>();
  const byId = new Map(model.segments.map((segment) => [segment.id, segment]));
  const changedParts = new Map<string, XmlDocument>();
  for (const diff of diffs) {
    const segment = byId.get(diff.segmentId);
    const part = segment?.meta?.sourcePart;
    if (!segment || !part || segment.type === 'image' || !diff.before || diff.before === diff.after) continue;
    const source = changedParts.get(part) || await getPartDocument(model, part);
    changedParts.set(part, source);
    const targets = nodesForSegment(source, segment, diff);
    const after = diff.action === 'delete_text' ? '' : diff.after;
    let appliedAny = false;
    for (const target of targets) {
      if (replaceTextInElement(target, diff.before, after)) appliedAny = true;
    }
    if (appliedAny) applied.add(diff.segmentId);
  }
  for (const [part, source] of changedParts) model.zip.file(part, serializeXml(source));
  if (applied.size) updateSegments(model.segments, diffs, applied);
  return [...applied];
}


export function animateEditedSegments(container: HTMLElement, segments: DocSegment[], appliedIds: string[]): void {
  const changed = new Set(appliedIds);
  segments.forEach((segment) => {
    if (!changed.has(segment.id)) return;
    const candidates = Array.from(container.querySelectorAll<HTMLElement>('p, td, th, li, h1, h2, h3, h4, h5, h6'));
    const target = candidates.find((element) => element.textContent?.includes(segment.text));
    if (!target) return;
    target.classList.remove('edit-highlight');
    void target.offsetWidth;
    target.classList.add('edit-highlight');
    window.setTimeout(() => target.classList.remove('edit-highlight'), 2600);
  });
}

function updateSegments(segments: DocSegment[], diffs: SegmentDiff[], applied: Set<string>): void {
  segments.forEach((segment) => {
    if (!applied.has(segment.id)) return;
    const relevant = diffs.filter((diff) => diff.segmentId === segment.id);
    relevant.forEach((diff) => {
      if (segment.meta?.cells) {
        if (diff.target?.row !== undefined && diff.target.column !== undefined) {
          const cell = segment.meta.cells[diff.target.row]?.[diff.target.column];
          if (cell !== undefined && cell.includes(diff.before)) {
            segment.meta.cells[diff.target.row][diff.target.column] = cell.replace(diff.before, diff.after);
          }
          return;
        }
        for (let r = 0; r < segment.meta.cells.length; r += 1) {
          for (let c = 0; c < segment.meta.cells[r].length; c += 1) {
            const cell = segment.meta.cells[r][c];
            if (cell.includes(diff.before)) {
              segment.meta.cells[r][c] = cell.replace(diff.before, diff.after);
            }
          }
        }
      } else {
        segment.text = segment.text.replace(diff.before, diff.after);
      }
    });

    if (segment.meta?.cells) {
      segment.text = segment.meta.cells.map((row) => row.join(' | ')).join('\n');
    }

  });
}


function normalizeDataUrl(value: string): string {
  return value.includes(',') ? value.slice(value.indexOf(',') + 1).replace(/\s/g, '') : value;
}

export function findImageSegment(model: EditableDocx, image: HTMLImageElement): DocSegment | undefined {
  const imageSegments = model.segments.filter((s) => s.type === 'image');
  if (!imageSegments.length) return undefined;

  const src = normalizeDataUrl(image.currentSrc || image.src);
  const exactMatch = imageSegments.find((segment) =>
    segment.meta?.src && normalizeDataUrl(segment.meta.src) === src
  );
  if (exactMatch) return exactMatch;

  const srcTail = src.slice(-80);
  const tailMatch = imageSegments.find((segment) =>
    segment.meta?.src && normalizeDataUrl(segment.meta.src).slice(-80) === srcTail
  );
  if (tailMatch) return tailMatch;

  const alt = (image.alt || '').trim();
  if (alt) {
    const altMatch = imageSegments.find((segment) =>
      segment.text && (segment.text === alt || segment.meta?.imagePath?.endsWith(alt))
    );
    if (altMatch) return altMatch;
  }

  const allImgsInDoc = Array.from(
    image.closest('.docx-preview-wrapper, [class*="docx"]')?.querySelectorAll('img') ||
    document.querySelectorAll('.docx-preview-wrapper img')
  );
  const imgIndex = allImgsInDoc.indexOf(image);
  if (imgIndex >= 0 && imgIndex < imageSegments.length) {
    return imageSegments[imgIndex];
  }

  return imageSegments[0];
}

function extensionFromFile(file: File): string {
  const byName = file.name.split('.').pop()?.toLowerCase();
  if (byName && /^(png|jpe?g|gif|bmp|webp)$/.test(byName)) return byName === 'jpeg' ? 'jpg' : byName;
  return file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/gif' ? 'gif' : file.type === 'image/bmp' ? 'bmp' : file.type === 'image/webp' ? 'webp' : 'png';
}

async function ensureContentType(model: EditableDocx, extension: string, mime: string): Promise<void> {
  const path = '[Content_Types].xml';
  const source = await getPartDocument(model, path);
  const exists = Array.from(source.getElementsByTagNameNS(CONTENT_TYPES_NS, 'Default'))
    .some((node) => (node.getAttribute('Extension') || '').toLowerCase() === extension);
  if (!exists) {
    const node = source.createElementNS(CONTENT_TYPES_NS, 'Default');
    node.setAttribute('Extension', extension);
    node.setAttribute('ContentType', mime || `image/${extension}`);
    source.documentElement.append(node);
    model.zip.file(path, serializeXml(source));
  }
}

export async function replaceImageInDocx(model: EditableDocx, segment: DocSegment, file: File): Promise<string> {
  const path = segment.meta?.imagePath;
  const part = segment.meta?.sourcePart;
  const relationshipId = segment.meta?.relationshipId;

  if (!path || !part || !relationshipId) throw new Error('Gambar ini tidak dapat dipetakan ke file DOCX asli.');
  const dataUrl = await fileToDataUrl(file);

  model.zip.file(path, dataUrl.slice(dataUrl.indexOf(',') + 1), { base64: true });
  model.images[path] = dataUrl;
  segment.text = file.name;
  if (segment.meta) segment.meta.src = dataUrl;

  try {
    const size = await imageSize(dataUrl);
    const source = await getPartDocument(model, part);
    const paragraphs = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'));
    const paragraph = paragraphs.find((item) => Array.from(item.getElementsByTagNameNS('*', 'blip')).some((node) => (node.getAttributeNS(OFFICE_REL_NS, 'embed') || node.getAttribute('r:embed')) === relationshipId));
    
    if (paragraph) {
      const extent = paragraph.getElementsByTagNameNS('*', 'extent')[0];
      if (extent) {
        const currentWidth = Number(extent.getAttribute('cx') || 1);
        const newHeight = Math.round(currentWidth * (size.height / Math.max(size.width, 1)));
        extent.setAttribute('cy', String(newHeight));
        
        const graphicExtent = paragraph.getElementsByTagNameNS('*', 'ext')[0];
        if (graphicExtent) {
          graphicExtent.setAttribute('cy', String(newHeight));
        }
        model.zip.file(part, serializeXml(source));
      }
    }
  } catch (err) {
    console.warn('Failed to update image aspect ratio during replacement:', err);
  }

  return dataUrl;
}

export async function replaceTextWithImage(
  model: EditableDocx,
  segment: DocSegment,
  file: File,
  widthCm = 6,
): Promise<DocSegment> {
  if (segment.type !== 'paragraph' && segment.type !== 'heading') {
    throw new Error('Pilih teks paragraf atau heading untuk diganti dengan gambar.');
  }
  const part = segment.meta?.sourcePart;
  if (!part) throw new Error('Teks ini tidak dapat dipetakan ke dokumen asli.');
  const source = await getPartDocument(model, part);
  const paragraph = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'))[segment.meta?.nodeIndex ?? -1];
  if (!paragraph) throw new Error('Blok teks tidak ditemukan.');
  const relPath = `${part.slice(0, part.lastIndexOf('/') + 1)}_rels/${part.split('/').pop()}.rels`;
  const relations = await getPartDocument(model, relPath);
  const relationIds = Array.from(relations.getElementsByTagNameNS(REL_NS, 'Relationship')).map((node) => node.getAttribute('Id') || '');
  let index = 1;
  while (relationIds.includes(`rId${index}`)) index += 1;
  const relationshipId = `rId${index}`;
  const extension = extensionFromFile(file);
  const dataUrl = await fileToDataUrl(file);
  const imagePath = `word/media/replacement-${Date.now()}.${extension}`;
  const relationship = relations.createElementNS(REL_NS, 'Relationship');
  relationship.setAttribute('Id', relationshipId);
  relationship.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
  relationship.setAttribute('Target', `media/${imagePath.split('/').pop()}`);
  relations.documentElement.append(relationship);
  model.zip.file(relPath, serializeXml(relations));
  await ensureContentType(model, extension, file.type || `image/${extension}`);
  model.zip.file(imagePath, normalizeDataUrl(dataUrl), { base64: true });
  model.images[imagePath] = dataUrl;
  const size = await imageSize(dataUrl);
  const width = Math.max(1, widthCm) * 36000;
  const height = Math.max(1, width * (size.height / Math.max(size.width, 1)));
  const drawing = parseXml(drawingXml(relationshipId, file.name, Math.round(width), Math.round(height), Date.now()));
  const properties = paragraph.getElementsByTagNameNS(WORD_NS, 'pPr')[0];
  Array.from(paragraph.childNodes).forEach((child) => {
    if (child !== properties) paragraph.removeChild(child);
  });
  paragraph.appendChild(source.importNode(drawing.documentElement.firstChild || drawing.documentElement, true));
  model.zip.file(part, serializeXml(source));
  segment.text = file.name;
  segment.type = 'image';
  segment.meta = { ...segment.meta, src: dataUrl, sourcePart: part, relationshipId, imagePath };
  return segment;
}

export async function resizeImageInDocx(model: EditableDocx, segment: DocSegment, widthCm: number): Promise<void> {
  const part = segment.meta?.sourcePart;
  const relationshipId = segment.meta?.relationshipId;
  if (!part || !relationshipId) throw new Error('Gambar ini tidak dapat diubah ukurannya.');
  const source = await getPartDocument(model, part);
  const paragraphs = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'));
  const paragraph = paragraphs.find((item) => Array.from(item.getElementsByTagNameNS('*', 'blip')).some((node) => (node.getAttributeNS(OFFICE_REL_NS, 'embed') || node.getAttribute('r:embed')) === relationshipId));
  const extent = paragraph?.getElementsByTagNameNS('*', 'extent')[0];
  if (!extent) throw new Error('Ukuran gambar tidak ditemukan.');
  const currentWidth = Number(extent.getAttribute('cx') || 1);
  const currentHeight = Number(extent.getAttribute('cy') || 1);
  const nextWidth = Math.round(Math.min(16, Math.max(1, widthCm)) * 36000);
  const nextHeight = Math.round(nextWidth * currentHeight / currentWidth);
  extent.setAttribute('cx', String(nextWidth));
  extent.setAttribute('cy', String(nextHeight));
  const graphicExtent = paragraph?.getElementsByTagNameNS('*', 'ext')[0];
  if (graphicExtent) {
    graphicExtent.setAttribute('cx', String(nextWidth));
    graphicExtent.setAttribute('cy', String(nextHeight));
  }
  model.zip.file(part, serializeXml(source));
}

export async function moveImageInDocx(model: EditableDocx, segment: DocSegment, offsetX: number, offsetY: number): Promise<void> {
  const part = segment.meta?.sourcePart;
  const relationshipId = segment.meta?.relationshipId;
  if (!part || !relationshipId) throw new Error('Gambar ini tidak dapat dipindahkan.');
  const source = await getPartDocument(model, part);
  const paragraph = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p')).find((item) =>
    Array.from(item.getElementsByTagNameNS('*', 'blip')).some((node) =>
      (node.getAttributeNS(OFFICE_REL_NS, 'embed') || node.getAttribute('r:embed')) === relationshipId,
    ),
  );
  const wpNs = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const existingAnchor = paragraph?.getElementsByTagNameNS(wpNs, 'anchor')[0];
  const inline = paragraph?.getElementsByTagNameNS(wpNs, 'inline')[0];
  if (!paragraph || (!inline && !existingAnchor)) throw new Error('Posisi gambar tidak ditemukan.');
  if (existingAnchor) {
    const horizontal = existingAnchor.getElementsByTagNameNS(wpNs, 'positionH')[0]?.getElementsByTagNameNS(wpNs, 'posOffset')[0];
    const vertical = existingAnchor.getElementsByTagNameNS(wpNs, 'positionV')[0]?.getElementsByTagNameNS(wpNs, 'posOffset')[0];
    if (horizontal) horizontal.textContent = String(Number(horizontal.textContent || 0) + Math.round(offsetX * 9525));
    if (vertical) vertical.textContent = String(Number(vertical.textContent || 0) + Math.round(offsetY * 9525));
    model.zip.file(part, serializeXml(source));
    return;
  }
  if (!inline) throw new Error('Inline gambar tidak ditemukan.');
  const anchor = source.createElementNS(wpNs, 'wp:anchor');
  anchor.setAttribute('distT', '114300');
  anchor.setAttribute('distB', '114300');
  anchor.setAttribute('distL', '114300');
  anchor.setAttribute('distR', '114300');
  anchor.setAttribute('simplePos', '0');
  anchor.setAttribute('relativeHeight', '251659264');
  anchor.setAttribute('behindDoc', '0');
  anchor.setAttribute('locked', '0');
  anchor.setAttribute('layoutInCell', '1');
  anchor.setAttribute('allowOverlap', '1');
  const simplePos = source.createElementNS(wpNs, 'wp:simplePos');
  simplePos.setAttribute('x', '0');
  simplePos.setAttribute('y', '0');
  const positionH = source.createElementNS(wpNs, 'wp:positionH');
  positionH.setAttribute('relativeFrom', 'column');
  const posH = source.createElementNS(wpNs, 'wp:posOffset');
  posH.textContent = String(Math.round(offsetX * 9525));
  positionH.appendChild(posH);
  const positionV = source.createElementNS(wpNs, 'wp:positionV');
  positionV.setAttribute('relativeFrom', 'paragraph');
  const posV = source.createElementNS(wpNs, 'wp:posOffset');
  posV.textContent = String(Math.round(offsetY * 9525));
  positionV.appendChild(posV);
  const wrap = source.createElementNS(wpNs, 'wp:wrapSquare');
  wrap.setAttribute('wrapText', 'bothSides');
  anchor.append(simplePos, positionH, positionV, ...Array.from(inline.childNodes).map((node) => source.importNode(node, true)), wrap);
  inline?.parentNode?.replaceChild(anchor, inline);
  model.zip.file(part, serializeXml(source));
}

function findParagraphWithImage(source: XmlDocument, relationshipId: string): Element | null {
  const paragraphs = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'));
  for (const paragraph of paragraphs) {
    const blipMatch = Array.from(paragraph.getElementsByTagNameNS('*', 'blip')).some((node) =>
      (node.getAttributeNS(OFFICE_REL_NS, 'embed') || node.getAttribute('r:embed')) === relationshipId,
    );
    if (blipMatch) return paragraph;
    const vmlMatch = Array.from(paragraph.getElementsByTagNameNS('*', 'imagedata')).some((node) =>
      (node.getAttributeNS(OFFICE_REL_NS, 'id') || node.getAttribute('r:id')) === relationshipId,
    );
    if (vmlMatch) return paragraph;
  }
  return null;
}

export async function replaceImageWithText(model: EditableDocx, segment: DocSegment, text: string): Promise<void> {
  const part = segment.meta?.sourcePart;
  const relationshipId = segment.meta?.relationshipId;
  if (!part || !relationshipId) throw new Error('Gambar ini tidak dapat diubah menjadi teks.');
  const source = await getPartDocument(model, part);
  const paragraph = findParagraphWithImage(source, relationshipId);
  if (!paragraph) throw new Error('Blok gambar tidak ditemukan.');

  const properties = paragraph.getElementsByTagNameNS(WORD_NS, 'pPr')[0];
  Array.from(paragraph.childNodes).forEach((child) => {
    if (child !== properties) paragraph.removeChild(child);
  });
  const run = source.createElementNS(WORD_NS, 'w:r');
  const textNode = source.createElementNS(WORD_NS, 'w:t');
  textNode.textContent = text;
  textNode.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  run.appendChild(textNode);
  paragraph.appendChild(run);
  model.zip.file(part, serializeXml(source));
  segment.type = 'paragraph';
  segment.text = text;
  if (segment.meta) {
    delete segment.meta.imagePath;
    delete segment.meta.relationshipId;
    delete segment.meta.src;
  }
}

export async function replaceImageWithTable(

  model: EditableDocx,
  segment: DocSegment,
  rows: number,
  cols: number,
  cells: string[][],
): Promise<void> {
  const part = segment.meta?.sourcePart;
  const relationshipId = segment.meta?.relationshipId;
  if (!part || !relationshipId) throw new Error('Gambar ini tidak dapat diubah menjadi tabel.');
  if (rows < 1 || cols < 1) throw new Error('Tabel harus memiliki minimal 1 baris dan 1 kolom.');
  const source = await getPartDocument(model, part);
  const paragraph = findParagraphWithImage(source, relationshipId);
  if (!paragraph) throw new Error('Blok gambar tidak ditemukan.');

  const table = source.createElementNS(WORD_NS, 'w:tbl');


  const tblPr = source.createElementNS(WORD_NS, 'w:tblPr');
  const tblW = source.createElementNS(WORD_NS, 'w:tblW');
  tblW.setAttributeNS(WORD_NS, 'w:w', '5000');
  tblW.setAttributeNS(WORD_NS, 'w:type', 'pct');
  tblPr.appendChild(tblW);
  const tblBorders = source.createElementNS(WORD_NS, 'w:tblBorders');
  for (const edge of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
    const border = source.createElementNS(WORD_NS, `w:${edge}`);
    border.setAttributeNS(WORD_NS, 'w:val', 'single');
    border.setAttributeNS(WORD_NS, 'w:sz', '4');
    border.setAttributeNS(WORD_NS, 'w:space', '0');
    border.setAttributeNS(WORD_NS, 'w:color', 'auto');
    tblBorders.appendChild(border);
  }
  tblPr.appendChild(tblBorders);
  table.appendChild(tblPr);

  for (let r = 0; r < rows; r += 1) {
    const tr = source.createElementNS(WORD_NS, 'w:tr');
    for (let c = 0; c < cols; c += 1) {
      const tc = source.createElementNS(WORD_NS, 'w:tc');
      const tcPr = source.createElementNS(WORD_NS, 'w:tcPr');
      const tcW = source.createElementNS(WORD_NS, 'w:tcW');
      tcW.setAttributeNS(WORD_NS, 'w:w', String(Math.round(5000 / cols)));
      tcW.setAttributeNS(WORD_NS, 'w:type', 'pct');
      tcPr.appendChild(tcW);
      tc.appendChild(tcPr);
      const cellPara = source.createElementNS(WORD_NS, 'w:p');
      const cellText = cells[r]?.[c] ?? '';
      if (cellText) {
        const cellRun = source.createElementNS(WORD_NS, 'w:r');
        const cellTextNode = source.createElementNS(WORD_NS, 'w:t');
        cellTextNode.textContent = cellText;
        cellTextNode.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        cellRun.appendChild(cellTextNode);
        cellPara.appendChild(cellRun);
      }
      tc.appendChild(cellPara);
      tr.appendChild(tc);
    }
    table.appendChild(tr);
  }

  const properties = paragraph.getElementsByTagNameNS(WORD_NS, 'pPr')[0];

  const pPrClone = properties ? source.importNode(properties, true) : null;
  paragraph.parentNode?.insertBefore(table, paragraph);
  paragraph.parentNode?.removeChild(paragraph);
  if (pPrClone) {
    const spacer = source.createElementNS(WORD_NS, 'w:p');
    spacer.appendChild(pPrClone);
    table.parentNode?.insertBefore(spacer, table.nextSibling);
  }

  model.zip.file(part, serializeXml(source));
  segment.type = 'table';
  segment.text = cells.map((row) => row.join(' | ')).join('\n');
  if (segment.meta) {
    segment.meta.rows = rows;
    segment.meta.cols = cols;
    segment.meta.cells = cells;
    delete segment.meta.imagePath;
    delete segment.meta.relationshipId;
    delete segment.meta.src;
  }
}


function drawingXml(relId: string, name: string, width: number, height: number, docPrId: number): string {
  return `<w:p xmlns:w="${WORD_NS}" xmlns:r="${OFFICE_REL_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:r><w:drawing><wp:inline><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${docPrId}" name="${escapeXml(name)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] || char);
}

export async function addImageToDocx(model: EditableDocx, file: File): Promise<DocSegment> {
  const part = 'word/document.xml';
  const relPath = 'word/_rels/document.xml.rels';
  const extension = extensionFromFile(file);
  const dataUrl = await fileToDataUrl(file);
  const existingMedia = Object.keys(model.zip.files).filter((path) => path.startsWith('word/media/'));
  const imagePath = `word/media/image-${Date.now()}.${extension}`;
  const source = await getPartDocument(model, part);
  const relations = await getPartDocument(model, relPath);
  const relationIds = Array.from(relations.getElementsByTagNameNS(REL_NS, 'Relationship')).map((node) => node.getAttribute('Id') || '');
  let index = 1;
  while (relationIds.includes(`rId${index}`)) index += 1;
  const relationshipId = `rId${index}`;
  const relationship = relations.createElementNS(REL_NS, 'Relationship');
  relationship.setAttribute('Id', relationshipId);
  relationship.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
  relationship.setAttribute('Target', `media/${imagePath.split('/').pop()}`);
  relations.documentElement.append(relationship);
  model.zip.file(relPath, serializeXml(relations));
  await ensureContentType(model, extension, file.type || `image/${extension}`);
  model.zip.file(imagePath, dataUrl.slice(dataUrl.indexOf(',') + 1), { base64: true });
  model.images[imagePath] = dataUrl;

  const size = await imageSize(dataUrl);
  const maxWidth = 6 * 914400;
  const ratio = Math.min(1, maxWidth / (size.width * 9525));
  const drawing = parseXml(drawingXml(relationshipId, file.name, Math.round(size.width * 9525 * ratio), Math.round(size.height * 9525 * ratio), existingMedia.length + 1));
  const body = source.getElementsByTagNameNS(WORD_NS, 'body')[0];
  const sectionProperties = body.getElementsByTagNameNS(WORD_NS, 'sectPr')[0];
  body.insertBefore(source.importNode(drawing.documentElement, true), sectionProperties || null);
  model.zip.file(part, serializeXml(source));
  const segment: DocSegment = {
    id: makeId(part, 'image', model.segments.filter((item) => item.type === 'image').length),
    type: 'image', text: file.name, position: model.segments.length,
    meta: { src: dataUrl, sourcePart: part, relationshipId, imagePath, location: 'body' },
  };
  model.segments.push(segment);
  return segment;
}

async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 640, height: image.naturalHeight || 480 });
    image.onerror = () => resolve({ width: 640, height: 480 });
    image.src = dataUrl;
  });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface ExportOptions {
  watermark?: boolean;
}

export async function addWatermarkToDocx(model: EditableDocx, text = 'AIDOCU'): Promise<void> {
  const part = 'word/document.xml';
  const source = await getPartDocument(model, part);
  const body = source.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) return;

  const watermark = source.createElementNS(WORD_NS, 'w:p');
  const pPr = source.createElementNS(WORD_NS, 'w:pPr');
  const pStyle = source.createElementNS(WORD_NS, 'w:pStyle');
  pStyle.setAttributeNS(WORD_NS, 'w:val', 'Normal');
  pPr.appendChild(pStyle);
  const spacing = source.createElementNS(WORD_NS, 'w:spacing');
  spacing.setAttributeNS(WORD_NS, 'w:before', '0');
  spacing.setAttributeNS(WORD_NS, 'w:after', '0');
  pPr.appendChild(spacing);
  const jc = source.createElementNS(WORD_NS, 'w:jc');
  jc.setAttributeNS(WORD_NS, 'w:val', 'center');
  pPr.appendChild(jc);
  watermark.appendChild(pPr);

  const run = source.createElementNS(WORD_NS, 'w:r');
  const rPr = source.createElementNS(WORD_NS, 'w:rPr');
  const color = source.createElementNS(WORD_NS, 'w:color');
  color.setAttributeNS(WORD_NS, 'w:val', 'B9C4FF');
  rPr.appendChild(color);
  const sz = source.createElementNS(WORD_NS, 'w:sz');
  sz.setAttributeNS(WORD_NS, 'w:val', '96');
  rPr.appendChild(sz);
  const szCs = source.createElementNS(WORD_NS, 'w:szCs');
  szCs.setAttributeNS(WORD_NS, 'w:val', '96');
  rPr.appendChild(szCs);
  const rFonts = source.createElementNS(WORD_NS, 'w:rFonts');
  rFonts.setAttributeNS(WORD_NS, 'w:ascii', 'Arial');
  rFonts.setAttributeNS(WORD_NS, 'w:hAnsi', 'Arial');
  rPr.appendChild(rFonts);
  run.appendChild(rPr);
  const t = source.createElementNS(WORD_NS, 'w:t');
  t.textContent = text;
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  run.appendChild(t);
  watermark.appendChild(run);

  body.insertBefore(watermark, body.firstChild);
  model.zip.file(part, serializeXml(source));
}

export async function exportEditableDocx(model: EditableDocx, options?: ExportOptions): Promise<Blob> {
  if (options?.watermark) {
    await addWatermarkToDocx(model, 'AIDOCU');
  }
  return model.zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}




export async function applyTextFormatting(
  model: EditableDocx,
  segment: DocSegment,
  props: TextFormatProps,
): Promise<void> {
  const part = segment.meta?.sourcePart;
  if (!part) throw new Error('Segmen tidak ditemukan dalam dokumen.');
  const source = await getPartDocument(model, part);

  if (props.alignment !== undefined) {
    const paragraphs = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'));
    const para = paragraphs[segment.meta?.nodeIndex ?? -1];
    if (para) {
      let pPr = para.getElementsByTagNameNS(WORD_NS, 'pPr')[0];
      if (!pPr) {
        pPr = source.createElementNS(WORD_NS, 'w:pPr');
        para.insertBefore(pPr, para.firstChild);
      }
      let jc = pPr.getElementsByTagNameNS(WORD_NS, 'jc')[0];
      if (!jc) {
        jc = source.createElementNS(WORD_NS, 'w:jc');
        pPr.appendChild(jc);
      }
      const wordAlign = props.alignment === 'justify' ? 'both' : props.alignment;
      jc.setAttributeNS(WORD_NS, 'w:val', wordAlign);
      jc.setAttribute('w:val', wordAlign);
    }
  }

  const paragraphs = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'));
  const para = paragraphs[segment.meta?.nodeIndex ?? -1];
  if (!para) throw new Error('Paragraf tidak ditemukan.');

  const runs = Array.from(para.getElementsByTagNameNS(WORD_NS, 'r'));
  if (runs.length === 0) {

    const run = source.createElementNS(WORD_NS, 'w:r');
    para.appendChild(run);
    runs.push(run);
  }

  for (const run of runs) {
    let rPr = run.getElementsByTagNameNS(WORD_NS, 'rPr')[0];
    if (!rPr) {
      rPr = source.createElementNS(WORD_NS, 'w:rPr');
      run.insertBefore(rPr, run.firstChild);
    }

    function setRunBool(tagName: string, value: boolean | undefined) {
      if (value === undefined) return;
      const existing = rPr.getElementsByTagNameNS(WORD_NS, tagName)[0];
      if (value) {
        if (!existing) {
          const el = source.createElementNS(WORD_NS, `w:${tagName}`);
          rPr.appendChild(el);
        }
      } else {
        if (existing) rPr.removeChild(existing);
      }
    }

    setRunBool('b', props.bold);
    setRunBool('i', props.italic);
    setRunBool('u', props.underline === undefined ? undefined : props.underline);
    if (props.underline !== undefined) {
      const uEl = rPr.getElementsByTagNameNS(WORD_NS, 'u')[0];
      if (uEl) {
        uEl.setAttributeNS(WORD_NS, 'w:val', props.underline ? 'single' : 'none');
        uEl.setAttribute('w:val', props.underline ? 'single' : 'none');
      }
    }
    setRunBool('strike', props.strikethrough);

    if (props.fontFamily !== undefined) {
      let rFonts = rPr.getElementsByTagNameNS(WORD_NS, 'rFonts')[0];
      if (!rFonts) {
        rFonts = source.createElementNS(WORD_NS, 'w:rFonts');
        rPr.insertBefore(rFonts, rPr.firstChild);
      }
      for (const attr of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
        rFonts.setAttributeNS(WORD_NS, `w:${attr}`, props.fontFamily);
        rFonts.setAttribute(`w:${attr}`, props.fontFamily);
      }
    }

    if (props.fontSize !== undefined) {
      const halfPt = String(Math.round(props.fontSize * 2));
      for (const tag of ['sz', 'szCs']) {
        let szEl = rPr.getElementsByTagNameNS(WORD_NS, tag)[0];
        if (!szEl) {
          szEl = source.createElementNS(WORD_NS, `w:${tag}`);
          rPr.appendChild(szEl);
        }
        szEl.setAttributeNS(WORD_NS, 'w:val', halfPt);
        szEl.setAttribute('w:val', halfPt);
      }
    }

    if (props.color !== undefined) {
      let colorEl = rPr.getElementsByTagNameNS(WORD_NS, 'color')[0];
      if (!colorEl) {
        colorEl = source.createElementNS(WORD_NS, 'w:color');
        rPr.appendChild(colorEl);
      }
      const hex = props.color.replace('#', '');
      colorEl.setAttributeNS(WORD_NS, 'w:val', hex);
      colorEl.setAttribute('w:val', hex);
    }

    if (props.highlight !== undefined) {
      let hlEl = rPr.getElementsByTagNameNS(WORD_NS, 'highlight')[0];
      if (!hlEl) {
        hlEl = source.createElementNS(WORD_NS, 'w:highlight');
        rPr.appendChild(hlEl);
      }
      hlEl.setAttributeNS(WORD_NS, 'w:val', props.highlight);
      hlEl.setAttribute('w:val', props.highlight);
    }
  }

  model.zip.file(part, serializeXml(source));
}


export async function applyParagraphFormatting(
  model: EditableDocx,
  segment: DocSegment,
  props: ParagraphFormatProps,
): Promise<void> {
  const part = segment.meta?.sourcePart;
  if (!part) throw new Error('Segmen tidak ditemukan dalam dokumen.');
  const source = await getPartDocument(model, part);
  const paragraphs = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'));
  const para = paragraphs[segment.meta?.nodeIndex ?? -1];
  if (!para) throw new Error('Paragraf tidak ditemukan.');

  let pPr = para.getElementsByTagNameNS(WORD_NS, 'pPr')[0];
  if (!pPr) {
    pPr = source.createElementNS(WORD_NS, 'w:pPr');
    para.insertBefore(pPr, para.firstChild);
  }

  const hasSp = props.spaceBefore !== undefined || props.spaceAfter !== undefined || props.lineSpacing !== undefined;
  if (hasSp) {
    let spEl = pPr.getElementsByTagNameNS(WORD_NS, 'spacing')[0];
    if (!spEl) {
      spEl = source.createElementNS(WORD_NS, 'w:spacing');
      pPr.appendChild(spEl);
    }
    if (props.spaceBefore !== undefined) {
      const twips = String(Math.round(props.spaceBefore * 20));
      spEl.setAttributeNS(WORD_NS, 'w:before', twips);
      spEl.setAttribute('w:before', twips);
    }
    if (props.spaceAfter !== undefined) {
      const twips = String(Math.round(props.spaceAfter * 20));
      spEl.setAttributeNS(WORD_NS, 'w:after', twips);
      spEl.setAttribute('w:after', twips);
    }
    if (props.lineSpacing !== undefined) {
      spEl.setAttributeNS(WORD_NS, 'w:line', String(props.lineSpacing));
      spEl.setAttribute('w:line', String(props.lineSpacing));
      const rule = props.lineSpacingRule ?? 'auto';
      spEl.setAttributeNS(WORD_NS, 'w:lineRule', rule);
      spEl.setAttribute('w:lineRule', rule);
    }
  }

  const hasInd = props.indentLeft !== undefined || props.indentRight !== undefined || props.firstLine !== undefined;
  if (hasInd) {
    let indEl = pPr.getElementsByTagNameNS(WORD_NS, 'ind')[0];
    if (!indEl) {
      indEl = source.createElementNS(WORD_NS, 'w:ind');
      pPr.appendChild(indEl);
    }
    if (props.indentLeft !== undefined) {
      const twips = String(Math.round(props.indentLeft * 20));
      indEl.setAttributeNS(WORD_NS, 'w:left', twips);
      indEl.setAttribute('w:left', twips);
    }
    if (props.indentRight !== undefined) {
      const twips = String(Math.round(props.indentRight * 20));
      indEl.setAttributeNS(WORD_NS, 'w:right', twips);
      indEl.setAttribute('w:right', twips);
    }
    if (props.firstLine !== undefined) {
      const twips = String(Math.round(props.firstLine * 20));
      indEl.setAttributeNS(WORD_NS, 'w:firstLine', twips);
      indEl.setAttribute('w:firstLine', twips);
    }
  }

  model.zip.file(part, serializeXml(source));
}


export async function applyPageLayout(model: EditableDocx, props: PageLayoutProps): Promise<void> {
  const part = 'word/document.xml';
  const source = await getPartDocument(model, part);
  const body = source.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Struktur dokumen tidak valid: body tidak ditemukan.');

  let sectPr = body.getElementsByTagNameNS(WORD_NS, 'sectPr')[0];
  if (!sectPr) {
    sectPr = source.createElementNS(WORD_NS, 'w:sectPr');
    body.appendChild(sectPr);
  }

  const cmToTwips = (cm: number) => Math.round(cm * 567);
  const hasMargins = props.marginTopCm !== undefined || props.marginBottomCm !== undefined ||
    props.marginLeftCm !== undefined || props.marginRightCm !== undefined;

  if (hasMargins) {
    let pgMar = sectPr.getElementsByTagNameNS(WORD_NS, 'pgMar')[0];
    if (!pgMar) {
      pgMar = source.createElementNS(WORD_NS, 'w:pgMar');
      sectPr.insertBefore(pgMar, sectPr.firstChild);
    }
    if (props.marginTopCm !== undefined) {
      const v = String(cmToTwips(props.marginTopCm));
      pgMar.setAttributeNS(WORD_NS, 'w:top', v); pgMar.setAttribute('w:top', v);
    }
    if (props.marginBottomCm !== undefined) {
      const v = String(cmToTwips(props.marginBottomCm));
      pgMar.setAttributeNS(WORD_NS, 'w:bottom', v); pgMar.setAttribute('w:bottom', v);
    }
    if (props.marginLeftCm !== undefined) {
      const v = String(cmToTwips(props.marginLeftCm));
      pgMar.setAttributeNS(WORD_NS, 'w:left', v); pgMar.setAttribute('w:left', v);
    }
    if (props.marginRightCm !== undefined) {
      const v = String(cmToTwips(props.marginRightCm));
      pgMar.setAttributeNS(WORD_NS, 'w:right', v); pgMar.setAttribute('w:right', v);
    }
  }

  const hasSize = props.pageSizeWidthCm !== undefined || props.pageSizeHeightCm !== undefined || props.orientation !== undefined;
  if (hasSize) {
    let pgSz = sectPr.getElementsByTagNameNS(WORD_NS, 'pgSz')[0];
    if (!pgSz) {
      pgSz = source.createElementNS(WORD_NS, 'w:pgSz');
      sectPr.insertBefore(pgSz, sectPr.firstChild);
    }
    if (props.pageSizeWidthCm !== undefined) {
      const v = String(cmToTwips(props.pageSizeWidthCm));
      pgSz.setAttributeNS(WORD_NS, 'w:w', v); pgSz.setAttribute('w:w', v);
    }
    if (props.pageSizeHeightCm !== undefined) {
      const v = String(cmToTwips(props.pageSizeHeightCm));
      pgSz.setAttributeNS(WORD_NS, 'w:h', v); pgSz.setAttribute('w:h', v);
    }
    if (props.orientation !== undefined) {
      pgSz.setAttributeNS(WORD_NS, 'w:orient', props.orientation);
      pgSz.setAttribute('w:orient', props.orientation);

      if (props.orientation === 'landscape') {
        const w = Number(pgSz.getAttribute('w:w') || 0);
        const h = Number(pgSz.getAttribute('w:h') || 0);
        if (w > 0 && h > 0 && w < h) {
          pgSz.setAttributeNS(WORD_NS, 'w:w', String(h)); pgSz.setAttribute('w:w', String(h));
          pgSz.setAttributeNS(WORD_NS, 'w:h', String(w)); pgSz.setAttribute('w:h', String(w));
        }
      }
    }
  }

  model.zip.file(part, serializeXml(source));
}


export async function applyHeadingStyle(
  model: EditableDocx,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  props: TextFormatProps,
): Promise<void> {
  const part = 'word/styles.xml';
  const entry = model.zip.files[part];
  if (!entry) throw new Error('styles.xml tidak ditemukan dalam dokumen.');
  const source = parseXml(await entry.async('string'));

  const targetStyleId = `Heading${level}`;
  const styles = Array.from(source.getElementsByTagNameNS(WORD_NS, 'style'));
  const style = styles.find((s) => {
    const id = s.getAttributeNS(WORD_NS, 'styleId') || s.getAttribute('w:styleId') || '';
    return id === targetStyleId || id.toLowerCase() === `heading${level}`;
  });

  if (!style) throw new Error(`Style Heading${level} tidak ditemukan dalam dokumen ini.`);

  let rPr = style.getElementsByTagNameNS(WORD_NS, 'rPr')[0];
  if (!rPr) {
    rPr = source.createElementNS(WORD_NS, 'w:rPr');
    style.appendChild(rPr);
  }

  if (props.fontSize !== undefined) {
    const halfPt = String(Math.round(props.fontSize * 2));
    for (const tag of ['sz', 'szCs']) {
      let szEl = rPr.getElementsByTagNameNS(WORD_NS, tag)[0];
      if (!szEl) {
        szEl = source.createElementNS(WORD_NS, `w:${tag}`);
        rPr.appendChild(szEl);
      }
      szEl.setAttributeNS(WORD_NS, 'w:val', halfPt); szEl.setAttribute('w:val', halfPt);
    }
  }

  if (props.bold !== undefined) {
    const existing = rPr.getElementsByTagNameNS(WORD_NS, 'b')[0];
    if (props.bold && !existing) rPr.appendChild(source.createElementNS(WORD_NS, 'w:b'));
    if (!props.bold && existing) rPr.removeChild(existing);
  }

  if (props.fontFamily !== undefined) {
    let rFonts = rPr.getElementsByTagNameNS(WORD_NS, 'rFonts')[0];
    if (!rFonts) { rFonts = source.createElementNS(WORD_NS, 'w:rFonts'); rPr.insertBefore(rFonts, rPr.firstChild); }
    for (const attr of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
      rFonts.setAttributeNS(WORD_NS, `w:${attr}`, props.fontFamily);
      rFonts.setAttribute(`w:${attr}`, props.fontFamily);
    }
  }

  if (props.color !== undefined) {
    let colorEl = rPr.getElementsByTagNameNS(WORD_NS, 'color')[0];
    if (!colorEl) { colorEl = source.createElementNS(WORD_NS, 'w:color'); rPr.appendChild(colorEl); }
    const hex = props.color.replace('#', '');
    colorEl.setAttributeNS(WORD_NS, 'w:val', hex); colorEl.setAttribute('w:val', hex);
  }

  model.zip.file(part, serializeXml(source));
}


export async function addPageBreakBefore(model: EditableDocx, segment: DocSegment): Promise<void> {
  const part = segment.meta?.sourcePart;
  if (!part) throw new Error('Segmen tidak ditemukan dalam dokumen.');
  const source = await getPartDocument(model, part);
  const paragraphs = Array.from(source.getElementsByTagNameNS(WORD_NS, 'p'));
  const para = paragraphs[segment.meta?.nodeIndex ?? -1];
  if (!para) throw new Error('Paragraf tidak ditemukan.');

  const breakPara = source.createElementNS(WORD_NS, 'w:p');
  const run = source.createElementNS(WORD_NS, 'w:r');
  const br = source.createElementNS(WORD_NS, 'w:br');
  br.setAttributeNS(WORD_NS, 'w:type', 'page');
  br.setAttribute('w:type', 'page');
  run.appendChild(br);
  breakPara.appendChild(run);
  para.parentNode?.insertBefore(breakPara, para);
  model.zip.file(part, serializeXml(source));
}



export async function dispatchOperation(
  model: EditableDocx,
  operation: AIOperation,
): Promise<OperationResult> {
  const type = operation.type;
  try {
    switch (type) {
      case 'format_text': {
        const segment = operation.segmentId
          ? model.segments.find((s) => s.id === operation.segmentId)
          : undefined;
        if (!segment) throw new Error(`Segment '${operation.segmentId}' tidak ditemukan.`);
        await applyTextFormatting(model, segment, (operation.properties ?? {}) as TextFormatProps);
        return { type, description: `Formatted text in segment ${operation.segmentId}`, success: true };
      }

      case 'format_paragraph': {
        const segment = operation.segmentId
          ? model.segments.find((s) => s.id === operation.segmentId)
          : undefined;
        if (!segment) throw new Error(`Segment '${operation.segmentId}' tidak ditemukan.`);
        await applyParagraphFormatting(model, segment, (operation.properties ?? {}) as ParagraphFormatProps);
        return { type, description: `Formatted paragraph spacing for segment ${operation.segmentId}`, success: true };
      }

      case 'modify_page_layout': {
        await applyPageLayout(model, (operation.properties ?? {}) as PageLayoutProps);
        return { type, description: 'Page layout updated', success: true };
      }

      case 'modify_heading_style': {
        const level = operation.level as 1 | 2 | 3 | 4 | 5 | 6;
        if (!level || level < 1 || level > 6) throw new Error('Level heading tidak valid (harus 1–6).');
        await applyHeadingStyle(model, level, (operation.properties ?? {}) as TextFormatProps);
        return { type, description: `Heading ${level} style updated`, success: true };
      }

      case 'resize_image': {
        const segment = operation.segmentId
          ? model.segments.find((s) => s.id === operation.segmentId && s.type === 'image')
          : model.segments.find((s) => s.type === 'image');
        if (!segment) throw new Error('Gambar tidak ditemukan.');
        const widthCm = operation.widthCm ?? 6;
        await resizeImageInDocx(model, segment, widthCm);
        return { type, description: `Image resized to ${widthCm} cm`, success: true };
      }

      case 'add_page_break': {
        const segment = operation.segmentId
          ? model.segments.find((s) => s.id === operation.segmentId)
          : undefined;
        if (!segment) throw new Error(`Segment '${operation.segmentId}' tidak ditemukan.`);
        await addPageBreakBefore(model, segment);
        return { type, description: `Page break added before segment ${operation.segmentId}`, success: true };
      }

      default:
        throw new Error(`Operasi tidak dikenal: ${type}`);
    }
  } catch (err) {
    return {
      type,
      description: `Failed: ${type}`,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function renderDocx(fileOrBlob: Blob, container: HTMLElement, preloadedBuffer?: ArrayBuffer): Promise<void> {
  try {
    let arrayBuffer = preloadedBuffer;
    if (!arrayBuffer) {
      try {
        arrayBuffer = await fileOrBlob.arrayBuffer();
      } catch (err) {
        console.error('[renderDocx] Failed to read file.arrayBuffer():', err);
        throw new Error(`Failed to read file bytes for rendering: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.error('[renderDocx] File buffer is empty or zero-length.', {
        fileName: fileOrBlob instanceof File ? fileOrBlob.name : 'blob',
        fileSize: fileOrBlob.size,
        fileType: fileOrBlob.type,
      });
      throw new Error('File is empty or corrupted');
    }
    console.log('[renderDocx] Rendering DOCX buffer:', {
      fileName: fileOrBlob instanceof File ? fileOrBlob.name : 'blob',
      byteLength: arrayBuffer.byteLength,
      fileSize: fileOrBlob.size,
    });
    await renderAsync(arrayBuffer, container, undefined, {
      className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
      ignoreFonts: false, breakPages: true, experimental: false, useBase64URL: true,
    });
  } catch (err) {
    console.error('[renderDocx] Render error:', err);
    throw new Error(`Failed to render document: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

