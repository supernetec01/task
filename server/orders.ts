import { z } from 'zod';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import type { API } from './app.js';
import {
  type DB,
  type Actor,
  rows,
  one,
  need,
  hasJob,
  isAdmin,
  localDate,
  version,
} from './base.js';
import { isBoss } from './handoff-access.js';
import { safeWorkbook } from './metrics.js';

export const orderStatuses = {
  CREATED: 'Đã tạo đơn',
  PICKED_UP: 'Đã lấy hàng',
  IN_TRANSIT: 'Đang vận chuyển',
  OUT_FOR_DELIVERY: 'Đang giao hàng',
  DELIVERY_FAILED: 'Giao không thành công',
  DELIVERED: 'Giao thành công',
  RETURNING: 'Đang hoàn hàng',
  RETURNED: 'Đã trả về',
  CANCELLED: 'Đã hủy',
};
export const canReadOrders = (a: Actor) => isAdmin(a) || isBoss(a) || hasJob(a, 'MARKETPLACE');
export const canWriteOrders = (a: Actor) => isAdmin(a) || hasJob(a, 'MARKETPLACE');
const status = z.enum(
  Object.keys(orderStatuses) as [keyof typeof orderStatuses, ...Array<keyof typeof orderStatuses>],
);
const text = (max = 255) => z.string().trim().min(1).max(max);
const day = z.iso.date();
const optionalDay = day.nullable().default(null);
const money = z
  .number()
  .nonnegative()
  .max(999999999999)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.01,
    'Số tiền tối đa 2 chữ số thập phân',
  );
