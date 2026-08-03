import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clapperboard,
  LifeBuoy,
  Megaphone,
  PlusCircle,
  Settings2,
  UserRoundCog,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getWinRateLast30Days } from "@/lib/data/tips";
import { getMonthlyRevenue } from "@/lib/stripe";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { PreviewToggle } from "./preview-toggle";

export const dynamic = "force-dynamic";

function formatPln(amount: number | null): string {
  if (amount === null) return "brak danych";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(amount);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

const QUICK_ACTIONS = [
  { href: "/admin/dodaj-typ", label: "Dodaj typ", description: "Wybierz mecz ze scrapera", icon: PlusCircle },
  { href: "/admin/generator-rolek", label: "Generator rolek", description: "Lektor, napisy i pionowy MP4", icon: Clapperboard },
  { href: "/admin/uzytkownicy", label: "Użytkownicy", description: "Konta i dostęp Pro", icon: UserRoundCog },
  { href: "/admin/wsparcie", label: "Wsparcie", description: "Odpowiedz na zgłoszenia", icon: LifeBuoy },
  { href: "/admin/prace-techniczne", label: "Komunikacja", description: "Ogłoszenia i prace techniczne", icon: Megaphone },
];

export default async function AdminDashboardPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [
    activeProCount,
    cancellingProCount,
    totalUsers,
    newUsers,
    unverifiedUsers,
    revenue,
    winRate,
    openTickets,
    activeTips,
    latestCache,
    recentUsers,
    recentTips,
  ] = await Promise.all([
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.subscription.count({ where: { status: "active", cancelAtPeriodEnd: true } }),
    prisma.user.count({ where: { role: "user" } }),
    prisma.user.count({ where: { role: "user", createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { role: "user", emailVerified: null } }),
    getMonthlyRevenue(),
    getWinRateLast30Days(),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.tip.count({ where: { status: "upcoming", match: { matchDate: { gt: now } } } }),
    prisma.cachedMatchDay.findFirst({ orderBy: { fetchedAt: "desc" } }),
    prisma.user.findMany({
      where: { role: "user" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, email: true, createdAt: true, emailVerified: true, subscription: { select: { status: true } } },
    }),
    prisma.tip.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        createdAt: true,
        match: { select: { playerA: true, playerB: true, tournament: true } },
      },
    }),
  ]);

  const conversion = totalUsers ? Math.round((activeProCount / totalUsers) * 1000) / 10 : 0;
  const cacheAgeMinutes = latestCache
    ? Math.max(0, Math.round((now.getTime() - latestCache.fetchedAt.getTime()) / 60_000))
    : null;
  const cacheHealthy = cacheAgeMinutes !== null && cacheAgeMinutes <= 180;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium">Centrum administracyjne</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Najważniejsze liczby, stan systemu i szybkie działania.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            cacheHealthy
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          Cache meczów: {cacheAgeMinutes === null ? "brak danych" : `${cacheAgeMinutes} min temu`}
        </span>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Aktywni Pro" value={<AnimatedCounter value={activeProCount} />} detail={`${conversion}% użytkowników`} />
        <Metric label="Przychód w miesiącu" value={formatPln(revenue)} detail="Dane Stripe" />
        <Metric
          label="Skuteczność 30 dni"
          value={winRate.winRatePercent !== null ? `${winRate.winRatePercent}%` : "—"}
          detail={`${winRate.won}W / ${winRate.lost}L`}
        />
        <Metric label="Aktywne typy" value={<AnimatedCounter value={activeTips} />} detail="Przed rozpoczęciem meczu" />
        <Metric label="Użytkownicy" value={<AnimatedCounter value={totalUsers} />} detail={`+${newUsers} przez 7 dni`} />
        <Metric label="Otwarte zgłoszenia" value={<AnimatedCounter value={openTickets} />} detail="Wymagają odpowiedzi" />
        <Metric label="Anulowanie Pro" value={<AnimatedCounter value={cancellingProCount} />} detail="Aktywne do końca okresu" />
        <Metric label="Niepotwierdzone konta" value={<AnimatedCounter value={unverifiedUsers} />} detail="Brak weryfikacji e-mail" />
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-medium">Szybkie działania</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-border bg-bg-surface p-4 hover:border-border-strong hover:bg-bg-surface-raised"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-accent" />
                <ArrowRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-1" />
              </div>
              <p className="mt-3 text-sm font-medium text-text-primary">{label}</p>
              <p className="mt-1 text-xs text-text-muted">{description}</p>
            </Link>
          ))}
        </div>
      </section>

      {(!cacheHealthy || openTickets > 0 || unverifiedUsers > 0) && (
        <section className="mt-8 rounded-lg border border-premium/30 bg-premium/5 p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-medium">
            <AlertTriangle className="h-5 w-5 text-premium" />
            Wymaga uwagi
          </h2>
          <div className="mt-3 grid gap-2 text-sm text-text-secondary sm:grid-cols-3">
            {!cacheHealthy && (
              <p className="rounded-md border border-border bg-bg-base px-3 py-2">
                Scraper meczów nie odświeżył cache w ciągu ostatnich 3 godzin.
              </p>
            )}
            {openTickets > 0 && (
              <Link href="/admin/wsparcie" className="rounded-md border border-border bg-bg-base px-3 py-2 hover:text-text-primary">
                {openTickets} {openTickets === 1 ? "zgłoszenie czeka" : "zgłoszeń czeka"} na odpowiedź.
              </Link>
            )}
            {unverifiedUsers > 0 && (
              <Link href="/admin/uzytkownicy" className="rounded-md border border-border bg-bg-base px-3 py-2 hover:text-text-primary">
                {unverifiedUsers} kont bez potwierdzonego adresu e-mail.
              </Link>
            )}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-medium">
            <Users className="h-4 w-4 text-accent" />
            Ostatnie rejestracje
          </h2>
          <div className="mt-3 divide-y divide-border">
            {recentUsers.map((user) => (
              <Link
                key={user.id}
                href={`/admin/uzytkownicy/${user.id}`}
                className="flex items-center justify-between gap-3 py-3 text-sm hover:text-accent"
              >
                <span className="min-w-0 truncate text-text-primary">{user.email}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {user.subscription?.status === "active" ? "Pro · " : ""}
                  {formatDate(user.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-medium">
            <CalendarClock className="h-4 w-4 text-accent" />
            Ostatnio dodane typy
          </h2>
          <div className="mt-3 divide-y divide-border">
            {recentTips.map((tip) => (
              <Link
                key={tip.id}
                href={`/typy/${tip.id}`}
                className="flex items-center justify-between gap-3 py-3 text-sm hover:text-accent"
              >
                <span className="min-w-0 truncate text-text-primary">
                  {tip.match.playerA} vs {tip.match.playerB}
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {tip.status} · {formatDate(tip.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-lg border border-border bg-bg-surface p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-medium">
          <Settings2 className="h-4 w-4 text-accent" />
          Podgląd dostępu
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Sprawdź ekran blokady i pełną wersję Pro bez osobnego konta testowego.
        </p>
        <PreviewToggle className="mt-4" />
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-surface p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-medium text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-secondary">{detail}</p>
    </div>
  );
}
