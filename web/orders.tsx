import React, { useEffect, useState } from 'react';
import { api, fmt, monday } from './api';
import { useLoad, Loaded, Empty, ErrorBox, Form, Modal, Badge } from './ui';
import './orders.css';

const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const date = (d: string | null) =>
  d ? new Date(d + 'T00:00:00Z').toLocaleDateString('vi-VN', { timeZone: 'UTC' }) : '—';
const money = (v: any) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
const videoLabels: Record<string, string> = {
  WAITING_DELIVERY: 'Chờ nhận hàng',
  WAITING_VIDEO: 'Chờ đăng video',
  WARNING_1: 'Nhắc lần 1 · 7 ngày',
  WARNING_2: 'Nhắc lần 2 · 15 ngày',
  COMPLETED: 'Đã đăng video',
  STOPPED: 'Đã dừng theo dõi',
};
const tabs = [
  ['overview', 'Tổng quan'],
  ['orders', 'Đơn hàng'],
  ['koc', 'Theo dõi KOC'],
  ['products', 'Sản phẩm & SKU'],
  ['imports', 'Nhập dữ liệu'],
];
const emit = () => window.dispatchEvent(new Event('sn-notifications-refresh'));
function Status({ value, labels }: any) {
  return (
    <span className={'order-status status-' + value.toLowerCase()}>{labels?.[value] || value}</span>
  );
}
function download(path: string) {
  window.location.assign('/api/v1' + path);
}
function useRevision() {
  const [rev, set] = useState(0);
  return [rev, () => set((x) => x + 1)] as const;
}

