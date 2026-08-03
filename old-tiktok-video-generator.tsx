"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

export type TipOption = {
  id: string;
  label: string;
  narration: string;
  analysis: string;
  tour: string;
  tournament: string;
  playerA: string;
  playerB: string;
  recommendedBet: string;
  bookmaker: string | null;
  odd: number | null;
};

type Props = { tips: TipOption[] };
type Stage = "idle" | "voice" | "render" | "convert" | "done";

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type TimedWord = {
  text: string;
  start: number;
  end: number;
  charStart: number;
  charEnd: number;
};

type CaptionPage = {
  words: TimedWord[];
  lines: TimedWord[][];
  start: number;
  end: number;
};

type Timeline = {
  introEnd: number;
  matchEnd: number;
  analysisStart: number;
  analysisEnd: number;
  pickStart: number;
  ctaStart: number;
  outroStart: number;
  duration: number;
};

type VoiceSettings = {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  speakerBoost: boolean;
};

type NarrationScript = {
  fullText: string;
  introText: string;
  analysisText: string;
  pickText: string;
  ctaText: string;
  introRange: { start: number; end: number };
  analysisRange: { start: number; end: number };
  pickRange: { start: number; end: number };
  ctaRange: { start: number; end: number };
};

const WIDTH = 1080;
const HEIGHT = 1920;
const CAPTURE_WIDTH = 720;
const CAPTURE_HEIGHT = 1280;
const DRAW_SCALE = CAPTURE_WIDTH / WIDTH;
const FPS = 30;
const MAX_TEXT_LENGTH = 5000;
const ANALYSIS_FONT = 40;
const ANALYSIS_LINE_HEIGHT = 58;
const ANALYSIS_MAX_LINES = 7;
const ANALYSIS_MAX_WIDTH = 690;
const OUTRO_SECONDS = 1.15;
const SCENE_GAP = 0.12;
const BRIAN_PRESET: VoiceSettings = {
  stability: 0.46,
  similarityBoost: 0.86,
  style: 0.06,
  speed: 1.03,
  speakerBoost: true,
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value: number): number {
  const t = clamp(value);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(value: number): number {
  const t = clamp(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight = 900,
): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
}

function drawGlowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color = "#ffffff",
): void {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(13,211,239,.72)";
  ctx.shadowBlur = 26;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes.buffer], { type });
}

function alignmentToWords(alignment: Alignment): TimedWord[] {
  const words: TimedWord[] = [];
  let startIndex: number | null = null;

  const flush = (endExclusive: number) => {
    if (startIndex === null) return;
    const text = alignment.characters.slice(startIndex, endExclusive).join("");
    if (text.trim()) {
      words.push({
        text,
        start: alignment.character_start_times_seconds[startIndex] ?? 0,
        end: alignment.character_end_times_seconds[endExclusive - 1] ?? 0,
        charStart: startIndex,
        charEnd: endExclusive,
      });
    }
    startIndex = null;
  };

  alignment.characters.forEach((character, index) => {
    if (/\s/.test(character)) {
      flush(index);
    } else if (startIndex === null) {
      startIndex = index;
    }
  });
  flush(alignment.characters.length);
  return words;
}

function estimateTimedWords(text: string, duration: number): TimedWord[] {
  const matches = [...text.matchAll(/\S+/g)];
  if (!matches.length) return [];

  const weights = matches.map((match) => {
    const token = match[0];
    const punctuationPause = /[.!?]$/.test(token) ? 2.4 : /[,;:]$/.test(token) ? 1.55 : 1;
    return Math.max(1, token.replace(/[^\p{L}\p{N}]/gu, "").length * 0.34) * punctuationPause;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;

  return matches.map((match, index) => {
    const token = match[0];
    const charStart = match.index ?? 0;
    const start = (cursor / totalWeight) * duration;
    cursor += weights[index];
    const end = (cursor / totalWeight) * duration;
    return {
      text: token,
      start,
      end,
      charStart,
      charEnd: charStart + token.length,
    };
  });
}

function buildStableTimedWords(
  text: string,
  duration: number,
  alignment: Alignment | null,
): TimedWord[] {
  if (!alignment) return estimateTimedWords(text, duration);

  const alignedText = alignment.characters.join("");
  const rawWords = alignmentToWords(alignment);
  const lastEnd = rawWords.at(-1)?.end ?? 0;
  const textComparable = alignedText.replace(/\s+/g, " ").trim();
  const sourceComparable = text.replace(/\s+/g, " ").trim();

  // Korzystamy z dokładnego alignment tylko wtedy, gdy rzeczywiście obejmuje
  // prawie cały tekst. W przeciwnym razie ElevenLabs potrafi zwrócić częściowe
  // znaczniki i napisy zatrzymują się, mimo że audio dalej trwa.
  const coverage = sourceComparable.length
    ? Math.min(1, textComparable.length / sourceComparable.length)
    : 0;

  if (!rawWords.length || coverage < 0.94 || lastEnd <= 0) {
    return estimateTimedWords(text, duration);
  }

  // Skalujemy czasy do faktycznej długości MP3. Usuwa to narastający dryf
  // między MediaRecorderem a timestampami API.
  const scale = duration / lastEnd;
  return rawWords.map((word) => ({
    ...word,
    start: word.start * scale,
    end: word.end * scale,
  }));
}

function splitNameLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2,
): { lines: string[]; fontSize: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let fontSize = 62; fontSize >= 30; fontSize -= 2) {
    ctx.font = `900 ${fontSize}px Arial, sans-serif`;
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((item) => ctx.measureText(item).width <= maxWidth)) {
      return { lines, fontSize };
    }
  }
  return { lines: [text.slice(0, 22)], fontSize: 30 };
}

