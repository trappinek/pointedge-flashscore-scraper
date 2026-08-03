import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBM_SIZE = 200 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.toLowerCase().endsWith(".webm")) {
          throw new Error("Dozwolone są wyłącznie pliki WebM generatora PointEdge.");
        }

        return {
          allowedContentTypes: ["video/webm"],
          maximumSizeInBytes: MAX_WEBM_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ source: "pointedge-video-generator" }),
        };
      },
      onUploadCompleted: async () => {
        // Render uruchamia osobny endpoint po zakończeniu bezpośredniego uploadu.
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Vercel Blob upload token failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nie udało się przygotować uploadu filmu." },
      { status: 400 },
    );
  }
}
