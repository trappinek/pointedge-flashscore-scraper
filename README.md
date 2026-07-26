# Flashscore Tennis Scraper

Samodzielne narzędzie do zebrania zakończonych meczów ATP/WTA Singles z publicznych stron Flashscore, przygotowania technicznego zbioru 650 historycznych rekordów i wygenerowania SQL dla PostgreSQL/Neon. Nie używa API ani kodu PointEdge.

## Wymagania systemowe

- Windows 10/11
- Node.js 20 lub nowszy
- około 1 GB wolnego miejsca dla Chromium i danych
- stabilne połączenie z Internetem

## Instalacja

W CMD i PowerShell, w folderze projektu:

```text
npm install
npm run install:browser
```

## Uruchamianie w CMD

```bat
set HISTORY_FROM=2024-08-01
set HISTORY_TO=2026-06-30
set HISTORY_POOL=900
set HEADLESS=0
set SCRAPE_DELAY_MS=2000
set MAX_RETRIES=3
set MIN_ODDS=1.8
set MAX_ODDS=4.0
npm run scrape
npm run prepare
npm run export-sql
```

Test jednego dnia:

```bat
set HISTORY_FROM=2025-01-10
set HISTORY_TO=2025-01-10
set HISTORY_POOL=5
npm run scrape
```

## Uruchamianie w PowerShell

```powershell
$env:HISTORY_FROM="2024-08-01"
$env:HISTORY_TO="2026-06-30"
$env:HISTORY_POOL="900"
$env:PREPARE_COUNT="650"
$env:HEADLESS="0"
$env:SCRAPE_DELAY_MS="2000"
$env:MAX_RETRIES="3"
$env:MIN_ODDS="1.8"
$env:MAX_ODDS="4.0"
npm run scrape
npm run prepare
npm run export-sql
```

`HEADLESS=0` pokazuje przeglądarkę, a `HEADLESS=1` uruchamia ją w tle. `SCRAPE_DELAY_MS` ustala przerwę między meczami, `MAX_RETRIES` ogranicza ponowienia, a `HISTORY_POOL` ustala docelową pulę.

### Szybka próba na 5 rekordach

W PowerShell:

```powershell
$env:HISTORY_FROM="2025-01-12"
$env:HISTORY_TO="2025-01-26"
$env:HISTORY_POOL="5"
$env:PREPARE_COUNT="5"
$env:HEADLESS="0"
$env:TRIAL_TOURNAMENT="australian-open"
$env:TRIAL_TOUR="ATP"
$env:MIN_ODDS="1.8"
$env:MAX_ODDS="4.0"
npm run scrape
npm run prepare
npm run export-sql
```

W CMD:

```bat
set HISTORY_FROM=2025-01-12
set HISTORY_TO=2025-01-26
set HISTORY_POOL=5
set PREPARE_COUNT=5
set HEADLESS=0
set TRIAL_TOURNAMENT=australian-open
set TRIAL_TOUR=ATP
set MIN_ODDS=1.8
set MAX_ODDS=4.0
npm run scrape
npm run prepare
npm run export-sql
```

Jeżeli scraper zapisze pięć kompletnych meczów, `prepare` utworzy pięć rekordów w `data/pointedge-history-ready.json`, a `export-sql` wygeneruje plik `data/pointedge-neon-import.sql`.

## Pliki wynikowe i wznowienie

- `data/flashscore-atp-wta.json` — checkpoint surowych, zweryfikowanych meczów.
- `data/pointedge-history-ready.json` — dokładnie 650 przygotowanych rekordów.
- `data/pointedge-neon-import.sql` — gotowy, transakcyjny i idempotentny import.
- `logs/errors.log` — błędy i ponowienia.
- `screenshots/*.png` oraz `*.html` — stan strony przy błędzie selektora.

## Bieżące mecze dla PointEdge

Osobny tryb pobiera wyłącznie singlowe mecze głównych cykli ATP i WTA dla
wczoraj, dzisiaj i jutro. Challenger, ITF, WTA 125, debel, mikst i mecze
pokazowe są pomijane.