const inputSchema = z
  .object({
    order_code: text(100),
    carrier: text(80).default('SPX'),
    tracking_number: z.string().trim().max(150).nullable().default(null),
    kind: z.enum(['CUSTOMER', 'KOC']),
    recipient_name: text(150),
    phone: text(40),
    city: text(150),
    ward: text(150),
    address: text(500),
    status: status.default('CREATED'),
    shipping_cost: money.default(0),
    revenue: money.default(0),
    order_date: day,
    shipped_on: optionalDay,
    delivered_on: optionalDay,
    note: z.string().trim().max(3000).default(''),
    items: z
      .array(
        z.object({ sku_id: z.uuid(), quantity: z.number().int().positive().max(1000000) }).strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export function validateOrder(v: z.infer<typeof inputSchema>, today = localDate()) {
  need(v.order_date <= today, 'Ngày tạo đơn không được ở tương lai', 422, 'VALIDATION');
  for (const d of [v.shipped_on, v.delivered_on])
    if (d)
      need(
        d >= v.order_date && d <= today,
        'Ngày gửi / giao phải từ ngày tạo đơn đến hôm nay',
        422,
        'VALIDATION',
      );
  need(
    !v.shipped_on || !v.delivered_on || v.delivered_on >= v.shipped_on,
    'Ngày giao không thể trước ngày gửi',
    422,
    'VALIDATION',
  );
  need(
    v.status !== 'DELIVERED' || v.delivered_on,
    'Cần ngày giao thành công thực tế',
    422,
    'VALIDATION',
  );
  need(v.kind !== 'KOC' || v.revenue === 0, 'Đơn mẫu KOC không ghi doanh thu', 422, 'VALIDATION');
  need(
    new Set(v.items.map((i) => i.sku_id)).size === v.items.length,
    'Mỗi SKU chỉ xuất hiện một lần trong đơn',
    422,
    'VALIDATION',
  );
}
export function addDays(d: string, n: number) {
  return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}
export function videoState(o: any, today = localDate()) {
  if (o.kind !== 'KOC') return 'NOT_APPLICABLE';
  if (['RETURNING', 'RETURNED', 'CANCELLED'].includes(o.status)) return 'STOPPED';
  if (o.video_url) return 'COMPLETED';
  if (o.status !== 'DELIVERED' || !o.delivered_on) return 'WAITING_DELIVERY';
  if (today >= addDays(o.delivered_on, 15)) return 'WARNING_2';
  if (today >= addDays(o.delivered_on, 7)) return 'WARNING_1';
  return 'WAITING_VIDEO';
}
const view = (o: any) => ({
  ...o,
  video_state: videoState(o),
  video_due_on: o.kind === 'KOC' && o.delivered_on ? addDays(o.delivered_on, 15) : null,
  first_reminder_on: o.kind === 'KOC' && o.delivered_on ? addDays(o.delivered_on, 7) : null,
});
const selectOrders = `SELECT o.*,u.name AS responsible_name,u.username AS responsible_username,e.employee_code,
  maker.username AS creator_username,imp.filename AS import_filename,imp.uploaded_at,up.username AS uploader_username,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('sku_id',s.id,'sku',s.code,'sku_name',s.name,'product_code',p.code,'product_name',p.name,'quantity',i.quantity) ORDER BY p.code,s.code)
    FROM shipping_order_items i JOIN shipping_skus s ON s.id=i.sku_id JOIN shipping_products p ON p.id=s.product_id WHERE i.order_id=o.id),'[]'::jsonb) AS items
 FROM shipping_orders o JOIN users u ON u.id=o.responsible_id JOIN users maker ON maker.id=o.created_by
 LEFT JOIN employee_profiles e ON e.user_id=u.id LEFT JOIN order_imports imp ON imp.id=o.last_import_id LEFT JOIN users up ON up.id=imp.uploaded_by`;
export async function orderDetail(c: DB, a: Actor, id: string) {
  need(canReadOrders(a));
  const o = await one(c, selectOrders + ' WHERE o.id=$1', [z.uuid().parse(id)]);
  need(o, 'Không tìm thấy đơn hàng', 404, 'NOT_FOUND');
  return view(o);
}
async function event(c: DB, a: Actor, o: any, before: any, type: string) {
  await c.query(
    'INSERT INTO shipping_order_events(order_id,actor_id,event_type,before_data,after_data) VALUES($1,$2,$3,$4,$5)',
    [o.id, a.id, type, before ? JSON.stringify(before) : null, JSON.stringify(o)],
  );
}
export async function saveOrder(
  c: DB,
  a: Actor,
  input: unknown,
  id?: string,
  expected?: number,
  importId?: string,
) {
  need(canWriteOrders(a));
  const v = inputSchema.parse(input);
  validateOrder(v);
  const sku = await rows(c, 'SELECT id FROM shipping_skus WHERE id=ANY($1::uuid[])', [
    v.items.map((i) => i.sku_id),
  ]);
  need(
    sku.length === v.items.length,
    'SKU không tồn tại. Hãy tạo sản phẩm / SKU trước.',
    422,
    'UNKNOWN_SKU',
  );
  let before: any;
  if (id) {
    before = await orderDetail(c, a, id);
    const locked = await one(c, 'SELECT version FROM shipping_orders WHERE id=$1 FOR UPDATE', [id]);
    version(locked, expected);
    need(
      !before.video_published_on || (v.delivered_on && before.video_published_on >= v.delivered_on),
      'Ngày nhận thực tế phải trước hoặc bằng ngày đăng video đã lưu',
      422,
      'VALIDATION',
    );
    need(
      before.kind === v.kind || !before.video_url,
      'Không đổi loại đơn đã có video',
      422,
      'VALIDATION',
    );
  }
  const data: any = {
    ...v,
    tracking_number: v.tracking_number || null,
    collected_on: v.kind === 'CUSTOMER' && v.status === 'DELIVERED' ? v.delivered_on : null,
  };
  delete data.items;
  const keys = Object.keys(data),
    values = Object.values(data);
  let o: any;
  if (id) {
    o = await one(
      c,
      `UPDATE shipping_orders SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')},last_import_id=COALESCE($${keys.length + 2},last_import_id),version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
      [id, ...values, importId || null],
    );
    await c.query('DELETE FROM shipping_order_items WHERE order_id=$1', [id]);
  } else {
    o = await one(
      c,
      `INSERT INTO shipping_orders(${keys.join(',')},responsible_id,created_by,import_id,last_import_id) VALUES(${[...keys, 'responsible_id', 'created_by', 'import_id', 'last_import_id'].map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      [...values, a.id, a.id, importId || null, importId || null],
    );
  }
  for (const i of v.items)
    await c.query('INSERT INTO shipping_order_items(order_id,sku_id,quantity) VALUES($1,$2,$3)', [
      o.id,
      i.sku_id,
      i.quantity,
    ]);
  o = await orderDetail(c, a, o.id);
  await event(c, a, o, before, importId ? 'IMPORT' : id ? 'UPDATED' : 'CREATED');
  // Pending reminders are cancelled immediately on video, cancellation or return.
  await clearInactiveReminders(c, o);
  return o;
}
async function clearInactiveReminders(c: DB, o: any) {
  const active = o.kind === 'KOC' && o.status === 'DELIVERED' && !o.video_url;
  const currentKey = `koc-video:${o.id}:${o.delivered_on}:%`;
  await c.query(
    "DELETE FROM outbox WHERE object_id=$1 AND event_type LIKE 'KOC_VIDEO_%' AND processed_at IS NULL AND (NOT $2 OR event_key NOT LIKE $3)",
    [o.id, active, currentKey],
  );
  await c.query(
    "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE object_id=$1 AND event_type LIKE 'KOC_VIDEO_%' AND (NOT $2 OR event_key NOT LIKE $3)",
    [o.id, active, currentKey],
  );
}
export async function orderReminders(c: DB, today = localDate()) {
  const orders = await rows(
    c,
    `SELECT o.* FROM shipping_orders o JOIN users u ON u.id=o.responsible_id
    WHERE u.active AND o.kind='KOC' AND o.status='DELIVERED' AND o.video_url='' AND o.delivered_on<=$1::date-7
    AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now())
      AND ((g.kind='JOB' AND g.role='MARKETPLACE' AND g.scope='SELF') OR (g.kind='ACCESS' AND g.role='ADMIN' AND g.scope='ALL'))) FOR SHARE OF o`,
    [today],
  );
  for (const o of orders) {
    // A late import receives only the most urgent applicable reminder, not both at once.
    const days = today >= addDays(o.delivered_on, 15) ? 15 : 7;
    const level = days === 15 ? 2 : 1;
    if (level === 2)
      await c.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE object_id=$1 AND event_type='KOC_VIDEO_1'",
        [o.id],
      );
    await c.query(
      `INSERT INTO outbox(user_id,event_key,message,object_id,object_type,event_type,action_path)
      VALUES($1,$2,$3,$4,'shipping_order',$5,$6) ON CONFLICT DO NOTHING`,
      [
        o.responsible_id,
        `koc-video:${o.id}:${o.delivered_on}:${days}`,
        `Nhắc lần ${level} · Đơn ${o.order_code} / ${o.recipient_name}: đã nhận hàng ${o.delivered_on}, chưa ghi nhận video. Hạn đăng ${addDays(o.delivered_on, 15)}.`,
        o.id,
        `KOC_VIDEO_${level}`,
        `/orders/${o.id}`,
      ],
    );
  }
}
const querySchema = z
  .object({
    search: z.string().max(200).default(''),
    kind: z.enum(['', 'KOC', 'CUSTOMER']).default(''),
    status: z.union([z.literal(''), status]).default(''),
    video: z.string().max(30).default(''),
    from: z.union([z.literal(''), day]).default(''),
    to: z.union([z.literal(''), day]).default(''),
    page: z.coerce.number().int().min(0).default(0),
  })
  .strict();
async function filtered(c: DB, a: Actor, q: any) {
  need(canReadOrders(a));
  const v = querySchema.parse(q);
  const all = await rows(
    c,
    selectOrders +
      ` WHERE ($1='' OR o.order_code ILIKE '%'||$1||'%' OR o.tracking_number ILIKE '%'||$1||'%' OR o.recipient_name ILIKE '%'||$1||'%' OR o.phone ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%' OR EXISTS(SELECT 1 FROM shipping_order_items i JOIN shipping_skus s ON s.id=i.sku_id WHERE i.order_id=o.id AND s.code ILIKE '%'||$1||'%'))
    AND ($2='' OR o.kind=$2) AND ($3='' OR o.status=$3) AND ($4='' OR o.order_date>=NULLIF($4,'')::date) AND ($5='' OR o.order_date<=NULLIF($5,'')::date) ORDER BY o.order_date DESC,o.created_at DESC,o.id`,
    [v.search, v.kind, v.status, v.from, v.to],
  );
  const items = all.map(view).filter((o) => !v.video || o.video_state === v.video);
  return { items, v };
}
export const periodSchema = z.object({
  range: z.enum(['WEEK', 'MONTH']).default('WEEK'),
  date: day,
});
export function orderPeriod(q: unknown) {
  const v = periodSchema.parse(q),
    d = new Date(v.date + 'T00:00:00Z');
  let from: string, to: string, previousFrom: string, previousTo: string;
  if (v.range === 'WEEK') {
    from = addDays(v.date, -((d.getUTCDay() + 6) % 7));
    to = addDays(from, 7);
    previousFrom = addDays(from, -7);
    previousTo = from;
  } else {
    from = v.date.slice(0, 7) + '-01';
    to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    previousFrom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 10);
    previousTo = from;
  }
  return { from, to, previousFrom, previousTo };
}
async function summary(c: DB, a: Actor, q: any) {
  need(canReadOrders(a));
  const p = orderPeriod(q);
  async function aggregate(from: string, to: string) {
    const totals = await one(
      c,
      `SELECT count(*)::int AS total,count(*) FILTER(WHERE kind='CUSTOMER')::int AS customer,count(*) FILTER(WHERE kind='KOC')::int AS koc,
      COALESCE(sum(shipping_cost),0)::text AS shipping_cost,count(*) FILTER(WHERE status='DELIVERED')::int AS delivered,
      count(*) FILTER(WHERE status IN ('RETURNING','RETURNED'))::int AS returned FROM shipping_orders WHERE order_date >=$1 AND order_date<$2`,
      [from, to],
    );
    const collected = await one(
      c,
      `SELECT COALESCE(sum(revenue),0)::text AS revenue FROM shipping_orders WHERE kind='CUSTOMER' AND status='DELIVERED' AND collected_on>=$1 AND collected_on<$2`,
      [from, to],
    );
    const goods = await rows(
      c,
      `SELECT p.code AS product_code,p.name AS product_name,s.code AS sku,s.name AS sku_name,
      sum(i.quantity)::int AS quantity,sum(i.quantity) FILTER(WHERE o.kind='KOC')::int AS koc_quantity,
      sum(i.quantity) FILTER(WHERE o.kind='CUSTOMER')::int AS customer_quantity
      FROM shipping_order_items i JOIN shipping_orders o ON o.id=i.order_id JOIN shipping_skus s ON s.id=i.sku_id JOIN shipping_products p ON p.id=s.product_id
      WHERE o.order_date>=$1 AND o.order_date<$2 AND (o.shipped_on IS NOT NULL OR o.status NOT IN ('CREATED','CANCELLED')) AND o.status<>'CANCELLED' GROUP BY p.code,p.name,s.code,s.name ORDER BY quantity DESC,s.code`,
      [from, to],
    );
    return { ...totals, ...collected, units: goods.reduce((n, g) => n + g.quantity, 0), goods };
  }
  const koc = await rows(c, "SELECT * FROM shipping_orders WHERE kind='KOC'");
  const video_counts: Record<string, number> = {};
  for (const o of koc) {
    const s = videoState(o);
    video_counts[s] = (video_counts[s] || 0) + 1;
  }
  return {
    ...p,
    current: await aggregate(p.from, p.to),
    previous: await aggregate(p.previousFrom, p.previousTo),
    video_counts,
  };
}
const importFields = {
  order_code: 'Mã đơn hàng',
  tracking_number: 'Mã vận đơn',
  kind: 'Loại đơn (KOC/CUSTOMER)',
  recipient_name: 'Tên người nhận',
  phone: 'Số điện thoại',
  city: 'Tỉnh / Thành phố',
  ward: 'Phường / Xã',
  address: 'Số nhà / Đường',
  sku: 'SKU',
  quantity: 'Số lượng',
  shipping_cost: 'Chi phí giao hàng',
  revenue: 'Doanh thu',
  order_date: 'Ngày tạo đơn',
  shipped_on: 'Ngày gửi hàng',
  delivered_on: 'Ngày giao thành công',
  status: 'Trạng thái',
  note: 'Ghi chú',
};
const requiredFields = [
  'order_code',
  'recipient_name',
  'phone',
  'city',
  'ward',
  'address',
  'sku',
  'quantity',
  'shipping_cost',
  'revenue',
  'order_date',
  'status',
];
async function importAccess(c: DB, a: Actor, id: string, write = false) {
  need(write ? canWriteOrders(a) : canReadOrders(a));
  const b = await one(c, 'SELECT * FROM order_imports WHERE id=$1' + (write ? ' FOR UPDATE' : ''), [
    z.uuid().parse(id),
  ]);
  need(b, 'Không tìm thấy lần nhập', 404, 'NOT_FOUND');
  return b;
}
function columnValues(source: any[], headers: string[]) {
  return headers.map((_, index) =>
    [...new Set<string>(source.map((r) => r.data[index]))].slice(0, 100),
  );
}
function cellValue(v: any): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  need(
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    'File có công thức hoặc ô phức tạp. Hãy xuất dữ liệu dạng giá trị.',
    422,
    'FILE_CELL',
  );
  return String(v).trim();
}
export function importDate(raw: string, format: string, required = false): string | null {
  if (!raw) {
    need(!required, 'Thiếu ngày', 422, 'VALIDATION');
    return null;
  }
  let result = raw;
  if (format === 'DMY' && /^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}(?:\s.*)?$/.test(raw)) {
    const [d, m, y] = raw.split(/[/.\-\s]/);
    result = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  day.parse(result);
  return result;
}
function importMoney(raw: string, format: string) {
  need(raw !== '', 'Thiếu số tiền', 422, 'VALIDATION');
  const normalized =
    format === 'VI' ? raw.replaceAll('.', '').replace(',', '.') : raw.replaceAll(',', '');
  need(/^\d+(\.\d{1,2})?$/.test(normalized), 'Định dạng số tiền không đúng', 422, 'VALIDATION');
  return money.parse(Number(normalized));
}
export function orderRoutes(api: API) {
  api('GET', '/orders/meta', async (c, a) => {
    need(canReadOrders(a));
    return {
      can_write: canWriteOrders(a),
      statuses: orderStatuses,
      import_fields: importFields,
      required_fields: requiredFields,
      identity: await one(
        c,
        'SELECT u.id,u.name,u.username,e.employee_code FROM users u LEFT JOIN employee_profiles e ON e.user_id=u.id WHERE u.id=$1',
        [a.id],
      ),
    };
  });
  api('GET', '/shipping-products', async (c, a) => {
    need(canReadOrders(a));
    return {
      items: await rows(
        c,
        `SELECT p.*,COALESCE((SELECT jsonb_agg(s ORDER BY s.code) FROM shipping_skus s WHERE s.product_id=p.id),'[]'::jsonb) AS skus FROM shipping_products p ORDER BY p.name,p.code`,
      ),
    };
  });
  const productInput = z
    .object({
      code: text(100),
      name: text(200),
      skus: z
        .array(
          z
            .object({
              id: z.uuid().optional(),
              code: text(100),
              name: z.string().trim().max(150).default(''),
            })
            .strict(),
        )
        .min(1)
        .max(100),
      expected_version: z.number().int().optional(),
    })
    .strict();
  async function saveProduct(c: DB, a: Actor, b: any, id?: string) {
    need(canWriteOrders(a));
    const v = productInput.parse(b);
    need(
      new Set(v.skus.map((s) => s.code.toLowerCase())).size === v.skus.length,
      'SKU bị lặp',
      422,
      'VALIDATION',
    );
    if (id) {
      const old = await one(c, 'SELECT * FROM shipping_products WHERE id=$1 FOR UPDATE', [id]);
      need(old, 'Không tìm thấy sản phẩm', 404, 'NOT_FOUND');
      version(old, v.expected_version);
      await c.query('UPDATE shipping_products SET code=$2,name=$3,version=version+1 WHERE id=$1', [
        id,
        v.code,
        v.name,
      ]);
    } else
      id = (
        await one(
          c,
          'INSERT INTO shipping_products(code,name,created_by) VALUES($1,$2,$3) RETURNING id',
          [v.code, v.name, a.id],
        )
      ).id;
    for (const s of v.skus) {
      if (s.id) {
        const old = await one(c, 'SELECT id FROM shipping_skus WHERE id=$1 AND product_id=$2', [
          s.id,
          id,
        ]);
        need(old, 'SKU không thuộc sản phẩm', 422, 'VALIDATION');
        await c.query('UPDATE shipping_skus SET code=$2,name=$3 WHERE id=$1', [
          s.id,
          s.code,
          s.name,
        ]);
      } else
        await c.query('INSERT INTO shipping_skus(product_id,code,name) VALUES($1,$2,$3)', [
          id,
          s.code,
          s.name,
        ]);
    }
    return { id };
  }
  api('POST', '/shipping-products', async (c, a, b) => saveProduct(c, a, b));
  api('PATCH', '/shipping-products/:id', async (c, a, b, q, p) => saveProduct(c, a, b, p.id));
  api('GET', '/orders/summary', async (c, a, b, q) => summary(c, a, q));
  api('GET', '/orders', async (c, a, b, q) => {
    const { items, v } = await filtered(c, a, q);
    return {
      items: items.slice(v.page * 50, (v.page + 1) * 50),
      total: items.length,
      page: v.page,
    };
  });
  api('POST', '/orders', async (c, a, b) => saveOrder(c, a, b));
  api('GET', '/orders/export', async (c, a, b, q, p, reply) => {
    const { items } = await filtered(c, a, q);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Đơn hàng');
    sheet.addRow([
      'Mã đơn',
      'Loại',
      'Người nhận',
      'Điện thoại',
      'Tỉnh / TP',
      'Phường / Xã',
      'Địa chỉ',
      'ĐVVC',
      'Vận đơn',
      'SKU',
      'Số lượng',
      'Chi phí giao hàng (cấp đơn)',
      'Doanh thu (cấp đơn)',
      'Ngày tạo đơn',
      'Ngày gửi',
      'Ngày nhận thực tế',
      'Ngày thu tiền',
      'Trạng thái',
      'Ngày hạn video',
      'Link video',
      'Ngày đăng video',
      'Phụ trách',
      'Mã nhân sự',
      'Người tạo',
      'Người nhập gần nhất',
      'File nhập gần nhất',
    ]);
    for (const o of items)
      for (const [index, i] of o.items.entries())
        sheet.addRow([
          o.order_code,
          o.kind,
          o.recipient_name,
          o.phone,
          o.city,
          o.ward,
          o.address,
          o.carrier,
          o.tracking_number,
          i.sku,
          i.quantity,
          index === 0 ? Number(o.shipping_cost) : null,
          index === 0 ? Number(o.revenue) : null,
          o.order_date,
          o.shipped_on,
          o.delivered_on,
          o.collected_on,
          orderStatuses[o.status as keyof typeof orderStatuses],
          o.video_due_on,
          o.video_url,
          o.video_published_on,
          o.responsible_username,
          o.employee_code,
          o.creator_username,
          o.uploader_username,
          o.import_filename,
        ]);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((col) => (col.width = 22));
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="SuperNet-orders.xlsx"');
    return Buffer.from(await wb.xlsx.writeBuffer());
  });
  api('GET', '/orders/report-export', async (c, a, b, q, p, reply) => {
    const s = await summary(c, a, q),
      wb = new ExcelJS.Workbook(),
      w = wb.addWorksheet('Báo cáo');
    w.addRow([
      'Chỉ tiêu',
      `${s.from} – ${addDays(s.to, -1)}`,
      `${s.previousFrom} – ${addDays(s.previousTo, -1)}`,
    ]);
    for (const [k, label] of Object.entries({
      total: 'Số đơn theo ngày tạo',
      customer: 'Đơn khách hàng',
      koc: 'Đơn KOC',
      shipping_cost: 'Chi phí theo ngày tạo',
      revenue: 'Doanh thu theo ngày thu tiền',
      units: 'Số hàng đã gửi (theo ngày tạo đơn)',
    }))
      w.addRow([label, Number(s.current[k]), Number(s.previous[k])]);
    const goods = wb.addWorksheet('Hàng hóa đã gửi');
    goods.addRow(['Mã SP', 'Tên SP', 'SKU', 'Tên SKU', 'Số lượng', 'Khách hàng', 'KOC']);
    for (const g of s.current.goods)
      goods.addRow([
        g.product_code,
        g.product_name,
        g.sku,
        g.sku_name,
        g.quantity,
        g.customer_quantity || 0,
        g.koc_quantity || 0,
      ]);
    for (const sh of wb.worksheets) {
      sh.getRow(1).font = { bold: true };
      sh.columns.forEach((col) => (col.width = 30));
    }
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="SuperNet-order-report.xlsx"');
    return Buffer.from(await wb.xlsx.writeBuffer());
  });
  api('GET', '/orders/:id', async (c, a, b, q, p) => ({
    ...(await orderDetail(c, a, p.id)),
    events: await rows(
      c,
      'SELECT e.*,u.username FROM shipping_order_events e JOIN users u ON u.id=e.actor_id WHERE order_id=$1 ORDER BY e.created_at DESC,e.id',
      [p.id],
    ),
  }));
  api('PATCH', '/orders/:id', async (c, a, b, q, p) => {
    const { expected_version, ...data } = b;
    return saveOrder(c, a, data, p.id, z.number().int().parse(expected_version));
  });
  api('POST', '/orders/:id/video', async (c, a, b, q, p) => {
    need(canWriteOrders(a));
    const v = z
      .object({
        url: z
          .url()
          .refine((x) => /^https?:\/\//.test(x))
          .max(2000),
        published_on: day,
        expected_version: z.number().int(),
      })
      .strict()
      .parse(b);
    await c.query('SELECT id FROM shipping_orders WHERE id=$1 FOR UPDATE', [p.id]);
    const before = await orderDetail(c, a, p.id);
    version(before, v.expected_version);
    need(
      before.kind === 'KOC' && before.status === 'DELIVERED',
      'Chỉ ghi nhận video cho đơn KOC đã giao thành công',
      422,
      'STATE',
    );
    need(
      v.published_on >= before.delivered_on && v.published_on <= localDate(),
      'Ngày đăng phải từ ngày nhận hàng đến hôm nay',
      422,
      'VALIDATION',
    );
    await c.query(
      'UPDATE shipping_orders SET video_url=$2,video_published_on=$3,version=version+1,updated_at=now() WHERE id=$1',
      [p.id, v.url, v.published_on],
    );
    const o = await orderDetail(c, a, p.id);
    await event(c, a, o, before, 'VIDEO_PUBLISHED');
    await clearInactiveReminders(c, o);
    return o;
  });
  api('GET', '/order-imports', async (c, a) => {
    need(canReadOrders(a));
    return {
      items: await rows(
        c,
        'SELECT i.id,i.filename,i.uploaded_at,i.status,i.order_count,i.committed_at,u.username,e.employee_code FROM order_imports i JOIN users u ON u.id=i.uploaded_by LEFT JOIN employee_profiles e ON e.user_id=u.id ORDER BY i.uploaded_at DESC LIMIT 100',
      ),
    };
  });
  api('POST', '/order-imports', async (c, a, b) => {
    need(canWriteOrders(a));
    need(/\.(xlsx|csv)$/i.test(b.filename), 'Chỉ nhận Excel .xlsx hoặc CSV', 422, 'FILE_TYPE');
    const wb = new ExcelJS.Workbook();
    if (/\.xlsx$/i.test(b.filename)) {
      safeWorkbook(b.buffer);
      await wb.xlsx.load(b.buffer);
    } else
      await wb.csv.read(Readable.from([b.buffer]), {
        parserOptions: { delimiter: b.fields?.delimiter === ';' ? ';' : ',' },
      });
    const sh = wb.worksheets[Number(b.fields?.sheet || 0)],
      header = Number(b.fields?.header_row || 1);
    need(
      sh && Number.isInteger(header) && header >= 1 && header <= 20,
      'Trang tính hoặc dòng tiêu đề không hợp lệ',
      422,
      'VALIDATION',
    );
    need(
      sh.rowCount - header <= 5000 && sh.columnCount <= 80,
      'Mỗi file tối đa 5.000 dòng dữ liệu và 80 cột',
      422,
      'FILE_SIZE',
    );
    const headers = Array.from(
        { length: sh.columnCount },
        (_, i) => cellValue(sh.getCell(header, i + 1).value) || `Cột ${i + 1}`,
      ),
      source: any[] = [];
    for (let n = header + 1; n <= sh.rowCount; n++) {
      const data = Array.from({ length: headers.length }, (_, i) =>
        cellValue(sh.getCell(n, i + 1).value),
      );
      if (data.some(Boolean)) source.push({ line: n, data });
    }
    need(source.length, 'File không có dữ liệu', 422, 'VALIDATION');
    const result = await one(
      c,
      'INSERT INTO order_imports(filename,uploaded_by,headers,source_rows) VALUES($1,$2,$3,$4) RETURNING id',
      [b.filename, a.id, JSON.stringify(headers), JSON.stringify(source)],
    );
    return {
      ...result,
      headers,
      sample: source.slice(0, 5),
      column_values: columnValues(source, headers),
      row_count: source.length,
    };
  });
  api('GET', '/order-imports/:id', async (c, a, b, q, p) => {
    const i = await importAccess(c, a, p.id);
    return {
      id: i.id,
      headers: i.headers,
      sample: i.source_rows.slice(0, 5),
      column_values: columnValues(i.source_rows, i.headers),
      row_count: i.source_rows.length,
      status: i.status,
      mapping: i.mapping,
      preview: i.preview,
      preview_token: i.preview_token,
    };
  });
  api('POST', '/order-imports/:id/preview', async (c, a, b, q, p) => {
    const batch = await importAccess(c, a, p.id, true);
    need(batch.status !== 'COMMITTED', 'Lần nhập đã được lưu', 409, 'STATE');
    const conf = z
      .object({
        columns: z.record(
          z.string(),
          z
            .number()
            .int()
            .min(0)
            .max(batch.headers.length - 1),
        ),
        statuses: z.record(z.string(), status),
        default_kind: z.enum(['KOC', 'CUSTOMER']),
        date_format: z.enum(['DMY', 'ISO']),
        money_format: z.enum(['VI', 'EN']),
      })
      .strict()
      .parse(b);
    need(
      requiredFields.every((f) => conf.columns[f] !== undefined),
      'Hãy ghép đầy đủ các cột bắt buộc',
      422,
      'MAPPING',
    );
    const skus = await rows(c, 'SELECT id,code FROM shipping_skus'),
      skuMap = new Map(skus.map((s) => [s.code.toLowerCase(), s.id]));
    const groups = new Map<string, any>(),
      errors: any[] = [];
    for (const row of batch.source_rows) {
      try {
        const read = (f: string) => row.data[conf.columns[f]] ?? '';
        const sku = skuMap.get(read('sku').toLowerCase());
        need(sku, `SKU “${read('sku')}” chưa có trong danh mục`, 422, 'UNKNOWN_SKU');
        need(/^\d+$/.test(read('quantity')), 'Số lượng phải là số nguyên dương', 422, 'VALIDATION');
        const rawStatus = read('status'),
          mapped = conf.statuses[rawStatus];
        need(mapped, `Chưa ghép trạng thái “${rawStatus}”`, 422, 'MAPPING');
        const raw = {
          order_code: read('order_code'),
          carrier: 'SPX',
          tracking_number: read('tracking_number') || null,
          kind: read('kind') || conf.default_kind,
          recipient_name: read('recipient_name'),
          phone: read('phone'),
          city: read('city'),
          ward: read('ward'),
          address: read('address'),
          status: mapped,
          shipping_cost: importMoney(read('shipping_cost'), conf.money_format),
          revenue: importMoney(read('revenue'), conf.money_format),
          order_date: importDate(read('order_date'), conf.date_format, true),
          shipped_on: importDate(read('shipped_on'), conf.date_format),
          delivered_on: importDate(read('delivered_on'), conf.date_format),
          note: read('note'),
          items: [{ sku_id: sku, quantity: Number(read('quantity')) }],
        };
        const v = inputSchema.parse(raw);
        validateOrder(v);
        const key = v.order_code.toLowerCase(),
          group = groups.get(key);
        if (group) {
          const { items: i1, ...a1 } = group.input,
            { items: i2, ...a2 } = v;
          need(
            JSON.stringify(a1) === JSON.stringify(a2),
            'Các dòng cùng mã đơn có thông tin cấp đơn khác nhau',
            422,
            'CONFLICT',
          );
          need(
            !group.input.items.some((i: any) => i.sku_id === sku),
            'Trùng SKU trong cùng đơn; hãy gộp số lượng trước khi nhập',
            422,
            'DUPLICATE',
          );
          group.input.items.push(v.items[0]);
        } else groups.set(key, { input: v, line: row.line });
      } catch (e: any) {
        errors.push({
          line: row.line,
          message:
            e instanceof z.ZodError
              ? e.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ')
              : e.message,
        });
      }
    }
    const orders = [];
    const trackingSeen = new Set<string>();
    for (const g of groups.values()) {
      const validation = inputSchema.safeParse(g.input);
      if (!validation.success) errors.push({ line: g.line, message: 'Một đơn tối đa 100 SKU' });
      if (g.input.tracking_number) {
        const key = g.input.tracking_number.toLowerCase();
        if (trackingSeen.has(key))
          errors.push({ line: g.line, message: 'Mã vận đơn bị dùng cho nhiều đơn trong file' });
        trackingSeen.add(key);
        const other = await one(
          c,
          "SELECT id FROM shipping_orders WHERE lower(carrier)='spx' AND lower(tracking_number)=$1 AND lower(order_code)<>$2",
          [key, g.input.order_code.toLowerCase()],
        );
        if (other) errors.push({ line: g.line, message: 'Mã vận đơn đã thuộc một đơn khác' });
      }
      const old = await one(
        c,
        "SELECT id,version,responsible_id,video_url,kind FROM shipping_orders WHERE lower(carrier)='spx' AND lower(order_code)=$1",
        [g.input.order_code.toLowerCase()],
      );
      if (old && old.kind !== g.input.kind && old.video_url)
        errors.push({ line: g.line, message: 'Không đổi loại đơn đã có video' });
      orders.push({
        ...g,
        existing_id: old?.id || null,
        expected_version: old?.version || null,
        action: old ? 'UPDATE' : 'CREATE',
      });
    }
    const preview = {
        orders,
        errors,
        new_count: orders.filter((o) => !o.existing_id).length,
        update_count: orders.filter((o) => o.existing_id).length,
      },
      token = randomUUID();
    await c.query(
      "UPDATE order_imports SET preview=$2,mapping=$3,preview_token=$4,status='PREVIEWED' WHERE id=$1",
      [batch.id, JSON.stringify(preview), JSON.stringify(conf), token],
    );
    return { ...preview, preview_token: token };
  });
  api('POST', '/order-imports/:id/commit', async (c, a, b, q, p) => {
    const batch = await importAccess(c, a, p.id, true);
    need(
      batch.status === 'PREVIEWED' && batch.preview_token === b.preview_token,
      'Bản xem trước đã thay đổi hoặc đã nhập',
      409,
      'STALE_PREVIEW',
    );
    need(
      batch.preview.errors.length === 0 && batch.preview.orders.length > 0,
      'Cần xử lý hết lỗi trước khi nhập',
      422,
      'IMPORT_ERRORS',
    );
    for (const o of batch.preview.orders)
      await saveOrder(
        c,
        a,
        o.input,
        o.existing_id || undefined,
        o.expected_version || undefined,
        batch.id,
      );
    await c.query(
      "UPDATE order_imports SET status='COMMITTED',committed_at=now(),order_count=$2,source_rows='[]',preview_token=NULL WHERE id=$1",
      [batch.id, batch.preview.orders.length],
    );
    return { count: batch.preview.orders.length };
  });
}
