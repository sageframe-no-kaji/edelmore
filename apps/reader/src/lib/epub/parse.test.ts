import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildEpub,
  epubWithEmptySpine,
  epubWithInvalidOpf,
  epubWithMissingChapterFile,
  epubWithMissingOpf,
  epubWithUnknownSpineIdref,
  epubWithoutContainer,
  epubWithoutRootfile,
  minimalBook,
  notAZip,
  pngBytes,
} from './fixtures';
import type { EmphasisRange, NormalizedChapter } from './model';
import { EpubParseError, type EpubParseStage, extractImages, parseEpub } from './parse';

/** Slice the chapter text with a range — the offsets themselves are the assertion. */
function sliceOf(chapter: NormalizedChapter, range: EmphasisRange): string {
  return chapter.text.slice(range.start, range.end);
}

async function stageOf(promise: Promise<unknown>): Promise<EpubParseStage> {
  const error = await promise.then(
    () => {
      throw new Error('expected parseEpub to reject');
    },
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(EpubParseError);
  return (error as EpubParseError).stage;
}

describe('parseEpub happy path', () => {
  it('produces the NormalizedBook contract shapes', async () => {
    const bytes = await minimalBook();
    const book = await parseEpub(bytes);

    expect(book.id).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(book.title).toBe('The Fixture Book');
    expect(book.author).toBe('A. Fixture');
    expect(book.language).toBe('en');
    expect(book.coverImage).toBe('OEBPS/images/cover.png');
    expect(book.chapters).toHaveLength(2);
    expect(book.chapters.map((c) => c.idx)).toEqual([0, 1]);
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two']);
  });

  it('normalizes chapter text as \\n\\n-joined paragraphs with collapsed whitespace', async () => {
    const book = await parseEpub(await minimalBook());
    expect(book.chapters[0].text).toBe(
      'Chapter One\n\nIt was a truly quiet morning in the old cottage.\n\nLook closely.'
    );
    expect(book.chapters[1].text).toBe(
      'Chapter Two\n\nThe second chapter carries on bravely to the end.'
    );
  });

  it('emphasis ranges land on the right words (verified by slicing)', async () => {
    const book = await parseEpub(await minimalBook());
    const [ch1, ch2] = book.chapters;

    expect(ch1.emphasis.map((r) => [sliceOf(ch1, r), r.kind])).toEqual([
      ['truly', 'em'],
      ['old', 'strong'],
    ]);
    expect(ch2.emphasis.map((r) => [sliceOf(ch2, r), r.kind])).toEqual([['bravely', 'em']]);
  });

  it('anchors plates at their char position with resolved href and alt', async () => {
    const book = await parseEpub(await minimalBook());
    const [plate] = book.chapters[0].images;

    expect(plate.href).toBe('OEBPS/images/plate1.png');
    expect(plate.alt).toBe('A quiet plate');
    // The image sat between 'Look ' and 'closely.' in the final paragraph.
    expect(plate.anchor).toBe(book.chapters[0].text.indexOf('closely.'));
    expect(book.chapters[1].images).toEqual([]);
  });

  it('is deterministic: same bytes, deeply equal output', async () => {
    const bytes = await minimalBook();
    const first = await parseEpub(bytes);
    const second = await parseEpub(bytes);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('offset stability', () => {
  it('adding emphasis markup around a word shifts no offsets anywhere', async () => {
    const chapter2 = { href: 'c2.xhtml', body: '<p>Second chapter text stays put.</p>' };
    const plain = await parseEpub(
      await buildEpub({
        title: 'Stability',
        chapters: [{ href: 'c1.xhtml', body: '<p>The fox jumps over the dog.</p>' }, chapter2],
      })
    );
    const marked = await parseEpub(
      await buildEpub({
        title: 'Stability',
        chapters: [
          { href: 'c1.xhtml', body: '<p>The fox <em>jumps</em> over the dog.</p>' },
          chapter2,
        ],
      })
    );

    // Emphasis is a range OVER the text, never markup IN it: text is byte-identical.
    expect(marked.chapters[0].text).toBe(plain.chapters[0].text);
    expect(marked.chapters[1].text).toBe(plain.chapters[1].text);
    expect(marked.chapters[1].emphasis).toEqual(plain.chapters[1].emphasis);
    expect(marked.chapters[0].emphasis).toHaveLength(1);
    expect(sliceOf(marked.chapters[0], marked.chapters[0].emphasis[0])).toBe('jumps');
  });
});

describe('text extraction rules', () => {
  async function singleChapter(body: string): Promise<NormalizedChapter> {
    const book = await parseEpub(
      await buildEpub({ title: 'T', chapters: [{ href: 'c.xhtml', body }] })
    );
    return book.chapters[0];
  }

  it('collapses whitespace runs within a paragraph', async () => {
    const chapter = await singleChapter('<p>Hello\n\t   world   again</p>');
    expect(chapter.text).toBe('Hello world again');
  });

  it('treats <br> as a single space', async () => {
    const chapter = await singleChapter('<p>line<br/>break</p>');
    expect(chapter.text).toBe('line break');
  });

  it('ignores script, style, head, and nav content', async () => {
    const chapter = await singleChapter(
      '<script>ignored();</script><nav><a href="c.xhtml">skip</a></nav><p>Visible</p>'
    );
    expect(chapter.text).toBe('Visible');
  });

  it('treats a div with loose inline content as a block', async () => {
    const chapter = await singleChapter('<div>Loose text<p>Inner para</p>tail text</div>');
    expect(chapter.text).toBe('Loose text\n\nInner para\n\ntail text');
  });

  it('produces paragraphs from li and blockquote', async () => {
    const chapter = await singleChapter(
      '<ul><li>First</li><li>Second</li></ul><blockquote>Quoted</blockquote>'
    );
    expect(chapter.text).toBe('First\n\nSecond\n\nQuoted');
  });

  it('keeps overlapping ranges for nested emphasis', async () => {
    const chapter = await singleChapter('<p><strong>bold <em>both</em></strong> plain</p>');
    expect(chapter.text).toBe('bold both plain');
    const strong = chapter.emphasis.find((r) => r.kind === 'strong')!;
    const em = chapter.emphasis.find((r) => r.kind === 'em')!;
    expect(sliceOf(chapter, strong)).toBe('bold both');
    expect(sliceOf(chapter, em)).toBe('both');
  });

  it('maps <i> to em and <b> to strong', async () => {
    const chapter = await singleChapter('<p>an <i>italic</i> and a <b>bold</b> word</p>');
    expect(chapter.emphasis.map((r) => [sliceOf(chapter, r), r.kind])).toEqual([
      ['italic', 'em'],
      ['bold', 'strong'],
    ]);
  });

  it('trims emphasis ranges to word extents across tag-boundary spaces', async () => {
    const chapter = await singleChapter('<p>Hello<em> world </em>again</p>');
    expect(chapter.text).toBe('Hello world again');
    expect(chapter.emphasis.map((r) => sliceOf(chapter, r))).toEqual(['world']);
  });

  it('drops whitespace-only emphasis instead of emitting an empty range', async () => {
    const chapter = await singleChapter('<p>a<em>   </em>b</p>');
    expect(chapter.text).toBe('a b');
    expect(chapter.emphasis).toEqual([]);
  });

  it('anchors an image-only paragraph at the current end of chapter text', async () => {
    const chapter = await singleChapter(
      '<p>Before the plate.</p><p><img src="images/p.png" alt="plate"/></p><p>After it.</p>'
    );
    expect(chapter.text).toBe('Before the plate.\n\nAfter it.');
    expect(chapter.images).toEqual([
      { anchor: 'Before the plate.'.length, href: 'OEBPS/images/p.png', alt: 'plate' },
    ]);
  });

  it('records a null alt when the image has none', async () => {
    const chapter = await singleChapter('<p>See <img src="pic.png"/> here</p>');
    expect(chapter.images).toEqual([{ anchor: 4, href: 'OEBPS/pic.png', alt: null }]);
  });
});

describe('chapter titles', () => {
  it('uses the first heading when present', async () => {
    const book = await parseEpub(
      await buildEpub({
        title: 'T',
        chapters: [{ href: 'c.xhtml', body: '<p>lead-in</p><h2>The Heading</h2><p>body</p>' }],
      })
    );
    expect(book.chapters[0].title).toBe('The Heading');
  });

  it('falls back to the NCX toc label for heading-less chapters', async () => {
    const book = await parseEpub(
      await buildEpub({
        title: 'T',
        chapters: [{ href: 'c.xhtml', body: '<p>No heading here.</p>' }],
        ncx: [{ href: 'c.xhtml', label: 'From the Toc' }],
      })
    );
    expect(book.chapters[0].title).toBe('From the Toc');
  });

  it('falls back to the EPUB 3 nav document label', async () => {
    const book = await parseEpub(
      await buildEpub({
        title: 'T',
        chapters: [{ href: 'c.xhtml', body: '<p>No heading here.</p>' }],
        nav: [{ href: 'c.xhtml', label: 'From the Nav' }],
      })
    );
    expect(book.chapters[0].title).toBe('From the Nav');
  });

  it('is null when there is no heading and no toc entry', async () => {
    const book = await parseEpub(
      await buildEpub({ title: 'T', chapters: [{ href: 'c.xhtml', body: '<p>Bare.</p>' }] })
    );
    expect(book.chapters[0].title).toBeNull();
  });
});

describe('metadata edge cases', () => {
  it('defaults title to empty string and author/language/cover to null', async () => {
    const book = await parseEpub(
      await buildEpub({ chapters: [{ href: 'c.xhtml', body: '<p>x</p>' }] })
    );
    expect(book.title).toBe('');
    expect(book.author).toBeNull();
    expect(book.language).toBeNull();
    expect(book.coverImage).toBeNull();
  });

  it('finds an EPUB 2 cover declared via <meta name="cover">', async () => {
    const book = await parseEpub(
      await buildEpub({
        title: 'T',
        chapters: [{ href: 'c.xhtml', body: '<p>x</p>' }],
        images: [
          { href: 'cover.jpg', data: pngBytes(3), mediaType: 'image/jpeg', coverMeta: true },
        ],
      })
    );
    expect(book.coverImage).toBe('OEBPS/cover.jpg');
  });
});

describe('EpubParseError stages', () => {
  it("throws stage 'zip' for bytes that are not a zip archive", async () => {
    expect(await stageOf(parseEpub(notAZip()))).toBe('zip');
  });

  it("throws stage 'container' when META-INF/container.xml is missing", async () => {
    expect(await stageOf(parseEpub(await epubWithoutContainer()))).toBe('container');
  });

  it("throws stage 'container' when no rootfile is declared", async () => {
    expect(await stageOf(parseEpub(await epubWithoutRootfile()))).toBe('container');
  });

  it("throws stage 'opf' when the OPF file is missing", async () => {
    expect(await stageOf(parseEpub(await epubWithMissingOpf()))).toBe('opf');
  });

  it("throws stage 'opf' when the OPF has no package root", async () => {
    expect(await stageOf(parseEpub(await epubWithInvalidOpf()))).toBe('opf');
  });

  it("throws stage 'spine' when the spine is empty", async () => {
    expect(await stageOf(parseEpub(await epubWithEmptySpine()))).toBe('spine');
  });

  it("throws stage 'chapter' when a spine document is missing from the archive", async () => {
    expect(await stageOf(parseEpub(await epubWithMissingChapterFile()))).toBe('chapter');
  });

  it("throws stage 'chapter' when a spine idref has no manifest item", async () => {
    expect(await stageOf(parseEpub(await epubWithUnknownSpineIdref()))).toBe('chapter');
  });

  it('prefixes the message with the stage name', async () => {
    const error = await parseEpub(await epubWithEmptySpine()).catch((e: unknown) => e);
    expect((error as EpubParseError).message).toMatch(/^\[spine\]/);
    expect((error as EpubParseError).name).toBe('EpubParseError');
  });
});

describe('extractImages', () => {
  it('returns the raw bytes map keyed by the hrefs the model uses', async () => {
    const bytes = await minimalBook();
    const book = await parseEpub(bytes);
    const images = await extractImages(bytes);

    expect([...images.keys()].sort()).toEqual([
      'OEBPS/images/cover.png',
      'OEBPS/images/plate1.png',
    ]);
    expect(images.get(book.coverImage!)).toEqual(pngBytes(1));
    expect(images.get(book.chapters[0].images[0].href)).toEqual(pngBytes(2));
  });
});
