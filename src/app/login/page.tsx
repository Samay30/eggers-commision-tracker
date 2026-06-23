import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  const params = await searchParams;

  return (
    <div className="login-page">
      <div className="card login-card">
        <p className="eyebrow">Private payroll data</p>
        <h1>Sign in</h1>
        <p>Access is restricted to authorized Eggers users. Recruiters only see their own numbers.</p>
        {params.error ? <div className="error">Invalid email or password.</div> : null}
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
