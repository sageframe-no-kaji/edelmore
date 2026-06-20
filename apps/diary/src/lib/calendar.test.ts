import { describe, expect, it } from 'vitest';
import { DAY_LABELS, MONTH_NAMES, getCalendarDays, nextMonth, prevMonth } from './calendar.js';

describe('getCalendarDays', () => {
  it('returns a multiple of 7 days (complete weeks)', () => {
    for (let m = 0; m < 12; m++) {
      const days = getCalendarDays(2026, m);
      expect(days.length % 7).toBe(0);
    }
  });

  it('includes all days of the month as inMonth=true', () => {
    const days = getCalendarDays(2026, 4); // May 2026
    const inMonth = days.filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth[0].date).toBe('2026-05-01');
    expect(inMonth[30].date).toBe('2026-05-31');
  });

  it('starts on the correct day of the week (2026-05 starts on Friday = index 5)', () => {
    const days = getCalendarDays(2026, 4); // May 2026
    // May 1 2026 is a Friday; Sunday=0, so 5 leading days
    const leadingOut = days.filter((d) => !d.inMonth && d.date < '2026-05-01');
    expect(leadingOut).toHaveLength(5);
  });

  it('handles a month that starts on Sunday (no leading days)', () => {
    // 2026-02-01 is a Sunday
    const days = getCalendarDays(2026, 1);
    const leadingOut = days.filter((d) => !d.inMonth && d.date < '2026-02-01');
    expect(leadingOut).toHaveLength(0);
  });

  it('handles February in a leap year', () => {
    const days = getCalendarDays(2024, 1); // Feb 2024
    const inMonth = days.filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[28].date).toBe('2024-02-29');
  });

  it('handles February in a non-leap year', () => {
    const days = getCalendarDays(2026, 1);
    const inMonth = days.filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(28);
  });

  it('trailing days belong to the next month', () => {
    const days = getCalendarDays(2026, 4); // May
    const trailing = days.filter((d) => !d.inMonth && d.date > '2026-05-31');
    for (const d of trailing) expect(d.date.startsWith('2026-06')).toBe(true);
  });
});

describe('prevMonth', () => {
  it('decrements the month within a year', () => {
    expect(prevMonth(2026, 5)).toEqual({ year: 2026, month: 4 });
  });

  it('wraps January to December of the previous year', () => {
    expect(prevMonth(2026, 0)).toEqual({ year: 2025, month: 11 });
  });
});

describe('nextMonth', () => {
  it('increments the month within a year', () => {
    expect(nextMonth(2026, 4)).toEqual({ year: 2026, month: 5 });
  });

  it('wraps December to January of the next year', () => {
    expect(nextMonth(2026, 11)).toEqual({ year: 2027, month: 0 });
  });
});

describe('constants', () => {
  it('MONTH_NAMES has 12 entries', () => {
    expect(MONTH_NAMES).toHaveLength(12);
  });

  it('DAY_LABELS has 7 entries starting with Su', () => {
    expect(DAY_LABELS).toHaveLength(7);
    expect(DAY_LABELS[0]).toBe('Su');
  });
});
