import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { Role } from '@prisma/client';

import { sessionCookieName as COOKIE_NAME } from '@/lib/session-cookie';
const MAX_AGE_SECONDS = 60 * 60 * 10;

export type SessionPayload = {
  userId: string;
  role: Role;
  exp: number;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET must be set to a long random value.');
  }
  return value;
}

function sign(data: string) {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

function encode(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

export async function createSessionCookie(userId: string, role: Role) {
  const store = await cookies();
  const payload: SessionPayload = {
    userId,
    role,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS
  };

  store.set(COOKIE_NAME, encode(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS
  });
}

export async function readSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return decode(token);
  } catch {
    return null;
  }
}

export async function destroySessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

