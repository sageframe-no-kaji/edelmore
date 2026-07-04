/**
 * Server-side EPUB parser: EPUB bytes in, `NormalizedBook` out.
 *
 * Pure Node — jszip + fast-xml-parser only, no DOM. Parsing is deterministic:
 * the same bytes always produce byte-identical chapter text, because character
 * offsets into that text are the system's spine (positions, dog-ears, word
 * timings, page splits all key on them).
 *
 * Image bytes: this module exposes the RAW BYTES MAP form of the contract —
 * `extractImages(bytes)` returns `Map<href, Uint8Array>` keyed by the same
 * zip-internal hrefs used in `PlateRef.href` and `NormalizedBook.coverImage`.
 * Writing those bytes to disk is the ingestion task's job (R-AT-03).
 */

import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import type { EmphasisRange, NormalizedBook, NormalizedChapter, PlateRef } from './model';

/** Where parsing failed. Named stages let ingestion report malformed uploads precisely. */
export type EpubParseStage = 'zip' | 'container' | 'opf' | 'spine' | 'chapter';

/** Typed failure for malformed EPUBs — carries the stage that failed. */
export class EpubParseError extends Error {
  readonly stage: EpubParseStage;

  constructor(stage: EpubParseStage, message: string) {
    super(`[${stage}] ${message}`);
    this.name = 'EpubParseError';
    this.stage = stage;
  }
}

/** Parse an EPUB into the normalized model. Throws `EpubParseError` on malformed input. */
export async function parseEpub(bytes: Uint8Array): Promise<NormalizedBook> {
  const epub = await openEpub(bytes);
  const tocLabels = await collectTocLabels(epub);
  const parser = chapterParser();
  const chapters: NormalizedChapter[] = [];

  for (let idx = 0; idx < epub.spineIdrefs.length; idx += 1) {
    const idref = epub.spineIdrefs[idx];
    const item = epub.byId.get(idref);
    if (!item) {
      throw new EpubParseError('chapter', `spine idref "${idref}" has no manifest item`);
    }
    const path = resolveHref(epub.opfDir, item.href);
    const file = epub.zip.file(path);
    if (!file) {
      throw new EpubParseError('chapter', `spine document missing from archive: ${path}`);
    }
    const doc = parser.parse(await file.async('string')) as unknown[];
    const extractor = new ChapterExtractor(dirOf(path));
    extractor.walk(doc);
    const title = extractor.firstHeading ?? tocLabels.get(path) ?? null;
    chapters.push(assembleChapter(idx, title, extractor.paragraphs));
  }

  return {
    id: createHash('sha256').update(bytes).digest('hex'),
    title: epub.title,
    author: epub.author,
    language: epub.language,
    coverImage: epub.coverImage,
    chapters,
  };
}

/**
 * The raw-bytes-map half of the parser contract: every manifest entry with an
 * `image/*` media type, keyed by zip-internal href (the same hrefs that appear
 * in `PlateRef.href` and `NormalizedBook.coverImage`).
 */
export async function extractImages(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const epub = await openEpub(bytes);
  const images = new Map<string, Uint8Array>();
  for (const item of epub.manifest) {
    if (!item.mediaType.startsWith('image/')) continue;
    const path = resolveHref(epub.opfDir, item.href);
    const file = epub.zip.file(path);
    if (file) images.set(path, await file.async('uint8array'));
  }
  return images;
}

// ---------------------------------------------------------------------------
// Container + OPF
// ---------------------------------------------------------------------------

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

interface OpenedEpub {
  zip: JSZip;
  opfDir: string;
  manifest: ManifestItem[];
  byId: Map<string, ManifestItem>;
  spineIdrefs: string[];
  title: string;
  author: string | null;
  language: string | null;
  coverImage: string | null;
}

