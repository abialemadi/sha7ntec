'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui';
import type { Profile } from '@/lib/types';

export function PortalHeader({ profile }: { profile: Profile }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-panel">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-brand-gradient" />
            <span className="font-mono text-base font-bold tracking-wide text-navy">SHA7NTEC</span>
          </span>
          <Badge tone={profile.role === 'vendor' ? 'amber' : 'violet'}>{profile.role} portal</Badge>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-dim">{profile.email}</span>
          <button onClick={signOut} className="font-medium text-dim hover:text-red">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
