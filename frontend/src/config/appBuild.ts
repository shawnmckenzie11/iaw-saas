/** Bumped on each deploy that changes dispatch UI or intake behavior — busts stale sessionStorage. */
export const APP_BUILD = '2026.07.02-intake-v3';

/**
 * Clears cached waybill lists when a new build ships so dispatch sees fresh API data.
 */
export function ensureFreshAppBuildCache(): void {
  if (typeof window === 'undefined') return;
  const key = 'iaw_app_build';
  if (sessionStorage.getItem(key) === APP_BUILD) return;
  sessionStorage.removeItem('iaw_waybills');
  sessionStorage.setItem(key, APP_BUILD);
}
