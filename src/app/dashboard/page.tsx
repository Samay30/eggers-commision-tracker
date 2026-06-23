import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { KpiCard } from '@/components/KpiCard';
import { requireUser } from '@/lib/auth';
import { getAccessibleRecruiters, getLedger } from '@/lib/data';
import { currency } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const year = new Date().getFullYear();
  const recruiters = await getAccessibleRecruiters(user, year);

  const ledgers = await Promise.all(
    recruiters.map(async (recruiter) => {
      try {
        return { recruiter, ledger: await getLedger(user, recruiter.id, year), error: null as string | null };
      } catch (error) {
        return { recruiter, ledger: null, error: error instanceof Error ? error.message : 'Unable to calculate ledger.' };
      }
    })
  );

  const totals = ledgers.reduce(
    (acc, item) => {
      if (!item.ledger) return acc;
      acc.sales += item.ledger.summary.salesToDate;
      acc.commission += item.ledger.summary.commissionEarned;
      acc.draws += item.ledger.summary.drawPaid;
      acc.payouts += item.ledger.summary.paidOut;
      return acc;
    },
    { sales: 0, commission: 0, draws: 0, payouts: 0 }
  );

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">{year} commission year</p>
          <h1>Dashboard</h1>
          <p>Live draw-against-commission status based on paid placements, configured draw, monthly payout rate, and quarterly true-up settings.</p>
        </div>
      </div>

      <div className="grid cards">
        <KpiCard label="Billings to date" value={currency(totals.sales)} />
        <KpiCard label="Commission earned" value={currency(totals.commission)} />
        <KpiCard label="Draw paid" value={currency(totals.draws)} />
        <KpiCard label="Paid out" value={currency(totals.payouts)} />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Recruiter status</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recruiter</th>
                <th className="num">Goal</th>
                <th className="num">Sales</th>
                <th className="num">Remaining</th>
                <th className="num">Ending balance</th>
                <th>Goal progress</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.map(({ recruiter, ledger, error }) => {
                const progress = ledger ? Math.min(100, Math.round((ledger.summary.salesToDate / Math.max(1, ledger.summary.annualGoal)) * 100)) : 0;
                return (
                  <tr key={recruiter.id}>
                    <td><Link href={`/recruiters/${recruiter.id}`}><strong>{recruiter.displayName}</strong></Link><br /><span className="kpi-sub">{recruiter.user?.email}</span></td>
                    {ledger ? (
                      <>
                        <td className="num">{currency(ledger.summary.annualGoal)}</td>
                        <td className="num">{currency(ledger.summary.salesToDate)}</td>
                        <td className="num">{currency(ledger.summary.remainingGoal)}</td>
                        <td className="num">{currency(ledger.summary.endingBalance)}</td>
                        <td><div className="progress"><div style={{ width: `${progress}%` }} /></div><span className="kpi-sub">{progress}%</span></td>
                      </>
                    ) : (
                      <td colSpan={5}><span className="badge yellow">Needs setup</span> {error}</td>
                    )}
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
