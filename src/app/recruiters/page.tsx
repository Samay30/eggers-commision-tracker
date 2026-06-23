import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireUser, isAdminLike } from '@/lib/auth';
import { getAccessibleRecruiters } from '@/lib/data';
import { createRecruiterAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function RecruitersPage() {
  const user = await requireUser();
  const year = new Date().getFullYear();
  const recruiters = await getAccessibleRecruiters(user, year);
  const admin = isAdminLike(user.role);

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Private recruiter records</p>
          <h1>Recruiters</h1>
          <p>Each recruiter has their own plan, placements, draw balance, and annual goal progress.</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Current recruiters</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Plan</th><th>Status</th></tr></thead>
              <tbody>
                {recruiters.map((recruiter) => (
                  <tr key={recruiter.id}>
                    <td><Link href={`/recruiters/${recruiter.id}`}><strong>{recruiter.displayName}</strong></Link></td>
                    <td>{recruiter.user?.email ?? 'No login attached'}</td>
                    <td>{recruiter.plans[0] ? `${recruiter.plans[0].year}` : 'Not configured'}</td>
                    <td>{recruiter.active ? <span className="badge green">Active</span> : <span className="badge gray">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {admin ? (
          <div className="card">
            <h2>Add recruiter/login</h2>
            <p>This creates a login and, for recruiter role, a linked recruiter profile. Use a temporary password and change it after first sign-in.</p>
            <form className="form" action={createRecruiterAction}>
              <label>Name<input name="name" required /></label>
              <label>Email<input name="email" type="email" required /></label>
              <label>Temporary password<input name="password" type="password" minLength={12} required /></label>
              <label>Role
                <select name="role" defaultValue="RECRUITER">
                  <option value="RECRUITER">Recruiter</option>
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              <button className="button" type="submit">Create account</button>
            </form>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
