import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { PortalHeader } from '@/components/PortalHeader';

// External users (vendor / forwarder) live here. Internal roles are sent to
// the dashboard.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (!['vendor', 'forwarder'].includes(profile.role)) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-bg">
      <PortalHeader profile={profile} />
      <main className="mx-auto max-w-4xl px-6 py-6">{children}</main>
    </div>
  );
}