async function openEpub(bytes: Uint8Array): Promise<OpenedEpub> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new EpubParseError('zip', 'not a readable zip archive');
  }

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new EpubParseError('container', 'META-INF/container.xml not found');
  }
  const container: unknown = structuredParser().parse(await containerFile.async('string'));
  const rootfiles = asArray(
    asRecord(asRecord(asRecord(container)?.container)?.rootfiles)?.rootfile
  );
  const opfPath = attrOf(asRecord(rootfiles[0]), 'full-path');
  if (!opfPath) {
    throw new EpubParseError('container', 'container.xml declares no OPF rootfile');
  }

  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new EpubParseError('opf', `OPF document not found at ${opfPath}`);
  }
  const opf: unknown = structuredParser().parse(await opfFile.async('string'));
  const pkg = asRecord(asRecord(opf)?.package);
  if (!pkg) {
    throw new EpubParseError('opf', 'OPF has no <package> root');
  }

  const opfDir = dirOf(opfPath);
  const metadata = asRecord(pkg.metadata);

  const manifest: ManifestItem[] = [];
  const byId = new Map<string, ManifestItem>();
  for (const raw of asArray(asRecord(pkg.manifest)?.item)) {
    const rec = asRecord(raw);
    const id = attrOf(rec, 'id');
    const href = attrOf(rec, 'href');
    if (!id || !href) continue;
    const item: ManifestItem = {
      id,
      href,
      mediaType: attrOf(rec, 'media-type') ?? '',
      properties: attrOf(rec, 'properties') ?? '',
    };
    manifest.push(item);
    byId.set(id, item);
  }

  const spineIdrefs: string[] = [];
  for (const raw of asArray(asRecord(pkg.spine)?.itemref)) {
    const idref = attrOf(asRecord(raw), 'idref');
    if (idref) spineIdrefs.push(idref);
  }
  if (spineIdrefs.length === 0) {
    throw new EpubParseError('spine', 'spine is missing or empty');
  }

  // Cover: EPUB 3 `properties="cover-image"`, falling back to the EPUB 2
  // `<meta name="cover" content="...id..."/>` convention.
  let coverImage: string | null = null;
  for (const item of manifest) {
    if (item.properties.split(/\s+/).includes('cover-image')) {
      coverImage = resolveHref(opfDir, item.href);
      break;
    }
  }
  if (!coverImage) {
    for (const raw of asArray(metadata?.meta)) {
      const rec = asRecord(raw);
      if (attrOf(rec, 'name') !== 'cover') continue;
      const target = byId.get(attrOf(rec, 'content') ?? '');
      if (target) coverImage = resolveHref(opfDir, target.href);
      break;
    }
  }

  return {
    zip,
    opfDir,
    manifest,
    byId,
    spineIdrefs,
    title: textOf(metadata?.title) ?? '',
    author: textOf(metadata?.creator),
    language: textOf(metadata?.language),
    coverImage,
  };
}

// ---------------------------------------------------------------------------
// Table of contents (EPUB 3 nav document, EPUB 2 NCX) — chapter-title fallback
// ---------------------------------------------------------------------------

async function collectTocLabels(epub: OpenedEpub): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  const nav = epub.manifest.find((i) => i.properties.split(/\s+/).includes('nav'));
  if (nav) {
    const path = resolveHref(epub.opfDir, nav.href);
    const file = epub.zip.file(path);
    if (file) {
      const doc = chapterParser().parse(await file.async('string')) as unknown[];
      collectAnchors(doc, dirOf(path), labels);
    }
  }

  const ncx = epub.manifest.find((i) => i.mediaType === 'application/x-dtbncx+xml');
  if (ncx) {
    const path = resolveHref(epub.opfDir, ncx.href);
    const file = epub.zip.file(path);
    if (file) {
      const doc: unknown = structuredParser().parse(await file.async('string'));
      const navMap = asRecord(asRecord(asRecord(doc)?.ncx)?.navMap);
      collectNavPoints(asArray(navMap?.navPoint), dirOf(path), labels);
    }
  }

  return labels;
}

function collectAnchors(nodes: unknown[], dir: string, labels: Map<string, string>): void {
  for (const raw of nodes) {
    const rec = asRecord(raw);
    if (!rec || '#text' in rec) continue;
    const tag = tagOf(rec);
    if (!tag) continue;
    const children = asArray(rec[tag]);
    if (tag === 'a') {
      const href = plainAttr(rec, 'href');
      if (href && !href.startsWith('#')) {
        const label = inlineText(children);
        const path = resolveHref(dir, href);
        if (label && !labels.has(path)) labels.set(path, label);
      }
      continue;
    }
    collectAnchors(children, dir, labels);
  }
}

function collectNavPoints(points: unknown[], dir: string, labels: Map<string, string>): void {
  for (const raw of points) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const label = textOf(asRecord(rec.navLabel)?.text);
    const src = attrOf(asRecord(rec.content), 'src');
    if (label && src) {
      const path = resolveHref(dir, src);
      if (!labels.has(path)) labels.set(path, label);
    }
    collectNavPoints(asArray(rec.navPoint), dir, labels);
  }
}

