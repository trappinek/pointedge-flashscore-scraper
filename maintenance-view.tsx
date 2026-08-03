"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Check, ExternalLink, Mail, X, Gift } from "lucide-react";
import { LogoMark } from "@/components/ui/logo-mark";
import { BrandWordmark } from "@/components/ui/brand-wordmark";

const CONTACT_EMAIL = "kontakt@pointedge.pl";
const TIKTOK_URL = "https://www.tiktok.com/@pointedge.pl";

type Countdown =
  | { days: number; hours: number; minutes: number; seconds: number }
  | "passed"
  | null;

// Tyka co sekundę (dawniej co 30s) — licznik ma być "na żywo", zgodnie z
// Etapem 12, blok 1.
function useCountdown(expectedEndAt: string | null): Countdown {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expectedEndAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [expectedEndAt]);

  if (!expectedEndAt) return null;
  const diff = new Date(expectedEndAt).getTime() - now;
  if (diff <= 0) return "passed";

  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

// Kafelek w stylu "split-flap" — karta obraca się na płasko (rotateX), a
// treść podmienia się w połowie obrotu (kiedy karta stoi na krawędzi,
// niewidoczna), co daje wrażenie fizycznej klapki bez potrzeby dwóch
// nakładających się połówek.
function FlipUnit({ value, label }: { value: number; label: string }) {
  const [display, setDisplay] = useState(value);
  const [flipping, setFlipping] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === prevRef.current) return;
    prevRef.current = value;
    setFlipping(true);
    const swap = setTimeout(() => setDisplay(value), 150);
    const end = setTimeout(() => setFlipping(false), 300);
    return () => {
      clearTimeout(swap);
      clearTimeout(end);
    };
  }, [value]);

  return (
    <div style={{ perspective: "200px" }}>
      <p
        className={`text-3xl font-semibold text-accent ${flipping ? "animate-flip-digit" : ""}`}
      >
        {String(display).padStart(2, "0")}
      </p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

export function MaintenanceView({
  headline,
  message,
  expectedEndAt,
}: {
  headline: string;
  message: string;
  expectedEndAt: string | null;
}) {
  const countdown = useCountdown(expectedEndAt);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSubscribe(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAlreadySubscribed(!!data.alreadySubscribed);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(CONTACT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12 text-center">
      <div className="flex items-center gap-2">
        <LogoMark className="h-7 w-7" />
        <BrandWordmark className="text-base" />
      </div>

      <h1 className="mt-8 max-w-lg font-display text-3xl font-medium sm:text-4xl">{headline}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-text-secondary">{message}</p>

      {countdown && (
        <div className="mt-8 min-h-[4.5rem]">
          {countdown === "passed" ? (
            <p className="font-mono text-2xl font-semibold text-accent">Jeszcze chwilę</p>
          ) : (
            <div className="flex items-center gap-5 font-mono">
              <FlipUnit value={countdown.days} label="dni" />
              <FlipUnit value={countdown.hours} label="godz." />
              <FlipUnit value={countdown.minutes} label="min" />
              <FlipUnit value={countdown.seconds} label="sek." />
            </div>
          )}
        </div>
      )}

      <div className="mt-10 flex max-w-sm items-start gap-3 rounded-lg border border-premium/30 bg-premium/5 px-4 py-3 text-left">
        <Gift className="mt-0.5 h-4 w-4 shrink-0 text-premium" />
        <p className="text-xs leading-relaxed text-text-secondary">
          Zapisz się i odbierz <span className="text-text-primary">darmowy poradnik</span>: 5
          najczęstszych błędów przy obstawianiu tenisa — plus powiadomienie w dniu startu.
        </p>
      </div>

      <form
        onSubmit={handleSubscribe}
        className="mt-4 flex w-full max-w-sm flex-col gap-2 sm:flex-row"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Twój adres e-mail"
          disabled={status === "sending" || status === "done"}
          className="flex-1 rounded-lg border border-border bg-bg-surface-raised px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "sending" || status === "done"}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg-base hover:bg-accent-dim disabled:opacity-60"
        >
          {status === "sending" ? "Zapisywanie…" : status === "done" ? "Zapisano" : "Powiadom mnie"}
        </button>
      </form>
      {status === "done" && (
        <p className="mt-2 text-xs text-success">
          {alreadySubscribed
            ? "Ten adres jest już zapisany."
            : "Dzięki! Odezwiemy się, gdy wystartujemy."}
        </p>
      )}
      {status === "error" && (
        <p className="mt-2 text-xs text-danger">Coś poszło nie tak. Spróbuj ponownie.</p>
      )}

      <div className="mt-8 flex items-center gap-3">
        <a
          href={TIKTOK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary hover:bg-bg-surface-raised"
        >
          TikTok <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary hover:bg-bg-surface-raised"
        >
          <Mail className="h-3.5 w-3.5" /> Kontakt
        </button>
      </div>

      <div className="mt-12 flex items-center gap-2 rounded-md border border-border px-3 py-1.5 font-mono text-xs">
        <span className="text-premium">18+</span>
        <span className="text-text-secondary">Graj odpowiedzialnie</span>
      </div>

      {contactOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setContactOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-bg-surface p-6 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-display text-lg font-medium">Kontakt</h2>
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-text-secondary">Napisz do nas bezpośrednio:</p>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-surface-raised px-3 py-2">
              <span className="font-mono text-sm text-text-primary">{CONTACT_EMAIL}</span>
              <button type="button" onClick={handleCopy} className="text-text-muted hover:text-accent">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-4 block rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-medium text-bg-base hover:bg-accent-dim"
            >
              Napisz wiadomość
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
