import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Prompts the user to reload when a new service worker is waiting (post-deploy PWA updates).
 */
export default function PwaUpdateBanner() {
  const [needsRefresh, setNeedsRefresh] = useState(false);

  useEffect(() => {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedsRefresh(true);
      },
    });
  }, []);

  if (!needsRefresh) return null;

  return (
    <div className="pwa-update-banner" role="status">
      <span>A new version of the dispatch app is ready.</span>
      <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
        Reload now
      </button>
    </div>
  );
}
