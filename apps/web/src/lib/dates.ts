/**
 * One date format across the app, written the UK way: "20 Nov 2026, 20:39".
 * Times are 24-hour and always in the viewer's own time zone.
 */
const LOCALE = 'en-GB';

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const dateOnly = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const timeOnly = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayMonth = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

/** "20 Nov 2026, 20:39" */
export function formatDateTime(value: string | Date): string {
  return dateTime.format(new Date(value));
}

/** "20 Nov 2026" */
export function formatDate(value: string | Date): string {
  return dateOnly.format(new Date(value));
}

/** "20:39" */
export function formatTime(value: string | Date): string {
  return timeOnly.format(new Date(value));
}

/** "Thu 20 Nov" */
export function formatDayMonth(value: string | Date): string {
  return dayMonth.format(new Date(value));
}

/** "5 minutes ago", "yesterday", "3 days ago"; for tooltips beside an absolute date. */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60]
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
