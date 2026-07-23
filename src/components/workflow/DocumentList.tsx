'use client';

import { useState } from 'react';
import type { DocumentRow } from '@/lib/types';
import { DOC_TYPE_LABELS } from '@/lib/storage';
import { formatDateTime } from '@/lib/format';

// Lists documents with a signed-URL download button (60s expiry, minted on
// demand by /api/documents/[id]/signed-url).
export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  if (documents.length === 0) {
    return <p className="text-sm text-dim">No documents uploaded yet.</p>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {documents.map((doc) => (
        <DocumentRowItem key={doc.id} doc={doc} />
      ))}
    </ul>
  );
}

function DocumentRowItem({ doc }: { doc: DocumentRow }) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/signed-url`);
      const json = await res.json();
      if (json.url) window.open(json.url, '_blank', 'noopener');
      else alert(json.error ?? 'Could not open document');
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink">{doc.file_name}</div>
        <div className="text-xs text-dim">
          {DOC_TYPE_LABELS[doc.doc_type]} · {formatDateTime(doc.uploaded_at)}
        </div>
      </div>
      <button
        onClick={open}
        disabled={loading}
        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-blue hover:bg-blue/10 disabled:opacity-50"
      >
        {loading ? '…' : 'View'}
      </button>
    </li>
  );
}
