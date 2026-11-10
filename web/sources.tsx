import React, { useState } from 'react';
import { api } from './api';
import { Form, Loaded, ErrorBox, useLoad, Empty, roleLabel } from './ui';

const options = (items: any[], name = 'name') =>
  items.map((x) => ({ value: x.id, label: x[name] || x.label }));
const adapterNames: Record<string, string> = {
  TIKTOK_SALES: 'Bán hàng TikTok',
  SHOPEE_SALES: 'Bán hàng Shopee',
  KOC_SALES: 'Doanh số KOC',
  TIKTOK_RETURNS: 'Hoàn/hủy TikTok',
  VIDEO_PERFORMANCE: 'Hiệu quả video',
};
export function SourceWorkspace({ video = false }: any) {
  const [rev, setRev] = useState(0),
    [file, setFile] = useState<File>(),
    [batch, setBatch] = useState<any>(),
    [preview, setPreview] = useState<any>(),
    [adapter, setAdapter] = useState(video ? 'VIDEO_PERFORMANCE' : 'TIKTOK_SALES');
  const currentUser = useLoad('/me');
  const companies = useLoad('/companies', rev),
    resources = useLoad('/resources', rev),
    history = useLoad('/imports?v2=1', rev);
  return (
    <>
      <div className="panel">
        <h2>Tải dữ liệu lên</h2>
        <p>
          Chọn nguồn và xác nhận kỳ xuất thực tế. Tên file được giữ nguyên; số liệu chỉ được ghi sau
          khi xác nhận preview.
        </p>
        <Loaded data={resources.data} error={resources.error}>
          {!resources.data?.items.length ? (
            <Empty>Chưa được cấp shop/kênh. Admin cần tạo pháp nhân, nguồn và cấp quyền.</Empty>
          ) : (
            <>
              <label>
                File XLSX/CSV (tối đa 25 MiB)
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => setFile(e.target.files?.[0])}
                />
              </label>
              <Form
                fields={[
                  {
                    key: 'adapter_code',
                    label: 'Loại dữ liệu',
                    type: 'select',
                    options: Object.entries(adapterNames)
                      .filter(([k]) =>
                        video ? k === 'VIDEO_PERFORMANCE' : k !== 'VIDEO_PERFORMANCE',
                      )
                      .map(([value, label]) => ({ value, label })),
                    required: true,
                  },
                  {
                    key: 'company_id',
                    label: 'Pháp nhân',
                    type: 'select',
                    options: options(companies.data?.items || []),
                    required: true,
                  },
                  {
                    key: 'resource_id',
                    label: 'Shop / kênh',
                    type: 'select',
                    options: options(
                      (resources.data?.items || []).filter(
                        (r: any) => r.kind === (video ? 'CHANNEL' : 'SHOP'),
                      ),
                    ),
                    required: true,
                  },
                  { key: 'period_start', label: 'Kỳ nguồn từ ngày', type: 'date', required: true },
                  { key: 'period_end', label: 'Kỳ nguồn đến ngày', type: 'date', required: true },
                  {
                    key: 'basis',
                    label: 'Cơ sở kỳ nguồn',
                    type: 'select',
                    options: (video
                      ? ['SNAPSHOT']
                      : adapter === 'KOC_SALES'
                        ? ['EXPORT_PERIOD']
                        : adapter === 'TIKTOK_RETURNS'
                          ? ['DATE_CREATED', 'DATE_CANCELLED']
                          : ['DAILY']
                    ).map((value) => ({ value, label: value })),
                    required: true,
                  },
                ]}
                initial={{ adapter_code: adapter, basis: video ? 'SNAPSHOT' : 'DAILY' }}
                onChange={(v) => setAdapter(v.adapter_code)}
                onSubmit={async (v) => {
                  if (!file) throw Error('Chọn file trước khi tải');
                  const body = new FormData();
                  Object.entries(v).forEach(([k, x]) => body.append(k, String(x)));
                  body.append('file', file);
                  const r = await api('/imports', body);
                  setBatch(r);
                  setPreview(null);
                  setRev((n) => n + 1);
                }}
                label="Tải nguồn để kiểm tra"
              />
            </>
          )}
        </Loaded>
      </div>
      {batch && (
        <div className="panel">
          <h2>Kiểm tra nguồn · {batch.id}</h2>
          <Form
            key={batch.id}
            fields={[
              { key: 'sheet', label: 'Sheet (để trống nếu chỉ có một sheet phù hợp)' },
              {
                key: 'number_locale',
                label: 'Định dạng số nguồn',
                type: 'select',
                options: [
                  { value: 'vi-VN', label: 'Việt Nam · 1.234,56' },
                  { value: 'en-US', label: 'Quốc tế · 1,234.56' },
                ],
                required: true,
              },
              {
                key: 'source_basis',
                label: 'Căn cứ xác nhận đúng nguồn và kỳ',
                type: 'textarea',
                required: true,
              },
              {
                key: 'confirmed',
                label: 'Tôi đã kiểm tra đúng shop/kênh, pháp nhân và kỳ xuất',
                type: 'checkbox',
                required: true,
              },
            ]}
            initial={{ number_locale: 'vi-VN', sheet: '' }}
            onSubmit={async (v) => {
              if (!v.confirmed) throw Error('Cần xác nhận nguồn thực tế');
              const r = await api('/imports/' + batch.id + '/preview', {
                expected_version: batch.version,
                adapter_version: 1,
                ...(v.sheet ? { sheet: v.sheet } : {}),
                source_context: { number_locale: v.number_locale },
                confirmations: {
                  platform_source_confirmed: true,
                  period_basis: v.source_basis,
                  source_basis: v.source_basis,
                },
              });
              setBatch({ ...batch, version: r.version });
              setPreview(r);
            }}
            label="Xem trước dữ liệu"
          />
          {preview && (
            <>
              <p>
                {preview.valid_rows} dòng hợp lệ · {preview.errors.length} lỗi
              </p>
              {preview.warnings?.map((s: string) => (
                <p key={s}>{s}</p>
              ))}
              {preview.errors.map((e: any, i: number) => (
                <div role="alert" className="error" key={i}>
                  {e.code} · Sheet {e.sheet} · dòng {e.row} · {e.column}: {e.message_vi}
                  <p>{e.action}</p>
                </div>
              ))}
              <SourceRows rows={preview.preview_rows} />
              {!preview.errors.length && (
                <Form
                  fields={[
                    {
                      key: 'confirm',
                      label: 'Xác nhận ghi toàn bộ dữ liệu đã kiểm tra',
                      type: 'checkbox',
                      required: true,
                    },
                    ...(currentUser.data?.admin
                      ? [
                          {
                            key: 'conflict_mode',
                            label: 'Xử lý nguồn đang có',
                            type: 'select',
                            options: [
                              { value: 'REJECT', label: 'Chặn nếu trùng/giao nhau' },
                              { value: 'REPLACE', label: 'Thay đúng partition (Admin)' },
                            ],
                          },
                          { key: 'reason', label: 'Lý do thay phiên bản nguồn' },
                        ]
                      : []),
                  ]}
                  onSubmit={async (v) => {
                    if (!v.confirm) throw Error('Chưa xác nhận');
                    await api('/imports/' + batch.id + '/commit', {
                      expected_version: batch.version,
                      preview_token: preview.preview_token,
                      conflict_mode: v.conflict_mode || 'REJECT',
                      ...(v.reason ? { reason: v.reason } : {}),
                    });
                    setBatch(null);
                    setPreview(null);
                    setRev((n) => n + 1);
                  }}
                  label="Nhập dữ liệu"
                />
              )}
            </>
          )}
        </div>
      )}
      <div className="panel">
        <h2>Lịch sử nguồn</h2>
        <Loaded data={history.data} error={history.error}>
          {!history.data?.items.length ? (
            <Empty />
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Tệp nguồn</th>
                    <th>Loại</th>
                    <th>Kỳ</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data?.items.map((b: any) => (
                    <tr key={b.id}>
                      <td>{b.filename}</td>
                      <td>{adapterNames[b.adapter_code]}</td>
                      <td>
                        {b.period_start} – {b.period_end}
                      </td>
                      <td>{b.status}</td>
                      <td>
                        {b.status !== 'COMMITTED' && (
                          <button
                            onClick={() => {
                              setBatch(b);
                              setPreview(null);
                            }}
                          >
                            Kiểm tra tiếp
                          </button>
                        )}
                        <a href={'/api/v1/imports/' + b.id + '/source'}>Tệp gốc</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Loaded>
      </div>
      {!video && <MetricSummary resources={resources.data?.items || []} rev={rev} />}
    </>
  );
}
export function SourceRows({ rows }: any) {
  if (!rows?.length) return <Empty />;
  const keys = Object.keys(rows[0]).filter(
    (k) =>
      k !== 'id' &&
      !k.endsWith('_id') &&
      !k.endsWith('_ids') &&
      !['canonical_hash', 'checksum', 'storage_key', 'encrypted_payload'].includes(k),
  );
  const labels: Record<string, string> = {
    business_date: 'Ngày',
    revenue: 'Doanh thu',
    effective_revenue: 'Doanh thu hiệu quả',
    orders: 'Tổng đơn',
    cancelled_orders: 'Đơn hủy',
    refunded_orders: 'Đơn hoàn tiền',
    refund_amount: 'Tiền hoàn',
    cancelled_amount: 'Tiền hủy',
    cancel_rate: 'Tỷ lệ hủy',
    refund_rate: 'Tỷ lệ hoàn tiền',
    days: 'Số ngày có nguồn',
    gmv: 'GMV',
    estimated_commission: 'Hoa hồng ước tính',
    creator_key: 'KOC',
    creator_name_raw: 'Tên nguồn KOC',
    refunded_items: 'Số món hoàn',
    share: 'Tỷ trọng GMV',
    source_row: 'Dòng nguồn',
    order_id: 'Mã đơn',
    order_amount: 'Tiền cấp đơn',
    normalized_type: 'Loại xác minh',
    basis: 'Cơ sở kỳ',
    birthday: 'Ngày sinh',
    name: 'Họ tên',
    entity_type: 'Nhóm hồ sơ',
    revision: 'Phiên bản',
    number: 'Số hợp đồng',
    kind: 'Loại',
    status: 'Trạng thái',
    signed_on: 'Ngày ký',
    effective_from: 'Hiệu lực từ',
    expires_on: 'Hết hạn',
    reason: 'Lý do',
    created_at: 'Ngày ghi nhận',
    title: 'Tên hồ sơ',
    payload: 'Thông tin nguồn',
    currency: 'Tiền tệ',
  };
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{labels[k] || k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={r.id || i}>
              {keys.map((k) => (
                <td key={k}>
                  {r[k] === null
                    ? 'N/A'
                    : typeof r[k] === 'object'
                      ? JSON.stringify(r[k])
                      : String(r[k] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function MetricSummary({ resources, rev }: any) {
  const [data, setData] = useState<any>();
  return (
    <div className="panel">
      <h2>Kinh doanh sàn / KOC / Hoàn hủy</h2>
      <Form
        fields={[
          {
            key: 'kind',
            label: 'Báo cáo',
            type: 'select',
            options: [
              { value: 'sales', label: 'Bán hàng' },
              { value: 'koc', label: 'KOC · hoa hồng ước tính' },
              { value: 'returns', label: 'Hoàn/hủy theo basis' },
            ],
            required: true,
          },
          {
            key: 'resource_id',
            label: 'Shop',
            type: 'select',
            options: options(resources),
            required: true,
          },
          { key: 'from', label: 'Từ ngày', type: 'date', required: true },
          { key: 'to', label: 'Đến ngày', type: 'date', required: true },
        ]}
        initial={{ kind: 'sales' }}
        onSubmit={async (v) => {
          const r = resources.find((r: any) => r.id === v.resource_id);
          const q = new URLSearchParams({
            company_id: r.company_id,
            resource_id: r.id,
            from: v.from,
            to: v.to,
          });
          setData(await api('/' + v.kind + '/summary?' + q));
        }}
        label="Xem báo cáo nguồn"
      />
      {data && (
        <>
          <p>Độ phủ: {data.availability || 'Theo kỳ nguồn'}</p>
          {data.summary && <SourceRows rows={[data.summary]} />}
          <SourceRows rows={data.top10 || data.items} />
          {data.missing_reason && <p>N/A · {data.missing_reason}</p>}
        </>
      )}
    </div>
  );
}
export function ResourceSettings() {
  const [rev, setRev] = useState(0);
  const co = useLoad('/companies', rev),
    resources = useLoad('/resources', rev),
    platforms = useLoad('/platforms', rev),
    people = useLoad('/staff-directory', rev);
  const refresh = () => setRev((n) => n + 1);
  return (
    <div className="panel">
      <h2>Pháp nhân & quyền nguồn dữ liệu</h2>
      <h3>Thêm pháp nhân</h3>
      <Form
        fields={[
          { key: 'code', label: 'Mã pháp nhân', required: true },
          { key: 'name', label: 'Tên pháp nhân', required: true },
        ]}
        onSubmit={async (v) => {
          await api('/companies', v);
          refresh();
        }}
      />
      <h3>Thêm shop / kênh</h3>
      <Form
        fields={[
          {
            key: 'company_id',
            label: 'Pháp nhân',
            type: 'select',
            options: options(co.data?.items || []),
            required: true,
          },
          {
            key: 'platform_id',
            label: 'Nền tảng',
            type: 'select',
            options: options(platforms.data?.items || []),
            required: true,
          },
          {
            key: 'kind',
            label: 'Loại nguồn',
            type: 'select',
            options: [
              { value: 'SHOP', label: 'Shop' },
              { value: 'CHANNEL', label: 'Kênh' },
            ],
            required: true,
          },
          { key: 'label', label: 'Tên nguồn', required: true },
          { key: 'external_id', label: 'Mã nguồn bên ngoài (nếu có)' },
        ]}
        initial={{ kind: 'SHOP' }}
        onSubmit={async (v) => {
          await api('/resources', { ...v, external_id: v.external_id || null });
          refresh();
        }}
      />
      <h3>Cấp quyền nguồn</h3>
      {resources.data?.items.map((r: any) => (
        <details key={r.id}>
          <summary>
            {r.label} · {r.kind}
          </summary>
          <Form
            fields={[
              {
                key: 'user_ids',
                label: 'Người được cấp (thay danh sách hiện hành)',
                type: 'multi-select',
                options: options(people.data?.items || []),
              },
              {
                key: 'permission',
                label: 'Quyền nguồn',
                type: 'select',
                options: [
                  { value: 'READ', label: 'Đọc' },
                  { value: 'WRITE', label: 'Đọc và nhập nguồn' },
                ],
                required: true,
              },
              { key: 'reason', label: 'Lý do thay quyền', required: true },
            ]}
            initial={{ permission: 'READ', user_ids: [] }}
            onSubmit={async (v) => {
              await api(
                '/resources/' + r.id + '/grants',
                { ...v, expected_version: r.version },
                'PUT',
              );
              refresh();
            }}
          />
        </details>
      ))}
    </div>
  );
}
export function HandoffSettings() {
  const [rev, setRev] = useState(0);
  const load = useLoad('/settings', rev),
    row = load.data?.items.find((r: any) => r.key === 'handoff_policies'),
    v = row?.value;
  return (
    <div className="panel">
      <h2>Kỳ báo cáo & nhắc HR</h2>
      <Loaded data={v} error={load.error}>
        {v && (
          <Form
            key={row.version}
            fields={[
              {
                key: 'report_due_hour',
                label: 'Giờ hạn nộp thứ Hai (giờ Việt Nam)',
                type: 'number',
                required: true,
              },
              { key: 'report_due_minute', label: 'Phút hạn nộp', type: 'number', required: true },
              {
                key: 'probation',
                label: 'Nhắc hết thử việc trước (ngày lịch, cách nhau bằng dấu phẩy)',
                required: true,
              },
              {
                key: 'contract',
                label: 'Nhắc hết hợp đồng trước (ngày lịch, cách nhau bằng dấu phẩy)',
                required: true,
              },
              {
                key: 'birthday_offsets',
                label: 'Nhắc sinh nhật trước (ngày làm việc)',
                type: 'number',
                required: true,
              },
              {
                key: 'hr_reminders_enabled',
                label: 'Bật nhắc mốc thử việc/hợp đồng mới',
                type: 'checkbox',
              },
              {
                key: 'birthday_month_enabled',
                label: 'Thông báo danh sách sinh nhật đầu tháng',
                type: 'checkbox',
              },
              { key: 'birthday_soon_enabled', label: 'Nhắc sinh nhật sắp tới', type: 'checkbox' },
              { key: 'reason', label: 'Người chốt và lý do thay đổi', required: true },
            ]}
            initial={{
              ...v,
              report_due_minute: v.report_due_minute ?? 0,
              probation: v.probation_offsets.join(','),
              contract: v.contract_offsets.join(','),
              hr_reminders_enabled: v.hr_reminders_enabled ?? true,
              birthday_month_enabled: v.birthday_month_enabled ?? true,
              birthday_soon_enabled: v.birthday_soon_enabled ?? true,
            }}
            onSubmit={async (values) => {
              const { probation, contract, reason, ...value } = values;
              delete value.probation_offsets;
              delete value.contract_offsets;
              await api(
                '/settings/handoff_policies',
                {
                  value: {
                    ...value,
                    probation_offsets: String(probation).split(',').map(Number),
                    contract_offsets: String(contract).split(',').map(Number),
                  },
                  reason,
                  expected_version: row.version,
                },
                'PUT',
              );
              setRev((n) => n + 1);
            }}
          />
        )}
      </Loaded>
    </div>
  );
}