function drawPlayerPortrait(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  facing: 1 | -1,
  accent: string,
  enter: number,
  variant: "headband" | "short-hair",
): void {
  ctx.save();
  ctx.translate(centerX + facing * (1 - enter) * 210, baseY);
  ctx.scale(facing, 1);
  ctx.globalAlpha *= enter;

  const bodyGradient = ctx.createLinearGradient(-220, -220, 220, 340);
  bodyGradient.addColorStop(0, "rgba(8,22,34,.98)");
  bodyGradient.addColorStop(1, "rgba(0,3,8,.98)");
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 30;

  // Athletic torso cropped like a sports broadcast portrait.
  ctx.beginPath();
  ctx.moveTo(-185, 330);
  ctx.quadraticCurveTo(-175, 80, -92, -35);
  ctx.quadraticCurveTo(-45, -95, 12, -98);
  ctx.quadraticCurveTo(95, -90, 168, 55);
  ctx.quadraticCurveTo(220, 175, 235, 330);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Neck.
  ctx.beginPath();
  ctx.moveTo(-48, -75);
  ctx.lineTo(-38, -165);
  ctx.lineTo(42, -170);
  ctx.lineTo(58, -70);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Profile head facing the centre.
  ctx.beginPath();
  ctx.moveTo(-70, -215);
  ctx.quadraticCurveTo(-78, -350, 12, -405);
  ctx.quadraticCurveTo(92, -405, 126, -325);
  ctx.lineTo(153, -292);
  ctx.lineTo(124, -270);
  ctx.quadraticCurveTo(110, -205, 48, -174);
  ctx.quadraticCurveTo(-15, -160, -70, -215);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hair / headband gives each side a distinct broadcast-style player.
  ctx.shadowBlur = 18;
  if (variant === "headband") {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(-75, -352, 190, 30, 14);
    ctx.fill();
    ctx.fillStyle = "rgba(2,8,14,.98)";
    ctx.beginPath();
    ctx.moveTo(-63, -355);
    ctx.quadraticCurveTo(-20, -430, 72, -400);
    ctx.quadraticCurveTo(110, -390, 120, -343);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(2,8,14,.98)";
    ctx.beginPath();
    ctx.moveTo(-67, -330);
    ctx.quadraticCurveTo(-45, -430, 70, -410);
    ctx.quadraticCurveTo(126, -395, 122, -325);
    ctx.quadraticCurveTo(55, -354, -67, -330);
    ctx.fill();
    ctx.stroke();
  }

  // Face details.
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,.48)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(72, -319);
  ctx.lineTo(112, -308);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(127, -286);
  ctx.lineTo(93, -276);
  ctx.stroke();

  // Shirt accent and racket behind the shoulder.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-120, 185);
  ctx.quadraticCurveTo(10, 115, 145, 205);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-160, -40, 92, 145, -0.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-110, 70);
  ctx.lineTo(-30, 205);
  ctx.stroke();

  ctx.restore();
}

function stripTrailingNameCode(value: string): string {
  const clean = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[;,]+$/g, "");

  const parts = clean.split(" ");
  if (parts.length <= 1) return clean;

  const last = parts.at(-1) ?? "";
  const normalizedLast = last.replace(/[^\p{L}]/gu, "");
  const dottedInitials = /^(?:\p{L}\.){1,4}$/u.test(last);
  const shortNameCode =
    normalizedLast.length >= 1 &&
    normalizedLast.length <= 4 &&
    (/^[\p{Lu}]+$/u.test(normalizedLast) || /^[\p{Lu}][\p{Ll}]{0,3}$/u.test(normalizedLast));

  return dottedInitials || shortNameCode
    ? parts.slice(0, -1).join(" ").trim()
    : clean;
}

function spokenSurname(value: string): string {
  const withoutCode = stripTrailingNameCode(value);
  const parts = withoutCode.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return withoutCode;

  // Gdy dane są zapisane jako „Nazwisko A.” lub „Nazwisko DAR.”,
  // stripTrailingNameCode zwraca już właściwe nazwisko.
  if (withoutCode !== value.trim().replace(/\s+/g, " ").replace(/[;,]+$/g, "")) {
    return withoutCode;
  }

  // Przy pełnym imieniu lektor czyta samo nazwisko. Zachowujemy typowe
  // wieloczłonowe nazwiska, np. „de Minaur”, „van de Zandschulp”.
  const particles = new Set(["de", "del", "della", "di", "da", "dos", "du", "la", "le", "van", "von", "der", "den"]);
  let start = parts.length - 1;
  while (start > 0 && particles.has(parts[start - 1].toLocaleLowerCase("pl-PL"))) {
    start -= 1;
  }
  return parts.slice(start).join(" ");
}

function replacePlayerLabels(text: string, tip: TipOption): string {
  const directlyReplaced = text
    .replaceAll(tip.playerA, spokenSurname(tip.playerA))
    .replaceAll(tip.playerB, spokenSurname(tip.playerB));

  // Typ zapisany w bazie może nadal zawierać format „Nazwisko K.” lub
  // „Nazwisko DAR.”, nawet gdy administrator wpisał pełne imię w polu filmu.
  // Usuwamy taki końcowy kod również bez dokładnego dopasowania całej nazwy.
  return directlyReplaced.replace(
    /([\p{L}-]+(?:\s+[\p{L}-]+){0,3})\s+(?:(?:\p{Lu}\.){1,4}|\p{Lu}{1,4}\.)(?=\s|$)/gu,
    "$1",
  );
}

function spokenOdd(value: number): string {
  const fixed = value.toFixed(2);
  const [whole, fraction] = fixed.split(".");
  return `${whole} przecinek ${fraction}`;
}

