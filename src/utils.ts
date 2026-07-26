import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ROOT = process.cwd();
export const DATA_FILE = path.join(ROOT, "data", "flashscore-atp-wta.json");
export const READY_FILE = path.join(ROOT, "data", "pointedge-history-ready.json");
export const SQL_FILE = path.join(ROOT, "data", "pointedge-neon-import.sql");

export function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
export function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}
export function isoDays(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(+start) || Number.isNaN(+end) || start > end) throw new Error("Invalid HISTORY_FROM/HISTORY_TO");
  const out: string[] = [];
  for (const d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
export function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}
export function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, file);
}
export function logError(message: string): void {
  fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  fs.appendFileSync(path.join(ROOT, "logs", "errors.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
}
export function slugId(id: string): string { return id.replace(/[^a-zA-Z0-9_-]/g, "_"); }
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''").replaceAll("\0", "")}'`;
}
export function stableId(prefix: string, externalId: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const c of `${prefix}:${externalId}`) {
    h1 = Math.imul(h1 ^ c.charCodeAt(0), 16777619);
    h2 = Math.imul(h2 ^ c.charCodeAt(0), 2246822519);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${hex(h1)}-${hex(h2).slice(0,4)}-4${hex(h2).slice(5,8)}-8${hex(h1).slice(1,4)}-${hex(h1)}${hex(h2).slice(0,4)}`;
}
export function isMain(metaUrl: string): boolean {
  return !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === metaUrl;
}
