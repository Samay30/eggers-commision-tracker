import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

function errorMessage(code?: string): string | null {
  switch (code) {
    case 'no_account':
      return 'No Eggers account is linked to that Microsoft sign-in yet. Ask an admin to set one up.';
    case 'entra_config':
      return 'Microsoft sign-in isn\u2019t set up yet. Use your email and password instead.';
    case '1':
      return 'Invalid email or password.';
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  const params = await searchParams;
  const error = errorMessage(params.error);

  return (
    <div className="login-page">
      <div className="card login-card">
        <p className="eyebrow">Private payroll data</p>
        <h1>Sign in</h1>
        <p>Access is restricted to authorized Eggers users. Recruiters only see their own numbers.</p>
        {error ? <div className="error">{error}</div> : null}

        <a className="button secondary" href="/api/auth/entra/login">
          Sign in with Microsoft
        </a>

        <div className="divider"><span>or</span></div>

        <form className="form" action="/api/auth/login" method="post">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="button" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
