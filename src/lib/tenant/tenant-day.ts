/** Data calendário (YYYY-MM-DD) no fuso do restaurante. */
export function calendarDayInTimezone(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function isSameCalendarDayInTimezone(
  left: Date | string,
  right: Date | string,
  timeZone: string,
): boolean {
  return calendarDayInTimezone(left, timeZone) === calendarDayInTimezone(right, timeZone);
}

export function isTodayInTimezone(date: Date | string, timeZone: string): boolean {
  return isSameCalendarDayInTimezone(date, new Date(), timeZone);
}
