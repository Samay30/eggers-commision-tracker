import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { PlacementStatus, Prisma, WebhookStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encryptString } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';
import { normalizeLoxoPlacement } from '@/lib/loxo/mapping';
import { describeFee } from '@/lib/loxo/fee';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.LOXO_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-loxo-signature');
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

  if (!verifySignature(rawBody, signature)) {
    await auditLog({ action: 'LOXO_WEBHOOK_REJECTED', entityType: 'WebhookEvent', metadata: { reason: 'bad_signature', payloadHash } });
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // The placement may be nested under `data` depending on the Loxo event envelope.
  const record = payload.data && typeof payload.data === 'object' ? { ...payload, ...payload.data } : payload;
  const normalized = normalizeLoxoPlacement(record);

  if (!normalized.externalId) {
    return NextResponse.json({ ok: false, error: 'Missing external id' }, { status: 422 });
  }

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { source_externalId: { source: 'loxo', externalId: normalized.externalId } }
  });
  if (existingEvent) {
    await prisma.webhookEvent.update({ where: { id: existingEvent.id }, data: { status: WebhookStatus.DUPLICATE } });
    // fall through and still upsert, so re-sent events keep data fresh
  }

  const event = existingEvent
    ? existingEvent
    : await prisma.webhookEvent.create({
        data: { source: 'loxo', externalId: normalized.externalId, payloadHash, status: WebhookStatus.RECEIVED }
      });

  try {
    const recruiter = normalized.recruiterEmail
      ? await prisma.recruiter.findFirst({ where: { user: { email: normalized.recruiterEmail } } })
      : null;
    const recruiterId = recruiter?.id ?? process.env.DEFAULT_LOXO_RECRUITER_ID;

    if (!recruiterId) {
      throw new Error('No recruiter mapping found. Include recruiter.email in payload or set DEFAULT_LOXO_RECRUITER_ID.');
    }

    const needsReview = !normalized.fee.confident;
    const meta = {
      source: 'loxo-webhook',
      feeType: normalized.fee.feeType,
      flatFee: normalized.fee.flatFee,
      feePercentage: normalized.fee.feePercentage,
      salaryBasis: normalized.fee.salaryBasis,
      hours: normalized.fee.hours,
      hourlyRate: normalized.fee.hourlyRate,
      feeSummary: describeFee(normalized.fee),
      needsReview,
      reviewReason: normalized.fee.reason,
      payloadHash
    } as Prisma.InputJsonValue;

    const billAmount = normalized.fee.resolvedFee ?? 0;
    const paymentDate = normalized.paymentDate ?? normalized.startDate ?? new Date();
    const existing = await prisma.placement.findUnique({
      where: { externalSource_externalId: { externalSource: 'loxo', externalId: normalized.externalId } }
    });

    const note = encryptString(needsReview ? `Imported from Loxo — needs review: ${normalized.fee.reason ?? 'unverified fee'}` : null);

    const placement = await prisma.placement.upsert({
      where: { externalSource_externalId: { externalSource: 'loxo', externalId: normalized.externalId } },
      update: {
        recruiterId,
        placementName: normalized.placementName,
        clientName: normalized.clientName,
        candidateName: normalized.candidateName,
        paymentDate,
        startDate: normalized.startDate,
        billAmount: String(billAmount),
        status: existing?.status === PlacementStatus.PAID ? PlacementStatus.PAID : normalized.status,
        metadata: meta
      },
      create: {
        recruiterId,
        externalSource: 'loxo',
        externalId: normalized.externalId,
        placementName: normalized.placementName,
        clientName: normalized.clientName,
        candidateName: normalized.candidateName,
        paymentDate,
        startDate: normalized.startDate,
        billAmount: String(billAmount),
        status: normalized.status,
        noteCiphertext: note.ciphertext,
        noteIv: note.iv,
        noteAuthTag: note.authTag,
        metadata: meta
      }
    });

    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: WebhookStatus.PROCESSED, processedAt: new Date() } });
    await auditLog({ action: 'LOXO_PLACEMENT_IMPORTED', entityType: 'Placement', entityId: placement.id, metadata: { externalId: normalized.externalId, recruiterId, needsReview } });
    return NextResponse.json({ ok: true, placementId: placement.id, needsReview });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: WebhookStatus.FAILED, error: message, processedAt: new Date() } });
    await auditLog({ action: 'LOXO_WEBHOOK_FAILED', entityType: 'WebhookEvent', entityId: event.id, metadata: { error: message } });
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
