"use client";

import { useState } from "react";
import { Check, Copy, Download, ImageDown, X } from "lucide-react";
import type { TennisTip } from "@/lib/types";

type GraphicFormat = "story" | "instagram";

const FORMAT: Record<GraphicFormat, { width: number; height: number; label: string }> = {
  story: { width: 1080, height: 1920, label: "TikTok / Stories 9:16" },
  instagram: { width: 1080, height: 1350, label: "Instagram 4:5" },
};

const SOCIAL_HASHTAGS = "#tenis #ATP #WTA #analizatenisowa #ciekawostkitenisowe #PointEdge";

function safeSocialText(value: string): string {
  return value
    .replace(/\bvalue\s+bet\b/giu, "wartościowa analiza")
    .replace(/\b(?:po\s+)?kurs(?:ie|u|y|ów|ami|ach)?\s*\d+(?:[.,]\d+)?\b/giu, "")
    .replace(/\b(?:kurs|kursie|kursu|kursy|kursów|odds)\b/giu, "wskaźnik")
    .replace(/\b(?:typ|typy|typu|typem|typami|typach|typować|typowanie|typowania)\b/giu, "analiza")
    .replace(/\b(?:tip|tips|pick|picks)\b/giu, "analiza")
    .replace(/\b(?:zakład|zakłady|zakładu|zakładem|zakładami|zakładach|zakładów)\b/giu, "scenariusz")
    .replace(/\b(?:kupon|kupony|kuponu|kuponów|stawka|stawki|stawiać|bankroll)\b/giu, "analiza")
    .replace(/\b(?:bukmacher|bukmacherzy|bukmachera|bukmacherów|bukmacherski|bukmacherskie)\b/giu, "rynek")
    .replace(/\b(?:obstawiać|obstawianie|obstawiania|obstawiasz|obstawiamy)\b/giu, "analizować")
    .replace(/\bstawiają\b/giu, "wskazują")
    .replace(/\b(?:hazard|gambling|betting|bet|pewniak|pewniaki|handicap|yield|roi)\b/giu, "analiza")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function socialFilename(tip: TennisTip, suffix: string): string {
  return `pointedge-${tip.playerA}-vs-${tip.playerB}-${suffix}`
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}.-]+/gu, "-");
}

function buildCaption(tip: TennisTip): string {
  return [
    "Ten mecz ma więcej warstw, niż pokazuje sam wynik. 🎾",
    "",
    `${tip.playerA} vs ${tip.playerB}`,
    `${tip.tournament} • ${tip.round} • ${tip.surface}`,
    "",
    "Dane, kontekst i najważniejsze informacje przed meczem znajdziesz w PointEdge.",
    "Odwiedź pointedge.pl i zobacz więcej analiz tenisowych.",
    "",
    SOCIAL_HASHTAGS,
  ].join("\r\n");
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const output: string[] = [];
  for (const paragraph of value.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        if (line) output.push(line);
        line = word;
      }
    }
    if (line) output.push(line);
  }
  return output;
}

