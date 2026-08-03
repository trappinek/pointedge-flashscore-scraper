import { del, put } from "@vercel/blob";
import ffmpegStaticPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_INPUT_BYTES = 200 * 1024 * 1024;
const encoder = new TextEncoder();
const require = createRequire(import.meta.url);

type RenderBody = {
  inputUrl?: unknown;
  duration?: unknown;
};

function isAllowedBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".blob.vercel-storage.com") ||
        url.hostname.endsWith(".public.blob.vercel-storage.com"))
    );
  } catch {
    return false;
  }
}

function parseDuration(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 0;
  }

  return Math.min(value, 60 * 30);
}

/**
 * ffmpeg-static podczas buildu na Vercelu może zwrócić ścieżkę
 * z katalogu budowania, np. /ROOT/node_modules/..., która nie
 * istnieje podczas działania funkcji.
 *
 * Dlatego sprawdzamy kilka możliwych lokalizacji binarki.
 */
async function resolveFfmpegPath(): Promise<string> {
  const binaryName =
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

  let resolvedPackageBinary = "";

  try {
    const packageJsonPath = require.resolve(
      "ffmpeg-static/package.json",
    );

    resolvedPackageBinary = path.join(
      path.dirname(packageJsonPath),
      binaryName,
    );
  } catch {
    // Pakiet może być dostępny pod inną ścieżką w funkcji Vercela.
  }

  const candidates = Array.from(
    new Set(
      [
        ffmpegStaticPath,
        resolvedPackageBinary,

        path.join(
          process.cwd(),
          "node_modules",
          "ffmpeg-static",
          binaryName,
        ),

        path.join(
          "/var/task",
          "node_modules",
          "ffmpeg-static",
          binaryName,
        ),

        path.join(
          "/var/task",
          ".next",
          "server",
          "node_modules",
          "ffmpeg-static",
          binaryName,
        ),
      ].filter(
        (candidate): candidate is string =>
          typeof candidate === "string" &&
          candidate.length > 0,
      ),
    ),
  );

  for (const candidate of candidates) {
    try {
      await access(candidate);

      if (process.platform !== "win32") {
        await chmod(candidate, 0o755).catch(() => undefined);
      }

      return candidate;
    } catch {
      // Sprawdzamy kolejną możliwą lokalizację.
    }
  }

  throw new Error(
    [
      "Nie znaleziono binarki FFmpeg na serwerze.",
      "Sprawdzone ścieżki:",
      ...candidates,
    ].join(" "),
  );
}

