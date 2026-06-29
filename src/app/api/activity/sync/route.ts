import { NextResponse } from 'next/server';
import { syncRingoverCalls } from '@/lib/ringover/sync';
import { syncLoxoInterviews } from '@/lib/loxo/interviews';
import { ringoverConfigured } from '@/lib/ringover/client';
import { loxoConfigured } from '@/lib/loxo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled activity sync. Protect with CRON_SECRET and call from Vercel Cron
 * (or any scheduler) with `Authorization: Bearer <CRON_SECRET>`, or
 * `?key=<CRON_SECRET>`. Runs Ringover phone time + Loxo interviews for the
 * current year. Safe to run as often as hourly; everything is an upsert.
 *
 * Example vercel.json:
 *   { "crons": [{ "path": "/api/activity/sync", "schedule": "0 * * * *" }] }
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('key');
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
  const result: Record<string, unknown> = { year };

  if (ringoverConfigured()) {
    result.ringover = await syncRingoverCalls({ year, actorUserId: null });
  } else {
    result.ringover = { skipped: 'RINGOVER_API_KEY not set' };
  }

  if (loxoConfigured()) {
    result.interviews = await syncLoxoInterviews({ year, actorUserId: null });
  } else {
    result.interviews = { skipped: 'LOXO_API_KEY not set' };
  }

  return NextResponse.json({ ok: true, ...result });
}
