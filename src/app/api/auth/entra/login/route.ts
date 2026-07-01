import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getMsalClient, ENTRA_SCOPES, getEntraRedirectUri } from '@/lib/msal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'entra_oauth_state';

export async function GET(request: Request) {
  const state = crypto.randomBytes(24).toString('base64url');

  let authUrl: string;
  try {
    authUrl = await getMsalClient().getAuthCodeUrl({
      scopes: ENTRA_SCOPES,
      redirectUri: getEntraRedirectUri(),
      state
    });
  } catch (err) {
    console.error('Failed to start Microsoft sign-in', err);
    return NextResponse.redirect(new URL('/login?error=entra_config', request.url), { status: 303 });
  }

  const response = NextResponse.redirect(authUrl, { status: 303 });
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 300
  });
  return response;
}
