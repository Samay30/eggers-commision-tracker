import { AppShell } from '@/components/AppShell';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { createAdjustmentAction, createPlacementAction, upsertPlanAction } from '@/app/actions';
import { requireUser, isAdminLike } from '@/lib/auth';
import { getRecruiter, getLedger } from '@/lib/data';
import { currency, percent } from '@/lib/money';
import { toIsoDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function RecruiterDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const year = query.year ? Number(query.year) : new Date().getFullYear();
  const recruiter = await getRecruiter(user, id);
  const admin = isAdminLike(user.role);

  let ledgerData: Awaited<ReturnType<typeof getLedger>> | null = null;
  let setupError: string | null = null;
  try {
    ledgerData = await getLedger(user, id, year);
  } catch (error) {
    setupError = error instanceof Error ? error.message : 'No plan configured.';
  }

  const latestPlan = recruiter.plans.find((plan) => plan.year === year) ?? recruiter.plans[0];

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Recruiter ledger</p>
          <h1>{recruiter.displayName}</h1>
          <p>{recruiter.user?.email ?? 'No login attached'} · {year}</p>
        </div>
      </div>

      {setupError ? <div className="notice">{setupError} Admins can configure this recruiter's annual plan below.</div> : null}

      {ledgerData ? (
        <>
          <div className="grid cards">
            <KpiCard label="Annual goal" value={currency(ledgerData.summary.annualGoal)} sub={`${percent(Number(ledgerData.plan.commissionRate))} commission rate`} />
            <KpiCard label="Sales to date" value={currency(ledgerData.summary.salesToDate)} sub={`${currency(ledgerData.summary.remainingGoal)} remaining`} />
            <KpiCard label="Commission earned" value={currency(ledgerData.summary.commissionEarned)} sub={`${currency(ledgerData.summary.drawPaid)} draw paid`} />
            <KpiCard label="Ending balance" value={currency(ledgerData.summary.endingBalance)} sub="Negative means draw still to recover" />
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h2>Commission ledger</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Event</th><th className="num">Sales</th><th className="num">Commission</th><th className="num">Draw</th><th className="num">Payout</th><th className="num">Balance</th><th className="num">Goal remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.rows.map((row, index) => (
                    <tr key={`${row.type}-${row.date}-${index}`}>
                      <td>{row.date}</td>
                      <td><span className="badge gray">{row.type.replaceAll('_', ' ')}</span><br />{row.label}</td>
                      <td className="num">{row.sales ? currency(row.sales) : '—'}</td>
                      <td className="num">{row.commissionEarned ? currency(row.commissionEarned) : '—'}</td>
                      <td className="num">{row.drawPaid ? currency(row.drawPaid) : '—'}</td>
                      <td className="num">{row.payout ? currency(row.payout) : '—'}</td>
                      <td className="num">{currency(row.endingBalance)}</td>
                      <td className="num">{currency(row.annualGoalRemaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h2>Placements feeding this ledger</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Placement</th><th>Payment date</th><th>Status</th><th className="num">Bill</th><th className="num">Payout override</th></tr></thead>
                <tbody>
                  {ledgerData.placements.map((placement) => (
                    <tr key={placement.id}>
                      <td><strong>{placement.placementName}</strong><br /><span className="kpi-sub">{placement.clientName ?? 'No client'} · {placement.candidateName ?? 'No candidate'}</span></td>
                      <td>{toIsoDate(placement.paymentDate)}</td>
                      <td><StatusBadge status={placement.status} /></td>
                      <td className="num">{currency(Number(placement.billAmount))}</td>
                      <td className="num">{placement.payoutOverride ? currency(Number(placement.payoutOverride)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {admin ? (
        <div className="grid two" style={{ marginTop: 18 }}>
          <div className="card">
            <h2>Annual plan</h2>
            <form className="form" action={upsertPlanAction}>
              <input type="hidden" name="recruiterId" value={recruiter.id} />
              <div className="form-row">
                <label>Year<input name="year" type="number" defaultValue={year} required /></label>
                <label>Annual goal<input name="annualGoal" inputMode="decimal" defaultValue={latestPlan ? String(latestPlan.annualGoal) : '250000'} required /></label>
              </div>
              <div className="form-row">
                <label>Commission rate<input name="commissionRate" inputMode="decimal" defaultValue={latestPlan ? String(latestPlan.commissionRate) : '0.10'} required /></label>
                <label>Salary/draw per pay period<input name="salaryPerPayPeriod" inputMode="decimal" defaultValue={latestPlan ? String(latestPlan.salaryPerPayPeriod) : '0'} required /></label>
              </div>
              <div className="form-row">
                <label>Pay frequency
                  <select name="payFrequency" defaultValue={latestPlan?.payFrequency ?? 'SEMI_MONTHLY'}>
                    <option value="SEMI_MONTHLY">Semi-monthly</option>
                    <option value="BI_WEEKLY">Bi-weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </label>
                <label>Monthly payout rate<input name="monthlyPayoutRate" inputMode="decimal" defaultValue={latestPlan ? String(latestPlan.monthlyPayoutRate) : '0.90'} required /></label>
              </div>
              <div className="form-row">
                <label>Opening balance<input name="openingBalance" inputMode="decimal" defaultValue={latestPlan ? String(latestPlan.openingBalance) : '0'} /></label>
                <label style={{ alignSelf: 'end' }}><span><input name="quarterlyTrueUp" type="checkbox" defaultChecked={latestPlan?.quarterlyTrueUp ?? true} /> Quarterly true-up</span></label>
              </div>
              <button className="button" type="submit">Save plan</button>
            </form>
          </div>

          <div className="card">
            <h2>Add placement</h2>
            <form className="form" action={createPlacementAction}>
              <input type="hidden" name="recruiterId" value={recruiter.id} />
              <label>Placement name<input name="placementName" required /></label>
              <div className="form-row">
                <label>Client<input name="clientName" /></label>
                <label>Candidate<input name="candidateName" /></label>
              </div>
              <div className="form-row">
                <label>Payment date<input name="paymentDate" type="date" required /></label>
                <label>Start date<input name="startDate" type="date" /></label>
              </div>
              <div className="form-row">
                <label>Bill amount<input name="billAmount" inputMode="decimal" required /></label>
                <label>Payout override/split<input name="payoutOverride" inputMode="decimal" placeholder="Optional" /></label>
              </div>
              <div className="form-row">
                <label>Pay date<input name="payDate" type="date" /></label>
                <label>Status
                  <select name="status" defaultValue="PENDING">
                    <option value="PENDING">Pending</option>
                    <option value="PAID">Paid</option>
                    <option value="CANCELED">Canceled</option>
                  </select>
                </label>
              </div>
              <label>Private note<textarea name="note" /></label>
              <button className="button" type="submit">Add placement</button>
            </form>
          </div>

          <div className="card">
            <h2>Add manual adjustment</h2>
            <form className="form" action={createAdjustmentAction}>
              <input type="hidden" name="recruiterId" value={recruiter.id} />
              <div className="form-row">
                <label>Date<input name="effectiveDate" type="date" required /></label>
                <label>Amount<input name="amount" inputMode="decimal" required /></label>
              </div>
              <label>Kind
                <select name="kind" defaultValue="COMMISSION">
                  <option value="COMMISSION">Commission adjustment</option>
                  <option value="DRAW">Draw adjustment</option>
                  <option value="PAYOUT">Manual payout</option>
                  <option value="MANUAL">Manual correction</option>
                </select>
              </label>
              <label>Reason<textarea name="reason" /></label>
              <button className="button" type="submit">Add adjustment</button>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
