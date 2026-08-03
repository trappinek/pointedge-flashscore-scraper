import { describe, expect, it } from "vitest";
import { normalizeProxyServer, parseProxyList, parseProxyResponse } from "../src/proxy.js";

describe("public proxy parsing", () => {
  it("normalizes ip:port entries", () => {
    expect(normalizeProxyServer(" 1.2.3.4:8080 ")).toBe("http://1.2.3.4:8080");
    expect(normalizeProxyServer("https://5.6.7.8:443/ ")).toBe("https://5.6.7.8:443");
    expect(normalizeProxyServer("socks5://127.0.0.1:19050")).toBe("socks5://127.0.0.1:19050");
  });

  it("ignores invalid rows and removes duplicates", () => {
    expect(parseProxyList("1.2.3.4:80\n# comment\ninvalid\n1.2.3.4:80\nhttps://5.6.7.8:443")).toEqual([
      "http://1.2.3.4:80",
      "https://5.6.7.8:443",
    ]);
  });

  it("parses GeoNode JSON responses", () => {
    expect(
      parseProxyResponse(JSON.stringify({ data: [{ ip: "1.2.3.4", port: "8080", protocols: ["http"] }] })),
    ).toEqual(["http://1.2.3.4:8080"]);
  });
});
