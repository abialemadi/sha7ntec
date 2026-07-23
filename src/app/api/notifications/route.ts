import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications';
import type { Profile } from '@/lib/types';

// POST /api/notifications — mocked email (spec §9). Inserts a notifications
// row, leaves sent_at null. Phase 2 swaps in Resend.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    poId?: string;
    recipientProfileId?: string;
    recipientEmail?: string;
    channel?: 'in_app' | 'email' | 'whatsapp';
  };
  if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = profileRow as Profile | null;
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await notify({
    orgId: profile.org_id,
    title: body.title,
    body: body.body,
    poId: body.poId ?? null,
    recipientProfileId: body.recipientProfileId ?? null,
    recipientEmail: body.recipientEmail ?? null,
    channel: body.channel ?? 'in_app',
  });

  return NextResponse.json({ ok: true, simulated: true });
}
