/**
 * The normalized book model — the contract between the EPUB parser and
 * everything downstream (ingestion, rendering, pagination, narration sync).
 *
 * Character offsets into `NormalizedChapter.text` are the system's spine:
 * positions, dog-ears, word timings, and page splits all key on them. The
 * parser guarantees determinism — same EPUB bytes in, byte-identical `text`
 * out — and expresses emphasis as ranges OVER the text (never markup IN it)
 * so offsets stay stable.
 */

/** Inline emphasis expressed as a half-open range over `NormalizedChapter.text`. */
export interface EmphasisRange {
  /** Start offset into `text` (inclusive). */
  start: number;
  /** End offset into `text` (exclusive). */
  end: number;
  /** `<em>/<i>` map to 'em'; `<strong>/<b>` map to 'strong'. */
  kind: 'em' | 'strong';
}

/** An image ("plate") that occurred within a chapter's flow. */
export interface PlateRef {
  /** Char offset in `text` where the image occurred. */
  anchor: number;
  /**
   * The image's path inside the EPUB archive (zip-internal, normalized).
   * Raw bytes are exposed separately via `extractImages` — see parse.ts.
   * Extraction to disk is the ingestion task's job.
   */
  href: string;
  /** The image's alt text, or null when absent. */
  alt: string | null;
}

/** One spine document, normalized to offset-stable plain text. */
export interface NormalizedChapter {
  /** Position in the spine, 0-based. */
  idx: number;
  /** From the chapter's first heading, else the OPF/NCX toc, else null. */
  title: string | null;
  /**
   * Plain text: paragraphs joined with '\n\n', whitespace collapsed within
   * paragraphs. Deterministic for a given EPUB — offsets are stable.
   */
  text: string;
  /** Emphasis ranges over `text`. Overlapping ranges are permitted. */
  emphasis: EmphasisRange[];
  /** Images anchored into `text`. */
  images: PlateRef[];
}

/** A fully parsed, normalized EPUB. */
export interface NormalizedBook {
  /** Content hash: sha256 of the EPUB bytes, hex-encoded. */
  id: string;
  /** dc:title, or '' when the OPF declares none. */
  title: string;
  /** dc:creator, or null when absent. */
  author: string | null;
  /** dc:language, or null when absent. */
  language: string | null;
  /** Zip-internal path of the cover image, or null when none is declared. */
  coverImage: string | null;
  /** Chapters in spine order. */
  chapters: NormalizedChapter[];
}
