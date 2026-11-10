import { useApi } from '../lib/hooks';
import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { BrandMark } from '../components/Shell';
import { ErrorBox } from '../components/ui';

function HeroArt() {
  // Original abstract illustration: strategy → portfolio → delivery → operations flow.
  return (
    <svg viewBox="0 0 520 320" width="100%" style={{ maxWidth: 560 }} role="img" aria-label="Illustration of connected strategy, portfolio, delivery and operations layers">
      <defs>
        <linearGradient id="lg1" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor="#fff" stopOpacity=".75" /></linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${30 + i * 24}, ${40 + i * 58})`}>
          <rect width="380" height="46" rx="12" fill="url(#lg1)" opacity={0.18 + i * 0.05} />
          <rect x="14" y="13" width="20" height="20" rx="6" fill="#fff" opacity=".9" />
          <rect x="46" y="15" width={110 + i * 20} height="7" rx="3.5" fill="#fff" opacity=".85" />
          <rect x="46" y="27" width={70 + i * 15} height="6" rx="3" fill="#fff" opacity=".5" />
          {[0, 1, 2, 3, 4].map((k) => <rect key={k} x={250 + k * 22} y={30 - ((k * 7 + i * 5) % 18)} width="12" height={8 + ((k * 7 + i * 5) % 18)} rx="3" fill="#fff" opacity=".7" />)}
        </g>
      ))}
      <path d="M440 60 C 500 110, 500 200, 440 250" stroke="#fff" strokeOpacity=".7" strokeWidth="2.5" fill="none" strokeDasharray="5 6" />
      <circle cx="440" cy="60" r="7" fill="#fff" /><circle cx="440" cy="250" r="7" fill="#fff" />
    </svg>
  );
}

export function Login() {
  const { data: sso } = useApi<{ enabled: boolean; issuer: string | null }>('/api/auth/sso');
  const { refresh, me } = useSession();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState<any>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post('/api/auth/login', { email, password }); await refresh(); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  void me;
  return (
    <div className="login">
      <div className="login-art">
        <div className="row"><BrandMark size={36} /><div><div style={{ fontWeight: 700, fontSize: 18 }}>Meridian</div><div style={{ opacity: .8, fontSize: 12 }}>Enterprise strategy, portfolio, product & delivery</div></div></div>
        <div><HeroArt /><h1 style={{ fontSize: 30, maxWidth: 520, marginTop: 18 }}>One connected view from strategy to service.</h1>
          <p style={{ opacity: .85, maxWidth: 520 }}>Portfolios, products, projects, BIA, finance, risk and operations on a single governed data model – with AI assistance that never bypasses human approval.</p></div>
        <div style={{ opacity: .7, fontSize: 12 }}>Access is logged. Unauthorised use is prohibited.</div>
      </div>
      <div className="login-form">
        <form className="card login-card" onSubmit={submit} style={{ padding: 28 }}>
          <h1 style={{ marginBottom: 4 }}>Sign in</h1>
          <p className="muted" style={{ marginTop: 0 }}>Use your organisation account.</p>
          <div className="col" style={{ gap: 12, marginTop: 16 }}>
            <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {err && <ErrorBox error={err} />}
            <button className="btn primary block" disabled={busy} style={{ height: 40 }}><LogIn size={16} />{busy ? 'Signing in…' : 'Sign in'}</button>
            {sso?.enabled && <a className="btn block" href={`/api/auth/sso/start?return_to=${encodeURIComponent(location.pathname)}`} style={{ height: 40, justifyContent: 'center' }}>Sign in with single sign-on</a>}
            <div className="tiny muted">{sso?.enabled ? `SSO via ${sso.issuer}.` : 'Single sign-on is available when an OIDC identity provider is configured (see docs/security).'} Demo accounts are listed in the README.</div>
          </div>
        </form>
      </div>
    </div>
  );
}