function inlineText(nodes: unknown[]): string {
  let out = '';
  for (const raw of nodes) {
    const rec = asRecord(raw);
    if (!rec) continue;
    if ('#text' in rec) {
      out += String(rec['#text']);
      continue;
    }
    const tag = tagOf(rec);
    if (tag) out += inlineText(asArray(rec[tag]));
  }
  return out.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Chapter text extraction
// ---------------------------------------------------------------------------

const BLOCK_TAGS = new Set([
  'html',
  'body',
  'main',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ul',
  'ol',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'div',
  'figure',
  'figcaption',
  'pre',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'hr',
]);

const SKIP_TAGS = new Set(['script', 'style', 'nav', 'head', 'title', 'template', 'svg']);

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

interface Paragraph {
  text: string;
  emphasis: EmphasisRange[];
  images: PlateRef[];
}

/**
 * Walks a fast-xml-parser `preserveOrder` tree and produces paragraphs of
 * whitespace-collapsed text with emphasis ranges and image anchors.
 *
 * Rules: block elements produce paragraphs (joined later with '\n\n');
 * whitespace collapses to single spaces within a paragraph; `<em>/<i>` and
 * `<strong>/<b>` become ranges trimmed to non-space extents (overlap allowed);
 * `<img>` anchors a PlateRef at its char position; script/style/nav/head are
 * ignored; `<br>` contributes a single space.
 */
class ChapterExtractor {
  readonly paragraphs: Paragraph[] = [];
  firstHeading: string | null = null;
  private text = '';
  private emphasis: EmphasisRange[] = [];
  private images: PlateRef[] = [];
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  walk(nodes: unknown[]): void {
    this.walkNodes(nodes);
    this.flush();
  }

  /** Block-aware walk: block elements flush the current paragraph around themselves. */
  private walkNodes(nodes: unknown[]): void {
    for (const raw of nodes) {
      const rec = asRecord(raw);
      if (!rec) continue;
      if ('#text' in rec) {
        this.append(String(rec['#text']));
        continue;
      }
      const tag = tagOf(rec);
      if (!tag || SKIP_TAGS.has(tag)) continue;
      const children = asArray(rec[tag]);
      if (BLOCK_TAGS.has(tag)) {
        this.flush();
        const before = this.paragraphs.length;
        this.walkNodes(children);
        this.flush();
        if (HEADING_TAGS.has(tag) && this.firstHeading === null) {
          const heading = this.paragraphs.slice(before).find((p) => p.text.length > 0);
          if (heading) this.firstHeading = heading.text;
        }
        continue;
      }
      this.walkInlineNode(tag, rec, children, false);
    }
  }

  /** Inline-only walk used inside emphasis: never flushes, so ranges stay within one paragraph. */
  private walkInline(nodes: unknown[]): void {
    for (const raw of nodes) {
      const rec = asRecord(raw);
      if (!rec) continue;
      if ('#text' in rec) {
        this.append(String(rec['#text']));
        continue;
      }
      const tag = tagOf(rec);
      if (!tag || SKIP_TAGS.has(tag)) continue;
      this.walkInlineNode(tag, rec, asArray(rec[tag]), true);
    }
  }

  private walkInlineNode(
    tag: string,
    rec: Record<string, unknown>,
    children: unknown[],
    insideEmphasis: boolean
  ): void {
    if (tag === 'img') {
      const src = plainAttr(rec, 'src');
      if (src) {
        this.images.push({
          anchor: this.text.length,
          href: resolveHref(this.dir, src),
          alt: plainAttr(rec, 'alt'),
        });
      }
      return;
    }
    if (tag === 'br') {
      this.append(' ');
      return;
    }
    const kind =
      tag === 'em' || tag === 'i' ? 'em' : tag === 'strong' || tag === 'b' ? 'strong' : null;
    if (kind) {
      const start = this.text.length;
      this.walkInline(children);
      this.pushEmphasis(start, this.text.length, kind);
      return;
    }
    // Transparent inline container (span, a, cite, ...): recurse in the caller's mode.
    if (insideEmphasis) {
      this.walkInline(children);
    } else {
      this.walkNodes(children);
    }
  }

  /** Append text, collapsing runs of whitespace and never doubling spaces. */
  private append(raw: string): void {
    let piece = raw.replace(/\s+/g, ' ');
    if (piece.startsWith(' ') && (this.text.length === 0 || this.text.endsWith(' '))) {
      piece = piece.slice(1);
    }
    this.text += piece;
  }

  /** Record an emphasis range trimmed to non-space extents; drop it if empty. */
  private pushEmphasis(rawStart: number, rawEnd: number, kind: 'em' | 'strong'): void {
    let start = rawStart;
    let end = Math.min(rawEnd, this.text.length);
    while (start < end && this.text[start] === ' ') start += 1;
    while (end > start && this.text[end - 1] === ' ') end -= 1;
    if (start < end) this.emphasis.push({ start, end, kind });
  }

  /** Close the current paragraph. Image-only paragraphs are kept so plates survive. */
  private flush(): void {
    const text = this.text.replace(/ +$/, '');
    if (text.length > 0 || this.images.length > 0) {
      this.paragraphs.push({
        text,
        emphasis: this.emphasis,
        images: this.images.map((img) => ({ ...img, anchor: Math.min(img.anchor, text.length) })),
      });
    }
    this.text = '';
    this.emphasis = [];
    this.images = [];
  }
}

/** Join paragraphs with '\n\n', shifting emphasis ranges and plate anchors into chapter space. */
function assembleChapter(
  idx: number,
  title: string | null,
  paragraphs: Paragraph[]
): NormalizedChapter {
  let text = '';
  const emphasis: EmphasisRange[] = [];
  const images: PlateRef[] = [];
  for (const para of paragraphs) {
    if (para.text.length === 0) {
      // Image-only paragraph: anchor its plates at the current end of the chapter text.
      for (const img of para.images) {
        images.push({ anchor: text.length, href: img.href, alt: img.alt });
      }
      continue;
    }
    const offset = text.length === 0 ? 0 : text.length + 2;
    text = text.length === 0 ? para.text : `${text}\n\n${para.text}`;
    for (const range of para.emphasis) {
      emphasis.push({ start: range.start + offset, end: range.end + offset, kind: range.kind });
    }
    for (const img of para.images) {
      images.push({ anchor: img.anchor + offset, href: img.href, alt: img.alt });
    }
  }
  return { idx, title, text, emphasis, images };
}

// ---------------------------------------------------------------------------
// XML plumbing
// ---------------------------------------------------------------------------

/** Tags parsed as arrays even when a single element is present. */
const STRUCTURED_ARRAYS = new Set([
  'rootfile',
  'item',
  'itemref',
  'meta',
  'navPoint',
  'title',
  'creator',
  'language',
]);

/** Parser for structured documents (container.xml, OPF, NCX): objects keyed by tag. */
function structuredParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    ignoreDeclaration: true,
    isArray: (name) => STRUCTURED_ARRAYS.has(name),
  });
}

