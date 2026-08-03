import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth-helpers";
import { SupportForm } from "@/components/support/support-form";

export const metadata: Metadata = {
  title: "Kontakt — PointEdge",
  description: "Skontaktuj się z zespołem PointEdge.",
};

export const dynamic = "force-dynamic";

export default async function KontaktPage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-2xl font-medium sm:text-3xl">Kontakt</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
        Masz pytanie dotyczące serwisu, subskrypcji albo współpracy? Wyślij wiadomość przez
        formularz. Odpowiemy najszybciej jak to możliwe.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-bg-surface p-5 sm:p-6">
        <SupportForm defaultEmail={user?.email ?? ""} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href="https://www.tiktok.com/@pointedge.pl"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-border-strong px-4 py-2 text-sm text-text-secondary hover:border-accent/40 hover:text-accent"
        >
          TikTok: @pointedge.pl
        </a>
        <a
          href="https://www.instagram.com/pointedgepl"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-border-strong px-4 py-2 text-sm text-text-secondary hover:border-accent/40 hover:text-accent"
        >
          Instagram: @pointedgepl
        </a>
      </div>
    </div>
  );
}