function buildNarrationScript(tip: TipOption, analysisText: string): NarrationScript {
  const playerA = spokenSurname(tip.playerA);
  const playerB = spokenSurname(tip.playerB);
  const introText = `Witaj. Oto darmowa analiza meczu ${playerA} kontra ${playerB}, przygotowana przez serwis PointEdge.pl.`;
  const cleanAnalysis = analysisText.trim();
  const pickText = tip.odd !== null
    ? `Dlatego sugerujemy typ: ${replacePlayerLabels(tip.recommendedBet, tip)}, po kursie ${spokenOdd(tip.odd)}.`
    : `Dlatego sugerujemy typ: ${replacePlayerLabels(tip.recommendedBet, tip)}.`;
  const ctaText = "Więcej analiz znajdziesz na PointEdge.pl. Graj odpowiedzialnie. Osiemnaście plus.";
  const fullText = [introText, cleanAnalysis, pickText, ctaText].filter(Boolean).join(" ");

  let cursor = 0;
  const takeRange = (part: string) => {
    const start = fullText.indexOf(part, cursor);
    const safeStart = start >= 0 ? start : cursor;
    const end = safeStart + part.length;
    cursor = end;
    return { start: safeStart, end };
  };

  return {
    fullText,
    introText,
    analysisText: cleanAnalysis,
    pickText,
    ctaText,
    introRange: takeRange(introText),
    analysisRange: takeRange(cleanAnalysis),
    pickRange: takeRange(pickText),
    ctaRange: takeRange(ctaText),
  };
}

function segmentTimes(
  words: TimedWord[],
  range: { start: number; end: number },
  fallbackStart: number,
  fallbackEnd: number,
): { start: number; end: number } {
  const segment = words.filter((word) => word.charEnd > range.start && word.charStart < range.end);
  return {
    start: segment[0]?.start ?? fallbackStart,
    end: segment.at(-1)?.end ?? fallbackEnd,
  };
}

function buildTimeline(
  audioDuration: number,
  allWords: TimedWord[],
  script: NarrationScript,
): Timeline {
  const introSpeech = segmentTimes(allWords, script.introRange, 0, Math.min(audioDuration, 4.8));
  const analysisSpeech = segmentTimes(
    allWords,
    script.analysisRange,
    introSpeech.end,
    Math.max(introSpeech.end, audioDuration - 6),
  );
  const pickSpeech = segmentTimes(
    allWords,
    script.pickRange,
    analysisSpeech.end,
    Math.max(analysisSpeech.end, audioDuration - 2.8),
  );
  const ctaSpeech = segmentTimes(allWords, script.ctaRange, pickSpeech.end, audioDuration);

  const introEnd = Math.max(1.35, introSpeech.end * 0.42);
  const matchEnd = Math.max(introEnd + 1.2, analysisSpeech.start - SCENE_GAP);
  const analysisStart = Math.max(matchEnd, analysisSpeech.start);
  const analysisEnd = Math.max(analysisStart + 0.9, analysisSpeech.end);
  const pickStart = Math.max(analysisEnd, pickSpeech.start - SCENE_GAP);
  const ctaStart = Math.max(pickStart + 1.1, ctaSpeech.start - SCENE_GAP);
  const outroStart = Math.max(ctaStart + 1.1, audioDuration + 0.12);
  const duration = outroStart + OUTRO_SECONDS;

  return {
    introEnd,
    matchEnd,
    analysisStart,
    analysisEnd,
    pickStart,
    ctaStart,
    outroStart,
    duration,
  };
}

function filterWordsByRange(
  words: TimedWord[],
  range: { start: number; end: number },
): TimedWord[] {
  return words.filter((word) => word.charEnd > range.start && word.charStart < range.end);
}

function measureWordLine(
  ctx: CanvasRenderingContext2D,
  words: TimedWord[],
): number {
  return ctx.measureText(words.map((word) => word.text).join(" ")).width;
}

function paginateTimedAnalysis(
  ctx: CanvasRenderingContext2D,
  allWords: TimedWord[],
  timeOffset = 0,
): CaptionPage[] {
  const analysisWords = allWords.map((word) => ({
    ...word,
    start: word.start + timeOffset,
    end: word.end + timeOffset,
  }));

  ctx.font = `800 ${ANALYSIS_FONT}px Arial, sans-serif`;
  const pages: CaptionPage[] = [];
  let lines: TimedWord[][] = [];
  let currentLine: TimedWord[] = [];

  const pushPage = () => {
    if (currentLine.length) {
      lines.push(currentLine);
      currentLine = [];
    }
    const words = lines.flat();
    if (words.length) {
      pages.push({
        words,
        lines,
        start: words[0].start,
        end: words.at(-1)?.end ?? words[0].end,
      });
    }
    lines = [];
  };

  for (const word of analysisWords) {
    const candidate = [...currentLine, word];
    if (currentLine.length && measureWordLine(ctx, candidate) > ANALYSIS_MAX_WIDTH) {
      lines.push(currentLine);
      currentLine = [word];
      if (lines.length >= ANALYSIS_MAX_LINES) pushPage();
    } else {
      currentLine = candidate;
    }
  }
  pushPage();

  // Każda plansza pozostaje aktywna aż do rozpoczęcia kolejnej. Dzięki temu
  // nawet przy krótkiej pauzie w lektorze tekst nie znika ani nie „zawiesza się”.
  for (let index = 0; index < pages.length - 1; index += 1) {
    pages[index].end = Math.max(pages[index].end, pages[index + 1].start - 0.02);
  }
  return pages;
}