function truncateLine(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (context.measureText(value).width <= maxWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}…`;
}

function completeSentence(value: string): string {
  const matches = [...value.matchAll(/[.!?](?=\s|$)/g)];
  const last = matches.at(-1);
  if (!last || last.index === undefined || last.index < value.length * 0.45) return value.trim();
  return value.slice(0, last.index + 1).trim();
}

function drawGraphic(canvas: HTMLCanvasElement, tip: TennisTip, format: GraphicFormat) {
  const { width, height } = FORMAT[format];
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Przeglądarka nie obsługuje generatora grafiki.");

  const story = format === "story";
  const top = story ? 300 : 105;
  const left = story ? 90 : 72;
  const contentWidth = story ? 900 : 936;
  const accent = "#18bdf2";
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#03070d");
  background.addColorStop(0.48, "#07172d");
  background.addColorStop(1, "#02050a");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.82, height * 0.42, 0, width * 0.82, height * 0.42, width * 0.7);
  glow.addColorStop(0, "rgba(21,119,255,.32)");
  glow.addColorStop(0.5, "rgba(13,74,157,.12)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(24,189,242,.65)";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(-80, height * 0.82);
  context.bezierCurveTo(width * 0.34, height * 0.69, width * 0.58, height * 0.96, width + 100, height * 0.72);
  context.stroke();

  context.fillStyle = accent;
  context.font = "800 40px Arial, sans-serif";
  context.fillText("P", left, top);
  context.fillStyle = "#ffffff";
  context.font = "700 34px Arial, sans-serif";
  context.fillText("POINT", left + 54, top);
  context.fillStyle = accent;
  context.fillText("EDGE", left + 164, top);

  let y = top + 92;
  context.fillStyle = "#ffffff";
  context.font = `900 ${story ? 54 : 60}px Arial, sans-serif`;
  context.fillText("ANALIZA MECZU", left, y);

  y += story ? 72 : 78;
  context.font = `800 ${story ? 45 : 49}px Arial, sans-serif`;
  const titleLines = wrapText(context, `${tip.playerA.toUpperCase()} VS ${tip.playerB.toUpperCase()}`, contentWidth);
  for (const line of titleLines.slice(0, 2)) {
    context.fillText(line, left, y);
    y += story ? 55 : 60;
  }

  context.fillStyle = accent;
  context.font = "700 25px Arial, sans-serif";
  context.fillText(`${tip.tournament.toUpperCase()} • ${tip.round.toUpperCase()}`, left, y + 10);
  y += 66;

  context.fillStyle = "rgba(2,7,14,.88)";
  context.strokeStyle = accent;
  context.lineWidth = 2;
  const panelHeight = story ? 820 : 700;
  context.beginPath();
  context.roundRect(left, y, contentWidth, panelHeight, 22);
  context.fill();
  context.stroke();

  const panelX = left + 34;
  let panelY = y + 58;
  context.fillStyle = accent;
  context.font = "800 26px Arial, sans-serif";
  context.fillText("SCENARIUSZ MECZU", panelX, panelY);

  panelY += 50;
  context.fillStyle = "#ffffff";
  context.font = "800 34px Arial, sans-serif";
  const recommendationWidth = contentWidth - 68;
  const recommendationLines = wrapText(
    context,
    safeSocialText(tip.recommendedBet).toUpperCase(),
    recommendationWidth,
  );
  const visibleRecommendationLines = recommendationLines.slice(0, 2);
  if (recommendationLines.length > 2) {
    visibleRecommendationLines[1] = truncateLine(
      context,
      `${visibleRecommendationLines[1]}…`,
      recommendationWidth,
    );
  }
  for (const line of visibleRecommendationLines) {
    context.fillText(line, panelX, panelY);
    panelY += 43;
  }

  panelY += 24;
  context.strokeStyle = "rgba(24,189,242,.42)";
  context.beginPath();
  context.moveTo(panelX, panelY);
  context.lineTo(left + contentWidth - 34, panelY);
  context.stroke();
  panelY += 50;

  context.fillStyle = accent;
  context.font = "800 27px Arial, sans-serif";
  context.fillText("UZASADNIENIE", panelX, panelY);
  panelY += 42;
  const footerY = y + panelHeight - 42;
  const textWidth = contentWidth - 68;
  const availableTextHeight = footerY - 54 - panelY;
  let fontSize = story ? 25 : 27;
  let lineHeight = Math.round(fontSize * 1.34);
  let maxLines = 0;
  let reasoningLines: string[] = [];

  while (fontSize >= 21) {
    context.font = `${fontSize}px Arial, sans-serif`;
    lineHeight = Math.round(fontSize * 1.34);
    maxLines = Math.max(3, Math.floor(availableTextHeight / lineHeight));
    reasoningLines = wrapText(context, safeSocialText(tip.reasoning), textWidth);
    if (reasoningLines.length <= maxLines) break;
    fontSize -= 1;
  }

  const shortened = reasoningLines.length > maxLines;
  let visibleLines = reasoningLines;
  if (shortened) {
    const textLineLimit = Math.max(3, maxLines - 2);
    visibleLines = wrapText(
      context,
      completeSentence(reasoningLines.slice(0, textLineLimit).join(" ")),
      textWidth,
    ).slice(0, textLineLimit);
  }
  if (!shortened && reasoningLines.length > maxLines && visibleLines.length) {
    visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1].replace(/[.,;:]?$/, "")}…`;
  }
  context.fillStyle = "#e9f2f8";
  context.font = `${fontSize}px Arial, sans-serif`;
  for (const line of visibleLines) {
    context.fillText(line, panelX, panelY);
    panelY += lineHeight;
  }
  if (shortened) {
    panelY += 10;
    context.fillStyle = accent;
    context.font = "800 22px Arial, sans-serif";
    context.fillText("PEŁNA ANALIZA NA POINTEDGE.PL", panelX, panelY);
  }

  context.strokeStyle = "rgba(24,189,242,.42)";
  context.beginPath();
  context.moveTo(panelX, footerY - 36);
  context.lineTo(left + contentWidth - 34, footerY - 36);
  context.stroke();
  context.fillStyle = accent;
  context.font = "700 23px Arial, sans-serif";
  context.fillText("POINTEDGE.PL", panelX, footerY);
  context.fillStyle = "rgba(255,255,255,.62)";
  context.font = "18px Arial, sans-serif";
  context.fillText("ANALIZA SPORTOWA • ATP / WTA", left, height - (story ? 250 : 58));
}

async function downloadGraphic(tip: TennisTip, format: GraphicFormat) {
  const canvas = document.createElement("canvas");
  drawGraphic(canvas, tip, format);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Nie udało się utworzyć PNG."))), "image/png"),
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${socialFilename(tip, format)}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SocialGraphicGenerator({ tip }: { tip: TennisTip }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState<GraphicFormat | null>(null);
  const [copied, setCopied] = useState(false);
  const caption = buildCaption(tip);

  async function generate(format: GraphicFormat) {
    setWorking(format);
    try {
      await document.fonts.ready;
      await downloadGraphic(tip, format);
    } finally {
      setWorking(null);
    }
  }

  async function copyCaption() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Generuj grafikę społecznościową"
        className="rounded-full border border-border-strong p-1.5 text-text-muted hover:border-accent/40 hover:text-accent"
      >
        <ImageDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-bg-surface p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-primary">Grafika + opis</p>
              <p className="mt-0.5 text-[10px] text-text-muted">Gotowe materiały dla social mediów</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {(Object.keys(FORMAT) as GraphicFormat[]).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => generate(format)}
                disabled={working !== null}
                className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs text-text-secondary hover:border-accent/40 hover:text-text-primary disabled:opacity-50"
              >
                <Download className="h-4 w-4 text-accent" />
                {working === format ? "Generowanie…" : FORMAT[format].label}
              </button>
            ))}
            <div className="rounded-lg border border-border bg-bg-elevated/50 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Opis do publikacji
                </p>
                <button
                  type="button"
                  onClick={copyCaption}
                  className="flex items-center gap-1.5 rounded-md border border-accent/30 px-2 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/10"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Skopiowano" : "Kopiuj opis"}
                </button>
              </div>
              <textarea
                readOnly
                value={caption}
                rows={10}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full resize-none rounded-md border border-border bg-bg-base px-2.5 py-2 text-[11px] leading-relaxed text-text-secondary outline-none focus:border-accent/50"
                aria-label="Gotowy opis do publikacji"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
