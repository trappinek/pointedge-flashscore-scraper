import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoiceSettingsInput = {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  speakerBoost?: boolean;
};

type ElevenLabsAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type ElevenLabsResponse = {
  audio_base64?: string;
  alignment?: ElevenLabsAlignment | null;
  normalized_alignment?: ElevenLabsAlignment | null;
  detail?: { message?: string } | string;
};

const MAX_TEXT_LENGTH = 7000;
const DEFAULT_BRIAN_SETTINGS = {
  stability: 0.46,
  similarity_boost: 0.86,
  style: 0.06,
  speed: 1.03,
  use_speaker_boost: true,
};

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "Brakuje ELEVENLABS_API_KEY w zmiennych środowiskowych." },
        { status: 500 },
      );
    }

    if (!voiceId) {
      return NextResponse.json(
        { error: "Brakuje ELEVENLABS_VOICE_ID. Wpisz Voice ID głosu Brian dostępnego na tym koncie." },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { text?: unknown; voiceSettings?: VoiceSettingsInput }
      | null;

    if (typeof body?.text !== "string") {
      return NextResponse.json({ error: "Brakuje tekstu lektora." }, { status: 400 });
    }

    const text = cleanText(body.text);
    if (!text) {
      return NextResponse.json({ error: "Tekst lektora jest pusty." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Tekst lektora może mieć maksymalnie ${MAX_TEXT_LENGTH} znaków.` },
        { status: 400 },
      );
    }

    const input = body.voiceSettings ?? {};
    const voiceSettings = {
      stability: bounded(input.stability, DEFAULT_BRIAN_SETTINGS.stability, 0, 1),
      similarity_boost: bounded(
        input.similarityBoost,
        DEFAULT_BRIAN_SETTINGS.similarity_boost,
        0,
        1,
      ),
      style: bounded(input.style, DEFAULT_BRIAN_SETTINGS.style, 0, 0.3),
      speed: bounded(input.speed, DEFAULT_BRIAN_SETTINGS.speed, 0.85, 1.15),
      use_speaker_boost:
        typeof input.speakerBoost === "boolean"
          ? input.speakerBoost
          : DEFAULT_BRIAN_SETTINGS.use_speaker_boost,
    };

    const endpoint = new URL(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    );
    endpoint.searchParams.set("output_format", "mp3_44100_128");

    const elevenResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: voiceSettings,
        apply_text_normalization: "on",
      }),
      cache: "no-store",
    });

    const data = (await elevenResponse.json().catch(() => null)) as ElevenLabsResponse | null;

    if (!elevenResponse.ok || !data?.audio_base64) {
      const detail =
        typeof data?.detail === "string"
          ? data.detail
          : data?.detail?.message;
      return NextResponse.json(
        {
          error: detail
            ? `ElevenLabs: ${detail}`
            : `ElevenLabs zwrócił błąd ${elevenResponse.status}.`,
        },
        { status: elevenResponse.status || 502 },
      );
    }

    return NextResponse.json({
      audioBase64: data.audio_base64,
      // Alignment odpowiada oryginalnemu tekstowi. To jest bezpieczniejsze dla
      // zakresów napisów niż normalized_alignment, które może zmieniać liczby.
      alignment: data.alignment ?? null,
      voice: "Brian",
      model: "eleven_multilingual_v2",
      requestId: elevenResponse.headers.get("request-id"),
    });
  } catch (error) {
    console.error("ElevenLabs voice generation failed:", error);
    return NextResponse.json(
      { error: "Nie udało się połączyć z ElevenLabs." },
      { status: 500 },
    );
  }
}
