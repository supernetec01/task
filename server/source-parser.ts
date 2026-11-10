import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { safeWorkbook } from './metrics.js';
import { need, hash, localDate } from './base.js';

export const adapters = JSON.parse(readFileSync('config/import-adapters.json', 'utf8'))
  .adapters as any[];
export const normalize = (v: any) =>
  String(v ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi');
export function sourcePercent(value: string, locale: string) {
  need(value.trim().endsWith('%'), 'Tỷ lệ nguồn cần dấu %', 422, 'NUMBER_FORMAT');
  const normalized = sourceNumber(value.trim().slice(0, -1), locale),
    [whole, fraction = ''] = normalized.split('.');
  const places = fraction.length + 2;
  const digits = (whole + fraction).padStart(places + 1, '0');
  const result = digits.slice(0, -places) + '.' + digits.slice(-places);
  return result.replace(/0+$/, '').replace(/\.$/, '');
}
export function canonicalJSON(value: any): string {
  const normalizeValue = (v: any): any =>
    Array.isArray(v)
      ? v.map(normalizeValue)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, normalizeValue(v[k])]),
          )
        : v;
  return JSON.stringify(normalizeValue(value));
}
export function sourceNumber(value: any, locale: string, integer = false): string {
  need(
    value !== null && value !== undefined && String(value).trim() !== '',
    'Thiếu số nguồn',
    422,
    'INVALID_NUMBER',
  );
  let s = String(value)
    .trim()
    .replace(/[₫đ\s]/g, '');
  if (typeof value !== 'number') {
    // An ungrouped decimal with a zero fractional part is a valid plain count.
    if (integer && /^\d+\.0+$/.test(s)) s = s.split('.')[0];
    else if (locale === 'vi-VN') {
      need(
        /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,10})?$/.test(s),
        'Định dạng số không khớp vi-VN',
        422,
        'NUMBER_FORMAT',
      );
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      need(
        /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,10})?$/.test(s),
        'Định dạng số không khớp en-US',
        422,
        'NUMBER_FORMAT',
      );
      s = s.replace(/,/g, '');
    }
  }
  need(
    /^\d{1,28}(?:\.\d{1,10})?$/.test(s) && s.replace('.', '').length <= 28,
    'Số không hợp lệ hoặc quá độ chính xác',
    422,
    'INVALID_NUMBER',
  );
  let [whole, fraction = ''] = s.split('.');
  whole = BigInt(whole).toString();
  fraction = fraction.replace(/0+$/, '');
  need(!integer || !fraction, 'Số lượng phải là số nguyên', 422, 'INVALID_NUMBER');
  if (integer)
    need(BigInt(whole) <= 9007199254740991n, 'Số đếm vượt giới hạn', 422, 'INVALID_NUMBER');
  return whole + (fraction ? '.' + fraction : '');
}
export function sourceDate(value: any, time = false) {
  if (value instanceof Date) {
    need(!time, 'Cần xác nhận múi giờ nguồn', 422, 'INVALID_DATE');
    return value.toISOString().slice(0, 10);
  }
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  let date: string;
  if (m) date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  else {
    need(/^\d{4}-\d{2}-\d{2}$/.test(s), 'Ngày thiếu năm hoặc sai định dạng', 422, 'INVALID_DATE');
    date = s;
  }
  const parsed = new Date(date + 'T00:00:00Z');
  need(
    Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date,
    'Ngày không tồn tại',
    422,
    'INVALID_DATE',
  );
  if (!time) return date;
  need(
    m && m[4] !== undefined && +m[4] < 24 && +m[5] < 60 && +(m[6] || 0) < 60,
    'Cần giờ nguồn đầy đủ',
    422,
    'INVALID_DATE',
  );
  return new Date(`${date}T${m[4].padStart(2, '0')}:${m[5]}:${m[6] || '00'}+07:00`).toISOString();
}
export async function readSource(bytes: Buffer, filename: string) {
  need(
    bytes.length > 0 && bytes.length <= 25 * 1024 * 1024,
    'Tệp rỗng hoặc vượt 25 MiB',
    422,
    'FILE_TOO_LARGE',
  );
  need(/\.(xlsx|csv)$/i.test(filename), 'Chỉ nhận XLSX/CSV', 422, 'FILE_TYPE');
  const wb = new ExcelJS.Workbook();
  try {
    if (/\.xlsx$/i.test(filename)) {
      safeWorkbook(bytes);
      const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
      for (const [name, file] of Object.entries(zip.files)) {
        need(
          !/vbaProject|externalLinks|encryptedPackage/i.test(name),
          'Xuất lại file chỉ có giá trị, không macro/liên kết ngoài',
          422,
          'REQUIRE_VALUES_EXPORT',
        );
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
          let xml = await file.async('string');
          // The original returns workbook repeats row elements. Merge by actual
          // cell address, not element position, before ExcelJS parses the sheet.
          const grouped = new Map<number, Map<string, string>>();
          for (const row of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
            const n = +row[1];
            const cells = grouped.get(n) || new Map<string, string>();
            for (const cell of row[2].matchAll(
              /<c\b[^>]*r="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g,
            )) {
              need(!cells.has(cell[1]), 'Trùng địa chỉ ô nguồn', 422, 'DUPLICATE_ENTITY_KEY');
              cells.set(cell[1], cell[0]);
            }
            grouped.set(n, cells);
          }
          if (grouped.size)
            xml = xml.replace(
              /<sheetData(?:\s[^>]*)?>[\s\S]*?<\/sheetData>/,
              `<sheetData>${[...grouped]
                .sort((a, b) => a[0] - b[0])
                .map(([n, cells]) => `<row r="${n}">${[...cells.values()].join('')}</row>`)
                .join('')}</sheetData>`,
            );
          zip.file(name, xml);
        }
      }
      await wb.xlsx.load((await zip.generateAsync({ type: 'nodebuffer' })) as any);
    } else {
      need(!bytes.includes(0), 'CSV không hợp lệ', 422, 'FILE_TYPE');
      await wb.csv.read(Readable.from([bytes]));
    }
  } catch (e: any) {
    need(
      false,
      e.status ? e.message : 'Không đọc được XLSX/CSV; xuất lại file không mật khẩu',
      422,
      e.status ? e.code : 'FILE_TYPE',
    );
  }
  const sheets = [];
  for (const ws of wb.worksheets) {
    need(
      ws.rowCount <= 10000 && ws.columnCount <= 100,
      'Nguồn vượt 10.000 dòng/100 cột',
      422,
      'FILE_TOO_LARGE',
    );
    const data: any[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const r: any[] = [];
      for (let i = 1; i <= ws.columnCount; i++) {
        const cell = row.getCell(i),
          v = cell.value;
        r.push(
          v instanceof Date
            ? { date: v.toISOString().slice(0, 10) }
            : typeof v === 'object' && v
              ? 'formula' in v || 'sharedFormula' in v
                ? { formula: true }
                : cell.text
              : v,
        );
      }
      data[row.number - 1] = r;
    });
    sheets.push({ name: ws.name, rows: data });
  }
  return sheets;
}
export function parseSource(
  sheets: any[],
  adapterCode: string,
  options: any,
  period: { start: string; end: string; basis: string; currency?: string },
) {
  const adapter = adapters.find((a) => a.code === adapterCode);
  need(adapter, 'Loại nguồn không hợp lệ', 422, 'WRONG_REPORT_TYPE');
  const errors: any[] = [],
    facts: any[] = [],
    matches: any[] = [];
  const error = (code: string, row: number, column: string, message: string) =>
    errors.push({
      code,
      severity: 'BLOCKING',
      sheet: options.sheet || null,
      row,
      column,
      raw_value_redacted: null,
      message_vi: message,
      action:
        'Kiểm tra nguồn, loại báo cáo, cột và xác nhận metadata; xuất lại dữ liệu gốc nếu cần.',
    });
  for (const s of sheets)
    for (let r = 0; r < Math.min(5, s.rows.length); r++) {
      const headers = (s.rows[r] || []).map(normalize);
      if (
        adapter.columns
          .filter((col: any) => col.required)
          .every((col: any) => headers.includes(normalize(col.header)))
      )
        matches.push({ sheet: s, row: r + 1, headers });
    }
  const chosen = matches.filter(
    (m) =>
      (!options.sheet || m.sheet.name === options.sheet) &&
      (!options.header_row || m.row === options.header_row),
  );
  if (chosen.length !== 1) {
    error(
      chosen.length > 1 ? 'SHEET_REQUIRED' : 'MISSING_COLUMN',
      options.header_row || adapter.header_row_hint,
      '',
      chosen.length > 1
        ? 'Nhiều sheet khớp; chọn sheet.'
        : 'Thiếu cột bắt buộc hoặc sai loại báo cáo.',
    );
    return {
      facts,
      errors,
      sheets: matches.map((m) => ({ sheet: m.sheet.name, header_row: m.row })),
    };
  }
  const { sheet, row: header, headers } = chosen[0];
  options = { ...options, sheet: sheet.name };
  if (['TIKTOK_SALES', 'SHOPEE_SALES'].includes(adapterCode)) {
    const preamble = sheet.rows
      .slice(0, header - 1)
      .flat()
      .join(' ');
    const range = preamble.match(/thời gian:\s*(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})/i);
    if (range && (range[1] !== period.start || range[2] !== period.end))
      error(
        'PERIOD_MISMATCH',
        1,
        'thời gian',
        'Kỳ đã chọn không khớp kỳ xuất ghi trong nội dung file',
      );
    const currency = preamble.match(/Tiền tệ:\s*([A-Z]{3})/i);
    if (currency && period.currency && currency[1].toUpperCase() !== period.currency)
      error('CURRENCY_MISMATCH', 1, 'Tiền tệ', 'Tiền tệ không khớp đơn vị nguồn');
  }
  const map = Object.fromEntries(
    adapter.columns.map((col: any) => [col.target, headers.indexOf(normalize(col.header))]),
  );
  const keys = new Set<string>();
  for (let i = header; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i] || [];
    if (!raw.some((v: any) => v !== null && v !== undefined && v !== '')) continue;
    // Skip only the adapter's documented description row, recognized by its
    // explanatory text in required numeric cells (never skip an arbitrary row).
    if (
      i === header &&
      adapter.data_start_hint === 3 &&
      header === 1 &&
      adapter.columns.some(
        (col: any) =>
          ['DECIMAL', 'INTEGER'].includes(col.type) &&
          /tổng|total|số lượng|number|doanh|gmv|amount|giá trị|estimated|commission/i.test(
            String(raw[map[col.target]] || ''),
          ),
      )
    )
      continue;
    const fact: any = { source_row: i + 1 };
    let valid = true;
    for (const col of adapter.columns) {
      let val = map[col.target] < 0 ? null : raw[map[col.target]];
      try {
        if (val && typeof val === 'object' && val.formula)
          need(
            false,
            'Cột nguồn chứa công thức; cần file chỉ có giá trị',
            422,
            'REQUIRE_VALUES_EXPORT',
          );
        if (val === null || val === undefined || val === '') {
          need(!col.required, 'Thiếu dữ liệu bắt buộc', 422, 'INVALID_NUMBER');
          fact[col.target] = null;
          continue;
        }
        if (col.type === 'TEXT') {
          need(
            ['string', 'number'].includes(typeof val),
            'Cột text/ID có kiểu dữ liệu không hợp lệ',
            422,
            'ID_PRECISION_LOSS',
          );
          if (/_id$/.test(col.target) && typeof val === 'number')
            need(
              Number.isSafeInteger(val) && String(val).length <= 15,
              'ID đã mất độ chính xác; xuất ID kiểu text',
              422,
              'ID_PRECISION_LOSS',
            );
          fact[col.target] = String(val).trim();
        } else if (col.type === 'INTEGER' || col.type === 'DECIMAL')
          fact[col.target] = sourceNumber(
            val,
            options.source_context.number_locale,
            col.type === 'INTEGER',
          );
        else {
          if (val && typeof val === 'object' && val.date) {
            need(
              col.type === 'DATE_DMY',
              'Serial datetime cần xuất text để xác nhận múi giờ',
              422,
              'INVALID_DATE',
            );
            val = val.date;
          }
          fact[col.target] = sourceDate(val, col.type === 'DATETIME_DMY_VN');
        }
      } catch (e: any) {
        valid = false;
        error(e.code || 'INVALID_NUMBER', i + 1, col.header, e.message);
      }
    }
    if (!valid) continue;
    if (adapterCode.endsWith('_SALES') && adapterCode !== 'KOC_SALES') {
      fact.business_date = fact.date;
      delete fact.date;
      if (fact.business_date < period.start || fact.business_date > period.end) {
        error('PERIOD_MISMATCH', i + 1, 'Ngày', 'Ngày nguồn ngoài kỳ đã chọn');
        continue;
      }
    }
    if (adapterCode === 'KOC_SALES') {
      fact.creator_name_raw = fact.creator_key;
      fact.creator_key = normalize(fact.creator_key);
    }
    if (adapterCode === 'TIKTOK_RETURNS') {
      fact.normalized_type = adapter.known_status_map[fact.type_raw + '|' + fact.status_raw];
      if (!fact.normalized_type) {
        error('UNMAPPED_STATUS', i + 1, 'Order Status', 'Chưa có mẫu xác minh loại/trạng thái này');
        continue;
      }
      const d =
        period.basis === 'DATE_CANCELLED' ? fact.cancelled_at_source : fact.created_at_source;
      const businessDate = d ? localDate(new Date(d)) : null;
      if (!businessDate || businessDate < period.start || businessDate > period.end) {
        error('PERIOD_MISMATCH', i + 1, 'Created Time', 'Ngày theo basis ngoài kỳ');
        continue;
      }
    }
    const key = fact.business_date || fact.creator_key || fact.url;
    if (key && keys.has(key)) {
      error('DUPLICATE_ENTITY_KEY', i + 1, '', 'Trùng thực thể trong cùng nguồn');
      continue;
    }
    if (key) keys.add(key);
    facts.push(fact);
  }
  if (!facts.length && !errors.length) error('EMPTY_FILE', header, '', 'Không có dòng dữ liệu');
  if (adapterCode === 'TIKTOK_RETURNS') {
    const orders = new Map<string, any>();
    for (const f of facts) {
      const prev = orders.get(f.order_id);
      if (
        prev &&
        ['order_amount', 'refund_amount', 'status_raw', 'type_raw'].some((k) => prev[k] !== f[k])
      )
        error(
          'ORDER_LEVEL_AMOUNT_CONFLICT',
          f.source_row,
          'Order Amount',
          'Các dòng cùng đơn có thông tin cấp đơn mâu thuẫn',
        );
      else orders.set(f.order_id, f);
    }
  }
  const canonical = facts
    .map(({ source_row, ...f }) => f)
    .sort((a, b) => canonicalJSON(a).localeCompare(canonicalJSON(b)));
  return {
    facts,
    errors,
    sheet: sheet.name,
    header_row: header,
    canonical_hash: hash(canonicalJSON(canonical)),
    valid_rows: facts.length,
  };
}
