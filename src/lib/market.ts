import 'server-only';
import { createAdminClient } from './supabase/admin';
import type { MarketSnapshotJson } from './types';

// ============================================================
// Baltic Dry Index fetch + 12h cache (spec §9).
// Server-only: uses OILPRICE_API_KEY. On failure returns the last cached
// value with stale: true — never breaks the tender flow.
// ============================================================

const INDEX_CODE = 'BALTIC_DRY_INDEX';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export async function fetchBdi(): Promise<MarketSnapshotJson> {
  const admin = createAdminClient();

  // 1. Return a fresh cached value if we have one (< 12h old).
  const { data: cached } = await admin
    .from('market_snapshots')
    .select('*')
    .eq('index_code', INDEX_CODE)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return toJson(cached);
  }

  // 2. Fetch fresh.
  const apiKey = process.env.OILPRICE_API_KEY;
  try {
    if (!apiKey) throw new Error('OILPRICE_API_KEY not set');
    const res = await fetch(
      `https://api.oilpriceapi.com/v1/prices/latest?by_code=${INDEX_CODE}`,
      { headers: { Authorization: `Token ${apiKey}` }, cache: 'no-store' },
    );
    if (!res.ok) throw new Error(`BDI fetch ${res.status}`);
    const json = await res.json();
    const value = Number(json?.data?.price ?? json?.price);
    if (!Number.isFinite(value)) throw new Error('BDI response missing price');

    const { data: inserted } = await admin
      .from('market_snapshots')
      .insert({
        index_code: INDEX_CODE,
        value,
        unit: 'points',
        source: 'oilpriceapi.com',
      })
      .select('*')
      .single();

    return toJson(inserted);
  } catch (err) {
    console.error('[market] BDI fetch failed', err);
    // 3. Fall back to last cached value (even if stale), flagged stale.
    if (cached) return { ...toJson(cached), stale: true };
    // No cache at all — return a neutral placeholder so callers never crash.
    return {
      index_code: INDEX_CODE,
      value: 0,
      unit: 'points',
      source: 'unavailable',
      fetched_at: new Date().toISOString(),
      stale: true,
    };
  }
}

function toJson(row: {
  index_code: string;
  value: number;
  unit: string | null;
  source: string | null;
  fetched_at: string;
}): MarketSnapshotJson {
  return {
    index_code: row.index_code,
    value: Number(row.value),
    unit: row.unit,
    source: row.source,
    fetched_at: row.fetched_at,
  };
}
