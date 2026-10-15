/**
 * Shared request validation for the position, marks, and owners endpoints.
 * Attribution-only discipline: a person name is a label, not a credential.
 */

import type { MarkKind } from './db.js';
import type { NormalizedBook } from './epub/model.js';

export const MAX_PERSON_NAME_LENGTH = 40;

/**
 * A person name: non-empty after trimming, at most 40 characters.
 * Returns the trimmed name, or null when invalid.
 */
export function parsePersonName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_PERSON_NAME_LENGTH) return null;
  return name;
}

/** A validated place in a book: chapter index + character offset. */
export interface Spot {
  chapterIdx: number;
  charOffset: number;
}

/**
 * Validate a chapter/offset pair against the normalized book read from disk:
 * chapterIdx must index an existing chapter; charOffset must lie within that
 * chapter's text (0..length inclusive — offset === length is the end of the
 * chapter, a legal resting place). Returns null when out of bounds or not
 * integers.
 */
export function parseSpot(
  book: NormalizedBook,
  chapterIdx: unknown,
  charOffset: unknown
): Spot | null {
  if (typeof chapterIdx !== 'number' || !Number.isInteger(chapterIdx)) return null;
  if (typeof charOffset !== 'number' || !Number.isInteger(charOffset)) return null;
  if (chapterIdx < 0 || chapterIdx >= book.chapters.length) return null;
  if (charOffset < 0 || charOffset > book.chapters[chapterIdx].text.length) return null;
  return { chapterIdx, charOffset };
}

const MARK_KINDS: readonly MarkKind[] = ['dog-ear', 'bookmark'];

/**
 * A mark kind: `'dog-ear'` (persistent fold) or `'bookmark'` (temporary
 * slip). `MarkKind` is a TypeScript-only guarantee (db.ts, no SQL CHECK
 * constraint) — this is the one place an unknown kind is turned away before
 * it reaches `addMark`/`deleteOwnMark`. Returns null for anything else.
 */
export function parseMarkKind(value: unknown): MarkKind | null {
  return typeof value === 'string' && (MARK_KINDS as readonly string[]).includes(value)
    ? (value as MarkKind)
    : null;
}
