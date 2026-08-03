import asyncio
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "tiktok"
VOICE_FILE = OUTPUT / "lektor-v2.mp3"
SUBTITLE_FILE = OUTPUT / "lektor-v2.srt"

TEXT = (
    "Ranking ATP lub WTA to dopiero początek. "
    "Jeśli chcesz lepiej rozumieć mecz, sprawdź trzy sygnały, "
    "które często umykają na pierwszy rzut oka. "
    "Po pierwsze: ELO na konkretnej nawierzchni. "
    "Zwykły ranking łączy wyniki z całego sezonu, a zawodnik może być "
    "znacznie mocniejszy na mączce niż na trawie. "
    "ELO dla nawierzchni pokazuje, z kim wygrywał właśnie w takich warunkach "
    "i jak świeże są te wyniki. "
    "Po drugie: obciążenie, a nie tylko ostatni rezultat. "
    "Sprawdź łączny czas spędzony na korcie, liczbę długich setów "
    "oraz przerwy między spotkaniami. "
    "Dwie wygrane mogą wyglądać identycznie, choć jedna kosztowała zawodnika "
    "prawie dwa razy więcej energii. "
    "Po trzecie: punkty po drugim serwisie. "
    "Asy przyciągają uwagę, ale to drugi serwis często pokazuje, "
    "co dzieje się pod presją. "
    "Gdy ten wskaźnik wyraźnie spada, rywal dostaje więcej okazji "
    "do agresywnego returnu i przejęcia inicjatywy. "
    "Sam wynik to za mało. Liczy się kontekst. "
    "Więcej tenisowych ciekawostek znajdziesz na pointedge.pl."
)


async def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    communicator = edge_tts.Communicate(
        TEXT,
        voice="pl-PL-MarekNeural",
        rate="+7%",
        pitch="-2Hz",
    )
    submaker = edge_tts.SubMaker()

    with VOICE_FILE.open("wb") as audio_file:
        async for chunk in communicator.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                submaker.feed(chunk)

    SUBTITLE_FILE.write_text(submaker.get_srt(), encoding="utf-8")
    print(VOICE_FILE)
    print(SUBTITLE_FILE)


if __name__ == "__main__":
    asyncio.run(main())
