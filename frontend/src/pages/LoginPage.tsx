import { useState, FormEvent, useEffect } from 'react';
import {
  DRIVER_LOGINS_CHANGED_EVENT,
  fetchDriverLogins,
  type DriverLoginEntry,
} from '../services/driverLogins';
import { driverDisplayName } from '../utils/driverLoginUsername';

type LoginMode = 'driver' | 'dispatcher';

interface LoginPageProps {
  onLogin: (mode: LoginMode, usernameOrEmail: string, passcodeOrPassword: string) => Promise<boolean>;
}

/**
 * Portal login screen with separate driver PIN and dispatcher email/password paths.
 */
export default function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<LoginMode>('driver');
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [driverLogins, setDriverLogins] = useState<DriverLoginEntry[]>([]);

  /**
   * Loads payroll-linked driver login usernames for the driver tab.
   */
  useEffect(() => {
    if (mode !== 'driver') return;

    const refresh = () => {
      void fetchDriverLogins().then(setDriverLogins);
    };

    refresh();
    window.addEventListener(DRIVER_LOGINS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DRIVER_LOGINS_CHANGED_EVENT, refresh);
  }, [mode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok =
      mode === 'driver'
        ? await onLogin('driver', username, passcode)
        : await onLogin('dispatcher', email, password);
    if (!ok) {
      setError(mode === 'driver' ? 'Invalid driver username or PIN.' : 'Invalid email or password.');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          <img src="/iaw-courier-logo.png" alt="IAW Courier" />
        </div>
        <p className="login-subtitle">Choose your portal to continue</p>

        <div className="login-mode-tabs">
          <button
            type="button"
            className={mode === 'driver' ? 'login-mode-tab active' : 'login-mode-tab'}
            onClick={() => {
              setMode('driver');
              setError('');
            }}
          >
            Driver (PIN)
          </button>
          <button
            type="button"
            className={mode === 'dispatcher' ? 'login-mode-tab active' : 'login-mode-tab'}
            onClick={() => {
              setMode('dispatcher');
              setError('');
            }}
          >
            Dispatcher
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        {mode === 'driver' ? (
          <>
            {driverLogins.length > 0 && (
              <div className="login-driver-hints">
                <div className="login-driver-hints-label">Payroll drivers</div>
                <ul className="login-driver-hints-list">
                  {driverLogins.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="login-driver-hint-btn"
                        onClick={() => setUsername(entry.loginUsername)}
                      >
                        <span className="login-driver-hint-name">
                          {driverDisplayName(entry.firstName, entry.lastName)}
                        </span>
                        <span className="login-driver-hint-user">{entry.loginUsername}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={
                driverLogins[0]?.loginUsername
                  ? `e.g. ${driverLogins[0].loginUsername}`
                  : 'firstname.lastinitial'
              }
            />
            <label>4-Digit PIN</label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              inputMode="numeric"
              autoCapitalize="none"
              maxLength={4}
            />
          </>
        ) : (
          <>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoCapitalize="none"
            />
          </>
        )}

        <button type="submit" className="btn-primary" disabled={loading}>
          SIGN IN
        </button>
      </form>
    </div>
  );
}
