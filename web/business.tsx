import React, { useState } from 'react';
import { api } from './api';
import {
  Form,
  useHourlyRefresh,
  Modal,
  Loaded,
  useLoad,
  ErrorBox,
  Empty,
  options,
  Badge,
  type Field,
  businessLabels,
} from './ui';
export function Metrics({ kind }: { kind: string }) {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/metrics?kind=' + kind, rev),
    batches = useLoad('/imports?kind=' + kind, rev),
    [upload, setUpload] = useState(false),
    [manual, setManual] = useState(false),
    [batch, setBatch] = useState<any>(),
    [preview, setPreview] = useState<any>(),
    [sheet, setSheet] = useState(''),
    [headerRow, setHeaderRow] = useState(1),
    [err, setErr] = useState<any>();
  const columns = (
    batch?.raw.find((s: any) => s.name === (sheet || batch.raw[0]?.name))?.rows[headerRow - 1] || []
  ).map((name: any, index: number) => ({
    value: String(index),
    label: `${String.fromCharCode(65 + index)} · ${String(name || 'Không có tiêu đề')}`,
  }));
  const refresh = () => setRev((r) => r + 1);
  useHourlyRefresh(refresh);
  return (
    <>
      <div className="toolbar">
        <button onClick={refresh}>Tải lại danh sách</button>
        <p className="muted">
          Nguồn {businessLabels[kind] || kind} · Dữ liệu đã xác nhận, không suy từ số task.
        </p>
        <button onClick={() => setManual(true)}>+ Nhập số liệu có nguồn</button>
        <button className="primary" onClick={() => setUpload(true)}>
          Nhập file XLSX / CSV
        </button>
      </div>
      <Loaded data={data} error={error}>
        <div className="panel">
          <h2>Số liệu & nguồn</h2>
          <p className="muted">{data?.note}</p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Shop / đối tượng</th>
                  <th>Kỳ / phạm vi</th>
                  <th>Chỉ số</th>
                  <th>Giá trị</th>
                  <th>Nguồn / revision</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      {r.platform} · {r.shop}
                      <div>{r.subject}</div>
                    </td>
                    <td>
                      {String(r.business_date).slice(0, 10)} – {String(r.window_end).slice(0, 10)}
                      <div className="row-meta">
                        {businessLabels[r.grain] || r.grain} ·{' '}
                        {businessLabels[r.aggregation] || r.aggregation}
                      </div>
                    </td>
                    <td>{businessLabels[r.metric] || r.metric}</td>
                    <td>
                      {r.value === null ? 'N/A · ' + r.missing_reason : r.value}
                      <div className="row-meta">{r.currency}</div>
                    </td>
                    <td>
                      {r.source}
                      <div className="row-meta">v{r.revision}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.items.length && (
              <Empty>Chưa nhập nguồn. Chỉ số thiếu không được hiển thị thành 0.</Empty>
            )}
          </div>
        </div>
      </Loaded>
      <div className="panel">
        <h2>Nguồn nhập</h2>
        <ErrorBox error={batches.error} />
        {batches.error && (
          <button onClick={() => setRev((r) => r + 1)}>Thử tải lại nguồn nhập</button>
        )}
        {batches.data?.items.map((b: any) => (
          <div key={b.id} className="support-row">
            <button
              className="text-link"
              onClick={async () => {
                setBatch(await api('/imports/' + b.id));
                setPreview(null);
                setSheet('');
                setHeaderRow(1);
              }}
            >
              {b.filename}
            </button>{' '}
            <Badge>{b.status}</Badge>
            <div className="row-meta">
              {b.platform} · {b.shop}
            </div>
          </div>
        ))}
      </div>
      {upload && (
        <Modal title="1 · Tải nguồn dữ liệu" onClose={() => setUpload(false)}>
          <ImportUpload
            kind={kind}
            onDone={async (id) => {
              setUpload(false);
              setBatch(await api('/imports/' + id));
              setPreview(null);
              refresh();
            }}
          />
        </Modal>
      )}
      {batch && (
        <Modal
          title="Nhập dữ liệu · Chọn nguồn → Map & preview → Kiểm tra → Xác nhận"
          onClose={() => {
            setBatch(null);
            setPreview(null);
          }}
        >
          <p>
            {batch.filename} · {batch.shop} · {batch.currency}
          </p>
          {batch.status === 'COMMITTED' ? (
            <div className="success">
              Nguồn đã được xác nhận nhập. Muốn sửa cần nguồn/revision mới.
            </div>
          ) : (
            <>
              <h3>2–3 · Chọn sheet và cột nguồn</h3>
              <Form
                key={batch.id}
                fields={[
                  {
                    key: 'sheet',
                    label: 'Sheet',
                    type: 'select',
                    required: true,
                    options: options(batch.raw.map((s: any) => s.name)),
                  },
                  {
                    key: 'header_row',
                    label: 'Dòng tiêu đề (bắt đầu từ 1)',
                    type: 'number',
                    required: true,
                  },
                  {
                    key: 'date_column',
                    label: 'Cột ngày',
                    type: 'select',
                    options: columns,
                    required: true,
                  },
                  {
                    key: 'locale',
                    label: 'Định dạng số nguồn',
                    type: 'select',
                    required: true,
                    options: [
                      { value: 'vi-VN', label: '1.234,56' },
                      { value: 'en-US', label: '1,234.56' },
                    ],
                  },
                  {
                    key: 'grain',
                    label: 'Cấp dữ liệu',
                    type: 'select',
                    required: true,
                    options: options(['DAY', 'PERIOD', 'SNAPSHOT']),
                  },
                  { key: 'subject', label: 'Shop / campaign / video ID', required: true },
                  {
                    key: 'window_end',
                    label: 'Ngày cuối kỳ (nguồn theo kỳ / snapshot)',
                    type: 'date',
                  },
                  {
                    key: 'mapping',
                    label: 'Các chỉ số cần nhập',
                    type: 'array',
                    fields: [
                      {
                        key: 'metric',
                        label: 'Chỉ số',
                        type: 'select',
                        required: true,
                        options: options(Object.keys(data?.definitions || {})),
                      },
                      {
                        key: 'column',
                        label: 'Cột nguồn',
                        type: 'select',
                        options: columns,
                        required: true,
                      },
                    ],
                  },
                ]}
                initial={{
                  sheet: batch.raw[0]?.name,
                  header_row: 1,
                  date_column: 0,
                  locale: 'en-US',
                  grain: 'DAY',
                  subject: 'SHOP',
                  mapping: [],
                }}
                onSubmit={async (v, key) => {
                  const r = await api(
                    '/imports/' + batch.id + '/preview',
                    {
                      ...v,
                      date_column: Number(v.date_column),
                      window_end: v.window_end || undefined,
                      mapping: Object.fromEntries(
                        (v.mapping || []).map((m: any) => [m.metric, Number(m.column)]),
                      ),
                      expected_version: batch.version,
                    },
                    'POST',
                    key,
                  );
                  setPreview(r);
                  setBatch({ ...batch, version: r.version });
                }}
                onChange={(v) => {
                  setSheet(v.sheet || '');
                  setHeaderRow(v.header_row || 1);
                }}
                label="Tạo preview kiểm tra"
              />
              <details>
                <summary>Xem các dòng nguồn đầu tiên</summary>
                {batch.raw.map((s: any) => (
                  <div key={s.name}>
                    <h3>{s.name}</h3>
                    <div className="tablewrap">
                      <table>
                        <tbody>
                          {s.rows.slice(0, 12).map((row: any[], i: number) => (
                            <tr key={i}>
                              <th>{i + 1}</th>
                              {row.map((v: any, j: number) => (
                                <td key={j}>{String(v ?? '')}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </details>
              {preview && (
                <div className="detail-section">
                  <h3>4 · Kiểm tra {preview.rows.length} số liệu</h3>
                  {preview.warnings.map((w: string) => (
                    <div className="notice" key={w}>
                      {w}
                    </div>
                  ))}
                  {preview.errors.map((e: any, i: number) => (
                    <div className="error" key={i}>
                      Dòng {e.row} · {e.field} · {String(e.raw_value)}: {e.message}
                    </div>
                  ))}
                  <p>{preview.skipped.length} dòng tổng / thay đổi đã loại khỏi dữ liệu ngày.</p>
                  <Form
                    fields={[
                      {
                        key: 'conflict_resolution',
                        label: 'Khi có nguồn cùng khóa/kỳ',
                        type: 'select',
                        required: true,
                        options: [
                          { value: 'REJECT', label: 'Dừng để kiểm tra xung đột' },
                          { value: 'REPLACE', label: 'Tạo revision mới thay nguồn (giữ lịch sử)' },
                        ],
                      },
                    ]}
                    initial={{ conflict_resolution: 'REJECT' }}
                    onSubmit={async (v, key) => {
                      await api(
                        '/imports/' + batch.id + '/commit',
                        {
                          ...v,
                          preview_hash: preview.preview_hash,
                          expected_version: batch.version,
                        },
                        'POST',
                        key,
                      );
                      setBatch(null);
                      setPreview(null);
                      refresh();
                    }}
                    label="5 · Xác nhận nhập dữ liệu"
                  />
                </div>
              )}
            </>
          )}
        </Modal>
      )}
      {manual && (
        <Modal title="Nhập số liệu có nguồn" onClose={() => setManual(false)}>
          <Form
            fields={[
              {
                key: 'platform',
                label: 'Nền tảng',
                type: 'select',
                required: true,
                options: options(['TIKTOK', 'SHOPEE', 'FACEBOOK', 'OTHER']),
              },
              { key: 'shop', label: 'Shop / tài khoản nguồn', required: true },
              { key: 'subject', label: 'Đối tượng (SHOP hoặc ID video/campaign)', required: true },
              {
                key: 'metric',
                label: 'Chỉ số',
                type: 'select',
                required: true,
                options: options(Object.keys(data?.definitions || {})),
              },
              { key: 'business_date', label: 'Ngày bắt đầu', type: 'date', required: true },
              { key: 'window_end', label: 'Ngày cuối kỳ', type: 'date', required: true },
              {
                key: 'grain',
                label: 'Cấp dữ liệu',
                type: 'select',
                required: true,
                options: options(['DAY', 'PERIOD', 'SNAPSHOT']),
              },
              {
                key: 'aggregation',
                label: 'Định nghĩa tổng hợp nguồn',
                type: 'select',
                required: true,
                options: options(['SUM', 'PERIOD_UNIQUE', 'RATIO', 'CUMULATIVE']),
              },
              { key: 'currency', label: 'Tiền tệ', required: true },
              { key: 'value', label: 'Giá trị (dấu chấm thập phân; tỷ lệ 0–1)' },
              { key: 'missing_reason', label: 'Lý do thiếu nếu không có số', type: 'textarea' },
              {
                key: 'source',
                label: 'Nguồn / kỳ / attribution',
                required: true,
                type: 'textarea',
              },
              {
                key: 'replace',
                label: 'Tạo revision thay nguồn trùng, không cộng thêm',
                type: 'checkbox',
              },
            ]}
            initial={{
              platform: 'TIKTOK',
              subject: 'SHOP',
              currency: 'VND',
              grain: 'DAY',
              aggregation: 'SUM',
              replace: false,
            }}
            onSubmit={async (v, key) => {
              await api(
                '/metrics',
                {
                  ...v,
                  kind,
                  value: v.value || null,
                  missing_reason: v.value ? null : v.missing_reason || null,
                },
                'POST',
                key,
              );
              setManual(false);
              refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
function ImportUpload({ kind, onDone }: { kind: string; onDone: (id: string) => void }) {
  const [file, setFile] = useState<File | null>();
  return (
    <Form
      fields={[
        {
          key: 'platform',
          label: 'Nền tảng',
          type: 'select',
          required: true,
          options: options(['TIKTOK', 'SHOPEE', 'FACEBOOK', 'OTHER']),
        },
        { key: 'shop', label: 'Shop / tài khoản nguồn', required: true },
        { key: 'currency', label: 'Tiền tệ', required: true },
      ]}
      initial={{ platform: 'TIKTOK', currency: 'VND' }}
      onSubmit={async (v, key) => {
        if (!file) throw Error('Vui lòng chọn file nguồn');
        const fd = new FormData();
        for (const [k, val] of Object.entries({ ...v, kind })) fd.set(k, String(val));
        fd.set('file', file);
        const r = await api('/imports', fd, 'POST', key);
        onDone(r.id);
      }}
      label="Tải file, chưa ghi KPI"
    >
      <label>
        File nguồn XLSX / CSV
        <input
          type="file"
          accept=".xlsx,.csv"
          required
          onChange={(e) => setFile(e.target.files?.[0])}
        />
      </label>
    </Form>
  );
}
export function Claims() {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/claims', rev);
  useHourlyRefresh(() => setRev((r) => r + 1));
  return (
    <div className="split">
      <div className="panel">
        <h2>Bồi hoàn đã nhập</h2>
        <button onClick={() => setRev((r) => r + 1)}>Tải lại danh sách</button>
        <Loaded data={data} error={error}>
          {data?.items.map((r: any) => (
            <div key={r.id} className="support-row">
              <strong>{r.order_id}</strong> · {r.amount} {r.currency}{' '}
              <Badge>{businessLabels[r.stage] || r.stage}</Badge>
              <p>{r.lines.map((l: any) => l.sku).join(', ')}</p>
            </div>
          ))}
        </Loaded>
      </div>
      <div className="panel">
        <h2>Nhập bồi hoàn cấp đơn</h2>
        <Form
          fields={[
            { key: 'platform', label: 'Nền tảng', required: true },
            { key: 'shop', label: 'Shop', required: true },
            { key: 'order_id', label: 'ID đơn', required: true },
            { key: 'amount', label: 'Số tiền cấp đơn', required: true },
            { key: 'currency', label: 'Tiền tệ', required: true },
            {
              key: 'stage',
              label: 'Ý nghĩa số tiền',
              type: 'select',
              required: true,
              options: options(['UNSPECIFIED', 'CLAIMED', 'APPROVED', 'RECEIVED']),
            },
            { key: 'note', label: 'Ghi chú', type: 'textarea' },
            {
              key: 'lines',
              label: 'Các SKU (tiền tổng không lặp theo SKU)',
              type: 'array',
              fields: [
                { key: 'sku', label: 'SKU', required: true },
                { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
                { key: 'allocation', label: 'Phân bổ nếu có' },
              ],
            },
          ]}
          initial={{
            platform: 'TIKTOK',
            currency: 'VND',
            stage: 'UNSPECIFIED',
            note: '',
            lines: [],
          }}
          onSubmit={async (v, key) => {
            await api(
              '/claims',
              {
                ...v,
                lines: (v.lines || []).map((l: any) => ({
                  ...l,
                  allocation: l.allocation || null,
                })),
              },
              'POST',
              key,
            );
            setRev((r) => r + 1);
          }}
        />
      </div>
    </div>
  );
}
