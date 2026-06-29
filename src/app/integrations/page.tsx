import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireAdminLike } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loxoConfigured } from '@/lib/loxo/client';
import { ringoverConfigured } from '@/lib/ringover/client';
import { syncLoxoAction, syncLoxoInterviewsAction } from '@/app/loxo-actions';
import { syncRingoverAction } from '@/app/ringover-actions';

export const dynamic = 'force-dynamic';

function SummaryTable({ summary, rows }: { summary: Record<string, unknown> | null; rows: [string, string][] }) {
  if (!summary) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h3>Last run</h3>
      <p className="kpi-sub">{String(summary.finishedAt ?? '')}</p>
      <div className="table-wrap">
        <table>
          <tbody>
            {rows.map(([label, key]) => (
              <tr key={key}><td>{label}</td><td className="num">{String(summary[key] ?? 0)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function IntegrationsPage() {
  const user = await requireAdminLike();
  const year = new Date().getFullYear();

  const configured = loxoConfigured();
  const ringover = ringoverConfigured();
  const slug = process.env.LOXO_AGENCY_SLUG || 'not set';
  const domain = process.env.LOXO_DOMAIN || 'app.loxo.co';
  const baseUrl = process.env.BASE_URL || '';
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/loxo/webhook`;
  const webhookSecretSet = Boolean(process.env.LOXO_WEBHOOK_SECRET);

  const [placementRun, interviewRun, ringoverRun, needsReview] = await Promise.all([
    prisma.auditLog.findFirst({ where: { action: 'LOXO_SYNC_RUN' }, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.findFirst({ where: { action: 'LOXO_INTERVIEW_SYNC_RUN' }, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.findFirst({ where: { action: 'RINGOVER_SYNC_RUN' }, orderBy: { createdAt: 'desc' } }),
    prisma.placement.findMany({
      where: { externalSource: 'loxo', metadata: { path: ['needsReview'], equals: true } },
      orderBy: { paymentDate: 'desc' },
      take: 50,
      include: { recruiter: { select: { id: true, displayName: true } } }
    })
  ]);

  const placementSummary = (placementRun?.metadata as Record<string, unknown> | null) ?? null;
  const interviewSummary = (interviewRun?.metadata as Record<string, unknown> | null) ?? null;
  const ringoverSummary = (ringoverRun?.metadata as Record<string, unknown> | null) ?? null;

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Integrations</p>
          <h1>Integrations</h1>
          <p>Placements and interviews flow in from Loxo; phone time from Ringover. Realtime via webhook, plus on-demand syncs below. A scheduled job can run the activity syncs automatically.</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Status</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td>Loxo API</td><td>{configured ? <span className="badge green">Configured</span> : <span className="badge red">Not configured</span>}</td></tr>
                <tr><td>Loxo agency slug</td><td>{slug}</td></tr>
                <tr><td>Loxo domain</td><td>{domain}</td></tr>
                <tr><td>Loxo webhook secret</td><td>{webhookSecretSet ? <span className="badge green">Set</span> : <span className="badge red">Missing</span>}</td></tr>
                <tr><td>Ringover API</td><td>{ringover ? <span className="badge green">Configured</span> : <span className="badge red">Not configured</span>}</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 12 }} className="kpi-sub">Realtime Loxo webhook URL (set in Loxo, with the signing secret):</p>
          <code style={{ wordBreak: 'break-all' }}>{baseUrl ? webhookUrl : 'Set BASE_URL to display the webhook URL'}</code>
        </div>

        <div className="card">
          <h2>Sync placements (Loxo)</h2>
          <p>Pulls {year} placed candidates from Loxo and reconciles them. Safe to run repeatedly.</p>
          {configured ? (
            <form className="form" action={syncLoxoAction}>
              <label>Year<input name="year" type="number" defaultValue={year} /></label>
              <button className="button" type="submit">Sync {year} placements</button>
            </form>
          ) : (
            <div className="notice">Set <code>LOXO_API_KEY</code> and <code>LOXO_AGENCY_SLUG</code> to enable.</div>
          )}
          <SummaryTable summary={placementSummary} rows={[['Pulled', 'pulled'], ['Imported (new)', 'imported'], ['Updated', 'updated'], ['Needs review', 'needsReview'], ['Skipped / unmapped', 'skippedUnmapped'], [`Outside ${year}`, 'outOfYear']]} />
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>Sync phone time (Ringover)</h2>
          <p>Pulls {year} call activity from Ringover and rolls it into per-recruiter daily totals. Matches calls to recruiters by agent email.</p>
          {ringover ? (
            <form className="form" action={syncRingoverAction}>
              <label>Year<input name="year" type="number" defaultValue={year} /></label>
              <button className="button" type="submit">Sync {year} phone time</button>
            </form>
          ) : (
            <div className="notice">Set <code>RINGOVER_API_KEY</code> to enable.</div>
          )}
          <SummaryTable summary={ringoverSummary} rows={[['Calls pulled', 'pulled'], ['Matched to recruiters', 'matchedCalls'], ['Skipped / unmapped', 'skippedUnmapped'], ['Recruiter-days written', 'recruiterDaysWritten']]} />
        </div>

        <div className="card">
          <h2>Sync interviews (Loxo)</h2>
          <p>Pulls {year} interview activity from Loxo and rolls it into per-recruiter daily counts.</p>
          {configured ? (
            <form className="form" action={syncLoxoInterviewsAction}>
              <label>Year<input name="year" type="number" defaultValue={year} /></label>
              <button className="button" type="submit">Sync {year} interviews</button>
            </form>
          ) : (
            <div className="notice">Set <code>LOXO_API_KEY</code> and <code>LOXO_AGENCY_SLUG</code> to enable.</div>
          )}
          <SummaryTable summary={interviewSummary} rows={[['Pulled', 'pulled'], ['Interview events', 'interviewEvents'], ['Skipped / unmapped', 'skippedUnmapped'], ['Recruiter-days written', 'recruiterDaysWritten']]} />
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
