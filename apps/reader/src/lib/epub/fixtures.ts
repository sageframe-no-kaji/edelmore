/**
 * Test-only helpers that BUILD minimal EPUBs in memory with jszip.
 * No network, no disk — tests hand the produced bytes straight to `parseEpub`.
 */

import JSZip from 'jszip';

export interface FixtureChapter {
  /** Path relative to OEBPS/, e.g. 'chapter1.xhtml'. */
  href: string;
  /** XHTML placed inside <body>…</body>. */
  body: string;
}

export interface FixtureImage {
  /** Path relative to OEBPS/, e.g. 'images/cover.png'. */
  href: string;
  data: Uint8Array;
  mediaType?: string;
  /** Mark as the EPUB 3 cover via `properties="cover-image"`. */
  cover?: boolean;
  /** Mark as the EPUB 2 cover via `<meta name="cover" content="…"/>`. */
  coverMeta?: boolean;
}

export interface FixtureToc {
  href: string;
  label: string;
}

export interface FixtureOptions {
  title?: string;
  author?: string;
  language?: string;
  chapters: FixtureChapter[];
  images?: FixtureImage[];
  /** Emit an EPUB 2 NCX with these navPoints. */
  ncx?: FixtureToc[];
  /** Emit an EPUB 3 nav document with these toc entries. */
  nav?: FixtureToc[];
}

const CONTAINER_XML =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
  '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
  '</container>';

function xhtml(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>fixture</title><style>p { color: peru; }</style></head><body>${body}</body></html>`;
}

function ncxDoc(entries: FixtureToc[]): string {
  const points = entries
    .map(
      (entry, i) =>
        `<navPoint id="np${i}" playOrder="${i + 1}">` +
        `<navLabel><text>${entry.label}</text></navLabel>` +
        `<content src="${entry.href}"/></navPoint>`
    )
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>${points}</navMap></ncx>`;
}

function navDoc(entries: FixtureToc[]): string {
  const items = entries
    .map((entry) => `<li><a href="${entry.href}">${entry.label}</a></li>`)
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>toc</title></head><body><nav epub:type="toc"><ol>${items}</ol></nav></body></html>`;
}

/** Build a complete, valid EPUB in memory. */
export async function buildEpub(opts: FixtureOptions): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', CONTAINER_XML);

  const manifest: string[] = [];
  const spine: string[] = [];
  const metaExtra: string[] = [];

  for (const [i, chapter] of opts.chapters.entries()) {
    manifest.push(`<item id="ch${i}" href="${chapter.href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="ch${i}"/>`);
    zip.file(`OEBPS/${chapter.href}`, xhtml(chapter.body));
  }

  for (const [i, image] of (opts.images ?? []).entries()) {
    const properties = image.cover ? ' properties="cover-image"' : '';
    manifest.push(
      `<item id="img${i}" href="${image.href}" media-type="${image.mediaType ?? 'image/png'}"${properties}/>`
    );
    if (image.coverMeta) metaExtra.push(`<meta name="cover" content="img${i}"/>`);
    zip.file(`OEBPS/${image.href}`, image.data);
  }

  if (opts.ncx) {
    manifest.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
    zip.file('OEBPS/toc.ncx', ncxDoc(opts.ncx));
  }
  if (opts.nav) {
    manifest.push(
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    );
    zip.file('OEBPS/nav.xhtml', navDoc(opts.nav));
  }

  const metadata = `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:edelmore-fixture</dc:identifier>${opts.title !== undefined ? `<dc:title>${opts.title}</dc:title>` : ''}${opts.author !== undefined ? `<dc:creator>${opts.author}</dc:creator>` : ''}${opts.language !== undefined ? `<dc:language>${opts.language}</dc:language>` : ''}${metaExtra.join('')}</metadata>`;

  const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">${metadata}<manifest>${manifest.join('')}</manifest><spine${opts.ncx ? ' toc="ncx"' : ''}>${spine.join('')}</spine></package>`;
  zip.file('OEBPS/content.opf', opf);

  return zip.generateAsync({ type: 'uint8array' });
}

