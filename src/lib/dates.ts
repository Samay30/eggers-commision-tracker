export function toIsoDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function monthName(monthIndex: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(Date.UTC(2026, monthIndex, 1)));
}

export function endOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0));
}

export function startOfYear(year: number) {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0));
}

export function endOfYear(year: number) {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59));
}
