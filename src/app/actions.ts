'use server';

import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminLike } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encryptString } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';
import { adjustmentSchema, createRecruiterSchema, placementSchema, planSchema } from '@/lib/validators';

function optionalDate(value?: string) {
  return value && value.trim() ? new Date(value) : null;
}

function optionalMoney(value?: string) {
  return value && value.trim() ? value.trim() : null;
}

export async function createRecruiterAction(formData: FormData) {
  const actor = await requireAdminLike();
  const parsed = createRecruiterSchema.parse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role') || 'RECRUITER'
  });

  const passwordHash = await bcrypt.hash(parsed.password, 12);

  const user = await prisma.user.create({
    data: {
      email: parsed.email,
      name: parsed.name,
      role: parsed.role as Role,
      passwordHash,
      recruiterProfile:
        parsed.role === 'RECRUITER'
          ? { create: { displayName: parsed.name, active: true } }
          : undefined
    },
    include: { recruiterProfile: true }
  });

  await auditLog({ actorUserId: actor.id, action: 'CREATE_USER', entityType: 'User', entityId: user.id, metadata: { role: parsed.role } });
  revalidatePath('/recruiters');
  redirect(user.recruiterProfile ? `/recruiters/${user.recruiterProfile.id}` : '/recruiters');
}

export async function upsertPlanAction(formData: FormData) {
  const actor = await requireAdminLike();
  const parsed = planSchema.parse({
    recruiterId: formData.get('recruiterId'),
    year: formData.get('year'),
    annualGoal: formData.get('annualGoal'),
    commissionRate: formData.get('commissionRate'),
    salaryPerPayPeriod: formData.get('salaryPerPayPeriod'),
    payFrequency: formData.get('payFrequency'),
    monthlyPayoutRate: formData.get('monthlyPayoutRate'),
    quarterlyTrueUp: formData.get('quarterlyTrueUp'),
    openingBalance: formData.get('openingBalance') || '0'
  });

  await prisma.commissionPlan.upsert({
    where: { recruiterId_year: { recruiterId: parsed.recruiterId, year: parsed.year } },
    update: {
      annualGoal: parsed.annualGoal,
      commissionRate: parsed.commissionRate,
      salaryPerPayPeriod: parsed.salaryPerPayPeriod,
      payFrequency: parsed.payFrequency,
      monthlyPayoutRate: parsed.monthlyPayoutRate,
      quarterlyTrueUp: parsed.quarterlyTrueUp,
      openingBalance: parsed.openingBalance
    },
    create: {
      recruiterId: parsed.recruiterId,
      year: parsed.year,
      annualGoal: parsed.annualGoal,
      commissionRate: parsed.commissionRate,
      salaryPerPayPeriod: parsed.salaryPerPayPeriod,
      payFrequency: parsed.payFrequency,
      monthlyPayoutRate: parsed.monthlyPayoutRate,
      quarterlyTrueUp: parsed.quarterlyTrueUp,
      openingBalance: parsed.openingBalance
    }
  });

  await auditLog({ actorUserId: actor.id, action: 'UPSERT_PLAN', entityType: 'CommissionPlan', entityId: parsed.recruiterId, metadata: { year: parsed.year } });
  revalidatePath(`/recruiters/${parsed.recruiterId}`);
}

export async function createPlacementAction(formData: FormData) {
  const actor = await requireAdminLike();
  const parsed = placementSchema.parse({
    recruiterId: formData.get('recruiterId'),
    placementName: formData.get('placementName'),
    clientName: formData.get('clientName') || undefined,
    candidateName: formData.get('candidateName') || undefined,
    paymentDate: formData.get('paymentDate'),
    startDate: formData.get('startDate') || undefined,
    payDate: formData.get('payDate') || undefined,
    billAmount: formData.get('billAmount'),
    payoutOverride: formData.get('payoutOverride') || undefined,
    status: formData.get('status'),
    note: formData.get('note') || undefined
  });

  const encryptedNote = encryptString(parsed.note);

  await prisma.placement.create({
    data: {
      recruiterId: parsed.recruiterId,
      placementName: parsed.placementName,
      clientName: parsed.clientName || null,
      candidateName: parsed.candidateName || null,
      paymentDate: new Date(parsed.paymentDate),
      startDate: optionalDate(parsed.startDate),
      payDate: optionalDate(parsed.payDate),
      billAmount: parsed.billAmount,
      payoutOverride: optionalMoney(parsed.payoutOverride),
      status: parsed.status,
      noteCiphertext: encryptedNote.ciphertext,
      noteIv: encryptedNote.iv,
      noteAuthTag: encryptedNote.authTag,
      createdById: actor.id
    }
  });

  await auditLog({ actorUserId: actor.id, action: 'CREATE_PLACEMENT', entityType: 'Placement', entityId: parsed.recruiterId, metadata: { status: parsed.status } });
  revalidatePath(`/recruiters/${parsed.recruiterId}`);
  revalidatePath('/placements');
}

export async function createAdjustmentAction(formData: FormData) {
  const actor = await requireAdminLike();
  const parsed = adjustmentSchema.parse({
    recruiterId: formData.get('recruiterId'),
    effectiveDate: formData.get('effectiveDate'),
    amount: formData.get('amount'),
    kind: formData.get('kind'),
    reason: formData.get('reason') || undefined
  });

  const encryptedReason = encryptString(parsed.reason);

  await prisma.adjustment.create({
    data: {
      recruiterId: parsed.recruiterId,
      effectiveDate: new Date(parsed.effectiveDate),
      amount: parsed.amount,
      kind: parsed.kind,
      reasonCiphertext: encryptedReason.ciphertext,
      reasonIv: encryptedReason.iv,
      reasonAuthTag: encryptedReason.authTag,
      createdById: actor.id
    }
  });

  await auditLog({ actorUserId: actor.id, action: 'CREATE_ADJUSTMENT', entityType: 'Adjustment', entityId: parsed.recruiterId, metadata: { kind: parsed.kind } });
  revalidatePath(`/recruiters/${parsed.recruiterId}`);
}
