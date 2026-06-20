export type CalendarDay = {
  date: string;
  inMonth: boolean;
};

export function getCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startDow = firstDay.getUTCDay(); // 0 = Sunday

  const days: CalendarDay[] = [];

  // Fill leading days from the previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month, -i));
    days.push({ date: d.toISOString().slice(0, 10), inMonth: false });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month, d));
    days.push({ date: date.toISOString().slice(0, 10), inMonth: true });
  }

  // Fill trailing days from the next month to reach a multiple of 7
  const trailing = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= trailing; d++) {
    const date = new Date(Date.UTC(year, month + 1, d));
    days.push({ date: date.toISOString().slice(0, 10), inMonth: false });
  }

  return days;
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 0) return { year: year - 1, month: 11 };
  return { year, month: month - 1 };
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 11) return { year: year + 1, month: 0 };
  return { year, month: month + 1 };
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
