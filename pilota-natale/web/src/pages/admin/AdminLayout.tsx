import type { ReactNode } from "react";
import { Link } from "react-router";
import { LogoutButton, RequireRole } from "../../components/Auth";
import { useSession } from "../../lib/session";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole role="admin" title="Accesso admin" subtitle="Area admin · Pilota Natale">
      <AdminChrome>{children}</AdminChrome>
    </RequireRole>
  );
}

function AdminChrome({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/admin" className="flex items-center gap-2 font-bold text-brand">
            <img src="/icon.svg" alt="" className="h-8 w-8" /> Fiscal · Admin
          </Link>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <span className="hidden sm:inline">{user?.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