export async function POST(
  request: Request,
): Promise<Response> {
  const body = (await request
    .json()
    .catch(() => null)) as RenderBody | null;

  const inputUrl =
    typeof body?.inputUrl === "string"
      ? body.inputUrl
      : "";

  const duration = parseDuration(body?.duration);

  if (!inputUrl || !isAllowedBlobUrl(inputUrl)) {
    return Response.json(
      {
        error:
          "Nieprawidłowy adres wejściowego pliku WebM.",
      },
      {
        status: 400,
      },
    );
  }

  let executablePath: string;

  try {
    executablePath = await resolveFfmpegPath();
  } catch (error) {
    console.error("FFmpeg path resolution failed:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Na serwerze nie znaleziono binarki FFmpeg.",
      },
      {
        status: 500,
      },
    );
  }

  console.log("Using FFmpeg binary:", executablePath);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const send = (payload: object): void => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify(payload)}\n`,
            ),
          );
        } catch {
          closed = true;
        }
      };

      const workDir = await mkdtemp(
        path.join(tmpdir(), "pointedge-render-"),
      );

      const inputPath = path.join(
        workDir,
        "input.webm",
      );

      const outputPath = path.join(
        workDir,
        "output.mp4",
      );

      try {
        send({
          type: "progress",
          progress: 0.01,
          message: "Pobieram materiał wejściowy",
        });

        const inputResponse = await fetch(inputUrl, {
          cache: "no-store",
        });

        if (!inputResponse.ok) {
          throw new Error(
            `Nie udało się pobrać WebM (${inputResponse.status}).`,
          );
        }

        const contentLength = Number(
          inputResponse.headers.get(
            "content-length",
          ) ?? 0,
        );

        if (
          Number.isFinite(contentLength) &&
          contentLength > MAX_INPUT_BYTES
        ) {
          throw new Error(
            "Plik WebM jest zbyt duży.",
          );
        }

        const inputBuffer = Buffer.from(
          await inputResponse.arrayBuffer(),
        );

        if (
          inputBuffer.length === 0 ||
          inputBuffer.length > MAX_INPUT_BYTES
        ) {
          throw new Error(
            "Plik WebM jest pusty albo przekracza limit 200 MB.",
          );
        }

        await writeFile(inputPath, inputBuffer);

        send({
          type: "progress",
          progress: 0.05,
          message: "Uruchamiam FFmpeg",
        });

        await new Promise<void>(
          (resolve, reject) => {
            const ffmpeg = spawn(
              executablePath,
              [
                "-y",

                "-i",
                inputPath,

                "-map",
                "0:v:0",

                "-map",
                "0:a:0?",

                "-c:v",
                "libx264",

                "-preset",
                "veryfast",

                "-crf",
                "20",

                "-pix_fmt",
                "yuv420p",

                "-vf",
                "scale=1080:1920:flags=lanczos,fps=30",

                "-c:a",
                "aac",

                "-b:a",
                "160k",

                "-movflags",
                "+faststart",

                "-shortest",

                "-progress",
                "pipe:1",

                "-nostats",

                outputPath,
              ],
              {
                stdio: [
                  "ignore",
                  "pipe",
                  "pipe",
                ],
              },
            );

            let progressBuffer = "";
            let errorTail = "";
            let settled = false;

            const resolveOnce = (): void => {
              if (settled) {
                return;
              }

              settled = true;
              resolve();
            };

            const rejectOnce = (
              error: Error,
            ): void => {
              if (settled) {
                return;
              }

              settled = true;
              reject(error);
            };

            ffmpeg.stdout.on(
              "data",
              (chunk: Buffer) => {
                progressBuffer +=
                  chunk.toString("utf8");

                const lines =
                  progressBuffer.split(/\r?\n/);

                progressBuffer =
                  lines.pop() ?? "";

                for (const line of lines) {
                  const separatorIndex =
                    line.indexOf("=");

                  if (separatorIndex === -1) {
                    continue;
                  }

                  const key = line.slice(
                    0,
                    separatorIndex,
                  );

                  const rawValue = line.slice(
                    separatorIndex + 1,
                  );

                  if (
                    (key === "out_time_us" ||
                      key === "out_time_ms") &&
                    duration > 0
                  ) {
                    const microseconds =
                      Number(rawValue);

                    if (
                      Number.isFinite(
                        microseconds,
                      )
                    ) {
                      const seconds =
                        microseconds /
                        1_000_000;

                      const encodingRatio =
                        Math.max(
                          0,
                          Math.min(
                            1,
                            seconds / duration,
                          ),
                        );

                      const progress =
                        0.05 +
                        encodingRatio * 0.89;

                      send({
                        type: "progress",
                        progress,
                        message: "Koduję MP4",
                      });
                    }
                  }

                  if (
                    key === "progress" &&
                    rawValue === "end"
                  ) {
                    send({
                      type: "progress",
                      progress: 0.96,
                      message:
                        "Finalizuję plik",
                    });
                  }
                }
              },
            );

            ffmpeg.stderr.on(
              "data",
              (chunk: Buffer) => {
                errorTail = (
                  errorTail +
                  chunk.toString("utf8")
                ).slice(-12000);
              },
            );

            ffmpeg.on(
              "error",
              (error) => {
                rejectOnce(
                  new Error(
                    `Nie udało się uruchomić FFmpeg z "${executablePath}": ${error.message}`,
                  ),
                );
              },
            );

            ffmpeg.on(
              "close",
              (code, signal) => {
                if (code === 0) {
                  resolveOnce();
                  return;
                }

                const details = errorTail
                  .slice(-2000)
                  .trim();

                rejectOnce(
                  new Error(
                    [
                      `FFmpeg zakończył pracę kodem ${String(code)}.`,
                      signal
                        ? `Sygnał: ${signal}.`
                        : "",
                      details,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  ),
                );
              },
            );
          },
        );

        const output =
          await readFile(outputPath);

        if (output.length === 0) {
          throw new Error(
            "FFmpeg utworzył pusty plik MP4.",
          );
        }

        send({
          type: "progress",
          progress: 0.97,
          message: "Wysyłam gotowy MP4",
        });

        const blob = await put(
          `pointedge-video/output-${Date.now()}.mp4`,
          output,
          {
            access: "public",
            addRandomSuffix: true,
            contentType: "video/mp4",
            cacheControlMaxAge: 60 * 60,
          },
        );

        send({
          type: "progress",
          progress: 1,
          message: "Gotowe",
        });

        send({
          type: "done",
          url: blob.url,
          size: output.length,
        });
      } catch (error) {
        console.error(
          "Server video render failed:",
          error,
        );

        send({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "Nie udało się zakodować filmu na serwerze.",
        });
      } finally {
        await Promise.allSettled([
          rm(workDir, {
            recursive: true,
            force: true,
          }),
          del(inputUrl),
        ]);

        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":
        "application/x-ndjson; charset=utf-8",
      "Cache-Control":
        "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
