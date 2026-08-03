import fs from "node:fs/promises";
import { Workbook } from "@oai/artifact-tool";

const file = "C:/Users/dcxml/Downloads/pointedge-statystyki(4).csv";
const csv = await fs.readFile(file, "utf8");
const workbook = await Workbook.fromCSV(csv, { sheetName: "Statystyki" });
const overview = await workbook.inspect({
  kind: "region",
  sheetId: "Statystyki",
  range: "A1:Z20",
  maxChars: 12000,
  tableMaxRows: 20,
  tableMaxCols: 26,
});
console.log(overview.ndjson);

const sheet = workbook.worksheets.getItem("Statystyki");
const values = sheet.getUsedRange(true).values;
const headers = values[0].map((value) => String(value));
const dateIndex = headers.indexOf("data");
const resultIndex = headers.indexOf("wynik");
const monthly = new Map();
for (const row of values.slice(1)) {
  const month = String(row[dateIndex]).slice(0, 7);
  const result = String(row[resultIndex]).trim().toLowerCase();
  const summary = monthly.get(month) ?? { records: 0, won: 0, lost: 0, refunded: 0 };
  summary.records += 1;
  if (result === "wygrany") summary.won += 1;
  else if (result === "przegrany") summary.lost += 1;
  else summary.refunded += 1;
  monthly.set(month, summary);
}
console.log(JSON.stringify(Object.fromEntries([...monthly].sort()), null, 2));
console.log(
  JSON.stringify(
    values.slice(1).filter((row) => String(row[dateIndex]).startsWith("2023-09")),
    null,
    2,
  ),
);
