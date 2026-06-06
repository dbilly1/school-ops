// Public routes (login, register) — no auth provider needed
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
