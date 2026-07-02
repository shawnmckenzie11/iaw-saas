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

/**
 * Returns a human-readable weight label from stored parcel weight class values.
 */
export function formatWeightClass(weightClass?: string | null): string {
  if (!weightClass?.trim()) return '—';
  const trimmed = weightClass.trim();
  if (/^Weight:\s*Under\s*75/i.test(trimmed)) return 'Under 75 lbs';
  const numericMatch = trimmed.match(/^Weight:\s*(\d+)\s*lbs?$/i);
  if (numericMatch) return `${numericMatch[1]} lbs`;
  return trimmed.replace(/^Weight:\s*/i, '');
}

/**
 * Returns a compact cargo label for narrow dashboard table columns.
 */
export function abbreviateCargo(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return '—';
  if (trimmed === 'Standard Package') return 'Std pkg';
  const weightMatch = trimmed.match(/^Weight:\s*(\d+)\s*lbs?$/i);
  if (weightMatch) return `${weightMatch[1]} lb`;
  if (/^Weight:\s*Under\s*75/i.test(trimmed)) return '<75 lb';
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 10)}…`;
}
