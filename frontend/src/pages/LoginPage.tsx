import { useState, FormEvent } from 'react';

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
        <div className="login-logo">🚚</div>
        <h1>IAW Courier Portal</h1>
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
            <p className="login-mode-hint">Use username + 4-digit PIN (e.g. driver1 / 1111).</p>
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. driver1 or dispatch"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <label>4-Digit PIN</label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="4-digit passcode"
              inputMode="numeric"
              autoCapitalize="none"
              maxLength={4}
            />
          </>
        ) : (
          <>
            <p className="login-mode-hint">
              Use email + password. Shortcut: username <strong>dispatch</strong> / PIN{' '}
              <strong>0000</strong> on the Driver tab also works.
            </p>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dispatcher@example.com"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password123"
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
