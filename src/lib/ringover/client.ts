/**
 * Thin Ringover Public API client.
 *
 * Base URL (confirmed from Ringover docs): https://public-api.ringover.com/v2
 * Auth: the API key is sent RAW in the `Authorization` header (NOT `Bearer`).
 * The /calls endpoint is paginated with limit_offset / limit_count and accepts
 * an ISO start/end date window.
 *
 * Configure via environment variables (never hardcode the key):
 *   RINGOVER_API_KEY   — from your Ringover dashboard > Developer > API keys
 *   RINGOVER_BASE_URL  — defaults to https://public-api.ringover.com/v2
 */

export interface RingoverConfig {
  apiKey: string;
  baseUrl: string;
}

export class RingoverConfigError extends Error {}

export function ringoverConfig(): RingoverConfig {
  const apiKey = process.env.RINGOVER_API_KEY?.trim();
  const baseUrl = (process.env.RINGOVER_BASE_URL || 'https://public-api.ringover.com/v2').trim().replace(/\/$/, '');
  if (!apiKey) throw new RingoverConfigError('RINGOVER_API_KEY is not set.');
  return { apiKey, baseUrl };
}

export function ringoverConfigured() {
  return Boolean(process.env.RINGOVER_API_KEY);
}

/**
 * Fetch every call in a date window. Ringover caps page size (1000) and returns
 * { total_call_count, call_list }. We page on limit_offset until we have them all.
 * maxPages guards against a runaway loop.
 */
export async function ringoverGetCalls(
  startDate: Date,
  endDate: Date,
  config = ringoverConfig(),
  maxPages = 200
): Promise<any[]> {
  const pageSize = 1000;
  const all: any[] = [];
  let offset = 0;

  for (let i = 0; i < maxPages; i += 1) {
    const url = new URL(`${config.baseUrl}/calls`);
    url.searchParams.set('start_date', startDate.toISOString());
    url.searchParams.set('end_date', endDate.toISOString());
    url.searchParams.set('limit_count', String(pageSize));
    url.searchParams.set('limit_offset', String(offset));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json', authorization: config.apiKey },
      cache: 'no-store'
    });

    // Ringover returns 204 when a window has no calls.
    if (res.status === 204) break;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ringover ${res.status} on /calls${body ? `: ${body.slice(0, 300)}` : ''}`);
    }

    const raw = await res.json();
    const list: any[] = Array.isArray(raw) ? raw : raw?.call_list ?? raw?.calls ?? [];
    all.push(...list);

    const total = Number(raw?.total_call_count ?? raw?.total ?? list.length);
    offset += list.length;
    if (list.length < pageSize || offset >= total || list.length === 0) break;
  }

  return all;
}
