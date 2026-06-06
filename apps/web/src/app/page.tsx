import { redirect } from 'next/navigation';

// Root redirects to staff login — the primary entry point
export default function RootPage() {
  redirect('/login');
}
