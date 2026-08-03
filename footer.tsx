import Link from "next/link";
import { ArrowUpRight, HeartHandshake, Mail, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/ui/logo-mark";
import { BrandWordmark } from "@/components/ui/brand-wordmark";

export function Footer() {
  return <footer className="site-footer">
    <div className="site-footer-glow" />
    <div className="site-footer-line"><span>POINTEDGE / TENNIS INTELLIGENCE</span><i /></div>
    <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-10 md:pb-10 md:pt-14">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_0.8fr_0.8fr_1fr]">
        <div className="max-w-sm"><Link href="/" className="inline-flex items-center gap-3" aria-label="PointEdge — strona główna"><LogoMark className="h-10 w-10 rounded-xl ring-1 ring-white/10" /><BrandWordmark className="text-lg" /></Link><p className="mt-4 text-sm leading-6 text-text-secondary">Analizy tenisowe dla osób, które wolą rozumieć decyzję, zamiast tylko ją kopiować.</p><div className="mt-5 inline-flex items-center gap-2 rounded-full border border-premium/25 bg-premium/5 px-3 py-2 text-xs"><ShieldCheck className="h-4 w-4 text-premium" /><span className="font-semibold text-premium">18+</span><span className="text-text-secondary">Graj odpowiedzialnie</span></div></div>
        <FooterGroup title="PointEdge"><FooterLink href="/">Typy</FooterLink><FooterLink href="/mecze">Mecze</FooterLink><FooterLink href="/statystyki">Statystyki</FooterLink><FooterLink href="/jak-dzialamy">Jak działamy</FooterLink><FooterLink href="/subskrypcja">Subskrypcja</FooterLink></FooterGroup>
        <FooterGroup title="Pomoc i zasady"><FooterLink href="/kontakt">Kontakt</FooterLink><FooterLink href="/wsparcie">Wsparcie</FooterLink><FooterLink href="/regulamin">Regulamin</FooterLink><FooterLink href="/polityka-prywatnosci">Prywatność</FooterLink></FooterGroup>
        <div><p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Bądź na bieżąco</p><div className="space-y-2"><SocialLink href="https://www.tiktok.com/@pointedge.pl" label="TikTok" handle="@pointedge.pl" /><SocialLink href="https://www.instagram.com/pointedgepl" label="Instagram" handle="@pointedgepl" /></div><Link href="/kontakt" className="mt-4 flex items-center gap-2 text-xs text-text-secondary transition-colors hover:text-accent"><Mail className="h-4 w-4" />Napisz do nas</Link></div>
      </div>
      <div className="mt-10 flex flex-col gap-3 border-t border-border/80 pt-5 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} PointEdge. Wszystkie prawa zastrzeżone.</p><p className="flex items-center gap-1.5"><HeartHandshake className="h-3.5 w-3.5 text-accent" />Dane i analizy podane w przejrzystej formie.</p></div>
    </div>
  </footer>;
}
function FooterGroup({ title, children }: { title: string; children: React.ReactNode }) { return <nav aria-label={title}><p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</p><div className="flex flex-col items-start gap-3 text-sm">{children}</div></nav>; }
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="text-text-secondary transition-colors hover:text-accent">{children}</Link>; }
function SocialLink({ href, label, handle }: { href: string; label: string; handle: string }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between rounded-xl border border-border bg-bg-surface px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-accent/50"><span><span className="block text-sm font-medium text-text-primary">{label}</span><span className="text-xs text-text-muted">{handle}</span></span><ArrowUpRight className="h-4 w-4 text-text-muted transition-colors group-hover:text-accent" /></a>; }
