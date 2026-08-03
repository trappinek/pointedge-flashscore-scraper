import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/dodaj-typ", label: "Typy i mecze" },
  { href: "/admin/darmowa-analiza", label: "Darmowa analiza" },
  { href: "/admin/generator-rolek", label: "Generator rolek" },
  { href: "/admin/uzytkownicy", label: "Użytkownicy" },
  { href: "/admin/transakcje", label: "Transakcje" },
  { href: "/admin/wsparcie", label: "Wsparcie" },
  { href: "/admin/prace-techniczne", label: "Prace techniczne" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    redirect("/");
  }

  return (
    <div>
      <nav className="mx-auto flex max-w-3xl flex-wrap gap-2 px-4 pt-6">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-surface-raised hover:text-text-primary"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
