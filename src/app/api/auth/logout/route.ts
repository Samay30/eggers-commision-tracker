import { NextResponse } from 'next/server';
import { destroySessionCookie, readSession } from '@/lib/session';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await readSession();
  await destroySessionCookie();
  if (session) {
    await auditLog({ actorUserId: session.userId, action: 'LOGOUT', entityType: 'User', entityId: session.userId });
  }
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
