import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import {
  adminResetPasswordAction,
  createAdjustmentAction,
  createPlacementAction,
  deleteAdjustmentAction,
  deletePlacementAction,
  deletePlanAction,
  deleteRecruiterAction,
  setRecruiterStatusAction,
  updateAdjustmentAction,
  updatePlacementAction,
  updatePlanAction,
  upsertPlanAction
} from '@/app/actions';
import { requireUser, isAdminLike } from '@/lib/auth';
import { getRecruiter, getLedger, getRecruiterRecords } from '@/lib/data';
import { canMutate, canDelete } from '@/lib/permissions';
import { currency, percent } from '@/lib/money';
import { toIsoDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const summaryStyle = { cursor: 'pointer', fontWeight: 700, color: 'var(--accent-dark)' } as const;
const editBlockStyle = { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' } as const;

export default async function RecruiterDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const year = query.year ? Number(query.year) : new Date().getFullYear();

  const recruiter = await getRecruiter(user, id);
  const admin = isAdminLike(user.role);

  const canEditPlan = canMutate(user, id, 'plan');
  const canDeletePlan = canDelete(user, id, 'plan');
  const canEditPlacement = canMutate(user, id, 'placement');
  const canDeletePlacement = canDelete(user, id, 'placement');
  const canEditAdjustment = canMutate(user, id, 'adjustment');
  const canDeleteAdjustment = canDelete(user, id, 'adjustment');

  let ledgerData: Awaited<ReturnType<typeof getLedger>> | null = null;
  let setupError: string | null = null;
  try {
    ledgerData = await getLedger(user, id, year);
  } catch (error) {
    setupError = error instanceof Error ? error.message : 'No plan configured.';
  }

  const { placements, adjustments } = await getRecruiterRecords(user, id, year);
  const latestPlan = recruiter.plans.find((plan) => plan.year === year) ?? recruiter.plans[0];

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Recruiter ledger</p>
          <h1>{recruiter.displayName}</h1>
          <p>
            {recruiter.user?.email ?? 'No login attached'} · {year}
            {!recruiter.active ? ' · ' : ''}
            {!recruiter.active ? <span className="badge gray">Inactive</span> : null}
          </p>
        </div>
        <div className="actions">
          <Link className="button secondary" href={`/recruiters/${id}?year=${year - 1}`}>← {year - 1}</Link>
          <Link className="button secondary" href={`/recruiters/${id}?year=${year + 1}`}>{year + 1} →</Link>
        </div>
      </div>

      {!recruiter.active ? (
        <div className="notice" style={{ marginBottom: 18 }}>
          This recruiter is deactivated. Their login is disabled and they no longer appear in active rollups. History is preserved.
        </div>
      ) : null}

      {setupError ? (
        <div className="notice" style={{ marginBottom: 18 }}>
          {setupError} {canEditPlan ? 'Configure the annual plan below to start the ledger.' : 'An admin needs to configure the annual plan.'}
        </div>
      ) : null}

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
        </>
      ) : null}

      {/* ---------------- Annual plans ---------------- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Annual plans (yearly forms)</h2>
        <p>One plan per year. Editing a plan recalculates the ledger immediately. Year is fixed once created — delete and recreate to move a plan to a different year.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Year</th><th className="num">Annual goal</th><th className="num">Rate</th><th className="num">Salary/draw</th><th>Frequency</th><th className="num">Payout %</th><th></th></tr>
            </thead>
            <tbody>
              {recruiter.plans.length === 0 ? (
                <tr><td colSpan={7}><span className="kpi-sub">No plans yet.</span></td></tr>
              ) : null}
              {recruiter.plans.map((plan) => (
                <tr key={plan.id}>
                  <td><strong>{plan.year}</strong>{plan.quarterlyTrueUp ? <><br /><span className="badge gray">Quarterly true-up</span></> : null}</td>
                  <td className="num">{currency(Number(plan.annualGoal))}</td>
                  <td className="num">{percent(Number(plan.commissionRate))}</td>
                  <td className="num">{currency(Number(plan.salaryPerPayPeriod))}</td>
                  <td>{plan.payFrequency.replaceAll('_', ' ').toLowerCase()}</td>
                  <td className="num">{percent(Number(plan.monthlyPayoutRate))}</td>
                  <td>
                    {canEditPlan || canDeletePlan ? (
                      <details>
                        <summary style={summaryStyle}>Edit</summary>
                        <div style={editBlockStyle}>
                          {canEditPlan ? (
                            <form className="form" action={updatePlanAction}>
                              <input type="hidden" name="planId" value={plan.id} />
                              <input type="hidden" name="expectedUpdatedAt" value={plan.updatedAt.toISOString()} />
                              <div className="form-row">
                                <label>Annual goal<input name="annualGoal" inputMode="decimal" defaultValue={String(plan.annualGoal)} required /></label>
                                <label>Commission rate<input name="commissionRate" inputMode="decimal" defaultValue={String(plan.commissionRate)} required /></label>
                              </div>
                              <div className="form-row">
                                <label>Salary/draw per pay period<input name="salaryPerPayPeriod" inputMode="decimal" defaultValue={String(plan.salaryPerPayPeriod)} required /></label>
                                <label>Monthly payout rate<input name="monthlyPayoutRate" inputMode="decimal" defaultValue={String(plan.monthlyPayoutRate)} required /></label>
                              </div>
                              <div className="form-row">
                                <label>Pay frequency
                                  <select name="payFrequency" defaultValue={plan.payFrequency}>
                                    <option value="SEMI_MONTHLY">Semi-monthly</option>
                                    <option value="BI_WEEKLY">Bi-weekly</option>
                                    <option value="MONTHLY">Monthly</option>
                                  </select>
                                </label>
                                <label>Opening balance<input name="openingBalance" inputMode="decimal" defaultValue={String(plan.openingBalance)} /></label>
                              </div>
                              <label style={{ flexDirection: 'row' }}><span><input name="quarterlyTrueUp" type="checkbox" defaultChecked={plan.quarterlyTrueUp} /> Quarterly true-up</span></label>
                              <button className="button" type="submit">Save changes</button>
                            </form>
                          ) : null}
                          {canDeletePlan ? (
                            <form action={deletePlanAction} style={{ marginTop: 12 }}>
                              <input type="hidden" name="planId" value={plan.id} />
                              <ConfirmSubmit message={`Delete the ${plan.year} plan? The ledger for ${plan.year} will stop calculating until a new plan is added.`}>Delete {plan.year} plan</ConfirmSubmit>
                            </form>
                          ) : null}
                        </div>
                      </details>
                    ) : <span className="kpi-sub">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEditPlan ? (
          <details style={{ marginTop: 16 }}>
            <summary style={summaryStyle}>Add or replace a plan for a year</summary>
            <form className="form" action={upsertPlanAction} style={editBlockStyle}>
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
          </details>
        ) : null}
      </div>

      {/* ---------------- Placements ---------------- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Placements · {year}</h2>
        <p>Only PAID placements flow into commission earned. {canEditPlacement ? 'You can add, edit, and correct placements here.' : 'Read-only.'}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Placement</th><th>Payment date</th><th>Status</th><th className="num">Bill</th><th>Fee basis</th><th></th></tr></thead>
            <tbody>
              {placements.length === 0 ? (
                <tr><td colSpan={6}><span className="kpi-sub">No placements recorded for {year}.</span></td></tr>
              ) : null}
              {placements.map((placement) => (
                <tr key={placement.id}>
                  <td><strong>{placement.placementName}</strong><br /><span className="kpi-sub">{placement.clientName ?? 'No client'} · {placement.candidateName ?? 'No candidate'}</span>{placement.externalSource ? <><br /><span className="badge gray">via {placement.externalSource}</span></> : null}</td>
                  <td>{toIsoDate(placement.paymentDate)}</td>
                  <td><StatusBadge status={placement.status} /></td>
                  <td className="num">{currency(Number(placement.billAmount))}</td>
                  <td>{(() => {
                    const meta = (placement.metadata as Record<string, unknown> | null) ?? {};
                    const summary = (meta.feeSummary as string) || (meta.feeType as string) || (placement.payoutOverride ? 'Override' : '—');
                    return (
                      <>
                        {summary}
                        {meta.needsReview ? <><br /><span className="badge yellow">Needs review</span></> : null}
                      </>
                    );
                  })()}</td>
                  <td>
                    {canEditPlacement || canDeletePlacement ? (
                      <details>
                        <summary style={summaryStyle}>Edit</summary>
                        <div style={editBlockStyle}>
                          {canEditPlacement ? (
                            <form className="form" action={updatePlacementAction}>
                              <input type="hidden" name="placementId" value={placement.id} />
                              <input type="hidden" name="expectedUpdatedAt" value={placement.updatedAt.toISOString()} />
                              <label>Placement name<input name="placementName" defaultValue={placement.placementName} required /></label>
                              <div className="form-row">
                                <label>Client<input name="clientName" defaultValue={placement.clientName ?? ''} /></label>
                                <label>Candidate<input name="candidateName" defaultValue={placement.candidateName ?? ''} /></label>
                              </div>
                              <div className="form-row">
                                <label>Payment date<input name="paymentDate" type="date" defaultValue={toIsoDate(placement.paymentDate)} required /></label>
                                <label>Start date<input name="startDate" type="date" defaultValue={placement.startDate ? toIsoDate(placement.startDate) : ''} /></label>
                              </div>
                              <div className="form-row">
                                <label>Bill amount<input name="billAmount" inputMode="decimal" defaultValue={String(placement.billAmount)} required /></label>
                                <label>Payout override/split<input name="payoutOverride" inputMode="decimal" defaultValue={placement.payoutOverride ? String(placement.payoutOverride) : ''} placeholder="Optional" /></label>
                              </div>
                              <div className="form-row">
                                <label>Pay date<input name="payDate" type="date" defaultValue={placement.payDate ? toIsoDate(placement.payDate) : ''} /></label>
                                <label>Status
                                  <select name="status" defaultValue={placement.status}>
                                    <option value="PENDING">Pending</option>
                                    <option value="PAID">Paid</option>
                                    <option value="CANCELED">Canceled</option>
                                  </select>
                                </label>
                              </div>
                              <label>Private note<textarea name="note" defaultValue={placement.note ?? ''} /></label>
                              <button className="button" type="submit">Save changes</button>
                            </form>
                          ) : null}
                          {canDeletePlacement ? (
                            <form action={deletePlacementAction} style={{ marginTop: 12 }}>
                              <input type="hidden" name="placementId" value={placement.id} />
                              <ConfirmSubmit message={`Delete placement "${placement.placementName}"? This cannot be undone.`}>Delete placement</ConfirmSubmit>
                            </form>
                          ) : null}
                        </div>
                      </details>
                    ) : <span className="kpi-sub">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEditPlacement ? (
          <details style={{ marginTop: 16 }}>
            <summary style={summaryStyle}>Add a placement</summary>
            <form className="form" action={createPlacementAction} style={editBlockStyle}>
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
          </details>
        ) : null}
      </div>

      {/* ---------------- Adjustments ---------------- */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Manual adjustments · {year}</h2>
        <p>Draws, payouts, and corrections applied to the ledger. {canEditAdjustment ? 'Editable.' : 'Managed by admins.'}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Kind</th><th className="num">Amount</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {adjustments.length === 0 ? (
                <tr><td colSpan={5}><span className="kpi-sub">No adjustments for {year}.</span></td></tr>
              ) : null}
              {adjustments.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td>{toIsoDate(adjustment.effectiveDate)}</td>
                  <td><span className="badge gray">{adjustment.kind}</span></td>
                  <td className="num">{currency(Number(adjustment.amount))}</td>
                  <td>{adjustment.reason ?? '—'}</td>
                  <td>
                    {canEditAdjustment || canDeleteAdjustment ? (
                      <details>
                        <summary style={summaryStyle}>Edit</summary>
                        <div style={editBlockStyle}>
                          {canEditAdjustment ? (
                            <form className="form" action={updateAdjustmentAction}>
                              <input type="hidden" name="adjustmentId" value={adjustment.id} />
                              <input type="hidden" name="expectedUpdatedAt" value={adjustment.updatedAt.toISOString()} />
                              <div className="form-row">
                                <label>Date<input name="effectiveDate" type="date" defaultValue={toIsoDate(adjustment.effectiveDate)} required /></label>
                                <label>Amount<input name="amount" inputMode="decimal" defaultValue={String(adjustment.amount)} required /></label>
                              </div>
                              <label>Kind
                                <select name="kind" defaultValue={adjustment.kind}>
                                  <option value="COMMISSION">Commission adjustment</option>
                                  <option value="DRAW">Draw adjustment</option>
                                  <option value="PAYOUT">Manual payout</option>
                                  <option value="MANUAL">Manual correction</option>
                                </select>
                              </label>
                              <label>Reason<textarea name="reason" defaultValue={adjustment.reason ?? ''} /></label>
                              <button className="button" type="submit">Save changes</button>
                            </form>
                          ) : null}
                          {canDeleteAdjustment ? (
                            <form action={deleteAdjustmentAction} style={{ marginTop: 12 }}>
                              <input type="hidden" name="adjustmentId" value={adjustment.id} />
                              <ConfirmSubmit message="Delete this adjustment? This cannot be undone.">Delete adjustment</ConfirmSubmit>
                            </form>
                          ) : null}
                        </div>
                      </details>
                    ) : <span className="kpi-sub">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEditAdjustment ? (
          <details style={{ marginTop: 16 }}>
            <summary style={summaryStyle}>Add an adjustment</summary>
            <form className="form" action={createAdjustmentAction} style={editBlockStyle}>
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
          </details>
        ) : null}
      </div>

      {/* ---------------- Admin: recruiter management ---------------- */}
      {admin ? (
        <div className="card" style={{ marginTop: 18, borderColor: 'var(--danger)' }}>
          <h2>Manage recruiter (admin)</h2>
          <p>Deactivating revokes the login and hides the recruiter from active rollups while keeping all history. Reactivate any time.</p>
          <div className="actions">
            {recruiter.active ? (
              <form action={setRecruiterStatusAction}>
                <input type="hidden" name="recruiterId" value={recruiter.id} />
                <input type="hidden" name="active" value="false" />
                <ConfirmSubmit className="button secondary" message={`Deactivate ${recruiter.displayName}? Their login will be disabled. You can reactivate later.`}>Deactivate recruiter</ConfirmSubmit>
              </form>
            ) : (
              <form action={setRecruiterStatusAction}>
                <input type="hidden" name="recruiterId" value={recruiter.id} />
                <input type="hidden" name="active" value="true" />
                <button className="button" type="submit">Reactivate recruiter</button>
              </form>
            )}
          </div>

          {recruiter.user ? (
            <details style={{ marginTop: 16 }}>
              <summary style={summaryStyle}>Reset this recruiter&apos;s password</summary>
              <form className="form" action={adminResetPasswordAction} style={editBlockStyle}>
                <input type="hidden" name="userId" value={recruiter.user.id} />
                <label>New temporary password<input name="newPassword" type="password" minLength={12} required /></label>
                <button className="button" type="submit">Set new password</button>
              </form>
            </details>
          ) : null}

          <details style={{ marginTop: 16 }}>
            <summary style={{ ...summaryStyle, color: 'var(--danger)' }}>Permanently delete recruiter</summary>
            <div style={editBlockStyle}>
              <p>Destructive and irreversible. This erases the recruiter and <strong>all</strong> of their plans, placements, and adjustments. Prefer deactivation in almost every case. The audit log entry is retained.</p>
              <form action={deleteRecruiterAction}>
                <input type="hidden" name="recruiterId" value={recruiter.id} />
                <ConfirmSubmit message={`PERMANENTLY delete ${recruiter.displayName} and all their financial history? This cannot be undone. Type-check: this is irreversible.`}>Permanently delete</ConfirmSubmit>
              </form>
            </div>
          </details>
        </div>
      ) : null}
    </AppShell>
  );
}
