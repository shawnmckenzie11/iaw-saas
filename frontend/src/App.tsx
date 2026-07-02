import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PickupPage from './pages/PickupPage';
import SignOffPage from './pages/SignOffPage';
import AccountingPage from './pages/AccountingPage';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import { APP_BUILD, ensureFreshAppBuildCache } from './config/appBuild';
import { hydrateLocationSuggestions } from './data/locationSuggestions';
import {
  authenticateUser,
  clearSession,
  loadSession,
  loadSessionFromIndexedDb,
  saveSession,
  type AuthSession,
} from './services/auth';
import { syncManager, type SyncStats } from './services/SyncManager';
import type { Waybill } from './types/waybill';

type Screen = 'dashboard' | 'pickup' | 'signoff' | 'accounting';

/**
 * Root application shell managing auth, routing, and sync state.
 */
export default function App() {
  const [session, setSession] = useState<AuthSession | null>(loadSession);
  const [sessionReady, setSessionReady] = useState(!!loadSession());
  const [locationReady, setLocationReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [signOffWaybill, setSignOffWaybill] = useState<Waybill | null>(null);
  const [editPickupWaybill, setEditPickupWaybill] = useState<Waybill | null>(null);
  const [cachedWaybills, setCachedWaybills] = useState<Waybill[]>([]);
  const [stats, setStats] = useState<SyncStats>({ pendingCount: 0, syncedCount: 0, conflictCount: 0 });
  const [isOnline, setIsOnline] = useState(() => readNetworkOnline());

  useEffect(() => {
    void ensureFreshAppBuildCache();
  }, []);

  useEffect(() => {
    void hydrateLocationSuggestions().finally(() => setLocationReady(true));
  }, []);

  useEffect(() => {
    if (session) {
      setSessionReady(true);
      return;
    }
    void loadSessionFromIndexedDb().then((restored) => {
      if (restored) setSession(restored);
      setSessionReady(true);
    });
  }, [session]);

  useLayoutEffect(() => {
    syncManager.refresh();
  }, [session]);

  useEffect(() => {
    const unsub = syncManager.subscribe(setStats);
    return unsub;
  }, []);

  useEffect(() => {
    syncManager.setNetworkConnected(isOnline);
    if (session && isOnline) {
      void syncManager.syncQueue(session);
    }
  }, [session, isOnline]);

  /** Retry pending queue items while online (events + signature/photo blobs). */
  useEffect(() => {
    if (!session || !isOnline || stats.pendingCount === 0) return;
    const interval = window.setInterval(() => {
      void syncManager.syncQueue(session);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [session, isOnline, stats.pendingCount]);

  useEffect(() => {
    const cached = sessionStorage.getItem('iaw_waybills');
    if (cached) {
      try {
        setCachedWaybills(JSON.parse(cached));
      } catch {
        setCachedWaybills([]);
      }
    }
  }, [screen, stats.pendingCount]);

  const handleLogin = useCallback(
    async (mode: 'driver' | 'dispatcher', usernameOrEmail: string, passcodeOrPassword: string) => {
    const result = await authenticateUser(mode, usernameOrEmail, passcodeOrPassword);
    if (!result) return false;
    sessionStorage.removeItem('iaw_waybills');
    await saveSession(result);
    persistNetworkOnline(true);
    syncManager.setNetworkConnected(true);
    setIsOnline(true);
    setSession(result);
    setScreen('dashboard');
    await syncManager.refresh();
    return true;
  },
  []);

  const handleSignOut = () => {
    sessionStorage.removeItem('iaw_waybills');
    void clearSession();
    setSession(null);
    setScreen('dashboard');
  };

  const toggleNetwork = () => {
    const next = !isOnline;
    setIsOnline(next);
    persistNetworkOnline(next);
    syncManager.setNetworkConnected(next);
  };

  if (!sessionReady || !locationReady) {
    return null;
  }

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (screen === 'pickup') {
    return (
      <PickupPage
        session={session}
        isOnline={isOnline}
        editWaybill={editPickupWaybill}
        onBack={() => {
          setEditPickupWaybill(null);
          setScreen('dashboard');
          void syncManager.refresh();
        }}
      />
    );
  }

  if (screen === 'signoff' && signOffWaybill) {
    return (
      <SignOffPage
        waybill={signOffWaybill}
        session={session}
        isOnline={isOnline}
        onBack={() => {
          setSignOffWaybill(null);
          setScreen('dashboard');
          void syncManager.refresh();
        }}
      />
    );
  }

  if (screen === 'accounting') {
    return (
      <AccountingPage
        session={session}
        waybills={cachedWaybills}
        onBack={() => setScreen('dashboard')}
      />
    );
  }

  return (
    <>
      <PwaUpdateBanner />
      <DashboardPage
      session={session}
      isOnline={isOnline}
      syncStats={stats}
      onToggleNetwork={toggleNetwork}
      onSignOut={handleSignOut}
      onNewPickup={() => {
        setEditPickupWaybill(null);
        setScreen('pickup');
      }}
      onContinuePickup={(wb) => {
        setEditPickupWaybill(wb);
        setScreen('pickup');
      }}
      onSignOff={(wb) => {
        setSignOffWaybill(wb);
        setScreen('signoff');
      }}
      onOpenAccounting={() => {
        const cached = sessionStorage.getItem('iaw_waybills');
        if (cached) {
          try {
            setCachedWaybills(JSON.parse(cached));
          } catch {
            // ignore
          }
        }
        setScreen('accounting');
      }}
    />
    </>
  );
}

/**
 * Reads persisted/simulated network state for offline queue tests.
 */
function readNetworkOnline(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = sessionStorage.getItem('iaw_network_online');
  if (saved !== null) return saved === 'true';
  return navigator.onLine;
}

/**
 * Persists the UI network toggle across page reloads.
 */
function persistNetworkOnline(online: boolean): void {
  sessionStorage.setItem('iaw_network_online', String(online));
}
