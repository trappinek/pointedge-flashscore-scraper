import { request } from "playwright";

type BrowserProxy = { server: string };

const PUBLIC_PROXY_SOURCES = [
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&country=pl&protocol=http&proxy_format=protocolipport&format=text&timeout=10000",
  "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=PL&ssl=all&anonymity=all",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries/PL/data.txt",
  "https://proxylist.geonode.com/api/proxy-list?country=PL&limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps",
];

const CHECK_URLS = ["https://api.country.is/", "https://ifconfig.co/json", "https://ipapi.co/json/"];

export function normalizeProxyServer(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed.startsWith("#")) return null;
  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const explicitPort = withProtocol.match(/:(\d+)(?:\/)?$/)?.[1];
    if (!parsed.hostname || !explicitPort) return null;
    return `${parsed.protocol}//${parsed.hostname}:${explicitPort}`;
  } catch {
    return null;
  }
}

export function parseProxyList(text: string): string[] {
  const result = new Set<string>();
  for (const line of text.split(/\r?\n|\s*,\s*/)) {
    const normalized = normalizeProxyServer(line);
    if (normalized) result.add(normalized);
  }
  return [...result];
}

export function parseProxyResponse(text: string): string[] {
  try {
    const payload = JSON.parse(text) as {
      data?: Array<{ ip?: unknown; port?: unknown; protocols?: unknown }>;
    };
    const rows = payload.data ?? [];
    const result = new Set<string>();
    for (const row of rows) {
      const protocols = Array.isArray(row.protocols) ? row.protocols.map(String) : ["http"];
      const protocol = protocols.includes("https") ? "https" : "http";
      const normalized = normalizeProxyServer(`${protocol}://${String(row.ip ?? "")}:${String(row.port ?? "")}`);
      if (normalized) result.add(normalized);
    }
    return [...result];
  } catch {
    return parseProxyList(text);
  }
}

function maskedProxy(server: string): string {
  try {
    const url = new URL(server);
    const parts = url.hostname.split(".");
    const host = parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : url.hostname;
    return `${url.protocol}//${host}:${url.port}`;
  } catch {
    return "nieznane proxy";
  }
}

async function isPolishProxy(server: string): Promise<boolean> {
  const client = await request.newContext({
    proxy: { server },
    ignoreHTTPSErrors: false,
    extraHTTPHeaders: { "user-agent": "PointEdge proxy connectivity test" },
  });
  try {
    for (const url of CHECK_URLS) {
      try {
        const response = await client.get(url, { timeout: 7_000, failOnStatusCode: false });
        if (!response.ok()) continue;
        const body = (await response.json()) as Record<string, unknown>;
        const country = String(body.country ?? body.country_iso ?? body.country_code ?? "").toUpperCase();
        if (country === "PL") return true;
      } catch {
        // Publiczne proxy często znika z sieci. Sprawdzamy kolejny endpoint.
      }
    }
    return false;
  } finally {
    await client.dispose();
  }
}

async function downloadCandidates(): Promise<string[]> {
  const candidates = new Set<string>();
  await Promise.all(
    PUBLIC_PROXY_SOURCES.map(async (url) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) return;
        for (const proxy of parseProxyResponse(await response.text())) candidates.add(proxy);
      } catch {
        console.warn(`Nie udało się pobrać publicznej listy proxy z ${new URL(url).hostname}.`);
      }
    }),
  );
  return [...candidates];
}

async function firstWorkingPolishProxy(candidates: string[]): Promise<string | null> {
  const limit = Math.max(1, Number(process.env.PUBLIC_PROXY_LIMIT || 24));
  const batchSize = 4;
  const limited = candidates.slice(0, limit);
  for (let offset = 0; offset < limited.length; offset += batchSize) {
    const batch = limited.slice(offset, offset + batchSize);
    const checked = await Promise.all(batch.map(async (server) => ({ server, valid: await isPolishProxy(server) })));
    const winner = checked.find((item) => item.valid)?.server;
    if (winner) return winner;
  }
  return null;
}

export async function resolveBrowserProxy(): Promise<BrowserProxy | undefined> {
  const configured = normalizeProxyServer(process.env.PROXY_SERVER || "");
  if (configured) {
    console.log(`Sprawdzanie skonfigurowanego proxy ${maskedProxy(configured)}...`);
    if (await isPolishProxy(configured)) {
      console.log(`Proxy działa i ma polski adres wyjściowy: ${maskedProxy(configured)}`);
      return { server: configured };
    }
    throw new Error("Skonfigurowane PROXY_SERVER nie działa albo nie ma polskiego adresu IP.");
  }

  if (process.env.PROXY_MODE !== "public-pl") return undefined;

  console.log("Pobieranie i testowanie darmowych publicznych proxy z Polski...");
  const candidates = await downloadCandidates();
  console.log(`Znaleziono ${candidates.length} kandydatów proxy. Trwa kontrola polskiego IP...`);
  const selected = await firstWorkingPolishProxy(candidates);
  if (!selected) {
    throw new Error(
      "Nie znaleziono działającego publicznego proxy z polskim IP. Snapshot nie został wysłany; uruchom workflow ponownie później.",
    );
  }
  console.log(`Wybrano działające polskie proxy: ${maskedProxy(selected)}`);
  return { server: selected };
}
