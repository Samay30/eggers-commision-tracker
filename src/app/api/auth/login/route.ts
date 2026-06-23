import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionCookie } from '@/lib/session';
import { auditLog } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limited = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.allowed) {
    await auditLog({ action: 'LOGIN_RATE_LIMITED', entityType: 'User', metadata: { ip } });
    return NextResponse.redirect(new URL('/login?error=1', request.url), { status: 303 });
  }

  const form = await request.formData();
  const email = String(form.get('email') || '').toLowerCase().trim();
  const password = String(form.get('password') || '');

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && user.isActive ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !ok) {
    await auditLog({ action: 'LOGIN_FAILED', entityType: 'User', entityId: null, metadata: { email } });
    return NextResponse.redirect(new URL('/login?error=1', request.url), { status: 303 });
  }

  await createSessionCookie(user.id, user.role);
  await auditLog({ actorUserId: user.id, action: 'LOGIN_SUCCESS', entityType: 'User', entityId: user.id });
  return NextResponse.redirect(new URL('/dashboard', request.url), { status: 303 });
}
