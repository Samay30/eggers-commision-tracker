import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { requireUser } from '@/lib/auth';
import { getAccessiblePlacements } from '@/lib/data';
import { currency } from '@/lib/money';
import { toIsoDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function PlacementsPage() {
  const user = await requireUser();
  const placements = await getAccessiblePlacements(user);

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Placement feed</p>
          <h1>Placements</h1>
          <p>Pending and paid placements are shown separately with status badges. Only paid placements flow into commission earned.</p>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Placement</th><th>Recruiter</th><th>Payment date</th><th>Status</th><th className="num">Bill</th><th className="num">Override</th></tr>
            </thead>
            <tbody>
              {placements.map((placement) => (
                <tr key={placement.id}>
                  <td><strong>{placement.placementName}</strong><br /><span className="kpi-sub">{placement.clientName ?? 'No client'} · {placement.candidateName ?? 'No candidate'}</span></td>
                  <td><Link href={`/recruiters/${placement.recruiterId}`}>{placement.recruiter.displayName}</Link></td>
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
    </AppShell>
  );
}
