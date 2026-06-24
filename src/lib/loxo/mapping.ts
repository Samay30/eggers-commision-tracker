import { PlacementStatus } from '@prisma/client';
import { computeFee, type FeeResult, type FeeType } from '@/lib/loxo/fee';

/**
 * ============================================================================
 *  THE ONE FILE TO VERIFY AGAINST YOUR LIVE LOXO ACCOUNT
 * ============================================================================
 * Loxo's Open API ships empty response schemas, so the exact field names below
 * are best-effort guesses based on Loxo conventions. Run the discovery script
 * (`npx tsx scripts/loxo-inspect.ts`) once with your API key to dump a real
 * placement, then adjust the key lists in this file to match. Everything else
 * in the integration reads from this normalizer, so this is the only file you
 * should need to touch.
 *
 * `LOXO_PLACEMENTS_PATH` is the list endpoint the sync pulls. In many Loxo
 * accounts placements live under jobs; the inspect script prints what works.
 */
export const LOXO_PLACEMENTS_PATH = process.env.LOXO_PLACEMENTS_PATH?.trim() || 'placements';

function pick(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.replace(/[$,%]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickDate(...values: unknown[]): Date | null {
  const v = pick(...values);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.valueOf()) ? null : d;
}

function mapStatus(value: unknown): PlacementStatus {
  const s = String(value || '').toLowerCase();
  if (['paid', 'billed', 'invoiced', 'completed', 'approved'].some((k) => s.includes(k))) return PlacementStatus.PAID;
  if (['cancel', 'void', 'fell', 'lost'].some((k) => s.includes(k))) return PlacementStatus.CANCELED;
  return PlacementStatus.PENDING;
}

function detectFeeType(raw: any, hints: { hours: number | null; rate: number | null; pct: number | null; salary: number | null; flat: number | null }): FeeType {
  const label = pick(
    raw?.fee_type?.name,
    raw?.fee_type,
    raw?.feeType,
    raw?.commission_type?.name,
    raw?.commission_type,
    raw?.job?.fee_type?.name,
    raw?.placement_type
  )?.toLowerCase();

  if (label) {
    if (/(hour|contract|temp|hourly)/.test(label)) return 'HOURLY';
    if (/(percent|%|contingen)/.test(label)) return 'PERCENTAGE';
    if (/(flat|fixed|retain)/.test(label)) return 'FLAT';
  }
  // Infer from which numbers are present.
  if (hints.hours !== null && hints.rate !== null) return 'HOURLY';
  if (hints.pct !== null && hints.salary !== null) return 'PERCENTAGE';
  return 'FLAT';
}

export interface NormalizedPlacement {
  externalId: string | null;
  recruiterEmail: string | null;
  recruiterName: string | null;
  placementName: string;
  clientName: string | null;
  candidateName: string | null;
  paymentDate: Date | null;
  startDate: Date | null;
  status: PlacementStatus;
  fee: FeeResult;
  loxoJobId: string | null;
  loxoCandidateId: string | null;
}

export function normalizeLoxoPlacement(raw: any): NormalizedPlacement {
  const candidateName = pick(raw?.candidate?.name, raw?.person?.name, raw?.candidate_name, raw?.person_name, raw?.name);
  const clientName = pick(raw?.company?.name, raw?.client?.name, raw?.job?.company?.name, raw?.company_name, raw?.client_name);
  const placementName =
    pick(raw?.title, raw?.job?.title, raw?.placementName, raw?.name) ||
    `${candidateName || 'Candidate'} → ${clientName || 'Client'}`;

  const flat = pickNumber(raw?.fee, raw?.flat_fee, raw?.placement_fee, raw?.total_fee, raw?.fee_amount);
  const pctRaw = pickNumber(raw?.fee_percentage, raw?.fee_percent, raw?.commission_percentage, raw?.percentage);
  const salary = pickNumber(raw?.salary, raw?.compensation, raw?.candidate?.salary, raw?.job?.salary, raw?.expected_salary, raw?.placed_salary);
  const hours = pickNumber(raw?.hours, raw?.total_hours, raw?.hours_worked);
  const rate = pickNumber(raw?.bill_rate, raw?.hourly_rate, raw?.rate);

  const feeType = detectFeeType(raw, { hours, rate, pct: pctRaw, salary, flat });
  const fee = computeFee({
    feeType,
    flatFee: flat,
    feePercentage: pctRaw,
    salaryBasis: salary,
    hours,
    hourlyRate: rate
  });

  return {
    externalId: pick(raw?.id, raw?.placement_id, raw?.uuid),
    recruiterEmail: pick(
      raw?.recruiter?.email,
      raw?.owner?.email,
      raw?.owned_by?.email,
      raw?.job?.owner?.email,
      raw?.recruiter_email
    )?.toLowerCase() ?? null,
    recruiterName: pick(raw?.recruiter?.name, raw?.owner?.name, raw?.owned_by?.name, raw?.job?.owner?.name),
    placementName,
    clientName,
    candidateName,
    paymentDate: pickDate(raw?.paid_at, raw?.invoice_paid_at, raw?.paymentDate, raw?.placed_at, raw?.start_date, raw?.created_at),
    startDate: pickDate(raw?.start_date, raw?.startDate, raw?.placed_at),
    status: mapStatus(raw?.status ?? raw?.state ?? raw?.workflow_stage?.name),
    fee,
    loxoJobId: pick(raw?.job_id, raw?.job?.id),
    loxoCandidateId: pick(raw?.candidate?.id, raw?.person?.id, raw?.person_id)
  };
}
