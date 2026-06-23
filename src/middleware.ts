import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from '@/lib/session-cookie';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health', '/api/loxo/webhook', '/manifest.webmanifest'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith('/_next') || pathname.startsWith('/favicon'))) {
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
