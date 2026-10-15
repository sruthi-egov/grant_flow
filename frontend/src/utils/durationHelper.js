/**
 * Shared duration calculation helper.
 * Calculates the human-readable duration between two dates.
 * Falls back to a term text string if dates are missing or invalid.
 */

export function calculateDurationLabel(startDate, endDate, fallbackTermText = "") {
  if (!startDate || !endDate) {
    return fallbackTermText || "—";
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return fallbackTermText || "—";
  }

  if (end < start) {
    return fallbackTermText || "—";
  }

  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  // If the end day is before the start day, the last month is not complete.
  // Exception: if end date is the last day of its month, treat it as a full month
  // (handles Apr 1 → Sep 30 = 6 months correctly).
  const endDay = end.getDate();
  const startDay = start.getDate();
  const lastDayOfEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  const endIsLastDayOfMonth = endDay === lastDayOfEndMonth;

  if (endDay < startDay && !endIsLastDayOfMonth) {
    months -= 1;
  }

  if (months <= 0) return "Less than 1 month";

  if (months < 12) {
    return `${months} month${months === 1 ? "" : "s"}`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (remainingMonths === 0) {
    return `${years} year${years === 1 ? "" : "s"}`;
  }

  return `${years} year${years === 1 ? "" : "s"} ${remainingMonths} month${remainingMonths === 1 ? "" : "s"}`;
}