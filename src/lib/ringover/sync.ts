import { prisma } from '@/lib/db';
import { auditLog } from '@/lib/audit';
import { startOfYear, endOfYear, toIsoDate } from '@/lib/dates';
import { ringoverGetCalls } from '@/lib/ringover/client';
import { normalizeRingoverCall } from '@/lib/ringover/mapping';

export interface RingoverSyncSummary {
  year: number;
  pulled: number;
  matchedCalls: number;
  skippedUnmapped: number;
  recruiterDaysWritten: number;
  errors: string[];
  finishedAt: string;
}

interface DayBucket {
  totalCalls: number;
  outboundCalls: number;
  talkSeconds: number;
}

/**
 * Pull all Ringover calls for a year, attribute each to a recruiter by agent
 * email, and roll them up into one CallActivityDay row per recruiter per day.
 * Idempotent: re-running overwrites the affected days with fresh totals.
 *
 * Safety: a call whose agent email doesn't match any recruiter is counted as
 * skipped, never attributed to the wrong person.
 */
export async function syncRingoverCalls(opts: { year: number; actorUserId?: string | null }): Promise<RingoverSyncSummary> {
  const { year } = opts;
  const summary: RingoverSyncSummary = {
    year,
    pulled: 0,
    matchedCalls: 0,
    skippedUnmapped: 0,
    recruiterDaysWritten: 0,
    errors: [],
    finishedAt: ''
  };

  const yStart = startOfYear(year);
  const yEnd = endOfYear(year);

  const recruiters = await prisma.recruiter.findMany({
    where: { active: true },
    include: { user: { select: { email: true } } }
  });
  const byEmail = new Map<string, string>();
  for (const r of recruiters) if (r.user?.email) byEmail.set(r.user.email.toLowerCase(), r.id);

  let calls: any[] = [];
  try {
    calls = await ringoverGetCalls(yStart, yEnd);
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : 'unknown error');
    summary.finishedAt = new Date().toISOString();
    return summary;
  }
  summary.pulled = calls.length;

  // recruiterId -> (isoDate -> bucket)
  const buckets = new Map<string, Map<string, DayBucket>>();

  for (const raw of calls) {
    const n = normalizeRingoverCall(raw);
    if (!n.agentEmail || !n.startedAt) {
      summary.skippedUnmapped += 1;
      continue;
    }
    const recruiterId = byEmail.get(n.agentEmail);
    if (!recruiterId) {
      summary.skippedUnmapped += 1;
      continue;
    }
    summary.matchedCalls += 1;

    const iso = toIsoDate(n.startedAt);
    if (!buckets.has(recruiterId)) buckets.set(recruiterId, new Map());
    const days = buckets.get(recruiterId)!;
    const bucket = days.get(iso) ?? { totalCalls: 0, outboundCalls: 0, talkSeconds: 0 };
    bucket.totalCalls += 1;
    if (n.direction === 'out') bucket.outboundCalls += 1;
    bucket.talkSeconds += n.talkSeconds;
    days.set(iso, bucket);
  }

  for (const [recruiterId, days] of buckets) {
    for (const [iso, bucket] of days) {
      try {
        const date = new Date(`${iso}T00:00:00.000Z`);
        await prisma.callActivityDay.upsert({
          where: { recruiterId_date: { recruiterId, date } },
          update: {
            totalCalls: bucket.totalCalls,
            outboundCalls: bucket.outboundCalls,
            talkSeconds: bucket.talkSeconds,
            source: 'ringover'
          },
          create: {
            recruiterId,
            date,
            totalCalls: bucket.totalCalls,
            outboundCalls: bucket.outboundCalls,
            talkSeconds: bucket.talkSeconds,
            source: 'ringover'
          }
        });
        summary.recruiterDaysWritten += 1;
      } catch (error) {
        summary.errors.push(error instanceof Error ? error.message : 'unknown error');
      }
    }
  }

  summary.finishedAt = new Date().toISOString();
  await auditLog({
    actorUserId: opts.actorUserId ?? null,
    action: 'RINGOVER_SYNC_RUN',
    entityType: 'CallActivityDay',
    metadata: { ...summary, errors: summary.errors.slice(0, 10) }
  });
  return summary;
}