/** Parser for flow documents (chapters, nav): preserveOrder keeps text/element order intact. */
function chapterParser(): XMLParser {
  return new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    htmlEntities: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** First text content of a structured-parse value (string, `{'#text'}` record, or array). */
function textOf(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? textOf(value[0]) : null;
  }
  const rec = asRecord(value);
  if (rec && '#text' in rec) return textOf(rec['#text']);
  return null;
}

/** Attribute from a structured-parse element (attributes carry the `@_` prefix). */
function attrOf(rec: Record<string, unknown> | null, name: string): string | null {
  const value = rec?.[`@_${name}`];
  return typeof value === 'string' ? value : null;
}

/** Attribute from a preserveOrder element (attributes sit under ':@' unprefixed). */
function plainAttr(rec: Record<string, unknown>, name: string): string | null {
  const value = asRecord(rec[':@'])?.[name];
  return typeof value === 'string' ? value : null;
}

/** The single element key of a preserveOrder node (skipping ':@' and '#text'). */
function tagOf(rec: Record<string, unknown>): string | null {
  for (const key of Object.keys(rec)) {
    if (key !== ':@' && key !== '#text') return key;
  }
  return null;
}

function dirOf(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

/** Resolve an href against a directory into a normalized zip-internal path (fragment dropped). */
function resolveHref(baseDir: string, href: string): string {
  const raw = decodeURIComponent(href.split('#')[0]);
  const parts = baseDir.length > 0 ? baseDir.split('/') : [];
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join('/');
}
