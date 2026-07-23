import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { writeAudit } from '@/lib/audit';
import {
  SHIPMENT_BUCKET,
  buildStoragePath,
  validateUpload,
} from '@/lib/storage';
import type { DocType, Profile } from '@/lib/types';

// POST /api/documents  (multipart form-data: file, poId, docType)
//
// The upload and the metadata insert both run through the RLS-scoped session
// client, so Storage policies AND the documents RLS policies apply — a vendor
// can only write to their own PO's path, a forwarder only delivery_note /
// freight_invoice for POs they won.
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  const poId = form.get('poId');
  const docType = form.get('docType');

  if (!(file instanceof File) || typeof poId !== 'string' || typeof docType !== 'string') {
    return NextResponse.json({ error: 'file, poId and docType are required' }, { status: 400 });
  }

  const validationError = validateUpload({ size: file.size, type: file.type });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = profileRow as Profile | null;
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const path = buildStoragePath(profile.org_id, poId, docType as DocType, file.name);

  const { error: upErr } = await supabase.storage
    .from(SHIPMENT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 403 });

  const { data: doc, error: insErr } = await supabase
    .from('documents')
    .insert({
      org_id: profile.org_id,
      po_id: poId,
      doc_type: docType as DocType,
      file_name: file.name,
      storage_path: path,
      file_size_bytes: file.size,
      mime_type: file.type,
      uploaded_by: profile.id,
    })
    .select('*')
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 403 });

  // If a vendor has now supplied the core documents, advance the PO.
  if (profile.role === 'vendor') {
    await supabase.from('purchase_orders').update({ status: 'docs_received' }).eq('id', poId);
  }

  await writeAudit({
    orgId: profile.org_id,
    actorProfileId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: 'document.uploaded',
    entityType: 'document',
    entityId: doc.id,
    poId,
    metadata: { doc_type: docType, file_name: file.name },
  });

  return NextResponse.json({ ok: true, document: doc });
}
