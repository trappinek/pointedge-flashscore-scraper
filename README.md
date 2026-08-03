# Flashscore Tennis Scraper

Samodzielne narzędzie do zebrania zakończonych meczów ATP/WTA Singles z publicznych stron Flashscore, przygotowania technicznego zbioru historycznych rekordów i wygenerowania SQL dla PostgreSQL/Neon. Nie używa API ani kodu PointEdge.

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
set HISTORY_FROM=2023-01-01
set HISTORY_TO=2026-07-25
set HISTORY_POOL=5000
set PREPARE_COUNT=700
set MIN_RECORDS_PER_MONTH=15
set MIN_PREPARED_PER_MONTH=15
set HEADLESS=0
set SCRAPE_DELAY_MS=2000
set MAX_RETRIES=3
set MIN_ODDS=1.5
set MAX_ODDS=3.0
npm run scrape
npm run scrape:missing
npm run prepare
npm run export-sql
```

### Tryby przygotowania danych historycznych

Bez zmiennych `TARGET_HIT_RATE` i `TARGET_YIELD` generator wykonuje transparentny
backtest jednej reguły przedmeczowej: wybiera niższy dostępny kurs w ustawionym
zakresie, bez sprawdzania zwycięzcy.

Po ustawieniu obu zmiennych generator tworzy jawnie oznaczony scenariusz
demonstracyjny `[FLASHSCORE_HISTORY_DEMO_V2]`. Taki scenariusz wykorzystuje znane
wyniki historyczne, aby osiągnąć zadane parametry, i nie może być przedstawiany
jako typy opublikowane przed meczami. `MAX_WIN_STREAK` i `MAX_LOSS_STREAK`
ograniczają długość serii, a `MIN_PREPARED_PER_MONTH` pilnuje pokrycia miesięcy.
Zwroty pochodzą wyłącznie z rzeczywistego statusu meczu w danych Flashscore.

Test jednego dnia:

```bat
set HISTORY_FROM=2025-01-10
set HISTORY_TO=2025-01-10
set HISTORY_POOL=5
npm run scrape
```

## Uruchamianie w PowerShell

```powershell
$env:HISTORY_FROM="2023-01-01"
$env:HISTORY_TO="2026-07-25"
$env:HISTORY_POOL="5000"
$env:PREPARE_COUNT="700"
$env:MIN_RECORDS_PER_MONTH="15"
$env:MIN_PREPARED_PER_MONTH="15"
$env:HEADLESS="0"
$env:SCRAPE_DELAY_MS="2000"
$env:MAX_RETRIES="3"
$env:MIN_ODDS="1.5"
$env:MAX_ODDS="3.0"
npm run scrape
npm run scrape:missing
npm run prepare
npm run export-sql
```

`HEADLESS=0` pokazuje przeglądarkę, a `HEADLESS=1` uruchamia ją w tle.
`SCRAPE_DELAY_MS` ustala przerwę między meczami, `MAX_RETRIES` ogranicza
ponowienia, a `HISTORY_POOL` ustala docelową pulę. `MIN_PREPARED_PER_MONTH`
wymusza minimalną liczbę rekordów w każdym aktywnym miesiącu.

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
- `data/pointedge-history-ready.json` — liczba rekordów ustawiona przez `PREPARE_COUNT`.
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

### Testowe polskie publiczne proxy

GitHub Actions uruchamia scraper live w trybie `PROXY_MODE=public-pl`. Przed otwarciem
Flashscore pobiera publiczną listę proxy, sprawdza rzeczywisty kraj adresu wyjściowego
i wybiera wyłącznie działające proxy z kodem `PL`. Jeżeli żadne nie działa, proces
kończy się błędem **przed zapisem snapshotu**, dzięki czemu zagraniczne kursy nie
zastąpią wcześniejszych danych.

Lokalnie można wymusić konkretny serwer:

```powershell
$env:PROXY_SERVER="http://adres-ip:port"
npm run scrape:live
```

Publiczne proxy są niestabilne i rozwiązanie ma charakter testowy. `CRON_SECRET`
oraz upload do PointEdge nie przechodzą przez proxy — proxy obsługuje tylko Chromium.

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

### Uzupełnianie brakujących miesięcy

Po zebraniu głównej puli możesz przeskanować wyłącznie miesiące, w których brakuje
rekordów. Tryb nie zaczyna od Australian Open i nie duplikuje istniejących meczów:

```bat
set HISTORY_FROM=2023-01-01
set HISTORY_TO=2026-07-25
set MIN_RECORDS_PER_MONTH=15
set HEADLESS=0
set SCRAPE_DELAY_MS=2000
set MAX_RETRIES=3
npm run scrape:missing
```

Zakres jest domyślnie wyliczany z najstarszej i najnowszej daty w
`data/flashscore-atp-wta.json`. Możesz go ograniczyć przez `HISTORY_FROM` i
`HISTORY_TO`. Tryb korzysta z archiwów turniejowych odpowiadających danemu
miesiącowi. Każdy znaleziony rekord jest od razu zapisywany, a kolejne
uruchomienie pomija jego ID, więc bezpiecznie wznawia pracę bez duplikatów.
Grudzień może pozostać pusty, ponieważ główne cykle ATP i WTA nie rozgrywają
wtedy regularnych turniejów.

## Przygotowanie danych i SQL

Po zebraniu co najmniej 650 rekordów:

```text
npm run prepare
npm run export-sql
```

Dobór jest deterministyczny, usuwa duplikaty i zapewnia minimalne pokrycie
aktywnych miesięcy. Strona jest wybierana wyłącznie na podstawie kursu
przedmeczowego, bez odczytywania zwycięzcy. Statystyki są drukowane przez
`prepare`.

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