Próba lokalna bez zapisu do Neon:

```text
npm run scrape:live
```

Wynik trafia do `data/flashscore-live-cache.json`. Po ustawieniu adresu
chronionego endpointu PointEdge i tego samego sekretu co w Vercel dane są
również wysyłane do Neon:

```powershell
$env:POINTEDGE_INGEST_URL="https://twoja-domena.pl/api/cron/ingest-flashscore"
$env:CRON_SECRET="ten-sam-sekret-co-w-vercel"
$env:LIVE_REQUIRE_UPLOAD="1"
npm run scrape:live
```

Workflow `.github/workflows/refresh-live-matches.yml` uruchamia ten proces co
30 minut. W repozytorium GitHub scrapera należy dodać sekrety
`POINTEDGE_INGEST_URL` i `CRON_SECRET`.

Snapshot jest zapisywany atomowo: PointEdge przyjmuje komplet trzech
zweryfikowanych dni, aktualizuje je w jednej transakcji i usuwa starsze dni.
Nieudane pobranie lub CAPTCHA nie czyści istniejącego cache.

Ponowne `npm run scrape` automatycznie wczytuje checkpoint i pomija zapisane ID. Nie usuwaj pliku wejściowego, jeśli chcesz wznowić. Zamknięta karta lub kontekst są odtwarzane, a bieżący mecz ponawiany.

## Przygotowanie danych i SQL

Po zebraniu co najmniej 650 rekordów:

```text
npm run prepare
npm run export-sql
```

Dobór jest deterministyczny, przeplata miesiące i toury, usuwa duplikaty i wybiera retrospektywnie stronę zakładu tak, by techniczny yield był możliwie bliski 7%. Kursy ani wyniki nie są zmieniane. Statystyki są drukowane przez `prepare`.

Rekordy historyczne zachowują oryginalną chronologię: `Match.createdAt` i `Tip.createdAt` są ustawiane dokładnie na pełną datę i godzinę meczu z JSON (`date`/`matchDate`). Generator nie używa czasu importu i przerywa pracę, jeżeli data jest niepoprawna albo `createdAt` różni się od daty meczu choćby o sekundę.

W Neon otwórz SQL Editor, wklej całą zawartość `data/pointedge-neon-import.sql` i uruchom ją jednorazowo. Ponowne uruchomienie nie dubluje meczów, typów ani kursów. Schemat musi już zawierać tabele i kolumny `Match`, `Tip` oraz `TipOdds` opisane w specyfikacji.

## Diagnostyka selektorów

```bat
set HEADLESS=0
set DIAGNOSE_URL=https://www.flashscore.com/tennis/
npm run diagnose
```

W PowerShell użyj `$env:HEADLESS="0"` i `$env:DIAGNOSE_URL="..."`. Komenda zapisuje aktualny HTML i pełny screenshot oraz podaje liczbę znalezionych linków do meczów. Dla strony konkretnego meczu ustaw jej URL w `DIAGNOSE_URL`.

Jeśli pojawi się CAPTCHA lub blokada antybotowa, scraper celowo zatrzymuje się i pozostawia checkpoint. Nie próbuje obchodzić zabezpieczeń. Po ręcznym rozwiązaniu problemu uruchom go ponownie.

## Testy

```text
npm run typecheck
npm test
```

Fixture kursów sprawdza wymagany wynik: Fortuna 1.90 dla gospodarza i Betclic 2.15 dla gościa. Testy obejmują też filtrowanie bukmacherów, przygotowanie, escapowanie/idempotencję SQL i kontrakt odtworzenia zamkniętej strony.

## Ograniczenia

Flashscore jest aplikacją dynamiczną i może zmienić HTML, nazwy klas, nawigację lub dostępność archiwalnych kursów. Parser ma alternatywne selektory i walidację, ale po zmianie strony może wymagać aktualizacji. Dostępność kursów polskich bukmacherów zależy od regionu, daty i polityki Flashscore. Szanuj regulamin serwisu, stosuj rozsądne opóźnienia i nie uruchamiaj dużej współbieżności.
