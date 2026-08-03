import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  TikTokVideoGenerator,
  type TipOption,
} from "@/components/admin/tiktok-video-generator";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function VideoGeneratorPage() {
  const session = await auth();

  if (!session?.user) redirect("/logowanie");
  if (session.user.role !== "admin") redirect("/");

  const tips = await prisma.tip.findMany({
    orderBy: { createdAt: "desc" },
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
      odds: {
        select: {
          bookmaker: true,
          value: true,
        },
      },
    },
  });

  const options: TipOption[] = tips.map((tip) => {
    const bestOdd = [...tip.odds].sort((a, b) => b.value - a.value)[0] ?? null;

    return {
      id: tip.id,
      label: `${tip.match.playerA} vs ${tip.match.playerB} — ${tip.recommendedBet}`,
      narration: tip.reasoning,
      analysis: tip.reasoning,
      tour: tip.match.tour,
      tournament: tip.match.tournament,
      playerA: tip.match.playerA,
      playerB: tip.match.playerB,
      recommendedBet: tip.recommendedBet,
      bookmaker: bestOdd?.bookmaker ?? null,
      odd: bestOdd?.value ?? null,
    };
  });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-7">
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.22em] text-cyan-400">
          PointEdge Video Engine v2
        </p>
        <h1 className="text-3xl font-black text-white sm:text-4xl">
          Generator filmu TikTok
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          Pełna analiza, lektor Brian, płynne sceny 9:16 i gotowy plik MP4.
          Typ oraz kurs pojawiają się dopiero na końcu filmu.
        </p>
      </div>

      <TikTokVideoGenerator tips={options} />
    </main>
  );
}
