import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireUser } from '@/lib/auth';
import { HUB_LINKS, type HubLink } from '@/lib/links';

export const dynamic = 'force-dynamic';

const GROUPS: HubLink['group'][] = ['Work', 'People', 'Tools'];

export default async function HubPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Home</p>
          <h1>The Eggers Hub</h1>
          <p>Your dashboard, plus quick links to the tools we already use. One place to start the day.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Goal dashboard</h2>
        <p>Live billing, interviews, and phone time against goal.</p>
        <Link className="button" href="/dashboard">Open dashboard</Link>
      </div>

      {GROUPS.map((group) => {
        const items = HUB_LINKS.filter((l) => l.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} style={{ marginBottom: 18 }}>
            <p className="eyebrow">{group}</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {items.map((link) => (
                <a key={link.title} className="card" href={link.href} target="_blank" rel="noreferrer">
                  <h3>{link.title}</h3>
                  <p style={{ margin: 0 }}>{link.description}</p>
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </AppShell>
  );
}
