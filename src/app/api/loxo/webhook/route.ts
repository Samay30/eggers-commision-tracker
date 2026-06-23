import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { PlacementStatus, WebhookStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encryptString } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.LOXO_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function textValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function moneyValue(...values: unknown[]) {
  const value = textValue(...values);
  if (!value) return null;
  const cleaned = value.replace(/[$,]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(...values: unknown[]) {
  const value = textValue(...values);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function statusValue(value: unknown): PlacementStatus {
  const normalized = String(value || '').toLowerCase();
  if (['paid', 'billed', 'completed', 'approved'].includes(normalized)) return PlacementStatus.PAID;
  if (['canceled', 'cancelled', 'void'].includes(normalized)) return PlacementStatus.CANCELED;
  return PlacementStatus.PENDING;
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

  const externalId = textValue(payload.id, payload.placement_id, payload.event_id, payload.data?.id);
  if (!externalId) {
    return NextResponse.json({ ok: false, error: 'Missing external id' }, { status: 422 });
  }

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { source_externalId: { source: 'loxo', externalId } }
  });
  if (existingEvent) {
    await prisma.webhookEvent.update({ where: { id: existingEvent.id }, data: { status: WebhookStatus.DUPLICATE } });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const event = await prisma.webhookEvent.create({
    data: { source: 'loxo', externalId, payloadHash, status: WebhookStatus.RECEIVED }
  });

  try {
    const recruiterEmail = textValue(payload.recruiter?.email, payload.owner?.email, payload.data?.recruiter?.email, payload.recruiter_email);
    let recruiter = recruiterEmail
      ? await prisma.recruiter.findFirst({ where: { user: { email: recruiterEmail.toLowerCase() } } })
      : null;

    if (!recruiter && process.env.DEFAULT_LOXO_RECRUITER_ID) {
      recruiter = await prisma.recruiter.findUnique({ where: { id: process.env.DEFAULT_LOXO_RECRUITER_ID } });
    }

    if (!recruiter) {
      throw new Error('No recruiter mapping found. Include recruiter.email in payload or set DEFAULT_LOXO_RECRUITER_ID.');
    }

    const clientName = textValue(payload.client?.name, payload.company?.name, payload.data?.client?.name, payload.client_name);
    const candidateName = textValue(payload.candidate?.name, payload.person?.name, payload.data?.candidate?.name, payload.candidate_name);
    const placementName = textValue(payload.placementName, payload.name, payload.title, `${candidateName || 'Candidate'} → ${clientName || 'Client'}`) || 'Loxo placement';
    const paymentDate = dateValue(payload.paymentDate, payload.paid_at, payload.invoice_paid_at, payload.data?.paymentDate) ?? new Date();
    const startDate = dateValue(payload.startDate, payload.start_date, payload.data?.startDate);
    const payDate = dateValue(payload.payDate, payload.pay_date, payload.data?.payDate);
    const billAmount = moneyValue(payload.billAmount, payload.fee, payload.invoice_amount, payload.data?.billAmount);

    if (billAmount === null) {
      throw new Error('Missing or invalid bill amount.');
    }

    const note = textValue(payload.note, payload.notes, payload.data?.note);
    const encryptedNote = encryptString(note);

    const placement = await prisma.placement.upsert({
      where: { externalSource_externalId: { externalSource: 'loxo', externalId } },
      update: {
        recruiterId: recruiter.id,
        placementName,
        clientName,
        candidateName,
        paymentDate,
        startDate,
        payDate,
        billAmount: String(billAmount),
        status: statusValue(payload.status ?? payload.data?.status)
      },
      create: {
        recruiterId: recruiter.id,
        externalSource: 'loxo',
        externalId,
        placementName,
        clientName,
        candidateName,
        paymentDate,
        startDate,
        payDate,
        billAmount: String(billAmount),
        status: statusValue(payload.status ?? payload.data?.status),
        noteCiphertext: encryptedNote.ciphertext,
        noteIv: encryptedNote.iv,
        noteAuthTag: encryptedNote.authTag,
        metadata: { source: 'loxo', payloadHash }
      }
    });

    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: WebhookStatus.PROCESSED, processedAt: new Date() } });
    await auditLog({ action: 'LOXO_PLACEMENT_IMPORTED', entityType: 'Placement', entityId: placement.id, metadata: { externalId, recruiterId: recruiter.id } });
    return NextResponse.json({ ok: true, placementId: placement.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: WebhookStatus.FAILED, error: message, processedAt: new Date() } });
    await auditLog({ action: 'LOXO_WEBHOOK_FAILED', entityType: 'WebhookEvent', entityId: event.id, metadata: { error: message } });
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
