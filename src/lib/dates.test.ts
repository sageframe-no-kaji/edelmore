import { describe, expect, it } from 'vitest';
import { formatDisplayDate, getNextDate, getPrevDate, isValidDate, todayIso } from './dates.js';

describe('isValidDate', () => {
  it('accepts a valid ISO date', () => {
    expect(isValidDate('2026-05-14')).toBe(true);
  });

  it('rejects dates with wrong separator', () => {
    expect(isValidDate('2026/05/14')).toBe(false);
  });

  it('rejects dates with wrong format', () => {
    expect(isValidDate('14-05-2026')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidDate('')).toBe(false);
  });

  it('rejects an impossible date (Feb 30)', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
  });

  it('rejects a string with extra characters', () => {
    expect(isValidDate('2026-05-14T00:00:00Z')).toBe(false);
  });

  it('accepts a future date', () => {
    expect(isValidDate('2099-12-31')).toBe(true);
  });

  it('accepts a past date', () => {
    expect(isValidDate('2000-01-01')).toBe(true);
  });
});

describe('todayIso', () => {
  it('returns a string matching YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a valid date', () => {
    expect(isValidDate(todayIso())).toBe(true);
  });

  it('returns the LOCAL calendar date, never the UTC date', () => {
    // Regression: toISOString() gave the UTC date, which rolls to "tomorrow"
    // at 8pm US Eastern — evening entries landed on the wrong day. This
    // assertion pins todayIso to local getters; in any non-UTC zone during
    // the offset window it fails against a toISOString-based implementation.
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
    expect(todayIso()).toBe(local);
  });
});

describe('getPrevDate', () => {
  it('returns the previous calendar day', () => {
    expect(getPrevDate('2026-05-14')).toBe('2026-05-13');
  });

  it('handles month boundaries', () => {
    expect(getPrevDate('2026-05-01')).toBe('2026-04-30');
  });

  it('handles year boundaries', () => {
    expect(getPrevDate('2026-01-01')).toBe('2025-12-31');
  });

  it('handles leap day boundary', () => {
    expect(getPrevDate('2024-03-01')).toBe('2024-02-29');
  });
});

describe('getNextDate', () => {
  it('returns the next calendar day', () => {
    expect(getNextDate('2026-05-14')).toBe('2026-05-15');
  });

  it('handles month boundaries', () => {
    expect(getNextDate('2026-04-30')).toBe('2026-05-01');
  });

  it('handles year boundaries', () => {
    expect(getNextDate('2025-12-31')).toBe('2026-01-01');
  });

  it('handles leap day', () => {
    expect(getNextDate('2024-02-28')).toBe('2024-02-29');
  });
});

describe('formatDisplayDate', () => {
  it('returns a human-readable string for a known date', () => {
    const result = formatDisplayDate('2026-05-14');
    expect(result).toContain('2026');
    expect(result).toContain('May');
    expect(result).toContain('14');
  });

  it('includes the weekday', () => {
    const result = formatDisplayDate('2026-05-14');
    // 2026-05-14 is a Thursday
    expect(result).toContain('Thursday');
  });
});
