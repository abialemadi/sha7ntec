import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBdi } from '@/lib/market';

// GET /api/market/bdi — cached Baltic Dry Index (spec §9).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const snapshot = await fetchBdi();
  return NextResponse.json(snapshot);
}
