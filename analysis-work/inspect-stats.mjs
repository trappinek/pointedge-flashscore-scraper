import fs from "node:fs/promises";
import { Workbook } from "@oai/artifact-tool";

const sourcePath = "C:/Users/dcxml/Downloads/pointedge-statystyki(6).csv";
const csvText = await fs.readFile(sourcePath, "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "Statystyki" });
const sheet = workbook.worksheets.getItem("Statystyki");
const used = sheet.getUsedRange(true);

console.log((await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 6000,
  tableMaxRows: 8,
  tableMaxCols: 15,
  tableMaxCellChars: 120,
})).ndjson);

console.log(JSON.stringify({
  rowCount: used.rowCount,
  columnCount: used.columnCount,
  headers: used.values[0],
  sample: used.values.slice(1, 4),
}, null, 2));
