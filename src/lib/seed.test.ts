import { describe, expect, it } from 'vitest';
import { createDb, createUser } from './db.js';
import { seedIfEmpty } from './seed.js';

describe('seedIfEmpty', () => {
  it('returns true when db has no users', () => {
    const db = createDb(':memory:');
    expect(seedIfEmpty(db)).toBe(true);
  });

  it('returns false when db already has users', () => {
    const db = createDb(':memory:');
    createUser(db, 'Iona', 'hash');
    expect(seedIfEmpty(db)).toBe(false);
  });
});
