const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const { parse } = require("csv-parse/sync");

function normalizeSheetSelection(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((name) => String(name || "").trim()).filter(Boolean);
}

async function readWorkbookRows(filePath, originalName = filePath, options = {}) {
  const selectedSheets = normalizeSheetSelection(options.sheetNames || options.sheetName);
  if (String(originalName).toLowerCase().endsWith(".csv")) {
    const content = fs.readFileSync(filePath, "utf8");
    const rows = parse(content, { columns: true, skip_empty_lines: true, bom: true });
    return { workbook: null, sheetName: "CSV", rows };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (error) {
    if (String(error.message || "").includes("Shared Formula master")) {
      const sheetName = selectedSheets[0];
      const rows = await readXlsxValuesFallback(filePath, sheetName);
      return { workbook: null, sheetName: sheetName || "Planilha", rows };
    }
    throw error;
  }
  const worksheets = selectedSheets.length
    ? selectedSheets.map((sheetName) => workbook.worksheets.find((sheet) => sheet.name === sheetName)).filter(Boolean)
    : [workbook.worksheets[0]].filter(Boolean);

  const missing = selectedSheets.filter((sheetName) => !worksheets.some((sheet) => sheet.name === sheetName));
  if (missing.length) throw new Error(`Aba nao encontrada na planilha: ${missing.join(", ")}`);
  if (!worksheets.length) return { workbook, sheetName: "Resultado", rows: [] };

  const allRows = [];
  for (const worksheet of worksheets) {
    allRows.push(...readWorksheetRows(worksheet, worksheets.length > 1));
  }

  return { workbook, sheetName: worksheets.map((sheet) => sheet.name).join(", "), rows: allRows };
}

function readWorksheetRows(worksheet, includeSheetName = false) {
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value || "").trim();
  });

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const value = row.getCell(colNumber).value;
      item[header] = cellToValue(value);
    });
    if (includeSheetName && !Object.prototype.hasOwnProperty.call(item, "Aba Origem")) item["Aba Origem"] = worksheet.name;
    if (Object.values(item).some((value) => String(value).trim() !== "")) rows.push(item);
  });

  return rows;
}

async function listWorkbookSheets(filePath, originalName = filePath) {
  if (String(originalName).toLowerCase().endsWith(".csv")) {
    return [{ name: "CSV", rowCount: null, selected: true }];
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
    return workbook.worksheets.map((sheet, index) => ({
      name: sheet.name,
      rowCount: Math.max(0, sheet.rowCount - 1),
      selected: index === 0
    }));
  } catch (error) {
    if (String(error.message || "").includes("Shared Formula master")) {
      const names = await listXlsxSheetsFallback(filePath);
      return names.map((name, index) => ({ name, rowCount: null, selected: index === 0 }));
    }
    throw error;
  }
}

async function readXlsxValuesFallback(filePath, sheetName = "") {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const sharedStrings = await readSharedStrings(zip);
  const sheetPath = await sheetPathByName(zip, sheetName);
  const sheetXml = await zip.file(sheetPath).async("string");
  const matrix = parseSheetXml(sheetXml, sharedStrings);
  const headers = (matrix[0] || []).map((value) => String(value || "").trim());

  return matrix.slice(1).map((line) => {
    const row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = line[index] ?? "";
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => String(value).trim() !== ""));
}

async function listXlsxSheetsFallback(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const entries = await workbookSheetEntries(zip);
  return entries.map((entry) => entry.name);
}

async function readSharedStrings(zip) {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return [];

  const xml = await file.async("string");
  const strings = [];
  for (const match of xml.matchAll(/<si[\s\S]*?<\/si>/g)) {
    const parts = Array.from(match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((part) => decodeXml(part[1]));
    strings.push(parts.join(""));
  }
  return strings;
}

async function workbookSheetEntries(zip) {
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const entries = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = match[1];
    const name = decodeXml((attrs.match(/\bname="([^"]*)"/) || [])[1] || "");
    const relId = (attrs.match(/\br:id="([^"]+)"/) || [])[1] || "";
    if (name && relId) entries.push({ name, relId });
  }
  return entries;
}

async function sheetPathByName(zip, sheetName = "") {
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const entries = await workbookSheetEntries(zip);
  const selected = sheetName ? entries.find((entry) => entry.name === sheetName) : entries[0];
  if (!selected) {
    if (sheetName) throw new Error(`Aba nao encontrada na planilha: ${sheetName}`);
    return "xl/worksheets/sheet1.xml";
  }

  const relRegex = new RegExp(`<Relationship[^>]*Id="${escapeRegExp(selected.relId)}"[^>]*Target="([^"]+)"`);
  const rel = relsXml.match(relRegex);
  if (!rel) return "xl/worksheets/sheet1.xml";

  const target = rel[1].replace(/^\/+/, "");
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function parseSheetXml(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = (attrs.match(/\br="([A-Z]+)(\d+)"/) || [])[1];
      const colIndex = ref ? columnNameToIndex(ref) : cells.length;
      cells[colIndex] = readCellValue(attrs, body, sharedStrings);
    }
    rows.push(cells);
  }
  return rows;
}

function readCellValue(attrs, body, sharedStrings) {
  const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
  if (type === "inlineStr") {
    return Array.from(body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((part) => decodeXml(part[1])).join("");
  }

  const valueMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
  if (!valueMatch) return "";
  const raw = decodeXml(valueMatch[1]);
  if (type === "s") return sharedStrings[Number(raw)] || "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

function columnNameToIndex(name) {
  let index = 0;
  for (const char of name) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cellToValue(value) {
  if (value == null) return "";
  if (value.text) return value.text;
  if (value.result != null) return value.result;
  if (value.richText) return value.richText.map((part) => part.text).join("");
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function writeRows(filePath, rows, sheetName = "Resultado", styled = true) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => {
      if (!String(key).startsWith("__")) set.add(key);
    });
    return set;
  }, new Set()));

  worksheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(Math.max(header.length + 4, 12), 58) }));
  rows.forEach((row) => worksheet.addRow(row));

  if (styled) {
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } };
      cell.alignment = { horizontal: "left", vertical: "middle" };
    });
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const sourceRow = rows[rowNumber - 2] || {};
      const alertFill = sourceRow.__rowFill === "red" || sourceRow.__rowAlert === true;
      row.eachCell((cell) => {
        cell.font = { name: "Calibri", size: 11 };
        if (alertFill) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
          cell.font = { name: "Calibri", size: 11, color: { argb: "FF9C0006" } };
        }
        cell.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE0E0E0" } },
          left: { style: "thin", color: { argb: "FFE0E0E0" } },
          bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
          right: { style: "thin", color: { argb: "FFE0E0E0" } }
        };
      });
    });
  }

  worksheet.columns.forEach((column) => {
    let max = String(column.header || "").length;
    column.eachCell({ includeEmpty: false }, (cell) => {
      max = Math.max(max, String(cell.value || "").length);
    });
    column.width = Math.min(Math.max(max + 4, 12), 60);
  });

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

function outputName(originalName, prefix) {
  const parsed = path.parse(originalName);
  return `${prefix}${parsed.name}.xlsx`;
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getValue(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name) && String(row[name]).trim() !== "") {
      return row[name];
    }
  }
  return "";
}

module.exports = { readWorkbookRows, listWorkbookSheets, writeRows, outputName, normalizeHeader, getValue };