/** Fixed fake PNG bytes (magic header + tag byte) — content is irrelevant to the parser. */
export function pngBytes(tag: number): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tag]);
}

/**
 * The canonical happy-path fixture: 2 chapters with headings, em + strong
 * emphasis, an inline plate, and an EPUB 3 cover image.
 */
export async function minimalBook(): Promise<Uint8Array> {
  return buildEpub({
    title: 'The Fixture Book',
    author: 'A. Fixture',
    language: 'en',
    chapters: [
      {
        href: 'chapter1.xhtml',
        body:
          '<h1>Chapter One</h1>' +
          '<p>It was a <em>truly</em> quiet morning in the <strong>old</strong> cottage.</p>' +
          '<p>Look <img src="images/plate1.png" alt="A quiet plate"/> closely.</p>',
      },
      {
        href: 'chapter2.xhtml',
        body:
          '<h1>Chapter Two</h1>' +
          '<p>The second chapter carries on <em>bravely</em> to the end.</p>',
      },
    ],
    images: [
      { href: 'images/cover.png', data: pngBytes(1), cover: true },
      { href: 'images/plate1.png', data: pngBytes(2) },
    ],
  });
}

/** Arbitrary zip contents — used to assemble malformed variants. */
export async function zipOf(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

/** Not a zip at all — stage 'zip'. */
export function notAZip(): Uint8Array {
  return new Uint8Array([0x4e, 0x4f, 0x54, 0x2d, 0x41, 0x2d, 0x5a, 0x49, 0x50]);
}

/** Valid zip, no META-INF/container.xml — stage 'container'. */
export async function epubWithoutContainer(): Promise<Uint8Array> {
  return zipOf({ mimetype: 'application/epub+zip' });
}

/** container.xml present but declares no rootfile — stage 'container'. */
export async function epubWithoutRootfile(): Promise<Uint8Array> {
  return zipOf({
    'META-INF/container.xml':
      '<?xml version="1.0"?>' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles></rootfiles></container>',
  });
}

/** container.xml points at an OPF that is not in the archive — stage 'opf'. */
export async function epubWithMissingOpf(): Promise<Uint8Array> {
  return zipOf({ 'META-INF/container.xml': CONTAINER_XML });
}

/** OPF exists but has no <package> root — stage 'opf'. */
export async function epubWithInvalidOpf(): Promise<Uint8Array> {
  return zipOf({
    'META-INF/container.xml': CONTAINER_XML,
    'OEBPS/content.opf': '<?xml version="1.0"?><notapackage/>',
  });
}

/** Well-formed OPF with an empty spine — stage 'spine'. */
export async function epubWithEmptySpine(): Promise<Uint8Array> {
  return zipOf({
    'META-INF/container.xml': CONTAINER_XML,
    'OEBPS/content.opf':
      '<?xml version="1.0"?>' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Empty</dc:title></metadata>' +
      '<manifest><item id="ch0" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest>' +
      '<spine></spine></package>',
  });
}

/** Spine references a manifest item whose file is absent from the zip — stage 'chapter'. */
export async function epubWithMissingChapterFile(): Promise<Uint8Array> {
  return zipOf({
    'META-INF/container.xml': CONTAINER_XML,
    'OEBPS/content.opf':
      '<?xml version="1.0"?>' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Ghost</dc:title></metadata>' +
      '<manifest><item id="ch0" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest>' +
      '<spine><itemref idref="ch0"/></spine></package>',
  });
}

/** Spine idref that no manifest item declares — stage 'chapter'. */
export async function epubWithUnknownSpineIdref(): Promise<Uint8Array> {
  return zipOf({
    'META-INF/container.xml': CONTAINER_XML,
    'OEBPS/content.opf':
      '<?xml version="1.0"?>' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Ghost</dc:title></metadata>' +
      '<manifest><item id="ch0" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest>' +
      '<spine><itemref idref="ghost"/></spine></package>',
  });
}
