import fs from 'node:fs';
import zlib from 'node:zlib';

export type ExcelApplicationRow = {
  rowNumber: number;
  companyRaw: string;
  appliedDate: Date | null;
  statusCell: string | null;
  colD: string | null;
  colE: string | null;
};

const IMPORT_YEAR = 2026;

function readZipEntries(filePath: string): Map<string, Buffer> {
  const buffer = fs.readFileSync(filePath);
  const entries = new Map<string, Buffer>();

  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid xlsx: end of central directory not found');
  }

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  let offset = cdOffset;
  const end = cdOffset + cdSize;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString(
      'utf8',
      offset + 46,
      offset + 46 + fileNameLength,
    );

    const localOffset = localHeaderOffset;
    const localFileNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (compressionMethod === 0) {
      data = compressed;
    } else if (compressionMethod === 8) {
      data = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported zip compression method: ${compressionMethod}`);
    }

    entries.set(fileName.replace(/\\/g, '/'), data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siPattern = /<si>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;

  while ((match = siPattern.exec(xml)) !== null) {
    const block = match[1];
    const textParts = [...block.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(
      (part) => decodeXml(part[1]),
    );
    strings.push(textParts.join(''));
  }

  return strings;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function columnLettersToIndex(column: string): number {
  let index = 0;
  for (const char of column) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function parseCellRef(ref: string): { column: number; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) {
    throw new Error(`Invalid cell reference: ${ref}`);
  }
  return {
    column: columnLettersToIndex(match[1]),
    row: Number.parseInt(match[2], 10),
  };
}

function parseWorksheetCells(
  xml: string,
  sharedStrings: string[],
): Map<string, string | number> {
  const cells = new Map<string, string | number>();
  const cellPattern = /<c r="([^"]+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let match: RegExpExecArray | null;

  while ((match = cellPattern.exec(xml)) !== null) {
    const ref = match[1];
    const attrs = match[2];
    const body = match[3];
    const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(body);
    if (!valueMatch) {
      continue;
    }

    const rawValue = valueMatch[1];
    const typeMatch = /\bt="([^"]+)"/.exec(attrs);
    const cellType = typeMatch?.[1];

    if (cellType === 's') {
      const index = Number.parseInt(rawValue, 10);
      cells.set(ref, sharedStrings[index] ?? '');
      continue;
    }

    const numeric = Number.parseFloat(rawValue);
    cells.set(ref, Number.isNaN(numeric) ? rawValue : numeric);
  }

  return cells;
}

function getCell(
  cells: Map<string, string | number>,
  column: string,
  row: number,
): string | number | null {
  return cells.get(`${column}${row}`) ?? null;
}

export function roundExcelDate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseExcelMdDate(value: string | number): Date | null {
  if (typeof value === 'number') {
    const rounded = roundExcelDate(value);
    const [monthPart, dayPart] = rounded.toString().split('.');
    const month = Number.parseInt(monthPart, 10);
    const day = Number.parseInt(dayPart, 10);
    if (!month || !day) {
      return null;
    }
    return new Date(IMPORT_YEAR, month - 1, day);
  }

  const trimmed = value.trim();
  const match = /^(\d{1,2})\.(\d{1,2})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  return new Date(IMPORT_YEAR, month - 1, day);
}

function toText(value: string | number | null): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseXlsx(filePath: string): ExcelApplicationRow[] {
  const entries = readZipEntries(filePath);
  const sharedStringsXml = entries.get('xl/sharedStrings.xml');
  const sheetXml = entries.get('xl/worksheets/sheet1.xml');

  if (!sharedStringsXml || !sheetXml) {
    throw new Error('Invalid xlsx: missing sharedStrings or sheet1');
  }

  const sharedStrings = parseSharedStrings(sharedStringsXml.toString('utf8'));
  const cells = parseWorksheetCells(sheetXml.toString('utf8'), sharedStrings);
  const rows: ExcelApplicationRow[] = [];

  for (let rowNumber = 2; rowNumber <= 36; rowNumber += 1) {
    const companyCell = getCell(cells, 'A', rowNumber);
    if (companyCell == null) {
      continue;
    }

    const companyRaw =
      typeof companyCell === 'number' ? companyCell.toString() : companyCell.trim();
    if (!companyRaw) {
      continue;
    }

    const appliedCell = getCell(cells, 'B', rowNumber);
    const appliedDate =
      appliedCell == null ? null : parseExcelMdDate(appliedCell);

    rows.push({
      rowNumber,
      companyRaw,
      appliedDate,
      statusCell: toText(getCell(cells, 'C', rowNumber)),
      colD: toText(getCell(cells, 'D', rowNumber)),
      colE: toText(getCell(cells, 'E', rowNumber)),
    });
  }

  return rows;
}
