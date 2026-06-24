import { NextResponse } from 'next/server';
import { syncLoxoPlacements } from '@/lib/loxo/sync';
import { loxoConfigured } from '@/lib/loxo/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron / external trigger for a reconciliation sync. Protect with LOXO_SYNC_SECRET.
 * Call as: GET /api/loxo/sync?year=2026  with header  x-sync-secret: <LOXO_SYNC_SECRET>
 * (or ?secret=... for Vercel Cron). Realtime updates still come via the webhook;
 * this is the safety-net backfill.
 */
export async function GET(request: Request) {
  const secret = process.env.LOXO_SYNC_SECRET;
  const url = new URL(request.url);
  const provided = request.headers.get('x-sync-secret') || url.searchParams.get('secret');

  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!loxoConfigured()) {
    return NextResponse.json({ ok: false, error: 'Loxo is not configured (LOXO_API_KEY / LOXO_AGENCY_SLUG).' }, { status: 400 });
  }

  const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
  try {
    const summary = await syncLoxoPlacements({ year, actorUserId: null });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Sync failed' }, { status: 500 });
  }
}
