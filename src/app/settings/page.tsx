import { AppShell } from '@/components/AppShell';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
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
          <p className="eyebrow">Environment</p>
          <h1>Settings checklist</h1>
          <p>These are the deployment-level settings needed before handling real compensation data.</p>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Status</th><th>Why it matters</th></tr></thead>
            <tbody>
              <tr><td>DATABASE_URL</td><td>{configured.database ? <span className="badge green">Configured</span> : <span className="badge red">Missing</span>}</td><td>Stores plans, placements, balances, users, and audit logs.</td></tr>
              <tr><td>SESSION_SECRET</td><td>{configured.session ? <span className="badge green">Configured</span> : <span className="badge red">Missing/weak</span>}</td><td>Signs private HTTP-only login cookies.</td></tr>
              <tr><td>APP_ENCRYPTION_KEY</td><td>{configured.encryption ? <span className="badge green">Configured</span> : <span className="badge red">Missing</span>}</td><td>Encrypts private notes before database storage.</td></tr>
              <tr><td>LOXO_WEBHOOK_SECRET</td><td>{configured.loxo ? <span className="badge green">Configured</span> : <span className="badge yellow">Optional</span>}</td><td>Verifies placement feed requests from Loxo/middleware.</td></tr>
              <tr><td>BASE_URL</td><td>{configured.baseUrl ? <span className="badge green">Configured</span> : <span className="badge yellow">Recommended</span>}</td><td>Used for redirects and generated app links.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
