import { redirect } from "next/navigation";

import {
  TikTokVideoGenerator,
  type TipOption,
} from "@/components/admin/tiktok-video-generator";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function VideoGeneratorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/logowanie");
  if (user.role !== "admin") redirect("/");

  const tips = await prisma.tip.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      match: {
        select: {
          tour: true,
          tournament: true,
          playerA: true,
          playerB: true,
        },
      },
    },
  });

  const options: TipOption[] = tips.map((tip) => ({
    id: tip.id,
    label: `${tip.match.playerA} vs ${tip.match.playerB} — ${tip.recommendedBet}`,
    narration: tip.reasoning,
    analysis: tip.reasoning,
    tour: tip.match.tour,
    tournament: tip.match.tournament,
    playerA: tip.match.playerA,
    playerB: tip.match.playerB,
    recommendedBet: tip.recommendedBet,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7">
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.22em] text-accent">
          PointEdge Video Studio
        </p>
        <h1 className="font-display text-3xl font-medium text-text-primary sm:text-4xl">
          Generator rolek TikTok
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
          Pionowy film MP4 z polskim lektorem, zsynchronizowanymi napisami,
          płynnymi animacjami, analizą i końcową prognozą meczu. Generator
          automatycznie używa neutralnego słownictwa.
        </p>
      </div>

      <TikTokVideoGenerator tips={options} />
    </main>
  );
}
