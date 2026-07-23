-- ============================================================
-- Sha7ntec — Supabase Storage bucket + policies for shipment documents.
--
-- Bucket is PRIVATE. Files are served only via signed URLs (60s) from
-- server routes. Path convention:
--   {org_id}/{po_id}/{doc_type}/{timestamp}-{filename}
--
-- Constraints (PDF/JPG/PNG, <=10MB) are enforced in application code
-- (src/lib/storage.ts) and again server-side on upload.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shipment-docs',
  'shipment-docs',
  false,
  10485760, -- 10 MB
  array['application/pdf','image/jpeg','image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Helper: the org_id segment is the first path element.
-- storage.foldername(name) returns the path split into an array.

-- INSERT: vendor uploads only into paths for a PO they own.
create policy storage_vendor_insert on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shipment-docs'
  and auth_role() = 'vendor'
  and (storage.foldername(name))[1] = auth_org()::text
  and exists (
    select 1 from purchase_orders p
    where p.id = ((storage.foldername(name))[2])::uuid
      and p.vendor_id = auth_vendor()
  )
);

-- INSERT: forwarder uploads delivery_note / freight_invoice for POs they won.
create policy storage_forwarder_insert on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shipment-docs'
  and auth_role() = 'forwarder'
  and (storage.foldername(name))[1] = auth_org()::text
  and (storage.foldername(name))[3] in ('delivery_note','freight_invoice')
  and exists (
    select 1 from purchase_orders p
    join tenders t on t.po_id = p.id
    join awards a on a.tender_id = t.id
    where p.id = ((storage.foldername(name))[2])::uuid
      and a.forwarder_id = auth_forwarder()
  )
);

-- INSERT: internal staff.
create policy storage_internal_insert on storage.objects for insert
to authenticated
with check (
  bucket_id = 'shipment-docs'
  and auth_role() in ('procurement','warehouse','admin')
  and (storage.foldername(name))[1] = auth_org()::text
);

-- SELECT: internal staff see everything in their org.
create policy storage_internal_read on storage.objects for select
to authenticated
using (
  bucket_id = 'shipment-docs'
  and auth_role() in ('procurement','finance','warehouse','admin')
  and (storage.foldername(name))[1] = auth_org()::text
);

-- SELECT: vendor reads their own PO's docs.
create policy storage_vendor_read on storage.objects for select
to authenticated
using (
  bucket_id = 'shipment-docs'
  and auth_role() = 'vendor'
  and (storage.foldername(name))[1] = auth_org()::text
  and exists (
    select 1 from purchase_orders p
    where p.id = ((storage.foldername(name))[2])::uuid
      and p.vendor_id = auth_vendor()
  )
);

-- SELECT: forwarder reads docs for POs they won.
create policy storage_forwarder_read on storage.objects for select
to authenticated
using (
  bucket_id = 'shipment-docs'
  and auth_role() = 'forwarder'
  and (storage.foldername(name))[1] = auth_org()::text
  and exists (
    select 1 from purchase_orders p
    join tenders t on t.po_id = p.id
    join awards a on a.tender_id = t.id
    where p.id = ((storage.foldername(name))[2])::uuid
      and a.forwarder_id = auth_forwarder()
  )
);

-- No DELETE policy on storage.objects for this bucket = nobody can delete.
