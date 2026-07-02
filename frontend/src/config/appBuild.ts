/** Bumped on each deploy that changes dispatch UI or intake behavior — busts stale sessionStorage and PWA cache. */
export const APP_BUILD = '2026.07.02-pending-v1';

/**
 * Clears cached waybill lists and stale PWA assets when a new build ships.
 * Unregisters service workers and clears Cache Storage once per build, then reloads.
 */
export async function ensureFreshAppBuildCache(): Promise<void> {
  if (typeof window === 'undefined') return;

  const buildKey = 'iaw_app_build';
  const reloadKey = 'iaw_build_reload_for';
  const storedBuild = localStorage.getItem(buildKey);

  if (storedBuild === APP_BUILD) return;

  sessionStorage.removeItem('iaw_waybills');
  localStorage.setItem(buildKey, APP_BUILD);

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }

  if (sessionStorage.getItem(reloadKey) !== APP_BUILD) {
    sessionStorage.setItem(reloadKey, APP_BUILD);
    window.location.reload();
  }
}
