import Link from "next/link";
import { logout } from "@/app/actions/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-8">
            <span className="font-serif text-lg font-semibold text-foreground">
              Calendar Remind
            </span>
            <nav className="flex gap-6 text-sm font-medium text-muted">
              <Link href="/events" className="transition-colors hover:text-accent">
                Events
              </Link>
              <Link href="/settings" className="transition-colors hover:text-accent">
                Settings
              </Link>
            </nav>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
