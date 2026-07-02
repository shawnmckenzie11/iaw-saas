/**
 * Formats an ISO timestamp as `Mon DD/YY` for dashboard tables.
 */
export function formatWaybillDate(isoString?: string | null): string {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'N/A';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month} ${day}/${year}`;
}

/**
 * Formats an ISO timestamp as a short local time for dashboard tables.
 */
export function formatWaybillTime(isoString?: string | null): string {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