function drawBackground(ctx: CanvasRenderingContext2D, time: number): void {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#02070d");
  gradient.addColorStop(0.52, "#06141e");
  gradient.addColorStop(1, "#010307");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(
    760 + Math.sin(time * 0.25) * 130,
    430 + Math.cos(time * 0.22) * 90,
    0,
    760,
    430,
    700,
  );
  glow.addColorStop(0, "rgba(0,210,239,.18)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.translate(WIDTH / 2, 1540);
  ctx.strokeStyle = "rgba(36,220,245,.12)";
  ctx.lineWidth = 3;
  for (let i = -7; i <= 7; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 70, 300);
    ctx.lineTo(i * 175, -510);
    ctx.stroke();
  }
  for (let y = 65; y <= 325; y += 65) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 825 - y, y, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRibbon(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  const pulse = 0.5 + Math.sin(time * 2.4) * 0.5;
  roundedRect(ctx, 86, 66, 908, 108, 38);
  ctx.fillStyle = "rgba(4,19,28,.94)";
  ctx.fill();
  ctx.strokeStyle = `rgba(13,211,239,${0.58 + pulse * 0.2})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(13,211,239,.45)";
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.font = "italic 900 47px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("DARMOWA ANALIZA", WIDTH / 2, 138);
  ctx.restore();
}

function drawFooter(ctx: CanvasRenderingContext2D, progress: number): void {
  ctx.fillStyle = "rgba(255,255,255,.11)";
  ctx.fillRect(110, 1765, 860, 7);
  ctx.fillStyle = "#0dd3ef";
  ctx.fillRect(110, 1765, 860 * clamp(progress), 7);
  ctx.fillStyle = "rgba(255,255,255,.57)";
  ctx.font = "700 23px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("18+  •  GRAJ ODPOWIEDZIALNIE", WIDTH / 2, 1832);
}

function drawIntro(ctx: CanvasRenderingContext2D, local: number, duration: number): void {
  const enter = easeOutCubic(local / 0.65);
  const leave = 1 - easeInOutCubic((local - duration + 0.55) / 0.55);
  ctx.save();
  ctx.globalAlpha = clamp(Math.min(enter, leave));
  ctx.translate(WIDTH / 2, 870);
  ctx.scale(0.9 + enter * 0.1, 0.9 + enter * 0.1);
  drawGlowText(ctx, "P", 0, -120, "900 235px Arial, sans-serif", "#0dd3ef");
  drawGlowText(ctx, "POINTEDGE", 0, 115, "900 94px Arial, sans-serif");
  ctx.fillStyle = "rgba(255,255,255,.62)";
  ctx.font = "800 31px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ANALITYCZNE TYPY TENISOWE", 0, 190);
  ctx.restore();
}

function drawMatch(
  ctx: CanvasRenderingContext2D,
  tip: TipOption,
  local: number,
  duration: number,
  _playersImage: HTMLImageElement | null,
): void {
  const enter = easeOutCubic(local / 0.7);
  const leave = 1 - easeInOutCubic((local - duration + 0.48) / 0.48);
  const alpha = clamp(Math.min(enter, leave));
  const playerA = tip.playerA.trim();
  const playerB = tip.playerB.trim();
  const pulse = 0.5 + Math.sin(local * 2.2) * 0.5;

  ctx.save();
  ctx.globalAlpha = alpha;

  const tournament = `${tip.tour.toUpperCase()} • ${tip.tournament.toUpperCase()}`;
  const tournamentSize = fitFont(ctx, tournament, 850, 28, 18, 800);
  ctx.fillStyle = "rgba(255,255,255,.68)";
  ctx.font = `800 ${tournamentSize}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(tournament, WIDTH / 2, 290);

  const x = 72;
  const y = 360;
  const w = WIDTH - 144;
  const h = 980;
  const midY = y + h / 2;

  roundedRect(ctx, x, y, w, h, 50);
  ctx.fillStyle = "rgba(3,12,19,.97)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.13)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, x, y, w, h, 50);
  ctx.clip();

  const topGlow = ctx.createRadialGradient(WIDTH / 2, y + 220, 30, WIDTH / 2, y + 220, 520);
  topGlow.addColorStop(0, "rgba(0,202,244,.22)");
  topGlow.addColorStop(1, "rgba(0,202,244,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(x, y, w, h / 2);

  const bottomGlow = ctx.createRadialGradient(WIDTH / 2, y + h - 210, 30, WIDTH / 2, y + h - 210, 520);
  bottomGlow.addColorStop(0, "rgba(255,55,88,.2)");
  bottomGlow.addColorStop(1, "rgba(255,55,88,0)");
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(x, midY, w, h / 2);

  // Delikatny kort i światła. Brak pionowej lub ukośnej smugi na środku.
  ctx.strokeStyle = "rgba(255,255,255,.055)";
  ctx.lineWidth = 2;
  for (let i = -5; i <= 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, midY + 15);
    ctx.lineTo(WIDTH / 2 + i * 170, y + h);
    ctx.stroke();
  }
  for (let row = 0; row < 6; row += 1) {
    const lineY = midY + 100 + row * 72;
    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + w, lineY);
    ctx.stroke();
  }

  const drawCenteredPlayer = (
    label: string,
    centerY: number,
    accent: string,
    offsetY: number,
  ) => {
    const upper = label.toUpperCase();
    const size = fitFont(ctx, upper, w - 150, 104, 42, 900);
    ctx.save();
    ctx.translate(0, offsetY);
    ctx.textAlign = "center";
    ctx.font = `italic 900 ${size}px Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
    ctx.fillText(upper, WIDTH / 2, centerY);
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    roundedRect(ctx, WIDTH / 2 - 95, centerY + 38, 190, 7, 4);
    ctx.fill();
    ctx.restore();
  };

  drawCenteredPlayer(playerA, y + 285, "#12d8f4", (1 - enter) * -90);
  drawCenteredPlayer(playerB, y + h - 210, "#ff4d69", (1 - enter) * 90);

  // Prosty, centralny separator VS bez ciężkiej grafiki i bez smugi.
  const vsRadius = 82 + pulse * 3;
  ctx.beginPath();
  ctx.arc(WIDTH / 2, midY, vsRadius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(4,13,20,.96)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "italic 900 66px Arial, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", WIDTH / 2, midY + 4);
  ctx.textBaseline = "alphabetic";

  ctx.restore();
  ctx.restore();
}

function activePageIndex(pages: CaptionPage[], time: number): number {
  const nextIndex = pages.findIndex((page) => time < page.start);
  if (nextIndex === 0) return 0;
  if (nextIndex === -1) return pages.length - 1;
  return nextIndex - 1;
}

function drawAnalysis(
  ctx: CanvasRenderingContext2D,
  pages: CaptionPage[],
  time: number,
  timeline: Timeline,
): void {
  if (!pages.length) return;
  const index = activePageIndex(pages, time);
  const page = pages[index];
  const effectiveEnd = index === pages.length - 1
    ? Math.max(page.end, timeline.analysisEnd)
    : page.end;
  const fadeIn = easeOutCubic((time - page.start) / 0.22);
  const fadeOut = 1 - easeInOutCubic((time - effectiveEnd + 0.18) / 0.18);

  ctx.save();
  ctx.globalAlpha = clamp(Math.min(fadeIn, fadeOut));
  ctx.translate(0, (1 - fadeIn) * 22);

  ctx.fillStyle = '#0dd3ef';
  ctx.font = '900 38px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ANALIZA', WIDTH / 2, 270);

  const cardX = 90;
  const cardY = 325;
  const cardW = 900;
  const cardH = 1090;
  roundedRect(ctx, cardX, cardY, cardW, cardH, 48);
  ctx.fillStyle = 'rgba(3,13,20,.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(13,211,239,.38)';
  ctx.lineWidth = 3;
  ctx.stroke();

  const totalHeight = page.lines.length * ANALYSIS_LINE_HEIGHT;
  const firstBaseline = cardY + (cardH - totalHeight) / 2 + ANALYSIS_FONT;
  let y = firstBaseline;
  ctx.font = `800 ${ANALYSIS_FONT}px Arial, sans-serif`;

  for (const line of page.lines) {
    const widths = line.map((word) => ctx.measureText(word.text).width);
    const space = ctx.measureText(' ').width;
    const lineWidth = widths.reduce((sum, width) => sum + width, 0) + space * Math.max(0, line.length - 1);
    let x = WIDTH / 2 - lineWidth / 2;

    line.forEach((word, wordIndex) => {
      const isSpoken = time >= word.end;
      const isCurrent = time >= word.start && time < word.end;
      ctx.fillStyle = isCurrent ? '#10d9f2' : isSpoken ? '#ffffff' : 'rgba(255,255,255,.34)';
      ctx.shadowColor = isCurrent ? 'rgba(16,217,242,.72)' : 'transparent';
      ctx.shadowBlur = isCurrent ? 16 : 0;
      ctx.textAlign = 'left';
      ctx.fillText(word.text, x, y);
      x += widths[wordIndex] + space;
    });
    y += ANALYSIS_LINE_HEIGHT;
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.52)';
  ctx.font = '800 25px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${index + 1} / ${pages.length}`, WIDTH / 2, 1510);

  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(150, 1560, 780, 8);
  const progress = (time - timeline.analysisStart) / Math.max(0.1, timeline.analysisEnd - timeline.analysisStart);
  ctx.fillStyle = '#0dd3ef';
  ctx.fillRect(150, 1560, 780 * clamp(progress), 8);
  ctx.restore();
}

