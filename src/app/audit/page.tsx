import { AppShell } from '@/components/AppShell';
import { requireAdminLike } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const user = await requireAdminLike();
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { actor: { select: { name: true, email: true } } }
  });

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Sensitive data controls</p>
          <h1>Audit log</h1>
          <p>Recent sign-ins and administrative changes. Keep this visible to Adrian/Aaron as a control layer.</p>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Metadata</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.createdAt.toISOString()}</td>
                  <td>{log.actor ? `${log.actor.name} (${log.actor.email})` : 'System/unknown'}</td>
                  <td><span className="badge gray">{log.action}</span></td>
                  <td>{log.entityType}{log.entityId ? ` · ${log.entityId}` : ''}</td>
                  <td><code>{log.metadata ? JSON.stringify(log.metadata) : '—'}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
