// Shared storage constants + helpers. The bucket is private; downloads use
// short-lived signed URLs (spec §6).

import type { DocType } from './types';

export const SHIPMENT_BUCKET = 'shipment-docs';
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const SIGNED_URL_TTL_SECONDS = 60;

export function validateUpload(file: { size: number; type: string }): string | null {
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return 'Only PDF, JPG and PNG files are allowed.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'File exceeds the 10 MB limit.';
  }
  return null;
}

// {org_id}/{po_id}/{doc_type}/{timestamp}-{filename}
export function buildStoragePath(
  orgId: string,
  poId: string,
  docType: DocType,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${orgId}/${poId}/${docType}/${Date.now()}-${safeName}`;
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  certificate_of_origin: 'Certificate of Origin',
  test_certificate: 'Test Certificate',
  delivery_note: 'Delivery Note',
  freight_invoice: 'Freight Invoice',
  other: 'Other',
};