function drawPick(ctx: CanvasRenderingContext2D, tip: TipOption, local: number, duration: number): void {
  const enter = easeOutCubic(local / 0.7);
  const leave = 1 - easeInOutCubic((local - duration + 0.55) / 0.55);
  ctx.save();
  ctx.globalAlpha = clamp(Math.min(enter, leave));
  ctx.translate(0, (1 - enter) * 70);
  ctx.textAlign = "center";

  ctx.fillStyle = "rgba(255,255,255,.57)";
  ctx.font = "900 32px Arial, sans-serif";
  ctx.fillText("NASZ TYP", WIDTH / 2, 415);

  roundedRect(ctx, 92, 475, 896, 555, 54);
  ctx.fillStyle = "rgba(2,13,20,.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(13,211,239,.5)";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.font = "900 78px Arial, sans-serif";
  const rawWords = tip.recommendedBet.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of rawWords) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > 750) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  const fontSize = lines.length > 3 ? 60 : lines.length > 2 ? 68 : 78;
  ctx.font = `900 ${fontSize}px Arial, sans-serif`;
  const lineHeight = fontSize * 1.18;
  const startY = 705 - ((lines.length - 1) * lineHeight) / 2;
  lines.slice(0, 4).forEach((item, index) => {
    ctx.fillStyle = index === lines.length - 1 ? "#0dd3ef" : "#fff";
    ctx.fillText(item, WIDTH / 2, startY + index * lineHeight);
  });

  if (tip.odd !== null) {
    roundedRect(ctx, 325, 1095, 430, 215, 48);
    ctx.fillStyle = "rgba(13,211,239,.1)";
    ctx.fill();
    ctx.strokeStyle = "#0dd3ef";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.font = "900 31px Arial, sans-serif";
    ctx.fillText("KURS", WIDTH / 2, 1160);
    drawGlowText(ctx, tip.odd.toFixed(2).replace(".", ","), WIDTH / 2, 1265, "900 104px Arial, sans-serif");
  }
  ctx.restore();
}

function drawCta(ctx: CanvasRenderingContext2D, local: number, duration: number): void {
  const enter = easeOutCubic(local / 0.65);
  const leave = 1 - easeInOutCubic((local - duration + 0.5) / 0.5);
  ctx.save();
  ctx.globalAlpha = clamp(Math.min(enter, leave));
  ctx.translate(0, (1 - enter) * 55);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "900 49px Arial, sans-serif";
  ctx.fillText("WIĘCEJ ANALIZ ZNAJDZIESZ NA", WIDTH / 2, 690);
  roundedRect(ctx, 120, 760, 840, 190, 54);
  ctx.fillStyle = "#0dd3ef";
  ctx.shadowColor = "rgba(13,211,239,.58)";
  ctx.shadowBlur = 38;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#021016";
  ctx.font = "900 88px Arial, sans-serif";
  ctx.fillText("POINTEDGE.PL", WIDTH / 2, 885);
  ctx.restore();
}

