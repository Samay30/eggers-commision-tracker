import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { GoalBar } from '@/components/GoalBar';
import { requireUser } from '@/lib/auth';
import { getGoalDashboard, goalPercent } from '@/lib/activity/data';
import { getAccessibleRecruiters, getLedger } from '@/lib/data';
import { currency } from '@/lib/money';

export const dynamic = 'force-dynamic';

function hours(minutes: number) {
  return `${(minutes / 60).toFixed(1)} hrs`;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const year = new Date().getFullYear();

  const data = await getGoalDashboard(user, year);

  // Commission summary (admins) — preserved from the original dashboard so no
  // financial visibility is lost. Computed from ledgers where a plan exists.
  let financials: { sales: number; commission: number; draws: number; payouts: number } | null = null;
  if (data.isAdmin) {
    const recruiters = await getAccessibleRecruiters(user, year);
    const ledgers = await Promise.all(
      recruiters.map(async (r) => {
        try {
          return await getLedger(user, r.id, year);
        } catch {
          return null;
        }
      })
    );
    financials = ledgers.reduce(
      (acc, l) => {
        if (!l) return acc;
        acc.sales += l.summary.salesToDate;
        acc.commission += l.summary.commissionEarned;
        acc.draws += l.summary.drawPaid;
        acc.payouts += l.summary.paidOut;
        return acc;
      },
      { sales: 0, commission: 0, draws: 0, payouts: 0 }
    );
  }

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">{year} goals</p>
          <h1>Dashboard</h1>
          <p>
            {data.isAdmin
              ? 'Live company progress across billing, interviews, and phone time, with a per-recruiter breakdown below.'
              : 'Your live progress across billing, interviews, and phone time for the year.'}
          </p>
        </div>
      </div>

      <p className="eyebrow">{data.isAdmin ? 'Company' : 'You'}</p>
      <div className="grid cards" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <GoalBar label="Billings" value={data.org.billings} goal={data.org.billingGoal} display={currency} />
        <GoalBar label="Interviews" value={data.org.interviews} goal={data.org.interviewGoal} display={(n) => String(n)} />
        <GoalBar label="Phone time" value={data.org.phoneMinutes} goal={data.org.phoneMinutesGoal} display={hours} />
      </div>

      {data.isAdmin ? (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Recruiter scoreboard</h2>
            <Link className="button secondary" href="/goals">Set goals</Link>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Recruiter</th>
                  <th className="num">Billings</th>
                  <th>Billing goal</th>
                  <th className="num">Interviews</th>
                  <th className="num">Phone</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const billProgress = goalPercent(row.billings, row.billingGoal);
                  return (
                    <tr key={row.recruiterId}>
                      <td>
                        <Link href={`/recruiters/${row.recruiterId}`}><strong>{row.displayName}</strong></Link>
                        <br />
                        <span className="kpi-sub">{row.email}</span>
                      </td>
                      <td className="num">{currency(row.billings)}</td>
                      <td style={{ minWidth: 160 }}>
                        <div className="progress"><div style={{ width: `${billProgress}%` }} /></div>
                        <span className="kpi-sub">{row.billingGoal > 0 ? `${billProgress}% of ${currency(row.billingGoal)}` : 'no goal'}</span>
                      </td>
                      <td className="num">
                        {row.interviews}
                        <br />
                        <span className="kpi-sub">{row.interviewGoal > 0 ? `/ ${row.interviewGoal}` : ''}</span>
                      </td>
                      <td className="num">
                        {hours(row.phoneMinutes)}
                        <br />
                        <span className="kpi-sub">{row.phoneMinutesGoal > 0 ? `/ ${hours(row.phoneMinutesGoal)}` : ''}</span>
                      </td>
                    </tr>
                  );
                })}
                {data.rows.length === 0 ? (
                  <tr><td colSpan={5}><span className="kpi-sub">No recruiters yet.</span></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {financials ? (
        <>
          <p className="eyebrow" style={{ marginTop: 24 }}>Commission summary</p>
          <div className="grid cards">
            <div className="card"><div className="kpi-label">Billings to date</div><div className="kpi-value">{currency(financials.sales)}</div></div>
            <div className="card"><div className="kpi-label">Commission earned</div><div className="kpi-value">{currency(financials.commission)}</div></div>
            <div className="card"><div className="kpi-label">Draw paid</div><div className="kpi-value">{currency(financials.draws)}</div></div>
            <div className="card"><div className="kpi-label">Paid out</div><div className="kpi-value">{currency(financials.payouts)}</div></div>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
