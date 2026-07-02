import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage, { PickupPage, SignOffPage, Waybill } from './pages/DashboardPage';
import {
  authenticateUser,
  clearSession,
  loadSession,
  loadSessionFromIndexedDb,
  saveSession,
  type AuthSession,
} from './services/auth';
import { syncManager, type SyncStats } from './services/SyncManager';

type Screen = 'dashboard' | 'pickup' | 'signoff';

/**
 * Root application shell managing auth, routing, and sync state.
 */
export default function App() {
  const [session, setSession] = useState<AuthSession | null>(loadSession);
  const [sessionReady, setSessionReady] = useState(!!loadSession());
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [signOffWaybill, setSignOffWaybill] = useState<Waybill | null>(null);
  const [stats, setStats] = useState<SyncStats>({ pendingCount: 0, syncedCount: 0, conflictCount: 0 });
  const [isOnline, setIsOnline] = useState(() => readNetworkOnline());

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

  const handleLogin = useCallback(async (username: string, passcode: string) => {
    const result = await authenticateUser(username, passcode);
    if (!result) return false;
    await saveSession(result);
    persistNetworkOnline(true);
    syncManager.setNetworkConnected(true);
    setIsOnline(true);
    setSession(result);
    setScreen('dashboard');
    await syncManager.refresh();
    return true;
  }, []);

  const handleSignOut = () => {
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

  if (!sessionReady) {
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
        onBack={() => {
          setScreen('dashboard');
          syncManager.refresh();
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
          syncManager.refresh();
        }}
      />
    );
  }

  return (
    <DashboardPage
      session={session}
      isOnline={isOnline}
      pendingCount={stats.pendingCount}
      onToggleNetwork={toggleNetwork}
      onSignOut={handleSignOut}
      onNewPickup={() => setScreen('pickup')}
      onSignOff={(wb) => {
        setSignOffWaybill(wb);
        setScreen('signoff');
      }}
    />
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
