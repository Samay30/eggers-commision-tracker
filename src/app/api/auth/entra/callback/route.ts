import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSessionCookie } from '@/lib/session';
import { auditLog } from '@/lib/audit';
import { getMsalClient, ENTRA_SCOPES, getEntraRedirectUri } from '@/lib/msal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'entra_oauth_state';

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  return header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function clearState(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const entraError = url.searchParams.get('error');
  const expectedState = readCookie(request, STATE_COOKIE);

  if (entraError) {
    await auditLog({ action: 'LOGIN_FAILED', entityType: 'User', metadata: { provider: 'entra', reason: entraError } });
    return clearState(NextResponse.redirect(new URL('/login?error=1', request.url), { status: 303 }));
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return clearState(NextResponse.redirect(new URL('/login?error=1', request.url), { status: 303 }));
  }

  try {
    const result = await getMsalClient().acquireTokenByCode({
      code,
      scopes: ENTRA_SCOPES,
      redirectUri: getEntraRedirectUri()
    });

    const claims = result.idTokenClaims as
      | { oid?: string; preferred_username?: string; email?: string }
      | undefined;
    const entraId = claims?.oid ?? result.account?.homeAccountId ?? null;
    const email = (claims?.email ?? claims?.preferred_username ?? result.account?.username ?? '')
      .toLowerCase()
      .trim();

    if (!entraId || !email) {
      throw new Error('Microsoft did not return the expected account details.');
    }

    let user = await prisma.user.findUnique({ where: { entraId } });

    if (!user) {
      const existingByEmail = await prisma.user.findUnique({ where: { email } });
      if (existingByEmail && !existingByEmail.entraId) {
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { entraId, authProvider: 'ENTRA' }
        });
      } else {
        user = existingByEmail;
      }
    }

    if (!user || !user.isActive) {
      await auditLog({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        metadata: { provider: 'entra', email, reason: user ? 'inactive' : 'no_matching_account' }
      });
      return clearState(NextResponse.redirect(new URL('/login?error=no_account', request.url), { status: 303 }));
    }

    await createSessionCookie(user.id, user.role);
    await auditLog({
      actorUserId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      metadata: { provider: 'entra' }
    });

    return clearState(NextResponse.redirect(new URL('/dashboard', request.url), { status: 303 }));
  } catch (err) {
    console.error('Microsoft sign-in failed', err);
    await auditLog({ action: 'LOGIN_FAILED', entityType: 'User', metadata: { provider: 'entra', reason: 'exchange_failed' } });
    return clearState(NextResponse.redirect(new URL('/login?error=1', request.url), { status: 303 }));
  }
}
