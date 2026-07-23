import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

// Internal dashboard shell. External roles (vendor/forwarder) belong in
// /portal and are redirected out of here.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (profile.role === 'vendor') redirect('/portal/vendor');
  if (profile.role === 'forwarder') redirect('/portal/forwarder');

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-x-hidden bg-bg">
        <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
