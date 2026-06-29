import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from '@/lib/session-cookie';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/health',
  '/api/loxo/webhook',
  '/api/activity/sync',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html'
];

// Public path prefixes (PWA icons and other static assets that must load
// before the user is authenticated so the app can install).
const PUBLIC_PREFIXES = ['/icons/', '/_next', '/favicon'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(sessionCookieName)?.value);
  if (!hasSessionCookie && !pathname.startsWith('/api/auth/logout')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
