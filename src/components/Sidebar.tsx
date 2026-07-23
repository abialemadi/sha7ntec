'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, UserRole } from '@/lib/types';
import { Badge } from '@/components/ui';

interface NavItem {
  href: string;
  label: string;
  roles: UserRole[];
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['admin', 'procurement', 'finance'] },
  { href: '/insights', label: 'Insights', roles: ['admin', 'procurement', 'finance'] },
  { href: '/shipments', label: 'Shipments', roles: ['admin', 'procurement', 'finance', 'warehouse'] },
  { href: '/admin/users', label: 'Users', roles: ['admin'] },
  { href: '/admin/forwarders', label: 'Forwarders', roles: ['admin', 'procurement'] },
  { href: '/admin/audit', label: 'Audit Log', roles: ['admin'] },
];

const ROLE_TONE: Record<UserRole, 'amber' | 'blue' | 'violet' | 'green' | 'red' | 'navy'> = {
  vendor: 'amber',
  procurement: 'blue',
  forwarder: 'violet',
  warehouse: 'green',
  finance: 'red',
  admin: 'navy',
};

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  const items = NAV.filter((n) => n.roles.includes(profile.role));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="border-b border-border px-5 py-4">
        <div className="text-lg font-bold tracking-tight text-navy">Sha7ntec</div>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={ROLE_TONE[profile.role]}>{profile.role}</Badge>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'block rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
                (active ? 'bg-blue/10 text-blue' : 'text-dim hover:bg-panelAlt hover:text-ink')
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="mb-2 px-2 text-xs text-faint">{profile.email}</div>
        <button
          onClick={signOut}
          className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-dim hover:bg-panelAlt hover:text-red"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
