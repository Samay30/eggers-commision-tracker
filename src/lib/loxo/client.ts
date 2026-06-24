/**
 * Thin Loxo Open API client.
 *
 * Base URL pattern (confirmed from Loxo's OpenAPI): https://{domain}/api/{agency_slug}/...
 * Auth: Bearer token. Pagination: page / per_page, plus a scroll_id cursor returned
 * in each response for deep pagination.
 *
 * Configure via environment variables (never hardcode the key):
 *   LOXO_API_KEY      — bearer token from Loxo Settings > API Keys
 *   LOXO_AGENCY_SLUG  — e.g. eggers-executive-search
 *   LOXO_DOMAIN       — defaults to app.loxo.co
 */

export interface LoxoConfig {
  apiKey: string;
  slug: string;
  domain: string;
}

export class LoxoConfigError extends Error {}

export function loxoConfig(): LoxoConfig {
  const apiKey = process.env.LOXO_API_KEY?.trim();
  const slug = process.env.LOXO_AGENCY_SLUG?.trim();
  const domain = (process.env.LOXO_DOMAIN || 'app.loxo.co').trim();
  if (!apiKey) throw new LoxoConfigError('LOXO_API_KEY is not set.');
  if (!slug) throw new LoxoConfigError('LOXO_AGENCY_SLUG is not set.');
  return { apiKey, slug, domain };
}

export function loxoConfigured() {
  return Boolean(process.env.LOXO_API_KEY && process.env.LOXO_AGENCY_SLUG);
}

function buildUrl(config: LoxoConfig, path: string, params: Record<string, string | number | undefined>) {
  const clean = path.replace(/^\/+/, '');
  const url = new URL(`https://${config.domain}/api/${config.slug}/${clean}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export interface LoxoResponse {
  raw: any;
  items: any[];
  scrollId: string | null;
}

/** Pull a list-style endpoint and normalize the envelope (Loxo varies the key). */
export async function loxoGet(
  path: string,
  params: Record<string, string | number | undefined> = {},
  config = loxoConfig()
): Promise<LoxoResponse> {
  const url = buildUrl(config, path, params);
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json', authorization: `Bearer ${config.apiKey}` },
    cache: 'no-store'
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Loxo ${res.status} on ${path}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }

  const raw = await res.json();
  // Loxo list endpoints return results under one of these keys; objects come back bare.
  const items: any[] = Array.isArray(raw)
    ? raw
    : raw?.results ?? raw?.people ?? raw?.jobs ?? raw?.placements ?? raw?.candidates ?? raw?.items ?? [];
  const scrollId: string | null = raw?.scroll_id ?? raw?.scrollId ?? null;
  return { raw, items, scrollId };
}

/**
 * Walk every page of a list endpoint. Uses scroll_id when present, else page numbers.
 * Caps iterations to avoid runaway loops against a misbehaving endpoint.
 */
export async function loxoGetAll(
  path: string,
  params: Record<string, string | number | undefined> = {},
  config = loxoConfig(),
  maxPages = 100
): Promise<any[]> {
  const perPage = Number(params.per_page ?? 50);
  const all: any[] = [];
  let page = 1;
  let scrollId: string | null = null;

  for (let i = 0; i < maxPages; i += 1) {
    const pageParams: Record<string, string | number | undefined> = { per_page: perPage, ...params };
    if (scrollId) pageParams.scroll_id = scrollId;
    else pageParams.page = page;

    const { items, scrollId: nextScroll } = await loxoGet(path, pageParams, config);
    all.push(...items);

    if (items.length < perPage) break; // last page
    if (nextScroll && nextScroll !== scrollId) scrollId = nextScroll;
    else if (!nextScroll) page += 1;
    else break; // scroll_id stopped advancing
  }

  return all;
}
