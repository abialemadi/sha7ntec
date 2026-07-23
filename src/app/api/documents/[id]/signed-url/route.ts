import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SHIPMENT_BUCKET, SIGNED_URL_TTL_SECONDS } from '@/lib/storage';
import type { DocumentRow } from '@/lib/types';

// GET /api/documents/[id]/signed-url
// Returns a 60-second signed URL for a document the caller is allowed to read.
// The documents SELECT is RLS-scoped, so only visible docs resolve; the signed
// URL is minted with the same session so Storage read policies also apply.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: docRow } = await supabase.from('documents').select('*').eq('id', id).single();
  const doc = docRow as DocumentRow | null;
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase.storage
    .from(SHIPMENT_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
}
