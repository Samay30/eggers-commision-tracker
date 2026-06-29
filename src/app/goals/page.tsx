import { AppShell } from '@/components/AppShell';
import { requireAdminLike } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOrgGoals, getActivityTargets } from '@/lib/goals';
import { saveOrgGoalsAction, saveActivityTargetAction } from '@/app/goal-actions';

export const dynamic = 'force-dynamic';

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireAdminLike();
  const params = await searchParams;
  const year = Number(params.year) || new Date().getFullYear();

  const [org, targets, recruiters] = await Promise.all([
    getOrgGoals(year),
    getActivityTargets(year),
    prisma.recruiter.findMany({
      where: { active: true },
      orderBy: { displayName: 'asc' },
      include: { plans: { where: { year }, take: 1 }, user: { select: { email: true } } }
    })
  ]);

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">{year} goals</p>
          <h1>Goals</h1>
          <p>Company targets and per-recruiter activity goals. Individual billing goals are set on each recruiter&apos;s plan.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Company goals ({year})</h2>
        <form className="form" action={saveOrgGoalsAction}>
          <input type="hidden" name="year" value={year} />
          <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <label>Annual billing goal ($)
              <input name="billingGoal" type="number" step="1000" defaultValue={org.billingGoal || ''} />
            </label>
            <label>Interview goal (count)
              <input name="interviewGoal" type="number" defaultValue={org.interviewGoal || ''} />
            </label>
            <label>Phone time goal (minutes)
              <input name="phoneMinutesGoal" type="number" defaultValue={org.phoneMinutesGoal || ''} />
            </label>
          </div>
          <div className="actions"><button className="button" type="submit">Save company goals</button></div>
        </form>
      </div>

      <div className="card">
        <h2>Recruiter activity targets ({year})</h2>
        <p>Billing goal comes from each recruiter&apos;s commission plan. Set interview and phone targets here.</p>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Recruiter</th>
                <th>Billing goal (plan)</th>
                <th>Interview goal</th>
                <th>Phone minutes goal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recruiters.map((r) => {
                const t = targets.get(r.id);
                const billing = Number(r.plans[0]?.annualGoal ?? 0);
                return (
                  <tr key={r.id}>
                    <td><strong>{r.displayName}</strong><br /><span className="kpi-sub">{r.user?.email}</span></td>
                    <td>{billing > 0 ? `$${billing.toLocaleString()}` : <span className="kpi-sub">set on plan</span>}</td>
                    <td colSpan={3}>
                      <form className="actions" action={saveActivityTargetAction}>
                        <input type="hidden" name="recruiterId" value={r.id} />
                        <input type="hidden" name="year" value={year} />
                        <input name="interviewGoal" type="number" defaultValue={t?.interviewGoal || ''} placeholder="interviews" style={{ maxWidth: 130 }} />
                        <input name="phoneMinutesGoal" type="number" defaultValue={t?.phoneMinutesGoal || ''} placeholder="minutes" style={{ maxWidth: 130 }} />
                        <button className="button secondary" type="submit">Save</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {recruiters.length === 0 ? (
                <tr><td colSpan={5}><span className="kpi-sub">No active recruiters.</span></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
