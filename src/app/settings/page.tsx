import { AppShell } from '@/components/AppShell';
import { requireUser } from '@/lib/auth';
import { changeOwnPasswordAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ pw?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const configured = {
    database: Boolean(process.env.DATABASE_URL),
    session: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
    encryption: Boolean(process.env.APP_ENCRYPTION_KEY),
    loxo: Boolean(process.env.LOXO_WEBHOOK_SECRET),
    baseUrl: Boolean(process.env.BASE_URL)
  };

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Your account &amp; environment</p>
          <h1>Settings</h1>
          <p>Change your password and review the deployment-level settings needed before handling real compensation data.</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Change your password</h2>
          {query.pw === 'ok' ? <div className="notice" style={{ marginBottom: 14 }}>Password updated.</div> : null}
          <p>Use at least 12 characters. You&apos;ll stay signed in on this device.</p>
          <form className="form" action={changeOwnPasswordAction}>
            <label>Current password<input name="currentPassword" type="password" required /></label>
            <label>New password<input name="newPassword" type="password" minLength={12} required /></label>
            <label>Confirm new password<input name="confirmPassword" type="password" minLength={12} required /></label>
            <button className="button" type="submit">Update password</button>
          </form>
        </div>

        <div className="card">
          <h2>Environment checklist</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>DATABASE_URL</td><td>{configured.database ? <span className="badge green">Configured</span> : <span className="badge red">Missing</span>}</td></tr>
                <tr><td>SESSION_SECRET</td><td>{configured.session ? <span className="badge green">Configured</span> : <span className="badge red">Missing/weak</span>}</td></tr>
                <tr><td>APP_ENCRYPTION_KEY</td><td>{configured.encryption ? <span className="badge green">Configured</span> : <span className="badge red">Missing</span>}</td></tr>
                <tr><td>LOXO_WEBHOOK_SECRET</td><td>{configured.loxo ? <span className="badge green">Configured</span> : <span className="badge yellow">Optional</span>}</td></tr>
                <tr><td>BASE_URL</td><td>{configured.baseUrl ? <span className="badge green">Configured</span> : <span className="badge yellow">Recommended</span>}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
