import { describe, expect, it } from 'vitest';
import { COVERS, findCover } from './covers.js';

describe('COVERS', () => {
  it('has exactly 10 presets', () => {
    expect(COVERS).toHaveLength(10);
  });

  it('all ids are unique', () => {
    const ids = COVERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('first cover id is meadow (schema default)', () => {
    expect(COVERS[0].id).toBe('meadow');
  });

  it('every cover has required palette fields', () => {
    for (const cover of COVERS) {
      expect(cover.palette).toHaveProperty('background');
      expect(cover.palette).toHaveProperty('accent');
      expect(cover.palette).toHaveProperty('text');
      expect(cover.palette).toHaveProperty('subtext');
    }
  });
});

describe('findCover', () => {
  it('returns the matching cover by id', () => {
    const cover = findCover('sage');
    expect(cover.id).toBe('sage');
  });

  it('returns COVERS[0] for an unknown id', () => {
    const cover = findCover('nonexistent');
    expect(cover.id).toBe(COVERS[0].id);
  });

  it('finds every cover by its own id', () => {
    for (const c of COVERS) {
      expect(findCover(c.id).id).toBe(c.id);
    }
  });
});
