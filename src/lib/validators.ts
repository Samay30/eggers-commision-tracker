import { z } from 'zod';

const moneyString = z.string().trim().min(1).refine((value) => Number.isFinite(Number(value)), 'Must be a number');
const rateString = z.string().trim().min(1).refine((value) => Number(value) >= 0 && Number(value) <= 1, 'Use decimal rate, e.g. 0.10 for 10%');
const dateString = z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date');
const optionalUpdatedAt = z.string().trim().optional();

export const createRecruiterSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(12),
  role: z.enum(['ADMIN', 'OWNER', 'RECRUITER']).default('RECRUITER')
});

export const planSchema = z.object({
  recruiterId: z.string().min(1),
  year: z.coerce.number().int().min(2020).max(2100),
  annualGoal: moneyString,
  commissionRate: rateString,
  salaryPerPayPeriod: moneyString,
  payFrequency: z.enum(['SEMI_MONTHLY', 'BI_WEEKLY', 'MONTHLY']),
  monthlyPayoutRate: rateString,
  quarterlyTrueUp: z.preprocess((value) => value === 'on' || value === true, z.boolean()),
  openingBalance: z.string().optional().default('0')
});

// Editing an existing plan. Year is immutable (delete + recreate to change it),
// which avoids colliding with the unique (recruiterId, year) constraint.
export const updatePlanSchema = z.object({
  planId: z.string().min(1),
  expectedUpdatedAt: optionalUpdatedAt,
  annualGoal: moneyString,
  commissionRate: rateString,
  salaryPerPayPeriod: moneyString,
  payFrequency: z.enum(['SEMI_MONTHLY', 'BI_WEEKLY', 'MONTHLY']),
  monthlyPayoutRate: rateString,
  quarterlyTrueUp: z.preprocess((value) => value === 'on' || value === true, z.boolean()),
  openingBalance: z.string().optional().default('0')
});

export const placementSchema = z.object({
  recruiterId: z.string().min(1),
  placementName: z.string().trim().min(2),
  clientName: z.string().trim().optional(),
  candidateName: z.string().trim().optional(),
  paymentDate: dateString,
  startDate: z.string().optional(),
  payDate: z.string().optional(),
  billAmount: moneyString,
  payoutOverride: z.string().optional(),
  status: z.enum(['PENDING', 'PAID', 'CANCELED']),
  note: z.string().optional()
});

export const updatePlacementSchema = z.object({
  placementId: z.string().min(1),
  expectedUpdatedAt: optionalUpdatedAt,
  placementName: z.string().trim().min(2),
  clientName: z.string().trim().optional(),
  candidateName: z.string().trim().optional(),
  paymentDate: dateString,
  startDate: z.string().optional(),
  payDate: z.string().optional(),
  billAmount: moneyString,
  payoutOverride: z.string().optional(),
  status: z.enum(['PENDING', 'PAID', 'CANCELED']),
  note: z.string().optional()
});

export const adjustmentSchema = z.object({
  recruiterId: z.string().min(1),
  effectiveDate: dateString,
  amount: moneyString,
  kind: z.enum(['COMMISSION', 'DRAW', 'PAYOUT', 'MANUAL']),
  reason: z.string().optional()
});

export const updateAdjustmentSchema = z.object({
  adjustmentId: z.string().min(1),
  expectedUpdatedAt: optionalUpdatedAt,
  effectiveDate: dateString,
  amount: moneyString,
  kind: z.enum(['COMMISSION', 'DRAW', 'PAYOUT', 'MANUAL']),
  reason: z.string().optional()
});

export const idSchema = z.object({ id: z.string().min(1) });

export const recruiterStatusSchema = z.object({
  recruiterId: z.string().min(1),
  active: z.preprocess((value) => value === 'true' || value === true || value === 'on', z.boolean())
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12),
    confirmPassword: z.string().min(1)
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match.',
    path: ['confirmPassword']
  });

export const adminResetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(12)
});
