import React, { useState } from 'react';
import { api, fmt, iso, localInput } from './api';
import {
  Form,
  Loaded,
  useLoad,
  Empty,
  Modal,
  Badge,
  options,
  roleLabel,
  statusLabel,
  type Field,
} from './ui';
import { Upload } from './tasks';
export function Records({ module, me }: { module: string; me: any }) {
  const [rev, setRev] = useState(0),
    [kind, setKind] = useState(''),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<any>(),
    [creating, setCreating] = useState(false),
    [cursor, setCursor] = useState('0');
  const conf = useLoad('/modules'),
    list = useLoad(
      `/records?module=${module}&kind=${kind}&search=${encodeURIComponent(search)}&cursor=${cursor}`,
      rev,
    );
  const kinds = Object.entries(conf.data?.kinds || {}).filter(([, c]: any) => c.module === module);
  const selectedKind = selected?.kind || kind || (kinds[0]?.[0] as string),
    config = conf.data?.kinds[selectedKind];
  const refresh = () => setRev((r) => r + 1);
  const open = async (id: string) => {
    try {
      setSelected(await api('/records/' + id));
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Tìm hồ sơ"
          placeholder="Tìm theo tên…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor('0');
          }}
        />
        <select
          aria-label="Loại hồ sơ"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setCursor('0');
          }}
        >
          <option value="">Tất cả loại hồ sơ</option>
          {kinds.map(([k, c]: any) => (
            <option key={k} value={k}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="primary" disabled={!kinds.length} onClick={() => setCreating(true)}>
          + Thêm hồ sơ
        </button>
      </div>
      <Loaded data={list.data} error={list.error}>
        {list.data?.source && <div className="notice">{list.data.source}</div>}
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>Hồ sơ</th>
                <th>Loại / trạng thái</th>
                <th>Người nhập</th>
                <th>Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <button className="text-link" onClick={() => open(r.id)}>
                      {r.title}
                    </button>
                    <div className="code">{r.id}</div>
                  </td>
                  <td>
                    {conf.data?.kinds[r.kind]?.name || r.kind}
                    <br />
                    <Badge>{r.status}</Badge>
                  </td>
                  <td>
                    {r.owner_name}
                    <div className="row-meta">{r.company}</div>
                  </td>
                  <td>{fmt(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.data?.items.length && <Empty />}
        </div>
        <div className="pager">
          {cursor !== '0' && <button onClick={() => setCursor('0')}>Về đầu</button>}
          {list.data?.next_cursor && (
            <button onClick={() => setCursor(list.data.next_cursor)}>Trang tiếp</button>
          )}
        </div>
      </Loaded>
      {(creating || selected) && config && (
        <Modal
          title={selected ? 'Chi tiết · ' + selected.title : 'Thêm ' + config.name}
          onClose={() => {
            setCreating(false);
            setSelected(null);
          }}
        >
          {!selected && (
            <label>
              Loại hồ sơ
              <select value={selectedKind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map(([k, c]: any) => (
                  <option key={k} value={k}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Form
            key={(selected?.id || 'new') + selectedKind}
            fields={[
              { key: 'title', label: 'Tên hồ sơ', required: true },
              { key: 'company', label: 'Pháp nhân / phạm vi sở hữu' },
              { key: 'status', label: 'Giai đoạn', required: true },
              ...Object.entries(config.fields).map(([key, f]: any) => ({
                key: 'payload_' + key,
                label: f.label,
                type: f.type === 'text' ? 'textarea' : f.type,
                required: f.required,
                hint: key.endsWith('_id')
                  ? 'Mã của hồ sơ liên quan, hiển thị trong danh sách.'
                  : undefined,
              })),
            ]}
            initial={{
              title: selected?.title || '',
              company: selected?.company || '',
              status: selected?.status || 'DRAFT',
              ...Object.fromEntries(
                Object.entries(selected?.payload || {}).map(([k, v]) => [
                  'payload_' + k,
                  config.fields[k]?.type === 'datetime-local' && v ? localInput(v as string) : v,
                ]),
              ),
            }}
            onSubmit={async (v, key) => {
              const payload: any = {};
              for (const [k, f] of Object.entries(config.fields) as any[])
                if (v['payload_' + k] !== undefined)
                  payload[k] =
                    f.type === 'datetime-local' && v['payload_' + k]
                      ? iso(v['payload_' + k])
                      : v['payload_' + k];
              const out = await api(
                selected ? '/records/' + selected.id : '/records',
                {
                  title: v.title,
                  company: v.company || '',
                  status: v.status,
                  kind: selectedKind,
                  payload,
                  expected_version: selected?.version,
                },
                selected ? 'PATCH' : 'POST',
                key,
              );
              if (out.warnings?.length) alert(out.warnings.join('\n'));
              setSelected(null);
              setCreating(false);
              refresh();
            }}
          />
          {selected && (
            <div className="detail-section">
              <h3>Tài liệu hồ sơ</h3>
              {selected.assets?.map((f: any) => (
                <p key={f.id}>
                  <a href={'/api/v1/assets/' + f.id + '/download'}>{f.filename}</a>
                </p>
              ))}
              <Upload recordId={selected.id} onDone={() => open(selected.id)} />
            </div>
          )}
        </Modal>
      )}
      {module === 'hr' && <Employees me={me} />}
    </>
  );
}
function Employees({ me }: { me: any }) {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/employees', rev),
    [selected, setSelected] = useState<any>(),
    [create, setCreate] = useState(false),
    [sensitive, setSensitive] = useState<any>(),
    directory = useLoad('/directory/invitees');
  const refresh = () => setRev((r) => r + 1),
    open = async (id: string) => setSelected(await api('/employees/' + id));
  return (
    <div className="panel">
      <div className="heading">
        <h2>Nhân viên & lịch sử tuyển dụng</h2>
        <button onClick={() => setCreate(true)}>+ Tạo hồ sơ nhân viên</button>
      </div>
      <Loaded data={data} error={error}>
        {data?.items.map((e: any) => (
          <div className="support-row" key={e.id}>
            <button
              className="text-link"
              onClick={() => {
                setSensitive(null);
                open(e.id);
              }}
            >
              {e.name}
            </button>{' '}
            · <Badge>{e.employment_state}</Badge>
            <small>
              {' '}
              · Thử việc:{' '}
              {e.probation_start ? String(e.probation_start).slice(0, 10) : 'Chưa bắt đầu'}
            </small>
          </div>
        ))}
      </Loaded>
      {create && (
        <Modal title="Tạo hồ sơ nhân viên" onClose={() => setCreate(false)}>
          <Form
            fields={[
              { key: 'name', label: 'Họ tên', required: true },
              {
                key: 'user_id',
                label: 'Tài khoản website (nếu có)',
                type: 'select',
                options: (directory.data?.items || []).map((u: any) => ({
                  value: u.id,
                  label: u.name,
                })),
              },
              { key: 'candidate_id', label: 'Mã hồ sơ ứng viên (nếu chuyển từ tuyển dụng)' },
              { key: 'birthday', label: 'Ngày sinh', type: 'date' },
              { key: 'contract_date', label: 'Ngày hợp đồng', type: 'date' },
              {
                key: 'recruiter_id',
                label: 'Người tuyển',
                type: 'select',
                options: (directory.data?.items || []).map((u: any) => ({
                  value: u.id,
                  label: u.name,
                })),
              },
            ]}
            onSubmit={async (v, key) => {
              await api(
                '/employees',
                {
                  ...v,
                  user_id: v.user_id || null,
                  candidate_id: v.candidate_id || null,
                  birthday: v.birthday || null,
                  contract_date: v.contract_date || null,
                  recruiter_id: v.recruiter_id || null,
                },
                'POST',
                key,
              );
              setCreate(false);
              refresh();
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal
          title={selected.name}
          onClose={() => {
            setSelected(null);
            setSensitive(null);
          }}
        >
          <Form
            fields={[
              { key: 'name', label: 'Họ tên', required: true },
              { key: 'birthday', label: 'Ngày sinh', type: 'date' },
              { key: 'contract_date', label: 'Ngày hợp đồng', type: 'date' },
            ]}
            initial={{
              name: selected.name,
              birthday: selected.birthday?.slice(0, 10) || '',
              contract_date: selected.contract_date?.slice(0, 10) || '',
            }}
            onSubmit={async (v, key) => {
              await api(
                '/employees/' + selected.id,
                {
                  ...v,
                  birthday: v.birthday || null,
                  contract_date: v.contract_date || null,
                  expected_version: selected.version,
                },
                'PATCH',
                key,
              );
              await open(selected.id);
              refresh();
            }}
          />
          {selected.employment_state === 'CANDIDATE' && (
            <div className="detail-section">
              <Form
                fields={[
                  {
                    key: 'actual_start_date',
                    label: 'Ngày thực tế bắt đầu thử việc',
                    type: 'date',
                    required: true,
                  },
                ]}
                onSubmit={async (v, key) => {
                  await api(
                    '/employees/' + selected.id + '/probation-start',
                    { ...v, expected_version: selected.version },
                    'POST',
                    key,
                  );
                  await open(selected.id);
                  refresh();
                }}
                label="Ghi nhận bắt đầu thử việc"
              />
              <small>Tạo thông báo HR một lần; không tự tính hoặc chi thưởng.</small>
            </div>
          )}
          {['PROBATION', 'OFFICIAL'].includes(selected.employment_state) && (
            <div className="detail-section">
              <Form
                fields={[
                  {
                    key: 'state',
                    label: 'Trạng thái mới',
                    type: 'select',
                    required: true,
                    options: options(
                      selected.employment_state === 'PROBATION' ? ['OFFICIAL', 'LEFT'] : ['LEFT'],
                    ),
                  },
                  { key: 'date', label: 'Ngày hiệu lực', type: 'date', required: true },
                  { key: 'reason', label: 'Lý do / quyết định', required: true, type: 'textarea' },
                ]}
                onSubmit={async (v, key) => {
                  await api(
                    '/employees/' + selected.id + '/employment',
                    { ...v, expected_version: selected.version },
                    'POST',
                    key,
                  );
                  await open(selected.id);
                  refresh();
                }}
                label="Ghi nhận quyết định"
              />
            </div>
          )}
          {(me.admin || me.grants.some((g: any) => g.role === 'HR_SENSITIVE')) && (
            <div className="detail-section">
              <button
                onClick={async () => {
                  try {
                    setSensitive(
                      (await api('/employees/' + selected.id + '/sensitive')).data || {},
                    );
                  } catch (e) {
                    alert((e as Error).message);
                  }
                }}
              >
                Mở hồ sơ nhạy cảm (có ghi nhật ký)
              </button>
              {sensitive && (
                <Form
                  fields={[
                    { key: 'salary', label: 'Thông tin lương', type: 'textarea' },
                    {
                      key: 'identity_document',
                      label: 'Thông tin giấy tờ định danh',
                      type: 'textarea',
                    },
                    { key: 'notes', label: 'Ghi chú riêng', type: 'textarea' },
                  ]}
                  initial={{ salary: '', identity_document: '', notes: '', ...sensitive }}
                  onSubmit={async (v, key) => {
                    await api(
                      '/employees/' + selected.id + '/sensitive',
                      { data: v, expected_version: selected.version },
                      'PUT',
                      key,
                    );
                    setSensitive(null);
                    await open(selected.id);
                    refresh();
                  }}
                />
              )}
            </div>
          )}
          <div className="detail-section">
            <h3>Lịch sử</h3>
            {selected.events.map((e: any) => (
              <p key={e.id}>
                {e.kind} · {String(e.business_date).slice(0, 10)} · {fmt(e.created_at)}
              </p>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
export function Requests({ me }: { me: any }) {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/requests', rev),
    conf = useLoad('/modules'),
    [selected, setSelected] = useState<any>(),
    [creating, setCreating] = useState(false);
  const refresh = () => setRev((r) => r + 1);
  const fields: Field[] = [
    { key: 'title', label: 'Tên đề nghị', required: true },
    {
      key: 'kind',
      label: 'Loại đề nghị',
      type: 'select',
      required: true,
      options: options(conf.data?.requestKinds || []),
    },
    { key: 'company', label: 'Pháp nhân', required: true },
    { key: 'amount', label: 'Số tiền dự kiến (bỏ trống nếu chưa có giá)' },
    { key: 'currency', label: 'Tiền tệ', required: true },
    { key: 'needed_on', label: 'Ngày cần', type: 'date' },
    { key: 'purpose', label: 'Mục đích', type: 'textarea' },
    { key: 'supplier', label: 'Nhà cung cấp / bên xử lý (nếu có)' },
    { key: 'task_id', label: 'Mã task liên quan' },
    {
      key: 'items',
      label: 'Danh sách cần mua / mượn / xử lý',
      type: 'array',
      fields: [
        { key: 'name', label: 'Nội dung', required: true },
        { key: 'quantity', label: 'Số lượng', type: 'number', required: true },
        { key: 'unit', label: 'Đơn vị', required: true },
      ],
    },
  ];
  return (
    <>
      <div className="heading">
        <p className="muted">
          Tách đề nghị, phê duyệt và xử lý thực tế. Không tự phát hành hóa đơn hoặc chi tiền.
        </p>
        <button className="primary" onClick={() => setCreating(true)}>
          + Tạo đề nghị
        </button>
      </div>
      <Loaded data={data} error={error}>
        <div className="panel">
          {data?.items.length ? (
            data.items.map((r: any) => (
              <div className="support-row" key={r.id}>
                <button className="text-link" onClick={() => setSelected(r)}>
                  {r.title}
                </button>{' '}
                <Badge>{statusLabel[r.state] || r.state}</Badge>
                <p>
                  {r.owner_name} · {r.company} ·{' '}
                  {r.amount === null ? 'Chưa có giá' : r.amount + ' ' + r.currency}
                </p>
                {r.policy_snapshot && (
                  <small>
                    Đang ở bước {r.step + 1} / {r.policy_snapshot.approvers.length}
                  </small>
                )}
              </div>
            ))
          ) : (
            <Empty />
          )}
        </div>
      </Loaded>
      {(creating || selected) && (
        <Modal
          title={selected?.title || 'Tạo đề nghị'}
          onClose={() => {
            setSelected(null);
            setCreating(false);
          }}
        >
          {(!selected || selected.owner_id === me.id) &&
            !['SUBMITTED', 'FULFILLED'].includes(selected?.state) && (
              <Form
                fields={fields}
                initial={{
                  kind: 'PURCHASE',
                  currency: 'VND',
                  purpose: '',
                  supplier: '',
                  items: [],
                  ...selected,
                  ...selected?.payload,
                  needed_on: selected?.needed_on?.slice(0, 10) || '',
                }}
                onSubmit={async (v, key) => {
                  await api(
                    selected ? '/requests/' + selected.id : '/requests',
                    {
                      title: v.title,
                      kind: v.kind,
                      company: v.company,
                      amount: v.amount || null,
                      currency: v.currency,
                      needed_on: v.needed_on || null,
                      task_id: v.task_id || null,
                      payload: {
                        purpose: v.purpose || '',
                        supplier: v.supplier || '',
                        items: v.items || [],
                        external_invoice_status: 'NOT_ISSUED',
                        external_invoice_id: '',
                      },
                      expected_version: selected?.version,
                    },
                    selected ? 'PATCH' : 'POST',
                    key,
                  );
                  setSelected(null);
                  setCreating(false);
                  refresh();
                }}
                label={
                  selected?.state === 'APPROVED'
                    ? 'Sửa thành bản mới, cần duyệt lại'
                    : 'Lưu nháp đề nghị'
                }
              />
            )}{' '}
          {selected && (
            <>
              <div className="detail-section">
                <h3>Chi tiết đề nghị</h3>
                <p className="prewrap">{selected.payload.purpose}</p>
                {selected.payload.items?.map((i: any, n: number) => (
                  <p key={n}>
                    {i.name} · {i.quantity} {i.unit}
                  </p>
                ))}
                <small>
                  {selected.kind === 'SALES_INVOICE_REQUEST'
                    ? 'Yêu cầu xuất hóa đơn chưa phải hóa đơn đã được phát hành.'
                    : ''}
                </small>
              </div>
              {selected.owner_id === me.id &&
                ['DRAFT', 'NEEDS_INFO', 'REJECTED'].includes(selected.state) && (
                  <Form
                    fields={[]}
                    onSubmit={async (v, key) => {
                      await api(
                        '/requests/' + selected.id + '/submit',
                        { expected_version: selected.version },
                        'POST',
                        key,
                      );
                      setSelected(null);
                      refresh();
                    }}
                    label="Nộp đề nghị"
                  />
                )}
              {selected.state === 'SUBMITTED' &&
                selected.policy_snapshot?.approvers[selected.step] === me.id && (
                  <Form
                    fields={[
                      {
                        key: 'decision',
                        label: 'Quyết định',
                        type: 'select',
                        required: true,
                        options: [
                          { value: 'APPROVE', label: 'Duyệt bước này' },
                          { value: 'REJECT', label: 'Từ chối' },
                          { value: 'NEEDS_INFO', label: 'Yêu cầu bổ sung' },
                        ],
                      },
                      { key: 'note', label: 'Nhận xét / căn cứ', required: true, type: 'textarea' },
                    ]}
                    onSubmit={async (v, key) => {
                      await api(
                        '/requests/' + selected.id + '/decision',
                        { ...v, expected_version: selected.version },
                        'POST',
                        key,
                      );
                      setSelected(null);
                      refresh();
                    }}
                    label="Ghi quyết định"
                  />
                )}
              {selected.state === 'APPROVED' &&
                (me.admin || me.grants.some((g: any) => g.role === 'ACCOUNTANT')) && (
                  <Form
                    fields={[
                      {
                        key: 'external_reference',
                        label: 'Mã xử lý ở hệ thống / hồ sơ bên ngoài',
                        required: true,
                      },
                      {
                        key: 'note',
                        label: 'Nội dung đã xử lý và căn cứ',
                        required: true,
                        type: 'textarea',
                      },
                    ]}
                    onSubmit={async (v, key) => {
                      await api(
                        '/requests/' + selected.id + '/fulfillment',
                        { ...v, expected_version: selected.version },
                        'POST',
                        key,
                      );
                      setSelected(null);
                      refresh();
                    }}
                    label="Ghi nhận xử lý thực tế"
                  />
                )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