export function OrderWorkspace({ me, focus, onFocusHandled }: any) {
  const [tab, setTab] = useState('overview'),
    [rev, refresh] = useRevision(),
    [selected, setSelected] = useState(''),
    [creating, setCreating] = useState(false);
  const meta = useLoad('/orders/meta'),
    products = useLoad('/shipping-products', rev);
  useEffect(() => {
    if (focus) {
      setSelected(focus);
      setTab('koc');
      onFocusHandled();
    }
  }, [focus]);
  useEffect(() => {
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, []);
  const updated = () => {
    refresh();
    emit();
  };
  const navTab = (next: string) => setTab(next);
  return (
    <Loaded data={meta.data} error={meta.error}>
      <div className="orders-workspace">
        <div className="order-intro">
          <div>
            <p className="eyebrow">VẬN HÀNH / GIAO NHẬN</p>
            <h2>Mỗi đơn hàng, một hành trình rõ ràng.</h2>
            <p className="muted">
              Theo dõi đơn khách hàng, mẫu KOC và kết quả giao nhận trong cùng một nơi.
            </p>
          </div>
          <div className="identity-chip">
            <span className="avatar">{me.name.slice(0, 1)}</span>
            <div>
              <strong>{meta.data?.identity.employee_code || me.username}</strong>
              <small>
                {me.name} · {meta.data?.can_write ? 'Được quản lý đơn' : 'Chỉ xem'}
              </small>
            </div>
          </div>
        </div>
        <div className="order-tabbar" role="tablist" aria-label="Quản lý đơn hàng">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              aria-controls="order-tab-panel"
              id={'order-tab-' + key}
              className={tab === key ? 'active' : ''}
              onClick={() => navTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="order-tab-panel" aria-labelledby={'order-tab-' + tab}>
          {tab === 'overview' && (
            <Overview
              rev={rev}
              onOpenList={(kind: string) => {
                setTab(kind === 'KOC' ? 'koc' : 'orders');
              }}
            />
          )}
          {(tab === 'orders' || tab === 'koc') && (
            <OrderList
              key={tab}
              koc={tab === 'koc'}
              rev={rev}
              meta={meta.data}
              onOpen={setSelected}
              onCreate={() => setCreating(true)}
              onImport={() => setTab('imports')}
            />
          )}
          {tab === 'products' && (
            <Products
              data={products.data}
              error={products.error}
              canWrite={meta.data?.can_write}
              onSaved={updated}
            />
          )}
          {tab === 'imports' && (
            <Imports
              rev={rev}
              meta={meta.data}
              onSaved={updated}
              onProducts={() => setTab('products')}
            />
          )}
        </div>
        {creating && meta.data && (
          <OrderEditor
            meta={meta.data}
            products={products.data?.items || []}
            identity={meta.data.identity}
            onClose={() => setCreating(false)}
            onSaved={(o: any) => {
              setCreating(false);
              setSelected(o.id);
              updated();
            }}
          />
        )}
        {selected && meta.data && (
          <OrderDetail
            id={selected}
            meta={meta.data}
            products={products.data?.items || []}
            identity={meta.data.identity}
            onClose={() => setSelected('')}
            onSaved={updated}
          />
        )}
      </div>
    </Loaded>
  );
}
function Overview({ rev, onOpenList }: any) {
  const [range, setRange] = useState('WEEK'),
    [period, setPeriod] = useState(monday());
  const params = new URLSearchParams({ range, date: period });
  const load = useLoad('/orders/summary?' + params, rev),
    s = load.data,
    c = s?.current,
    p = s?.previous;
  function diff(key: string) {
    if (!p || !c) return '';
    const d = Number(c[key]) - Number(p[key]);
    return `${d > 0 ? '+' : ''}${key === 'shipping_cost' || key === 'revenue' ? money(d) : d.toLocaleString('vi-VN')} so với kỳ trước`;
  }
  return (
    <>
      <div className="order-section-head">
        <div>
          <h2>Hiệu quả gửi hàng</h2>
          <p className="muted">Số đơn theo ngày tạo · Doanh thu theo ngày thu tiền</p>
        </div>
        <div className="actions order-period">
          <label>
            Kỳ báo cáo
            <select
              aria-label="Kỳ báo cáo"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="WEEK">Theo tuần</option>
              <option value="MONTH">Theo tháng</option>
            </select>
          </label>
          <label>
            Ngày trong kỳ
            <input
              aria-label="Ngày trong kỳ"
              type="date"
              value={period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
            />
          </label>
          <button onClick={() => download('/orders/report-export?' + params)}>
            ↓ Xuất báo cáo
          </button>
        </div>
      </div>
      <Loaded data={s} error={load.error}>
        {s && (
          <>
            <p className="order-period-caption">
              {date(s.from)} –{' '}
              {date(
                new Date(Date.parse(s.to + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10),
              )}{' '}
              <span>· So với kỳ bắt đầu {date(s.previousFrom)}</span>
            </p>
            <div className="order-stats">
              {[
                ['total', 'Đơn hàng', 'đơn'],
                ['units', 'Hàng hóa đã gửi', 'sản phẩm'],
                ['shipping_cost', 'Chi phí giao hàng', ''],
                ['revenue', 'Doanh thu đã thu', ''],
              ].map(([key, label, unit]) => (
                <div className="order-stat" key={key}>
                  <small>{label}</small>
                  <strong>
                    {key === 'shipping_cost' || key === 'revenue' ? (
                      money(c[key])
                    ) : (
                      <>
                        {c[key].toLocaleString('vi-VN')} <span>{unit}</span>
                      </>
                    )}
                  </strong>
                  <div>{diff(key)}</div>
                </div>
              ))}
            </div>
            <div className="order-overview-grid">
              <section className="panel">
                <div className="order-section-head">
                  <div>
                    <h3>Cơ cấu đơn hàng</h3>
                    <small>Tổng số đơn trong kỳ</small>
                  </div>
                  <Badge>{c.total} đơn</Badge>
                </div>
                <div className="order-donut-layout">
                  <div
                    className="order-donut"
                    role="img"
                    aria-label={`Khách hàng ${c.customer} đơn, KOC ${c.koc} đơn`}
                    style={{
                      background: c.total
                        ? `conic-gradient(#176448 0 ${(c.customer / c.total) * 100}%,#dab36b ${(c.customer / c.total) * 100}% 100%)`
                        : '#e7ece6',
                    }}
                  >
                    <div>
                      <strong>{c.total}</strong>
                      <small>tổng đơn</small>
                    </div>
                  </div>
                  <div className="order-legend">
                    {[
                      ['CUSTOMER', 'Khách hàng', c.customer],
                      ['KOC', 'Gửi mẫu KOC', c.koc],
                    ].map(([kind, label, n]) => (
                      <button key={kind} onClick={() => onOpenList(kind)}>
                        <i className={'legend-' + kind} />
                        <span>
                          {label}
                          <small>{n} đơn</small>
                        </span>
                        <strong>{c.total ? Math.round((Number(n) / c.total) * 100) : 0}%</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="panel order-reminder-panel">
                <div className="order-section-head">
                  <div>
                    <h3>KOC cần theo dõi</h3>
                    <small>Tất cả đơn đang theo dõi, không giới hạn kỳ báo cáo</small>
                  </div>
                  <span aria-hidden="true">◷</span>
                </div>
                <div className="order-reminder-row">
                  <span>
                    <i className="dot amber" />
                    Nhắc lần 1 · sau 7 ngày
                  </span>
                  <strong>{s.video_counts.WARNING_1 || 0}</strong>
                </div>
                <div className="order-reminder-row">
                  <span>
                    <i className="dot red" />
                    Nhắc lần 2 · đủ 15 ngày
                  </span>
                  <strong>{s.video_counts.WARNING_2 || 0}</strong>
                </div>
                <div className="order-reminder-row">
                  <span>
                    <i className="dot green" />
                    Đã đăng video
                  </span>
                  <strong>{s.video_counts.COMPLETED || 0}</strong>
                </div>
                <button className="text-link" onClick={() => onOpenList('KOC')}>
                  Mở danh sách KOC →
                </button>
                <p className="muted order-fineprint">
                  Tính từ ngày nhận thực tế. Đơn hủy, đang hoàn hoặc đã trả về dừng nhắc video.
                </p>
              </section>
            </div>
            <section className="panel">
              <div className="order-section-head">
                <div>
                  <h3>Hàng hóa đã gửi</h3>
                  <small>
                    Đơn có ngày gửi hoặc đã được lấy hàng, tính theo ngày tạo; không gồm đơn hủy.
                    Hàng trả về vẫn được tính là đã gửi.
                  </small>
                </div>
                <Badge>{c.units} sản phẩm</Badge>
              </div>
              {c.goods.length ? (
                <div className="order-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Sản phẩm</th>
                        <th>SKU</th>
                        <th>Khách hàng</th>
                        <th>KOC</th>
                        <th>Tổng đã gửi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.goods.map((g: any) => (
                        <tr key={g.sku}>
                          <td>
                            <strong>{g.product_name}</strong>
                            <small className="order-subline">{g.product_code}</small>
                          </td>
                          <td>
                            {g.sku}
                            <small className="order-subline">{g.sku_name}</small>
                          </td>
                          <td>{g.customer_quantity || 0}</td>
                          <td>{g.koc_quantity || 0}</td>
                          <td>
                            <strong>{g.quantity}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>Chưa có hàng hóa đã gửi trong kỳ này.</Empty>
              )}
            </section>
          </>
        )}
      </Loaded>
    </>
  );
}
function OrderList({ koc, rev, meta, onOpen, onCreate, onImport }: any) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [kind, setKind] = useState(''),
    [video, setVideo] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [page, setPage] = useState(0);
  const params = new URLSearchParams({
      search,
      status,
      kind: koc ? 'KOC' : kind,
      video,
      from,
      to,
      page: String(page),
    }),
    load = useLoad('/orders?' + params, rev);
  const change = (setter: any) => (e: any) => {
    setter(e.target.value);
    setPage(0);
  };
  return (
    <>
      <div className="order-section-head">
        <div>
          <h2>{koc ? 'Theo dõi mẫu gửi KOC' : 'Tất cả đơn hàng'}</h2>
          <p className="muted">
            {koc
              ? 'Ngày nhận thực tế → nhắc 7 ngày → hạn video 15 ngày'
              : 'Đơn khách hàng và KOC · dữ liệu chung cho đội vận hành'}
          </p>
        </div>
        <div className="actions">
          <button onClick={() => download('/orders/export?' + params)}>↓ Xuất Excel</button>
          {meta?.can_write && (
            <>
              <button onClick={onImport}>↑ Nhập từ file</button>
              <button className="primary" onClick={onCreate}>
                + Tạo đơn hàng
              </button>
            </>
          )}
        </div>
      </div>
      <section className="panel order-list-panel">
        <div className="order-filters">
          <label className="order-search">
            Tìm đơn hàng
            <input
              aria-label="Tìm đơn hàng"
              placeholder="Mã đơn, vận đơn, tên, SĐT, SKU hoặc tài khoản…"
              value={search}
              onChange={change(setSearch)}
            />
          </label>
          {!koc && (
            <label>
              Loại đơn
              <select aria-label="Loại đơn" value={kind} onChange={change(setKind)}>
                <option value="">Tất cả loại đơn</option>
                <option value="CUSTOMER">Khách hàng</option>
                <option value="KOC">Gửi mẫu KOC</option>
              </select>
            </label>
          )}
          <label>
            Trạng thái giao hàng
            <select aria-label="Trạng thái giao hàng" value={status} onChange={change(setStatus)}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(meta?.statuses || {}).map(([key, label]) => (
                <option key={key} value={key}>
                  {String(label)}
                </option>
              ))}
            </select>
          </label>
          {koc && (
            <label>
              Theo dõi video
              <select aria-label="Theo dõi video" value={video} onChange={change(setVideo)}>
                <option value="">Tất cả tiến độ</option>
                {Object.entries(videoLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Từ ngày tạo
            <input aria-label="Từ ngày tạo" type="date" value={from} onChange={change(setFrom)} />
          </label>
          <label>
            Đến ngày tạo
            <input aria-label="Đến ngày tạo" type="date" value={to} onChange={change(setTo)} />
          </label>
        </div>
        <Loaded data={load.data} error={load.error}>
          {load.data?.items.length ? (
            <>
              <div className="order-list-count">
                {load.data.total} đơn hàng <span>· Bấm mã đơn để xem chi tiết và cập nhật</span>
              </div>
              <div className="order-table-scroll">
                <table className={koc ? 'order-koc-table' : 'order-table'}>
                  <thead>
                    <tr>
                      <th>Đơn hàng / Ngày tạo</th>
                      <th>Người nhận</th>
                      <th>Hàng hóa</th>
                      <th>Giao nhận</th>
                      {koc ? (
                        <>
                          <th>Hạn đăng video</th>
                          <th>Tiến độ KOC</th>
                        </>
                      ) : (
                        <>
                          <th>Chi phí / Doanh thu</th>
                        </>
                      )}
                      <th>Phụ trách</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.data.items.map((o: any) => (
                      <tr key={o.id}>
                        <td>
                          <button className="text-link" onClick={() => onOpen(o.id)}>
                            {o.order_code}
                          </button>
                          <small className="order-subline">{date(o.order_date)}</small>
                          <span className={'order-kind kind-' + o.kind}>
                            {o.kind === 'KOC' ? 'KOC' : 'Khách hàng'}
                          </span>
                        </td>
                        <td>
                          <strong>{o.recipient_name}</strong>
                          <small className="order-subline">{o.phone}</small>
                          <small className="order-subline">
                            {o.ward}, {o.city}
                          </small>
                        </td>
                        <td>
                          {o.items.map((i: any) => (
                            <div className="order-line-item" key={i.sku_id}>
                              {i.sku}
                              <strong>×{i.quantity}</strong>
                            </div>
                          ))}
                        </td>
                        <td>
                          <Status value={o.status} labels={meta.statuses} />
                          <small className="order-subline">
                            {o.tracking_number || 'Chưa có vận đơn'} · {o.carrier}
                          </small>
                          <small className="order-subline">Gửi: {date(o.shipped_on)}</small>
                          {o.delivered_on && (
                            <small className="order-subline">Nhận: {date(o.delivered_on)}</small>
                          )}
                        </td>
                        {koc ? (
                          <>
                            <td>
                              <strong>{date(o.video_due_on)}</strong>
                              <small className="order-subline">
                                Nhắc lần 1: {date(o.first_reminder_on)}
                              </small>
                            </td>
                            <td>
                              <Status value={o.video_state} labels={videoLabels} />
                              {o.video_url && (
                                <a
                                  className="order-subline"
                                  href={o.video_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Xem video ↗
                                </a>
                              )}
                            </td>
                          </>
                        ) : (
                          <td>
                            <strong>{money(o.shipping_cost)}</strong>
                            <small className="order-subline">Thu: {money(o.revenue)}</small>
                            <small className="order-subline">
                              {o.collected_on ? 'Đã thu ' + date(o.collected_on) : 'Chưa thu tiền'}
                            </small>
                          </td>
                        )}
                        <td>
                          <strong>{o.employee_code || o.responsible_username}</strong>
                          <small className="order-subline">{o.responsible_name}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="order-pagination">
                <span>
                  Trang {page + 1} / {Math.ceil(load.data.total / 50)}
                </span>
                <div className="actions">
                  <button disabled={!page} onClick={() => setPage(page - 1)}>
                    Trước
                  </button>
                  <button
                    disabled={(page + 1) * 50 >= load.data.total}
                    onClick={() => setPage(page + 1)}
                  >
                    Tiếp
                  </button>
                </div>
              </div>
            </>
          ) : (
            <Empty>
              {search || status || video || from || to || kind
                ? 'Không có đơn phù hợp với bộ lọc.'
                : 'Chưa có đơn hàng. Tạo đơn đầu tiên hoặc nhập dữ liệu từ SPX.'}
            </Empty>
          )}
        </Loaded>
      </section>
    </>
  );
}
function OrderEditor({ order, meta, products, identity, onClose, onSaved }: any) {
  const [kind, setKind] = useState(order?.kind || 'CUSTOMER');
  const skus = products.flatMap((p: any) =>
    p.skus.map((s: any) => ({
      value: s.id,
      label: `${s.code} · ${p.name}${s.name ? ' / ' + s.name : ''}`,
    })),
  );
  const initial = order
    ? {
        ...order,
        shipping_cost: Number(order.shipping_cost),
        revenue: Number(order.revenue),
        items: order.items.map((i: any) => ({ sku_id: i.sku_id, quantity: i.quantity })),
      }
    : {
        kind: 'CUSTOMER',
        carrier: 'SPX',
        status: 'CREATED',
        order_date: today(),
        shipping_cost: 0,
        revenue: 0,
        items: [{ quantity: 1 }],
      };
  return (
    <Modal title={order ? 'Chỉnh sửa đơn hàng' : 'Tạo đơn hàng'} onClose={onClose}>
      <div className="order-editor">
        <p className="order-hint">
          Phụ trách:{' '}
          <strong>
            {order?.employee_code ||
              order?.responsible_username ||
              identity.employee_code ||
              identity.username}
          </strong>
          . Ngày giao phải là ngày người nhận thực tế nhận hàng.
        </p>
        {!skus.length ? (
          <Empty>Hãy tạo sản phẩm và SKU trong tab Sản phẩm & SKU trước khi tạo đơn.</Empty>
        ) : (
          <Form
            initial={initial}
            fields={[
              { key: 'order_code', label: 'Mã đơn hàng', required: true },
              {
                key: 'kind',
                label: 'Loại đơn hàng',
                type: 'select',
                required: true,
                options: [
                  { value: 'CUSTOMER', label: 'Khách hàng' },
                  { value: 'KOC', label: 'Gửi mẫu KOC' },
                ],
              },
              { key: 'carrier', label: 'Đơn vị vận chuyển', required: true },
              { key: 'tracking_number', label: 'Mã vận đơn' },
              { key: 'recipient_name', label: 'Tên người nhận', required: true },
              { key: 'phone', label: 'Số điện thoại', required: true },
              { key: 'city', label: 'Tỉnh / Thành phố', required: true },
              { key: 'ward', label: 'Phường / Xã', required: true },
              { key: 'address', label: 'Số nhà / Đường', required: true },
              {
                key: 'items',
                label: 'Hàng hóa trong đơn',
                type: 'array',
                fields: [
                  { key: 'sku_id', label: 'SKU', type: 'select', required: true, options: skus },
                  { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
                ],
              },
              {
                key: 'shipping_cost',
                label: 'Chi phí giao hàng (người gửi trả)',
                type: 'number',
                required: true,
              },
              ...(kind === 'CUSTOMER'
                ? [
                    {
                      key: 'revenue',
                      label: 'Doanh thu (người nhận trả)',
                      type: 'number',
                      required: true,
                    },
                  ]
                : []),
              { key: 'order_date', label: 'Ngày tạo đơn', type: 'date', required: true },
              { key: 'shipped_on', label: 'Ngày gửi hàng', type: 'date' },
              {
                key: 'status',
                label: 'Trạng thái đơn hàng',
                type: 'select',
                required: true,
                options: Object.entries(meta.statuses).map(([value, label]) => ({
                  value,
                  label: String(label),
                })),
              },
              {
                key: 'delivered_on',
                label: 'Ngày giao thành công thực tế',
                type: 'date',
                hint: 'Bắt buộc khi giao thành công. Doanh thu tự ghi nhận vào ngày này.',
              },
              { key: 'note', label: 'Ghi chú', type: 'textarea' },
            ]}
            onChange={(v) => setKind(v.kind)}
            onSubmit={async (v, key) => {
              const data: any = {};
              for (const k of [
                'order_code',
                'carrier',
                'tracking_number',
                'kind',
                'recipient_name',
                'phone',
                'city',
                'ward',
                'address',
                'status',
                'shipping_cost',
                'revenue',
                'order_date',
                'shipped_on',
                'delivered_on',
                'note',
                'items',
              ])
                if (v[k] !== undefined) data[k] = v[k];
              data.tracking_number = data.tracking_number || null;
              data.shipped_on = data.shipped_on || null;
              data.delivered_on = data.delivered_on || null;
              if (data.kind === 'KOC') data.revenue = 0;
              if (order) data.expected_version = order.version;
              const result = await api(
                order ? '/orders/' + order.id : '/orders',
                data,
                order ? 'PATCH' : 'POST',
                key,
              );
              onSaved(result);
            }}
            label={order ? 'Lưu thay đổi' : 'Tạo đơn hàng'}
          />
        )}
      </div>
    </Modal>
  );
}
function OrderDetail({ id, meta, products, identity, onClose, onSaved }: any) {
  const [rev, refresh] = useRevision(),
    [edit, setEdit] = useState(false),
    [video, setVideo] = useState(false),
    [tab, setTab] = useState('detail');
  const load = useLoad('/orders/' + id, rev),
    o = load.data;
  const saved = () => {
    refresh();
    onSaved();
  };
  return (
    <>
      <Modal title="Chi tiết đơn hàng" onClose={onClose}>
        <Loaded data={o} error={load.error}>
          {o && (
            <div className="order-detail">
              <div className="order-section-head">
                <div>
                  <p className="eyebrow">
                    {o.carrier} · {o.kind === 'KOC' ? 'GỬI MẪU KOC' : 'KHÁCH HÀNG'}
                  </p>
                  <h2>{o.order_code}</h2>
                  <Status value={o.status} labels={meta.statuses} />
                </div>
                {meta.can_write && <button onClick={() => setEdit(true)}>Chỉnh sửa đơn</button>}
              </div>
              <div className="order-detail-tabs" role="tablist" aria-label="Chi tiết đơn">
                {[
                  ['detail', 'Thông tin đơn'],
                  ['video', 'Theo dõi video'],
                  ['history', 'Lịch sử cập nhật'],
                ]
                  .filter(([k]) => k !== 'video' || o.kind === 'KOC')
                  .map(([k, label]) => (
                    <button role="tab" aria-selected={tab === k} key={k} onClick={() => setTab(k)}>
                      {label}
                    </button>
                  ))}
              </div>
              {tab === 'detail' && (
                <>
                  <div className="order-detail-grid">
                    <section>
                      <h3>Người nhận</h3>
                      <strong>{o.recipient_name}</strong>
                      <p>
                        {o.phone}
                        <br />
                        {o.address}, {o.ward}, {o.city}
                      </p>
                    </section>
                    <section>
                      <h3>Thông tin giao nhận</h3>
                      <dl>
                        <dt>Vận đơn</dt>
                        <dd>{o.tracking_number || 'Chưa có'}</dd>
                        <dt>Ngày tạo đơn</dt>
                        <dd>{date(o.order_date)}</dd>
                        <dt>Ngày gửi hàng</dt>
                        <dd>{date(o.shipped_on)}</dd>
                        <dt>Nhận thực tế</dt>
                        <dd>{date(o.delivered_on)}</dd>
                      </dl>
                    </section>
                  </div>
                  <div className="order-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Sản phẩm</th>
                          <th>SKU</th>
                          <th>Số lượng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.items.map((i: any) => (
                          <tr key={i.sku_id}>
                            <td>
                              {i.product_name}
                              <small className="order-subline">{i.product_code}</small>
                            </td>
                            <td>
                              {i.sku}
                              <small className="order-subline">{i.sku_name}</small>
                            </td>
                            <td>{i.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="order-detail-money">
                    <div>
                      <small>Chi phí người gửi trả</small>
                      <strong>{money(o.shipping_cost)}</strong>
                    </div>
                    <div>
                      <small>Doanh thu người nhận trả</small>
                      <strong>{money(o.revenue)}</strong>
                      <small>
                        {o.collected_on
                          ? 'Đã thu ' + date(o.collected_on)
                          : 'Chưa ghi nhận thu tiền'}
                      </small>
                    </div>
                  </div>
                  {o.note && <p className="order-hint">{o.note}</p>}
                  <dl className="order-provenance">
                    <dt>Phụ trách</dt>
                    <dd>
                      {o.employee_code || o.responsible_username} · {o.responsible_name}
                    </dd>
                    <dt>Người tạo</dt>
                    <dd>
                      {o.creator_username} · {fmt(o.created_at)}
                    </dd>
                    <dt>Người nhập gần nhất</dt>
                    <dd>
                      {o.uploader_username
                        ? `${o.uploader_username} · ${fmt(o.uploaded_at)}`
                        : 'Nhập thủ công'}
                    </dd>
                    {o.import_filename && (
                      <>
                        <dt>File gần nhất</dt>
                        <dd>{o.import_filename}</dd>
                      </>
                    )}
                  </dl>
                </>
              )}
              {tab === 'video' && (
                <>
                  <Status value={o.video_state} labels={videoLabels} />
                  <div className="order-video-timeline">
                    {[
                      ['Nhận hàng thực tế', o.delivered_on],
                      ['Nhắc lần 1 · 7 ngày', o.first_reminder_on],
                      ['Hạn video / Nhắc lần 2 · 15 ngày', o.video_due_on],
                    ].map(([label, d]) => (
                      <div key={label}>
                        <i />
                        <strong>{date(d)}</strong>
                        <small>{label}</small>
                      </div>
                    ))}
                  </div>
                  {o.video_state === 'STOPPED' ? (
                    <p className="order-hint">
                      Đơn đã hủy hoặc hoàn / trả hàng. Đã dừng theo dõi video và thông báo.
                    </p>
                  ) : o.video_url ? (
                    <div className="order-video-success">
                      <strong>Đã ghi nhận video</strong>
                      <p>Ngày đăng: {date(o.video_published_on)}</p>
                      <a href={o.video_url} target="_blank" rel="noreferrer">
                        Mở video ↗
                      </a>
                    </div>
                  ) : (
                    <p className="muted">
                      Hạn tính theo ngày nhận thực tế, bao gồm cuối tuần và ngày lễ.
                    </p>
                  )}
                  {meta.can_write && o.status === 'DELIVERED' && (
                    <button className="primary" onClick={() => setVideo(true)}>
                      {o.video_url ? 'Cập nhật link video' : 'Ghi nhận đã đăng video'}
                    </button>
                  )}
                </>
              )}
              {tab === 'history' && (
                <div className="order-history">
                  {o.events.map((e: any) => (
                    <article key={e.id}>
                      <small>{fmt(e.created_at)}</small>
                      <strong>
                        {
                          (
                            {
                              CREATED: 'Tạo đơn',
                              UPDATED: 'Cập nhật đơn',
                              IMPORT: 'Nhập dữ liệu từ file',
                              VIDEO_PUBLISHED: 'Ghi nhận video',
                            } as any
                          )[e.event_type]
                        }{' '}
                        · {e.username}
                      </strong>
                      <span>
                        {e.before_data?.status && e.before_data.status !== e.after_data.status
                          ? `${meta.statuses[e.before_data.status]} → `
                          : ''}
                        {meta.statuses[e.after_data.status]}
                      </span>
                      {e.after_data.delivered_on && (
                        <small>Ngày nhận thực tế: {date(e.after_data.delivered_on)}</small>
                      )}
                      {e.after_data.video_url && (
                        <a href={e.after_data.video_url} target="_blank" rel="noreferrer">
                          Link video ↗
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </Loaded>
      </Modal>
      {edit && o && (
        <OrderEditor
          order={o}
          meta={meta}
          products={products}
          identity={identity}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            saved();
          }}
        />
      )}
      {video && o && (
        <Modal title="Ghi nhận video KOC" onClose={() => setVideo(false)}>
          <Form
            initial={{ url: o.video_url, published_on: o.video_published_on || today() }}
            fields={[
              { key: 'url', label: 'Link video đã đăng', type: 'url', required: true },
              {
                key: 'published_on',
                label: 'Ngày đăng video thực tế',
                type: 'date',
                required: true,
              },
            ]}
            onSubmit={async (v, key) => {
              await api(
                '/orders/' + id + '/video',
                { ...v, expected_version: o.version },
                'POST',
                key,
              );
              setVideo(false);
              saved();
            }}
            label="Lưu video và hoàn thành"
          />
        </Modal>
      )}
    </>
  );
}
function Products({ data, error, canWrite, onSaved }: any) {
  const [editing, setEditing] = useState<any>(null),
    [search, setSearch] = useState('');
  const items = (data?.items || []).filter((p: any) =>
    `${p.code} ${p.name} ${p.skus.map((s: any) => s.code + ' ' + s.name).join(' ')}`
      .toLocaleLowerCase('vi')
      .includes(search.toLocaleLowerCase('vi')),
  );
  return (
    <>
      <div className="order-section-head">
        <div>
          <h2>Danh mục sản phẩm & SKU</h2>
          <p className="muted">Phục vụ tạo đơn và thống kê số lượng hàng gửi đi.</p>
        </div>
        {canWrite && (
          <button className="primary" onClick={() => setEditing({})}>
            + Tạo sản phẩm
          </button>
        )}
      </div>
      <section className="panel">
        <label>
          Tìm sản phẩm / SKU
          <input
            aria-label="Tìm sản phẩm / SKU"
            placeholder="Nhập mã sản phẩm, tên hoặc SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Loaded data={data} error={error}>
          {items.length ? (
            <div className="order-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>SKU / Phân loại</th>
                    {canWrite && <th />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((p: any) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.code}</strong>
                      </td>
                      <td>{p.name}</td>
                      <td>
                        {p.skus.map((s: any) => (
                          <div className="order-sku-pill" key={s.id}>
                            <strong>{s.code}</strong>
                            <span>{s.name || '—'}</span>
                          </div>
                        ))}
                      </td>
                      {canWrite && (
                        <td>
                          <button onClick={() => setEditing(p)}>Chỉnh sửa</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              {search
                ? 'Không có sản phẩm phù hợp.'
                : 'Chưa có sản phẩm. Tạo sản phẩm và SKU để bắt đầu nhập đơn.'}
            </Empty>
          )}
        </Loaded>
      </section>
      {editing && (
        <Modal
          title={editing.id ? 'Chỉnh sửa sản phẩm' : 'Tạo sản phẩm'}
          onClose={() => setEditing(null)}
        >
          <Form
            initial={editing.id ? editing : { skus: [{}] }}
            fields={[
              { key: 'code', label: 'Mã sản phẩm', required: true },
              { key: 'name', label: 'Tên sản phẩm', required: true },
              {
                key: 'skus',
                label: 'Các SKU',
                type: 'array',
                fields: [
                  { key: 'code', label: 'Mã SKU', required: true },
                  { key: 'name', label: 'Tên phân loại / SKU' },
                ],
              },
            ]}
            onSubmit={async (v, key) => {
              const data: any = {
                code: v.code,
                name: v.name,
                skus: v.skus.map((s: any) => ({
                  ...(s.id ? { id: s.id } : {}),
                  code: s.code,
                  name: s.name || '',
                })),
              };
              if (editing.id) {
                data.expected_version = editing.version;
                const retained = new Set(v.skus.filter((s: any) => s.id).map((s: any) => s.id));
                if (editing.skus.some((s: any) => !retained.has(s.id)))
                  throw Error(
                    'SKU đã lưu được giữ để bảo toàn lịch sử đơn. Bạn có thể sửa tên hoặc thêm SKU mới.',
                  );
              }
              await api(
                editing.id ? '/shipping-products/' + editing.id : '/shipping-products',
                data,
                editing.id ? 'PATCH' : 'POST',
                key,
              );
              setEditing(null);
              onSaved();
            }}
            label="Lưu sản phẩm"
          />
        </Modal>
      )}
    </>
  );
}
function Imports({ rev, meta, onSaved, onProducts }: any) {
  const load = useLoad('/order-imports', rev),
    [file, setFile] = useState<File>(),
    [batch, setBatch] = useState<any>(),
    [mapping, setMapping] = useState<Record<string, number>>({}),
    [statusMap, setStatusMap] = useState<Record<string, string>>({}),
    [kind, setKind] = useState('CUSTOMER'),
    [dateFormat, setDateFormat] = useState('DMY'),
    [moneyFormat, setMoneyFormat] = useState('EN'),
    [header, setHeader] = useState(1),
    [sheet, setSheet] = useState(1),
    [delimiter, setDelimiter] = useState(','),
    [preview, setPreview] = useState<any>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>(),
    [message, setMessage] = useState('');
  async function run(fn: () => Promise<any>) {
    setError(null);
    setMessage('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const dirty = () => setPreview(undefined);
  const rawStatuses =
    batch && mapping.status !== undefined ? batch.column_values[mapping.status] || [] : [];
  return (
    <>
      <div className="order-section-head">
        <div>
          <h2>Nhập đơn hàng từ file SPX</h2>
          <p className="muted">Tải file → ghép cột → kiểm tra dữ liệu → xác nhận lưu</p>
        </div>
        <span className="order-connection">Nhập file · Chưa kết nối API SPX</span>
      </div>
      <div className="order-import-note">
        <strong>Dữ liệu có thể nhập ngay từ Excel / CSV.</strong>
        <span>
          Ngày tạo lấy từ SPX. Mỗi dòng là một SKU; các dòng cùng đơn dùng chung thông tin và số
          tiền cấp đơn. Tạo SKU trong danh mục trước khi nhập.
        </span>
        <button className="text-link" onClick={onProducts}>
          Mở danh mục SKU →
        </button>
      </div>
      <ErrorBox error={error} />
      {message && (
        <p role="status" className="order-video-success">
          {message}
        </p>
      )}
      {meta.can_write && (
        <section className="panel">
          <ol className="order-import-steps">
            <li className={!batch ? 'active' : ''}>1. Chọn file</li>
            <li className={batch && !preview ? 'active' : ''}>2. Ghép dữ liệu</li>
            <li className={preview ? 'active' : ''}>3. Xem trước & lưu</li>
          </ol>
          {!batch ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (!file) throw Error('Hãy chọn file cần nhập');
                  const f = new FormData();
                  f.append('header_row', String(header));
                  f.append('sheet', String(sheet - 1));
                  f.append('delimiter', delimiter);
                  f.append('file', file);
                  const result = await api('/order-imports', f);
                  setBatch(result);
                  setMapping({});
                  setStatusMap({});
                  onSaved();
                });
              }}
            >
              <label className="order-dropzone">
                Chọn file xuất từ SPX
                <input
                  aria-label="File SPX"
                  type="file"
                  accept=".xlsx,.csv"
                  required
                  onChange={(e) => setFile(e.target.files?.[0])}
                />
                <small>
                  Excel .xlsx hoặc CSV · tối đa 5.000 dòng · điện thoại cần giữ số 0 đầu
                </small>
              </label>
              <div className="order-import-options">
                <label>
                  Trang tính (Excel)
                  <input
                    aria-label="Trang tính"
                    type="number"
                    min="1"
                    value={sheet}
                    onChange={(e) => setSheet(Number(e.target.value))}
                  />
                </label>
                <label>
                  Dòng tiêu đề
                  <input
                    aria-label="Dòng tiêu đề"
                    type="number"
                    min="1"
                    max="20"
                    value={header}
                    onChange={(e) => setHeader(Number(e.target.value))}
                  />
                </label>
                <label>
                  Dấu phân cách CSV
                  <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
                    <option value=",">Dấu phẩy (,)</option>
                    <option value=";">Chấm phẩy (;)</option>
                  </select>
                </label>
              </div>
              <button className="primary" disabled={busy} type="submit">
                {busy ? 'Đang đọc file…' : 'Đọc file & ghép cột'}
              </button>
            </form>
          ) : (
            <>
              <div className="order-section-head">
                <strong>
                  {file?.name || 'File đã tải'} · {batch.row_count} dòng
                </strong>
                <button
                  disabled={busy}
                  onClick={() => {
                    setBatch(undefined);
                    setPreview(undefined);
                    setError(null);
                  }}
                >
                  Chọn file khác
                </button>
              </div>
              <details>
                <summary>Xem các dòng đầu của file</summary>
                <div className="order-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {batch.headers.map((h: string, i: number) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {batch.sample.map((r: any) => (
                        <tr key={r.line}>
                          {r.data.map((v: string, i: number) => (
                            <td key={i}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <div className="order-mapping-grid">
                {Object.entries(meta.import_fields).map(([key, label]) => (
                  <label key={key}>
                    {String(label)}
                    {meta.required_fields.includes(key) ? ' *' : ''}
                    <select
                      aria-label={'Ghép cột ' + label}
                      value={mapping[key] ?? ''}
                      onChange={(e) => {
                        dirty();
                        setMapping((m) => {
                          const next = { ...m };
                          if (e.target.value === '') delete next[key];
                          else next[key] = Number(e.target.value);
                          return next;
                        });
                        if (key === 'status') setStatusMap({});
                      }}
                    >
                      <option value="">
                        {meta.required_fields.includes(key) ? 'Chọn cột bắt buộc' : 'Không có cột'}
                      </option>
                      {batch.headers.map((h: string, i: number) => (
                        <option key={i} value={i}>
                          {h} (cột {i + 1})
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="order-import-options">
                <label>
                  Loại đơn mặc định
                  <select
                    aria-label="Loại đơn mặc định"
                    value={kind}
                    onChange={(e) => {
                      dirty();
                      setKind(e.target.value);
                    }}
                  >
                    <option value="CUSTOMER">Khách hàng</option>
                    <option value="KOC">Gửi mẫu KOC</option>
                  </select>
                </label>
                <label>
                  Định dạng ngày
                  <select
                    aria-label="Định dạng ngày"
                    value={dateFormat}
                    onChange={(e) => {
                      dirty();
                      setDateFormat(e.target.value);
                    }}
                  >
                    <option value="DMY">Ngày/Tháng/Năm</option>
                    <option value="ISO">Năm-Tháng-Ngày</option>
                  </select>
                </label>
                <label>
                  Định dạng tiền
                  <select
                    aria-label="Định dạng tiền"
                    value={moneyFormat}
                    onChange={(e) => {
                      dirty();
                      setMoneyFormat(e.target.value);
                    }}
                  >
                    <option value="EN">12345.67 hoặc 12,345.67</option>
                    <option value="VI">12.345,67 hoặc 12345</option>
                  </select>
                </label>
              </div>
              {rawStatuses.length > 0 && (
                <>
                  <h3>Ghép trạng thái SPX</h3>
                  <div className="order-mapping-grid">
                    {rawStatuses.map((raw: string) => (
                      <label key={raw}>
                        {raw || '(Trống)'}
                        <select
                          aria-label={'Ghép trạng thái ' + raw}
                          value={statusMap[raw] || ''}
                          onChange={(e) => {
                            dirty();
                            setStatusMap((m) => ({ ...m, [raw]: e.target.value }));
                          }}
                        >
                          <option value="">Chọn trạng thái trong hệ thống</option>
                          {Object.entries(meta.statuses).map(([k, l]) => (
                            <option key={k} value={k}>
                              {String(l)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </>
              )}
              <p className="muted">
                Nếu có cột loại đơn, giá trị cần là KOC hoặc CUSTOMER. Số tiền phải có ở mọi dòng;
                đơn KOC nhập doanh thu bằng 0.
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  !meta.required_fields.every((k: string) => mapping[k] !== undefined) ||
                  !rawStatuses.length ||
                  rawStatuses.some((s: string) => !statusMap[s])
                }
                onClick={() =>
                  void run(async () => {
                    const p = await api('/order-imports/' + batch.id + '/preview', {
                      columns: mapping,
                      statuses: statusMap,
                      default_kind: kind,
                      date_format: dateFormat,
                      money_format: moneyFormat,
                    });
                    setPreview(p);
                  })
                }
              >
                {busy ? 'Đang kiểm tra…' : 'Kiểm tra & xem trước'}
              </button>
              {preview && (
                <div className="order-preview">
                  <h3>Kết quả kiểm tra</h3>
                  <div className="actions">
                    <Badge>{preview.new_count} đơn mới</Badge>
                    <Badge>{preview.update_count} đơn cập nhật</Badge>
                    <Badge>{preview.errors.length} lỗi</Badge>
                  </div>
                  {preview.errors.length ? (
                    <div className="error" role="alert">
                      {preview.errors.map((e: any, i: number) => (
                        <p key={i}>
                          Dòng {e.line}: {e.message}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="order-hint">
                      Đã kiểm tra {preview.orders.length} đơn. Đơn có cùng mã SPX sẽ được cập nhật,
                      giữ nguyên người tạo và người phụ trách; người nhập lần này được ghi vào lịch
                      sử.
                    </p>
                  )}
                  <div className="order-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Mã đơn</th>
                          <th>Thao tác</th>
                          <th>Người nhận</th>
                          <th>SKU</th>
                          <th>Ngày tạo</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.orders.slice(0, 50).map((o: any) => (
                          <tr key={o.input.order_code}>
                            <td>{o.input.order_code}</td>
                            <td>{o.action === 'CREATE' ? 'Tạo mới' : 'Cập nhật'}</td>
                            <td>{o.input.recipient_name}</td>
                            <td>{o.input.items.length} SKU</td>
                            <td>{date(o.input.order_date)}</td>
                            <td>{meta.statuses[o.input.status]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.orders.length > 50 && (
                    <small>Hiển thị 50 đơn đầu trong bản xem trước.</small>
                  )}
                  <button
                    className="primary"
                    disabled={busy || preview.errors.length > 0 || !preview.orders.length}
                    onClick={() =>
                      void run(async () => {
                        const r = await api('/order-imports/' + batch.id + '/commit', {
                          preview_token: preview.preview_token,
                        });
                        setBatch(undefined);
                        setPreview(undefined);
                        setMessage(`Đã lưu ${r.count} đơn hàng.`);
                        onSaved();
                      })
                    }
                  >
                    {busy ? 'Đang lưu…' : `Xác nhận nhập ${preview.orders.length} đơn`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      <section className="panel">
        <h3>Lịch sử nhập dữ liệu</h3>
        <Loaded data={load.data} error={load.error}>
          {load.data?.items.length ? (
            <div className="order-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Người tải lên</th>
                    <th>Thời điểm</th>
                    <th>Trạng thái</th>
                    <th>Số đơn</th>
                  </tr>
                </thead>
                <tbody>
                  {load.data.items.map((i: any) => (
                    <tr key={i.id}>
                      <td>{i.filename}</td>
                      <td>
                        {i.employee_code || i.username}
                        <small className="order-subline">{i.username}</small>
                      </td>
                      <td>{fmt(i.uploaded_at)}</td>
                      <td>
                        {
                          (
                            {
                              UPLOADED: 'Đã tải lên',
                              PREVIEWED: 'Đã kiểm tra',
                              COMMITTED: 'Đã nhập',
                            } as any
                          )[i.status]
                        }
                      </td>
                      <td>{i.status === 'COMMITTED' ? i.order_count : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Chưa có file nào được tải lên.</Empty>
          )}
        </Loaded>
      </section>
    </>
  );
}
