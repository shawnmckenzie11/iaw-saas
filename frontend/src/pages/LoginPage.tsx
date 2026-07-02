import { useState, FormEvent } from 'react';

interface LoginPageProps {
  onLogin: (username: string, passcode: string) => Promise<boolean>;
}

/**
 * Portal login screen with driver and dispatcher credential fields.
 */
export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await onLogin(username, passcode);
    if (!ok) setError('Invalid username or passcode.');
    setLoading(false);
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">🚚</div>
        <h1>IAW Courier Portal</h1>
        <p className="login-subtitle">Enter credentials to access waybills</p>

        {error && <div className="login-error">{error}</div>}

        <label>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. driver1 or dispatch"
          autoCapitalize="none"
          autoCorrect="off"
        />

        <label>Passcode</label>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="4-digit passcode"
          inputMode="numeric"
          autoCapitalize="none"
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          SIGN IN
        </button>
      </form>
    </div>
  );
}
