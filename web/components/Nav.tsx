"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/market", label: "Market" },
  { href: "/underwrite", label: "Underwrite a home" },
  { href: "/book", label: "Build a book" },
  { href: "/model", label: "Model" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 9.5c1.6 1.4 2.2 2.6 1.4 3.9-.5.8-1.4 1.1-1.4 1.1s-.9-.3-1.4-1.1c-.8-1.3-.2-2.5 1.4-3.9z" fill="var(--ember)" />
          </svg>
          <span className="font-semibold tracking-tight">ReEntry</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const on = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md whitespace-nowrap ${on ? "bg-ember-soft text-ember font-medium" : "text-muted hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
