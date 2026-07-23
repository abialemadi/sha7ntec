'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, UserRole } from '@/lib/types';
import { RoleTag } from '@/components/ui';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: UserRole[];
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Analytics Dashboard', icon: '📊', roles: ['admin', 'procurement', 'finance'] },
  { href: '/insights', label: 'Insights & Intelligence', icon: '🧠', roles: ['admin', 'procurement', 'finance'] },
  { href: '/shipments', label: 'Shipments', icon: '📋', roles: ['admin', 'procurement', 'finance', 'warehouse'] },
  { href: '/admin/users', label: 'Users', icon: '👤', roles: ['admin'] },
  { href: '/admin/forwarders', label: 'Forwarders', icon: '🚚', roles: ['admin', 'procurement'] },
  { href: '/admin/audit', label: 'Audit Log', icon: '🛡️', roles: ['admin'] },
];

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
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-panel">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="h-2.5 w-2.5 rounded-[3px] bg-brand-gradient" />
          <div className="font-mono text-[15px] font-bold tracking-wide text-navy">SHA7NTEC</div>
        </div>
        <div className="mt-1.5 text-[10px] font-semibold tracking-wide text-faint">
          FINANCIAL CONTROL MIDDLEWARE
        </div>
      </div>

      <div className="px-5 pb-2 pt-4 text-[10px] font-bold tracking-widest text-faint">NAVIGATION</div>
      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors ' +
                (active
                  ? 'border border-blue/30 bg-blue/10 font-bold text-navy'
                  : 'border border-transparent text-dim hover:bg-panelAlt hover:text-ink')
              }
            >
              <span className="text-[15px]">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="mb-2 flex items-center gap-2">
          <RoleTag role={profile.role} />
        </div>
        <div className="mb-2 truncate px-1 text-xs text-faint">{profile.email}</div>
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
