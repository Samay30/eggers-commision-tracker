/**
 * ============================================================================
 *  LOXO INTERVIEW ACTIVITY SYNC  (verify the path + field names once)
 * ============================================================================
 * Counts interview events per recruiter per day from Loxo. Loxo models activity
 * as "activity types" / scorecards / candidate-stage events, and the exact list
 * endpoint differs by account. Set the path with LOXO_INTERVIEWS_PATH and run
 * the existing inspect script to confirm the field names below, then adjust the
 * key lists. Everything reads through this file.
 *
 *   LOXO_INTERVIEWS_PATH   — e.g. "activities" or "scorecards" (default "activities")
 *   LOXO_INTERVIEW_KEYWORDS — comma list that marks an event as an interview
 *                             (default: "interview,screen,phone screen,onsite")
 */
import { prisma } from '@/lib/db';
import { auditLog } from '@/lib/audit';
import { startOfYear, endOfYear, toIsoDate } from '@/lib/dates';
import { loxoGetAll } from '@/lib/loxo/client';

export const LOXO_INTERVIEWS_PATH = process.env.LOXO_INTERVIEWS_PATH?.trim() || 'activities';

const INTERVIEW_KEYWORDS = (process.env.LOXO_INTERVIEW_KEYWORDS || 'interview,screen,phone screen,onsite')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export interface InterviewSyncSummary {
  year: number;
  pulled: number;
  interviewEvents: number;
  skippedUnmapped: number;
  recruiterDaysWritten: number;
  errors: string[];
  finishedAt: string;
}

function str(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function date(...values: unknown[]): Date | null {
  const v = str(...values);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.valueOf()) ? null : d;
}

function isInterview(raw: any): boolean {
  const label = String(
    str(raw?.activity_type?.name, raw?.activity_type, raw?.type, raw?.kind, raw?.name, raw?.subject) || ''
  ).toLowerCase();
  return INTERVIEW_KEYWORDS.some((k) => label.includes(k));
}

export async function syncLoxoInterviews(opts: { year: number; actorUserId?: string | null }): Promise<InterviewSyncSummary> {
  const { year } = opts;
  const summary: InterviewSyncSummary = {
    year,
    pulled: 0,
    interviewEvents: 0,
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

  let rawList: any[] = [];
  try {
    rawList = await loxoGetAll(LOXO_INTERVIEWS_PATH, { per_page: 50 });
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : 'unknown error');
    summary.finishedAt = new Date().toISOString();
    return summary;
  }
  summary.pulled = rawList.length;

  // recruiterId -> isoDate -> count
  const buckets = new Map<string, Map<string, number>>();

  for (const raw of rawList) {
    if (!isInterview(raw)) continue;
    const when = date(raw?.created_at, raw?.activity_date, raw?.date, raw?.scheduled_at);
    if (!when || when < yStart || when > yEnd) continue;

    const email = str(raw?.user?.email, raw?.created_by?.email, raw?.owner?.email, raw?.recruiter?.email)?.toLowerCase();
    const recruiterId = email ? byEmail.get(email) : undefined;
    if (!recruiterId) {
      summary.skippedUnmapped += 1;
      continue;
    }
    summary.interviewEvents += 1;

    const iso = toIsoDate(when);
    if (!buckets.has(recruiterId)) buckets.set(recruiterId, new Map());
    const days = buckets.get(recruiterId)!;
    days.set(iso, (days.get(iso) ?? 0) + 1);
  }

  for (const [recruiterId, days] of buckets) {
    for (const [iso, count] of days) {
      try {
        const d = new Date(`${iso}T00:00:00.000Z`);
        await prisma.interviewActivityDay.upsert({
          where: { recruiterId_date: { recruiterId, date: d } },
          update: { interviews: count, source: 'loxo' },
          create: { recruiterId, date: d, interviews: count, source: 'loxo' }
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
    action: 'LOXO_INTERVIEW_SYNC_RUN',
    entityType: 'InterviewActivityDay',
    metadata: { ...summary, errors: summary.errors.slice(0, 10) }
  });
  return summary;
}