function drawOutro(ctx: CanvasRenderingContext2D, local: number): void {
  const fade = 1 - easeInOutCubic(local / OUTRO_SECONDS);
  ctx.save();
  ctx.globalAlpha = clamp(fade);
  drawGlowText(ctx, "POINTEDGE", WIDTH / 2, 930, "900 92px Arial, sans-serif");
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "800 28px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ANALITYCZNE TYPY TENISOWE", WIDTH / 2, 1000);
  ctx.restore();
  ctx.fillStyle = `rgba(0,0,0,${easeInOutCubic(local / OUTRO_SECONDS)})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  tip: TipOption,
  pages: CaptionPage[],
  timeline: Timeline,
  elapsed: number,
  playersImage: HTMLImageElement | null,
): void {
  const time = clamp(elapsed, 0, timeline.duration);

  // Renderujemy logiczny layout 1080x1920 na lżejszym Canvas 720x1280.
  // To obniża koszt każdej klatki ponad dwukrotnie i zapobiega blokowaniu
  // głównego wątku podczas sceny VS. FFmpeg skaluje wynik do 1080x1920.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(DRAW_SCALE, 0, 0, DRAW_SCALE, 0, 0);
  drawBackground(ctx, time);

  if (time < timeline.introEnd) {
    drawIntro(ctx, time, timeline.introEnd);
  } else if (time < timeline.analysisStart) {
    drawMatch(ctx, tip, time - timeline.introEnd, timeline.analysisStart - timeline.introEnd, playersImage);
  } else if (time < timeline.pickStart) {
    drawAnalysis(ctx, pages, time, timeline);
  } else if (time < timeline.ctaStart) {
    drawPick(ctx, tip, time - timeline.pickStart, timeline.ctaStart - timeline.pickStart);
  } else if (time < timeline.outroStart) {
    drawCta(ctx, time - timeline.ctaStart, timeline.outroStart - timeline.ctaStart);
  } else {
    drawOutro(ctx, time - timeline.outroStart);
  }

  if (time < timeline.outroStart) {
    drawRibbon(ctx, time);
    drawFooter(ctx, time / timeline.duration);
  }
}

async function getAudioDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("Nie udało się odczytać długości lektora."));
    });
    return audio.duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function recordWebm(
  canvas: HTMLCanvasElement,
  audioBlob: Blob,
  tip: TipOption,
  pages: CaptionPage[],
  timeline: Timeline,
  setPercent: (value: number) => void,
  playersImage: HTMLImageElement | null,
): Promise<Blob> {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Przeglądarka nie obsługuje Canvas 2D.");
  if (!canvas.captureStream) throw new Error("Ta przeglądarka nie obsługuje nagrywania Canvas.");

  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination);

  /*
   * Kluczowa zmiana:
   * nie generujemy już klatek według frameIndex / FPS.
   * Gdy Canvas nie wyrabiał, poprzednia pętla tworzyła zaległe klatki bardzo
   * szybko. Audio leciało normalnie, ekran VS zostawał z tyłu, a później obraz
   * przyspieszał, żeby nadrobić.
   *
   * Teraz master clockiem jest AudioContext. Każda klatka jest rysowana dla
   * rzeczywistego czasu nagrania. Gdy przeglądarka zgubi klatkę, obraz przeskoczy
   * do prawidłowego czasu zamiast odtwarzać zaległe sceny w przyspieszeniu.
   */
  const canvasStream = canvas.captureStream(FPS);
  const videoTrack = canvasStream.getVideoTracks()[0];
  if (!videoTrack) throw new Error("Nie udało się utworzyć ścieżki obrazu Canvas.");

  const outputStream = new MediaStream([
    videoTrack,
    ...destination.stream.getAudioTracks(),
  ]);

  const mimeType = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) throw new Error("Przeglądarka nie obsługuje nagrywania WebM.");

  const recorder = new MediaRecorder(outputStream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 192_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("Błąd podczas renderowania filmu."));
  });

  drawFrame(ctx, tip, pages, timeline, 0, playersImage);
  recorder.start(500);

  // Krótki zapas pozwala MediaRecorderowi wystartować przed lektorem.
  const audioStartsAt = audioContext.currentTime + 0.12;
  source.start(audioStartsAt);

  let lastReportedPercent = -1;

  await new Promise<void>((resolve, reject) => {
    let animationFrameId = 0;
    let lastRenderedFrame = -1;

    const render = () => {
      try {
        const elapsed = clamp(audioContext.currentTime - audioStartsAt, 0, timeline.duration);
        const frameNumber = Math.min(
          Math.floor(elapsed * FPS),
          Math.ceil(timeline.duration * FPS),
        );

        // Nie rysujemy 60 razy na sekundę na ekranie 60/120/144 Hz.
        // Maksymalnie jedna klatka na każdy docelowy krok 30 FPS. Jeżeli
        // przeglądarka na moment zwolni, pomijamy zaległe klatki i od razu
        // rysujemy aktualny czas audio — bez zamrożenia VS i bez nadganiania.
        if (frameNumber !== lastRenderedFrame) {
          lastRenderedFrame = frameNumber;
          drawFrame(ctx, tip, pages, timeline, elapsed, playersImage);
        }

        const nextPercent = 12 + Math.round((elapsed / Math.max(0.1, timeline.duration)) * 58);
        if (nextPercent !== lastReportedPercent) {
          lastReportedPercent = nextPercent;
          setPercent(nextPercent);
        }

        if (elapsed >= timeline.duration) {
          resolve();
          return;
        }

        animationFrameId = window.requestAnimationFrame(render);
      } catch (error) {
        if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
        reject(error);
      }
    };

    animationFrameId = window.requestAnimationFrame(render);
  });

  // Utrwalamy ostatnią klatkę i pozwalamy MediaRecorderowi opróżnić bufor.
  drawFrame(ctx, tip, pages, timeline, timeline.duration, playersImage);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 220));

  recorder.stop();
  await stopped;

  try {
    source.stop();
  } catch {
    // Źródło mogło już zakończyć odtwarzanie.
  }

  outputStream.getTracks().forEach((track) => track.stop());
  canvasStream.getTracks().forEach((track) => track.stop());
  await audioContext.close();

  if (!chunks.length) throw new Error("Przeglądarka nie utworzyła danych filmu.");
  return new Blob(chunks, { type: mimeType });
}

type ServerRenderEvent =
  | { type: "progress"; progress: number; message?: string }
  | { type: "done"; url: string; size: number }
  | { type: "error"; error: string };

async function convertToMp4OnServer(
  webmBlob: Blob,
  duration: number,
  onProgress: (value: number) => void,
): Promise<Blob> {
  const inputName = `pointedge-input-${crypto.randomUUID()}.webm`;

  const uploaded = await upload(inputName, webmBlob, {
    access: "public",
    handleUploadUrl: "/api/admin/video-generator/upload",
    contentType: "video/webm",
    onUploadProgress: ({ percentage }) => {
      onProgress(70 + Math.round(clamp(percentage / 100) * 8));
    },
  });

  const response = await fetch("/api/admin/video-generator/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputUrl: uploaded.url, duration }),
  });

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Serwer renderujący zwrócił błąd ${response.status}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outputUrl = "";

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ServerRenderEvent;
    if (event.type === "progress") {
      onProgress(78 + Math.round(clamp(event.progress) * 20));
    } else if (event.type === "done") {
      outputUrl = event.url;
      onProgress(99);
    } else if (event.type === "error") {
      throw new Error(event.error);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
    if (done) break;
  }
  if (buffer.trim()) handleLine(buffer);
  if (!outputUrl) throw new Error("Serwer nie zwrócił adresu gotowego MP4.");

  const mp4Response = await fetch(outputUrl, { cache: "no-store" });
  if (!mp4Response.ok) throw new Error("Nie udało się pobrać gotowego MP4 z magazynu plików.");
  const mp4Blob = await mp4Response.blob();
  if (!mp4Blob.size) throw new Error("Serwer zwrócił pusty plik MP4.");
  return new Blob([mp4Blob], { type: "video/mp4" });
}

export function TikTokVideoGenerator({ tips }: Props) {
  const firstTip = tips[0] ?? null;
  const [tipId, setTipId] = useState(firstTip?.id ?? "");
  const [narration, setNarration] = useState(firstTip?.analysis ?? "");
  const [playerAInput, setPlayerAInput] = useState(firstTip?.playerA ?? "");
  const [playerBInput, setPlayerBInput] = useState(firstTip?.playerB ?? "");
  const [stage, setStage] = useState<Stage>("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(BRIAN_PRESET);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersImage: HTMLImageElement | null = null;

  const selectedTip = useMemo(
    () => tips.find((tip) => tip.id === tipId) ?? null,
    [tipId, tips],
  );

  const videoTip = useMemo(() => {
    if (!selectedTip) return null;
    return {
      ...selectedTip,
      playerA: playerAInput.trim() || selectedTip.playerA,
      playerB: playerBInput.trim() || selectedTip.playerB,
    };
  }, [selectedTip, playerAInput, playerBInput]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoTip || stage !== "idle") return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const script = buildNarrationScript(videoTip, narration);
    const estimatedSpeechSeconds = Math.max(4.5, script.fullText.trim().split(/\s+/).filter(Boolean).length / 2.7);
    const previewWords = estimateTimedWords(script.fullText, estimatedSpeechSeconds);
    const previewTimeline = buildTimeline(estimatedSpeechSeconds, previewWords, script);
    const analysisWords = filterWordsByRange(previewWords, script.analysisRange);
    const pages = paginateTimedAnalysis(ctx, analysisWords);
    const started = performance.now();
    let frame = 0;
    const animate = () => {
      const elapsed = ((performance.now() - started) / 1000) % previewTimeline.duration;
      drawFrame(ctx, videoTip, pages, previewTimeline, elapsed, playersImage);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, [videoTip, narration, stage, playersImage]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  function selectTip(nextId: string): void {
    const next = tips.find((tip) => tip.id === nextId) ?? null;
    setTipId(nextId);
    setNarration(next?.analysis ?? "");
    setPlayerAInput(next?.playerA ?? "");
    setPlayerBInput(next?.playerB ?? "");
    setError(null);
    setStage("idle");
    setPercent(0);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
  }

  async function generateVideo(): Promise<void> {
    if (!videoTip || !narration.trim() || !canvasRef.current) return;
    setError(null);
    setPercent(2);
    setStage("voice");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);

    try {
      const script = buildNarrationScript(videoTip, narration);
      const response = await fetch("/api/admin/video-generator/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: script.fullText,
          voiceSettings,
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      let audioBlob: Blob;
      let alignment: Alignment | null = null;

      if (contentType.includes("audio/")) {
        if (!response.ok) throw new Error("Nie udało się wygenerować lektora.");
        audioBlob = await response.blob();
      } else {
        const body = (await response.json().catch(() => null)) as
          | { error?: string; audioBase64?: string; alignment?: Alignment | null }
          | null;
        if (!response.ok) throw new Error(body?.error ?? "Nie udało się wygenerować lektora.");
        if (!body?.audioBase64) throw new Error("Endpoint nie zwrócił nagrania lektora.");
        audioBlob = base64ToBlob(body.audioBase64, "audio/mpeg");
        alignment = body.alignment ?? null;
      }

      const duration = await getAudioDuration(audioBlob);
      const words = buildStableTimedWords(script.fullText, duration, alignment);
      const ctx = canvasRef.current.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Nie udało się uruchomić podglądu Canvas.");
      const timeline = buildTimeline(duration, words, script);
      const analysisWords = filterWordsByRange(words, script.analysisRange);
      const pages = paginateTimedAnalysis(ctx, analysisWords);
      if (!pages.length) throw new Error("Nie udało się podzielić analizy na napisy.");

      setPercent(10);
      setStage("render");
      const webmBlob = await recordWebm(
        canvasRef.current,
        audioBlob,
        videoTip,
        pages,
        timeline,
        setPercent,
        playersImage,
      );
      setStage("convert");
      setPercent(70);
      const mp4Blob = await convertToMp4OnServer(webmBlob, timeline.duration, setPercent);
      setVideoUrl(URL.createObjectURL(mp4Blob));
      setPercent(100);
      setStage("done");
    } catch (caught) {
      console.error(caught);
      setStage("idle");
      setPercent(0);
      setError(caught instanceof Error ? caught.message : "Nie udało się wygenerować filmu.");
    }
  }

  const busy = stage === "voice" || stage === "render" || stage === "convert";
  const labels: Record<Stage, string> = {
    idle: "Gotowy do generowania",
    voice: "Generuję lektora i dokładne czasy napisów…",
    render: "Renderuję film zsynchronizowany z lektorem…",
    convert: "Serwer koduje gotowy film MP4…",
    done: "Gotowy film MP4",
  };

  if (!tips.length) {
    return <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-amber-100">Nie znaleziono typów.</div>;
  }

  return (
    <section className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="rounded-3xl border border-white/10 bg-zinc-950/75 p-5 sm:p-7">
        <div className="grid gap-6">
          <label className="grid gap-2">
            <span className="text-sm font-bold text-zinc-100">Wybierz dodany typ</span>
            <select value={tipId} onChange={(event) => selectTip(event.target.value)} disabled={busy} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white">
              {tips.map((tip) => <option key={tip.id} value={tip.id}>{tip.label}</option>)}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-zinc-100">Zawodnik 1 — tekst na ekranie</span>
              <input
                value={playerAInput}
                onChange={(event) => setPlayerAInput(event.target.value)}
                disabled={busy}
                className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white"
                placeholder="np. Alex de Minaur"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-zinc-100">Zawodnik 2 — tekst na ekranie</span>
              <input
                value={playerBInput}
                onChange={(event) => setPlayerBInput(event.target.value)}
                disabled={busy}
                className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white"
                placeholder="np. Stefanos Tsitsipas"
              />
            </label>
            <p className="text-xs leading-5 text-zinc-500 sm:col-span-2">Na ekranie pojawi się dokładnie wpisany tekst. Lektor automatycznie przeczyta tylko nazwiska, np. „Alex de Minaur” jako „de Minaur”, a „Stefanos Tsitsipas” jako „Tsitsipas”.</p>
          </div>

          <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-white">Lektor: Brian</p>
                <p className="text-xs leading-5 text-zinc-500">Preset pod polską analizę sportową. Model i język są ustawiane po stronie API.</p>
              </div>
              <button
                type="button"
                onClick={() => setVoiceSettings(BRIAN_PRESET)}
                disabled={busy}
                className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs font-black text-cyan-200"
              >
                PRZYWRÓĆ PRESET
              </button>
            </div>

            {([
              ["Stabilność", "stability", 0, 1, 0.01],
              ["Podobieństwo", "similarityBoost", 0, 1, 0.01],
              ["Ekspresja", "style", 0, 0.3, 0.01],
              ["Szybkość", "speed", 0.85, 1.15, 0.01],
            ] as const).map(([label, key, min, max, step]) => (
              <label key={key} className="grid gap-2">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-zinc-200">{label}</span>
                  <span className="text-zinc-500">{voiceSettings[key].toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={voiceSettings[key]}
                  disabled={busy}
                  onChange={(event) => setVoiceSettings((current) => ({
                    ...current,
                    [key]: Number(event.target.value),
                  }))}
                />
              </label>
            ))}

            <label className="flex items-center gap-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={voiceSettings.speakerBoost}
                disabled={busy}
                onChange={(event) => setVoiceSettings((current) => ({
                  ...current,
                  speakerBoost: event.target.checked,
                }))}
              />
              Wzmocnienie podobieństwa głosu
            </label>
          </div>

          <label className="grid gap-2">
            <div className="flex justify-between"><span className="text-sm font-bold text-zinc-100">Tekst analizy</span><span className="text-xs text-zinc-500">{narration.length}/{MAX_TEXT_LENGTH}</span></div>
            <textarea value={narration} onChange={(event) => setNarration(event.target.value)} rows={14} maxLength={MAX_TEXT_LENGTH} disabled={busy} className="min-h-80 w-full resize-y rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-100" />
            <p className="text-xs leading-5 text-zinc-500">Ten tekst jest pełną analizą czytaną i pokazywaną w filmie. Generator automatycznie dodaje także powitanie, zapowiedź meczu, odczyt typu i kursu oraz końcowe „Więcej analiz znajdziesz na PointEdge.pl”. Długość rolki dopasowuje się do całego nagrania.</p>
          </label>

          <button type="button" onClick={generateVideo} disabled={busy || !narration.trim()} className="rounded-xl bg-cyan-400 px-5 py-4 text-base font-black text-zinc-950 disabled:opacity-50">
            {busy ? labels[stage] : "GENERUJ GOTOWY FILM MP4"}
          </button>

          <div className="grid gap-2">
            <div className="flex justify-between text-xs text-zinc-400"><span>{labels[stage]}</span><span>{percent}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400 transition-[width] duration-300" style={{ width: `${percent}%` }} /></div>
          </div>

          {error ? <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}

          {videoUrl ? (
            <div className="grid gap-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5">
              <video src={videoUrl} controls playsInline className="max-h-[580px] w-full rounded-xl bg-black" />
              <a href={videoUrl} download={`pointedge-${selectedTip?.id ?? "tiktok"}.mp4`} className="rounded-xl bg-emerald-300 px-5 py-3 text-center font-black text-emerald-950">POBIERZ MP4</a>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="sticky top-24 rounded-3xl border border-white/10 bg-black p-3">
        <p className="py-2 text-center text-xs font-black uppercase tracking-[.26em] text-zinc-500">Podgląd 9:16</p>
        <div className="overflow-hidden rounded-2xl bg-black">
          <canvas ref={canvasRef} width={CAPTURE_WIDTH} height={CAPTURE_HEIGHT} className="block aspect-[9/16] h-auto w-full" />
        </div>
      </aside>
    </section>
  );
}
