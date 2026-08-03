import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { NextResponse } from "next/server";
import type { Readable } from "node:stream";

import { getCurrentUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TEXT_LENGTH = 7000;
const VOICE = "pl-PL-MarekNeural";
const TICKS_PER_SECOND = 10_000_000;

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type WordBoundary = {
  offset: number;
  duration: number;
  text: string;
};

type MetadataEnvelope = {
  Metadata?: Array<{
    Type?: string;
    Data?: {
      Offset?: number;
      Duration?: number;
      text?: { Text?: string };
    };
  }>;
};

function collectAudio(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once("end", finish);
    stream.once("close", finish);
    stream.once("error", reject);
  });
}

function collectBoundaries(stream: Readable | null): Promise<WordBoundary[]> {
  if (!stream) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const boundaries: WordBoundary[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(boundaries);
    };
    stream.on("data", (chunk) => {
      const envelope = JSON.parse(Buffer.from(chunk).toString("utf8")) as MetadataEnvelope;
      for (const item of envelope.Metadata ?? []) {
        if (item.Type !== "WordBoundary") continue;
        const offset = item.Data?.Offset;
        const duration = item.Data?.Duration;
        const word = item.Data?.text?.Text;
        if (typeof offset === "number" && typeof duration === "number" && word) {
          boundaries.push({ offset, duration, text: word });
        }
      }
    });
    stream.once("end", finish);
    stream.once("close", finish);
    stream.once("error", reject);
  });
}

function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function neutralizeText(value: string): string {
  return value
    .replace(/\b(?:typ(?:y|u|em|ach)?|zakład(?:y|u|em|ach)?|kupon(?:y|u|em|ach)?|stawka|bankroll|yield|roi)\b/giu, "prognoza")
    .replace(/\b(?:kurs(?:y|u|em|ach)?|bukmacher(?:zy|a|em|ach)?|obstawian(?:ie|ia|iu)|hazard|betting|bet)\b/giu, "analiza")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toSeconds(value: number): number {
  return Math.max(0, value / TICKS_PER_SECOND);
}

function createAlignment(text: string, boundaries: WordBoundary[]): Alignment {
  const characters = [...text];
  const fallbackDuration = Math.max(
    1,
    ...boundaries.map((item) => toSeconds(item.offset + item.duration)),
  );
  const starts = characters.map((_, index) => (index / Math.max(1, characters.length)) * fallbackDuration);
  const ends = characters.map((_, index) => ((index + 1) / Math.max(1, characters.length)) * fallbackDuration);
  let searchFrom = 0;

  for (const boundary of boundaries) {
    const word = boundary.text?.trim();
    if (!word) continue;

    let index = text.indexOf(word, searchFrom);
    if (index < 0) {
      index = text.toLocaleLowerCase("pl-PL").indexOf(word.toLocaleLowerCase("pl-PL"), searchFrom);
    }
    if (index < 0) continue;

    const start = toSeconds(boundary.offset);
    const end = Math.max(start + 0.02, toSeconds(boundary.offset + boundary.duration));
    const length = Math.max(1, word.length);

    for (let offset = 0; offset < word.length && index + offset < characters.length; offset += 1) {
      starts[index + offset] = start + ((end - start) * offset) / length;
      ends[index + offset] = start + ((end - start) * (offset + 1)) / length;
    }
    searchFrom = index + word.length;
  }

  return {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  };
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Brak uprawnień administratora." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
    if (typeof body?.text !== "string") {
      return NextResponse.json({ error: "Brakuje tekstu lektora." }, { status: 400 });
    }

    const text = neutralizeText(cleanText(body.text));
    if (!text) {
      return NextResponse.json({ error: "Tekst lektora jest pusty." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Tekst lektora może mieć maksymalnie ${MAX_TEXT_LENGTH} znaków.` },
        { status: 400 },
      );
    }

    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
      wordBoundaryEnabled: true,
      sentenceBoundaryEnabled: false,
    });

    const { audioStream, metadataStream } = tts.toStream(escapeXml(text), {
      rate: "+3%",
      pitch: "-1Hz",
      volume: "100%",
    });
    const [audio, boundaries] = await Promise.all([
      collectAudio(audioStream),
      collectBoundaries(metadataStream),
    ]);
    tts.close();
    if (!audio.length) {
      throw new Error("Silnik lektora zwrócił pusty plik audio.");
    }

    return NextResponse.json({
      audioBase64: audio.toString("base64"),
      alignment: createAlignment(text, boundaries),
      voice: "Microsoft Marek",
      model: "Edge TTS",
    });
  } catch (error) {
    console.error("Edge TTS voice generation failed:", error);
    return NextResponse.json(
      { error: "Nie udało się wygenerować bezpłatnego polskiego lektora." },
      { status: 502 },
    );
  }
}
