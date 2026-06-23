import Link from 'next/link';
import type { ReactNode } from 'react';
import { CurrentUser, isAdminLike } from '@/lib/auth';

export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Commission Tracker</div>
        <nav className="nav">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/recruiters">Recruiters</Link>
          <Link href="/placements">Placements</Link>
          {isAdminLike(user.role) ? <Link href="/audit">Audit log</Link> : null}
          <Link href="/settings">Settings</Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </nav>
        <div className="user-card">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
          <br />
          <span>{user.role}</span>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
