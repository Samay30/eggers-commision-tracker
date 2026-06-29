/**
 * ============================================================================
 *  THE ONE RINGOVER FILE TO VERIFY AGAINST YOUR LIVE ACCOUNT
 * ============================================================================
 * Ringover's call objects vary slightly by plan. The field lists below are
 * best-effort based on Ringover's v2 /calls schema. To confirm, pull one real
 * call and check the keys:
 *
 *   curl -H "Authorization: $RINGOVER_API_KEY" \
 *     "https://public-api.ringover.com/v2/calls?limit_count=1"
 *
 * Then adjust the key lists here. Everything else in the Ringover sync reads
 * through this normalizer, so this is the only file you should need to touch.
 *
 * Recruiter matching: we map a call to a recruiter by the agent's email. Make
 * sure each recruiter's Ringover user email matches their login email in the
 * tracker. Calls we can't map to a recruiter are counted as skipped, never
 * attributed to the wrong person.
 */

export interface NormalizedCall {
  externalId: string | null;
  agentEmail: string | null;
  direction: 'in' | 'out' | null;
  startedAt: Date | null;
  /** Seconds of actual conversation (in-call), not ringing time. */
  talkSeconds: number;
}

function pick(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(...values: unknown[]): number {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function pickDate(...values: unknown[]): Date | null {
  const v = pick(...values);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.valueOf()) ? null : d;
}

function mapDirection(value: unknown): 'in' | 'out' | null {
  const s = String(value || '').toLowerCase();
  if (s.includes('out')) return 'out';
  if (s.includes('in')) return 'in';
  return null;
}

export function normalizeRingoverCall(raw: any): NormalizedCall {
  const user = raw?.user ?? raw?.agent ?? raw?.user_data ?? {};
  return {
    externalId: pick(raw?.call_id, raw?.cdr_id, raw?.id, raw?.calluuid),
    agentEmail: pick(user?.email, raw?.user_email, raw?.agent_email)?.toLowerCase() ?? null,
    direction: mapDirection(raw?.direction ?? raw?.type ?? raw?.way),
    startedAt: pickDate(raw?.start_time, raw?.started_at, raw?.start_date, raw?.date),
    // Prefer in-call (talk) time; fall back to total duration.
    talkSeconds: Math.max(
      0,
      Math.round(pickNumber(raw?.incall_duration, raw?.talk_duration, raw?.duration, raw?.total_duration))
    )
  };
}
