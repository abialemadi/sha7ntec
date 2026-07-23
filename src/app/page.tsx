import { redirect } from 'next/navigation';
import { getSessionProfile, landingPathForRole } from '@/lib/auth';

export default async function RootPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  redirect(landingPathForRole(profile.role));
}
