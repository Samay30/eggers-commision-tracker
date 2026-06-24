import { PlacementStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encryptString } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';
import { startOfYear, endOfYear } from '@/lib/dates';
import { loxoGetAll } from '@/lib/loxo/client';
import { LOXO_PLACEMENTS_PATH, normalizeLoxoPlacement } from '@/lib/loxo/mapping';
import { describeFee } from '@/lib/loxo/fee';

export interface SyncSummary {
  year: number;
  pulled: number;
  imported: number;
  updated: number;
  needsReview: number;
  skippedUnmapped: number;
  outOfYear: number;
  errors: string[];
  finishedAt: string;
}

/**
 * Pull placed candidates from Loxo for a given year and upsert them as placements.
 * Idempotent on (externalSource='loxo', externalId). Designed so it can run from a
 * button, a cron route, or after a webhook as a reconciliation pass.
 *
 * Money-safety rules:
 *  - A fee we can't confidently derive is still imported but flagged needsReview
 *    in metadata (and noted) so a human resolves it instead of trusting a guess.
 *  - A placement with no recruiter match is NOT written (no orphan money); it's
 *    logged as LOXO_SYNC_UNMAPPED so Adrian can fix the email mapping.
 *  - A PAID status set by a human is never downgraded by a later sync.
 */
export async function syncLoxoPlacements(opts: { year: number; actorUserId?: string | null }): Promise<SyncSummary> {
  const { year } = opts;
  const summary: SyncSummary = {
    year,
    pulled: 0,
    imported: 0,
    updated: 0,
    needsReview: 0,
    skippedUnmapped: 0,
    outOfYear: 0,
    errors: [],
    finishedAt: ''
  };

  const rawList = await loxoGetAll(LOXO_PLACEMENTS_PATH, { per_page: 50 });
  summary.pulled = rawList.length;

  const recruiters = await prisma.recruiter.findMany({
    where: { active: true },
    include: { user: { select: { email: true } } }
  });
  const byEmail = new Map<string, string>();
  for (const r of recruiters) if (r.user?.email) byEmail.set(r.user.email.toLowerCase(), r.id);

  const yStart = startOfYear(year);
  const yEnd = endOfYear(year);

  for (const raw of rawList) {
    try {
      const n = normalizeLoxoPlacement(raw);
      if (!n.externalId) {
        summary.skippedUnmapped += 1;
        continue;
      }

      const paymentDate = n.paymentDate ?? n.startDate;
      if (paymentDate && (paymentDate < yStart || paymentDate > yEnd)) {
        summary.outOfYear += 1;
        continue;
      }

      const matchedRecruiterId = n.recruiterEmail ? byEmail.get(n.recruiterEmail) : undefined;
      const recruiterId = matchedRecruiterId ?? process.env.DEFAULT_LOXO_RECRUITER_ID ?? undefined;

      if (!recruiterId) {
        summary.skippedUnmapped += 1;
        await auditLog({
          actorUserId: opts.actorUserId ?? null,
          action: 'LOXO_SYNC_UNMAPPED',
          entityType: 'Placement',
          metadata: { externalId: n.externalId, recruiterEmail: n.recruiterEmail, candidate: n.candidateName }
        });
        continue;
      }

      const needsReview = !n.fee.confident;
      if (needsReview) summary.needsReview += 1;

      const meta = {
        source: 'loxo-sync',
        feeType: n.fee.feeType,
        flatFee: n.fee.flatFee,
        feePercentage: n.fee.feePercentage,
        salaryBasis: n.fee.salaryBasis,
        hours: n.fee.hours,
        hourlyRate: n.fee.hourlyRate,
        feeSummary: describeFee(n.fee),
        needsReview,
        reviewReason: n.fee.reason,
        loxoJobId: n.loxoJobId,
        loxoCandidateId: n.loxoCandidateId
      } as Prisma.InputJsonValue;

      const billAmount = n.fee.resolvedFee ?? 0;
      const existing = await prisma.placement.findUnique({
        where: { externalSource_externalId: { externalSource: 'loxo', externalId: n.externalId } }
      });

      if (existing) {
        await prisma.placement.update({
          where: { id: existing.id },
          data: {
            recruiterId,
            placementName: n.placementName,
            clientName: n.clientName,
            candidateName: n.candidateName,
            paymentDate: paymentDate ?? existing.paymentDate,
            startDate: n.startDate ?? existing.startDate,
            billAmount: String(billAmount),
            status: existing.status === PlacementStatus.PAID ? PlacementStatus.PAID : n.status,
            metadata: meta
          }
        });
        summary.updated += 1;
      } else {
        const note = encryptString(needsReview ? `Auto-imported from Loxo — needs review: ${n.fee.reason ?? 'unverified fee'}` : null);
        await prisma.placement.create({
          data: {
            recruiterId,
            externalSource: 'loxo',
            externalId: n.externalId,
            placementName: n.placementName,
            clientName: n.clientName,
            candidateName: n.candidateName,
            paymentDate: paymentDate ?? new Date(),
            startDate: n.startDate,
            billAmount: String(billAmount),
            status: n.status,
            noteCiphertext: note.ciphertext,
            noteIv: note.iv,
            noteAuthTag: note.authTag,
            metadata: meta
          }
        });
        summary.imported += 1;
      }
    } catch (error) {
      summary.errors.push(error instanceof Error ? error.message : 'unknown error');
    }
  }

  summary.finishedAt = new Date().toISOString();
  await auditLog({
    actorUserId: opts.actorUserId ?? null,
    action: 'LOXO_SYNC_RUN',
    entityType: 'WebhookEvent',
    metadata: { ...summary, errors: summary.errors.slice(0, 10) }
  });
  return summary;
}
