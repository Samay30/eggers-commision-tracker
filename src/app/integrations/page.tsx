import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireAdminLike } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loxoConfigured } from '@/lib/loxo/client';
import { syncLoxoAction } from '@/app/loxo-actions';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const user = await requireAdminLike();
  const year = new Date().getFullYear();

  const configured = loxoConfigured();
  const slug = process.env.LOXO_AGENCY_SLUG || 'not set';
  const domain = process.env.LOXO_DOMAIN || 'app.loxo.co';
  const baseUrl = process.env.BASE_URL || '';
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/loxo/webhook`;
  const webhookSecretSet = Boolean(process.env.LOXO_WEBHOOK_SECRET);

  const lastRun = await prisma.auditLog.findFirst({
    where: { action: 'LOXO_SYNC_RUN' },
    orderBy: { createdAt: 'desc' }
  });
  const summary = (lastRun?.metadata as Record<string, unknown> | null) ?? null;

  const needsReview = await prisma.placement.findMany({
    where: { externalSource: 'loxo', metadata: { path: ['needsReview'], equals: true } },
    orderBy: { paymentDate: 'desc' },
    take: 50,
    include: { recruiter: { select: { id: true, displayName: true } } }
  });

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Loxo integration</p>
          <h1>Integrations</h1>
          <p>Placed candidates flow in from Loxo automatically — recruiters enter details once. Realtime via webhook, plus an on-demand backfill below.</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Status</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td>API connection</td><td>{configured ? <span className="badge green">Configured</span> : <span className="badge red">Not configured</span>}</td></tr>
                <tr><td>Agency slug</td><td>{slug}</td></tr>
                <tr><td>Domain</td><td>{domain}</td></tr>
                <tr><td>Webhook secret</td><td>{webhookSecretSet ? <span className="badge green">Set</span> : <span className="badge red">Missing</span>}</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 12 }} className="kpi-sub">Realtime webhook URL (set this in Loxo, with the signing secret):</p>
          <code style={{ wordBreak: 'break-all' }}>{baseUrl ? webhookUrl : 'Set BASE_URL to display the webhook URL'}</code>
        </div>

        <div className="card">
          <h2>Sync placements</h2>
          <p>Pulls {year} placed candidates from Loxo and reconciles them into the tracker. Safe to run repeatedly.</p>
          {configured ? (
            <form className="form" action={syncLoxoAction}>
              <label>Year<input name="year" type="number" defaultValue={year} /></label>
              <button className="button" type="submit">Sync {year} from Loxo now</button>
            </form>
          ) : (
            <div className="notice">Set <code>LOXO_API_KEY</code> and <code>LOXO_AGENCY_SLUG</code> (and redeploy) to enable syncing.</div>
          )}

          {summary ? (
            <div style={{ marginTop: 16 }}>
              <h3>Last sync</h3>
              <p className="kpi-sub">{String(summary.finishedAt ?? '')}</p>
              <div className="table-wrap">
                <table>
                  <tbody>
                    <tr><td>Pulled from Loxo</td><td className="num">{String(summary.pulled ?? 0)}</td></tr>
                    <tr><td>Imported (new)</td><td className="num">{String(summary.imported ?? 0)}</td></tr>
                    <tr><td>Updated</td><td className="num">{String(summary.updated ?? 0)}</td></tr>
                    <tr><td>Needs review</td><td className="num">{String(summary.needsReview ?? 0)}</td></tr>
                    <tr><td>Skipped / unmapped</td><td className="num">{String(summary.skippedUnmapped ?? 0)}</td></tr>
                    <tr><td>Outside {year}</td><td className="num">{String(summary.outOfYear ?? 0)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Needs review ({needsReview.length})</h2>
        <p>Placements imported from Loxo where the fee couldn&apos;t be derived confidently. Open the recruiter to set the correct amount.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Placement</th><th>Recruiter</th><th>Date</th><th>Fee basis</th></tr></thead>
            <tbody>
              {needsReview.length === 0 ? (
                <tr><td colSpan={4}><span className="kpi-sub">Nothing waiting — all imported fees resolved cleanly.</span></td></tr>
              ) : null}
              {needsReview.map((placement) => {
                const meta = (placement.metadata as Record<string, unknown> | null) ?? {};
                return (
                  <tr key={placement.id}>
                    <td><strong>{placement.placementName}</strong><br /><span className="kpi-sub">{String(meta.reviewReason ?? '')}</span></td>
                    <td><Link href={`/recruiters/${placement.recruiter.id}`}>{placement.recruiter.displayName}</Link></td>
                    <td>{placement.paymentDate.toISOString().slice(0, 10)}</td>
                    <td>{String(meta.feeSummary ?? meta.feeType ?? '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
