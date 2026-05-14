import { describe, expect, it } from 'vitest';
import { formatDisplayDate, isValidDate, todayIso } from './dates.js';

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
