import React, { useState } from 'react';
import { api, fmt } from './api';
import {
  Form,
  Loaded,
  useLoad,
  Modal,
  ErrorBox,
  Empty,
  Badge,
  roleLabel,
  options,
  Field,
} from './ui';
import { TaskDrawer } from './task-drawer';
import { useDebounced } from './accounts';
const phaseNames = {
    PROBATION: 'Thử việc',
    OFFICIAL: 'Chính thức',
    LEFT: 'Đã nghỉ việc',
    CANDIDATE: 'Hồ sơ tuyển dụng cũ',
  },
  typeNames = {
    FULL_TIME: 'Toàn thời gian',
    PART_TIME: 'Bán thời gian',
    INTERN: 'Thực tập',
    CONTRACTOR: 'Cộng tác',
  };
const documentNames = {
  IDENTITY: 'Giấy tờ định danh',
  CONTRACT: 'Hợp đồng',
  QUALIFICATION: 'Bằng cấp / chứng chỉ',
  PHOTO: 'Ảnh hồ sơ',
  OTHER: 'Tài liệu khác',
};
function day(v: any) {
  return v
    ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
        new Date(v + 'T12:00:00+07:00'),
      )
    : 'Chưa bổ sung';
}
export function EmployeeDirectory({ me }: { me: any }) {
  const [rev, setRev] = useState(0),
    [status, setStatus] = useState('active'),
    [search, setSearch] = useState(''),
    [team, setTeam] = useState(''),
    [position, setPosition] = useState(''),
    [phase, setPhase] = useState(''),
    [type, setType] = useState(''),
    [cursor, setCursor] = useState('0'),
    [selected, setSelected] = useState(''),
    [create, setCreate] = useState(false),
    [error, setError] = useState<any>();
  const query = useDebounced(search),
    conf = useLoad('/employees/options');
  const filters = { status, search: query, team_id: team, position, phase, type };
  const list = useLoad('/employees?' + new URLSearchParams({ ...filters, cursor }), rev);
  const refresh = () => setRev((r) => r + 1);
  return (
    <>
      <div className="heading">
        <p className="muted">
          Hồ sơ nhân viên trong phạm vi bạn được quản lý. Vị trí trong hồ sơ không tự thay đổi quyền
          website.
        </p>
        <div className="actions">
          <button
            onClick={async () => {
              try {
                const r = await api('/employees/exports', filters);
                window.location.assign(r.url);
              } catch (e) {
                setError(e);
              }
            }}
          >
            Xuất Excel
          </button>
          <button className="primary" onClick={() => setCreate(true)}>
            + Thêm nhân viên
          </button>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="tabs">
        <button
          className={status === 'active' ? 'active' : ''}
          onClick={() => {
            setStatus('active');
            setCursor('0');
          }}
        >
          Đang làm việc
        </button>
        <button
          className={status === 'archived' ? 'active' : ''}
          onClick={() => {
            setStatus('archived');
            setCursor('0');
          }}
        >
          Đã nghỉ việc
        </button>
      </div>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Tìm nhân viên"
          placeholder="Mã nhân sự hoặc họ tên…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor('0');
          }}
        />
        {[
          {
            label: 'Bộ phận',
            value: team,
            set: setTeam,
            items: (conf.data?.teams || []).map((t: any) => ({ value: t.id, label: t.name })),
          },
          {
            label: 'Vị trí',
            value: position,
            set: setPosition,
            items: options(conf.data?.positions || [], roleLabel),
          },
          {
            label: 'Giai đoạn',
            value: phase,
            set: setPhase,
            items: options(['PROBATION', 'OFFICIAL'], phaseNames),
          },
          {
            label: 'Loại hình',
            value: type,
            set: setType,
            items: options(Object.keys(typeNames), typeNames),
          },
        ].map((f) => (
          <select
            key={f.label}
            aria-label={'Lọc nhân sự theo ' + f.label}
            value={f.value}
            onChange={(e) => {
              f.set(e.target.value);
              setCursor('0');
            }}
          >
            <option value="">Tất cả {f.label.toLowerCase()}</option>
            {f.items.map((o: any) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
      </div>
      <Loaded data={list.data} error={list.error}>
        <div className="kpis">
          {[
            ['Đang làm', list.data?.summary.active],
            ['Đang thử việc', list.data?.summary.probation],
            [
              'Cần bổ sung hồ sơ',
              list.data?.checklist_configured
                ? list.data?.summary.incomplete
                : 'Chưa chốt checklist',
            ],
          ].map(([label, value]) => (
            <div className="kpi" key={label}>
              <small>{label}</small>
              <div className="value">{value}</div>
            </div>
          ))}
        </div>
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Bộ phận / vị trí</th>
                <th>Ngày vào làm</th>
                <th>Giai đoạn / loại hình</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((e: any) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    <small className="row-meta">
                      {e.employee_code || 'Chưa có mã · Cần HR bổ sung'}
                    </small>
                  </td>
                  <td>
                    {e.team_name || 'Chưa bổ sung bộ phận'}
                    <small className="row-meta">
                      {e.positions
                        .filter((p: any) => !p.effective_to)
                        .map((p: any) => roleLabel[p.position_code])
                        .join(' · ') || 'Chưa bổ sung vị trí'}
                    </small>
                  </td>
                  <td>{day(e.joined_on)}</td>
                  <td>
                    <Badge>{(phaseNames as any)[e.employment_state]}</Badge>
                    <small className="row-meta">
                      {(typeNames as any)[e.employment_type] || 'Chưa bổ sung loại hình'}
                    </small>
                  </td>
                  <td>
                    <button onClick={() => setSelected(e.id)}>Mở hồ sơ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.data?.items.length && <Empty>Không có nhân viên phù hợp bộ lọc.</Empty>}
        </div>
        <div className="pager">
          {cursor !== '0' && <button onClick={() => setCursor('0')}>Về đầu</button>}
          {list.data?.next_cursor && (
            <button onClick={() => setCursor(list.data.next_cursor)}>Trang tiếp</button>
          )}
        </div>
      </Loaded>
      {create && (
        <Modal compact title="Thêm nhân viên" onClose={() => setCreate(false)}>
          <EmployeeEditor
            me={me}
            onSaved={(id) => {
              setCreate(false);
              setSelected(id);
              refresh();
            }}
          />
        </Modal>
      )}
      {selected && (
        <EmployeeDrawer id={selected} me={me} onClose={() => setSelected('')} onChanged={refresh} />
      )}
    </>
  );
}
function EmployeeEditor({
  employee,
  me,
  onSaved,
}: {
  employee?: any;
  me: any;
  onSaved: (id: string) => void;
}) {
  const { data, error } = useLoad('/employees/options');
  const [positions, setPositions] = useState<string[]>(
      (employee?.positions || [])
        .filter((p: any) => !p.effective_to)
        .map((p: any) => p.position_code),
    ),
    [team, setTeam] = useState(employee?.team_id || '');
  const [expectedVersion, setExpectedVersion] = useState(employee?.version);
  const c = employee?.contact || {};
  const fields: Field[] = [
    {
      key: 'employee_code',
      label: 'Mã nhân sự',
      required: true,
      hint: 'Nhập mã đã được HR cấp; giữ nguyên số 0 đầu.',
    },
    { key: 'name', label: 'Họ tên', required: true },
    { key: 'joined_on', label: 'Ngày vào làm', type: 'date', required: true },
    { key: 'birthday', label: 'Ngày sinh', type: 'date' },
    {
      key: 'team_id',
      label: 'Bộ phận',
      type: 'select',
      options: (data?.teams || []).map((t: any) => ({ value: t.id, label: t.name })),
    },
    {
      key: 'manager_id',
      label: 'Quản lý',
      type: 'select',
      options: (data?.managers || [])
        .filter(
          (u: any) =>
            u.id !== employee?.user_id &&
            u.scopes.some((s: any) => s.scope === 'ALL' || s.team_id === team),
        )
        .map((u: any) => ({ value: u.id, label: u.name })),
    },
    {
      key: 'phase',
      label: 'Giai đoạn công việc',
      type: 'select',
      required: true,
      options: options(['PROBATION', 'OFFICIAL'], phaseNames),
    },
    {
      key: 'employment_type',
      label: 'Loại hình làm việc',
      type: 'select',
      required: true,
      options: options(Object.keys(typeNames), typeNames),
    },
    { key: 'probation_end', label: 'Ngày hết thử việc', type: 'date' },
    { key: 'contract_date', label: 'Ngày ký hợp đồng', type: 'date' },
    { key: 'contract_end', label: 'Ngày hết hợp đồng', type: 'date' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'email', label: 'Email cá nhân', type: 'email' },
    { key: 'address', label: 'Địa chỉ', type: 'textarea' },
    { key: 'emergency_name', label: 'Người liên hệ khẩn cấp' },
    { key: 'emergency_phone', label: 'Điện thoại khẩn cấp' },
    ...(me.admin && !employee?.user_id
      ? [
          {
            key: 'user_id',
            label: 'Liên kết tài khoản website (không tự cấp quyền)',
            type: 'select',
            options: (data?.users || []).map((u: any) => ({ value: u.id, label: u.name })),
          } as Field,
        ]
      : []),
  ];
  return (
    <Loaded data={data} error={error}>
      <Form
        fields={fields}
        initial={{
          phase: 'PROBATION',
          employment_type: 'FULL_TIME',
          ...employee,
          phone: c.phone || '',
          email: c.email || '',
          address: c.address || '',
          emergency_name: c.emergency_name || '',
          emergency_phone: c.emergency_phone || '',
        }}
        onChange={(v) => setTeam(v.team_id || '')}
        onSubmit={async (v, key) => {
          if (!positions.length) throw Error('Chọn ít nhất một vị trí.');
          const body = {
            ...v,
            positions,
            birthday: v.birthday || null,
            team_id: v.team_id || null,
            manager_id: v.manager_id || null,
            user_id: employee?.user_id || v.user_id || null,
            probation_end: v.probation_end || null,
            contract_date: v.contract_date || null,
            contract_end: v.contract_end || null,
            contact: {
              phone: v.phone || '',
              email: v.email || '',
              address: v.address || '',
              emergency_name: v.emergency_name || '',
              emergency_phone: v.emergency_phone || '',
            },
            expected_version: expectedVersion,
          };
          const out = await api(
            employee ? '/employees/' + employee.id : '/employees',
            body,
            employee ? 'PATCH' : 'POST',
            key,
          );
          onSaved(out.id);
        }}
        onConflict={
          employee
            ? async () => setExpectedVersion((await api('/employees/' + employee.id)).version)
            : undefined
        }
        label="Lưu hồ sơ nhân viên"
      >
        <fieldset>
          <legend>Vị trí · chọn ít nhất một</legend>
          <div className="check-grid">
            {data?.positions.map((p: string) => (
              <label className="check" key={p}>
                <input
                  type="checkbox"
                  checked={positions.includes(p)}
                  onChange={(e) =>
                    setPositions(
                      e.target.checked ? [...positions, p] : positions.filter((v) => v !== p),
                    )
                  }
                />
                {roleLabel[p]}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="notice">
          Chuyên môn trong hồ sơ được lưu riêng. Cấp quyền website tại Đội ngũ & phân quyền.
        </p>
      </Form>
    </Loaded>
  );
}
function EmployeeDrawer({ id, me, onClose, onChanged }: any) {
  const [rev, setRev] = useState(0),
    [tab, setTab] = useState('info'),
    [edit, setEdit] = useState(false),
    [leave, setLeave] = useState(false),
    [notice, setNotice] = useState('');
  const { data: e, error } = useLoad('/employees/' + id, rev),
    conf = useLoad('/employees/options'),
    handover = useLoad(leave ? '/employees/' + id + '/handover' : null);
  const refresh = () => {
    setRev((r) => r + 1);
    onChanged();
  };
  const team = conf.data?.teams.find((t: any) => t.id === e?.team_id)?.name,
    manager = conf.data?.managers.find((u: any) => u.id === e?.manager_id)?.name;
  return (
    <>
      <TaskDrawer
        title={e?.name || 'Đang tải hồ sơ…'}
        eyebrow="HỒ SƠ NHÂN SỰ"
        dialogLabel="Hồ sơ nhân viên"
        profile
        onClose={onClose}
        meta={
          e && (
            <div className="drawer-meta">
              <span>{e.employee_code || 'Chưa có mã nhân sự'}</span>
              <Badge>{(phaseNames as any)[e.employment_state]}</Badge>
            </div>
          )
        }
        footer={
          e?.capabilities.edit && (
            <button className="primary" onClick={() => setEdit(true)}>
              Chỉnh sửa hồ sơ
            </button>
          )
        }
      >
        <Loaded data={e} error={error}>
          {e && (
            <>
              {notice && (
                <div className="success" role="status">
                  {notice}
                </div>
              )}
              <div className="drawer-tabs" role="tablist" aria-label="Nội dung hồ sơ">
                {[
                  ['info', 'Thông tin'],
                  ['work', 'Công việc'],
                  ['documents', 'Tài liệu'],
                ].map(([key, label]) => (
                  <button
                    role="tab"
                    id={'employee-tab-' + key}
                    aria-controls={'employee-panel-' + key}
                    aria-selected={tab === key}
                    className={tab === key ? 'active' : ''}
                    key={key}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <section
                role="tabpanel"
                id="employee-panel-info"
                aria-labelledby="employee-tab-info"
                hidden={tab !== 'info'}
              >
                {e.contact.photo_asset_id && (
                  <img
                    className="employee-photo"
                    alt={'Ảnh hồ sơ ' + e.name}
                    src={'/api/v1/assets/' + e.contact.photo_asset_id + '/download?preview=photo'}
                  />
                )}
                <dl className="task-facts">
                  {[
                    ['Mã nhân sự', e.employee_code],
                    ['Họ tên', e.name],
                    ['Ngày sinh', day(e.birthday)],
                    ['Điện thoại', e.contact.phone],
                    ['Email', e.contact.email],
                    ['Địa chỉ', e.contact.address],
                    ['Liên hệ khẩn cấp', e.contact.emergency_name],
                    ['Điện thoại khẩn cấp', e.contact.emergency_phone],
                  ].map(([label, v]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{v || 'Chưa bổ sung'}</dd>
                    </div>
                  ))}
                </dl>
                <p className="notice">CCCD, lương và thông tin nhận lương được kiểm quyền riêng.</p>
                {e.capabilities.sensitive && (
                  <SensitiveProfile
                    e={e}
                    onSaved={() => {
                      setNotice('Đã lưu thông tin nhạy cảm.');
                      refresh();
                    }}
                  />
                )}
              </section>
              <section
                role="tabpanel"
                id="employee-panel-work"
                aria-labelledby="employee-tab-work"
                hidden={tab !== 'work'}
              >
                <dl className="task-facts">
                  {[
                    ['Bộ phận', team],
                    ['Quản lý', manager],
                    ['Ngày vào làm', day(e.joined_on)],
                    ['Giai đoạn', (phaseNames as any)[e.employment_state]],
                    ['Loại hình', (typeNames as any)[e.employment_type]],
                    ['Hết thử việc', day(e.probation_end)],
                    ['Ngày ký hợp đồng', day(e.contract_date)],
                    ['Hết hợp đồng', day(e.contract_end)],
                    ['Ngày nghỉ việc', day(e.left_on)],
                  ].map(([label, v]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{v || 'Chưa bổ sung'}</dd>
                    </div>
                  ))}
                </dl>
                <h3>Vị trí công việc</h3>
                {e.positions.map((p: any) => (
                  <p key={p.id}>
                    {roleLabel[p.position_code]} · {day(p.effective_from)} →{' '}
                    {p.effective_to ? day(p.effective_to) : 'Hiện tại'}
                  </p>
                ))}
                <h3>Lịch sử công tác</h3>
                {e.events.map((v: any) => (
                  <p key={v.id}>
                    {(
                      {
                        PROFILE_CREATED: 'Tạo hồ sơ',
                        PROFILE_UPDATED: 'Điều chỉnh hồ sơ',
                        PROBATION_STARTED: 'Bắt đầu thử việc',
                        OFFICIAL: 'Chuyển chính thức',
                        LEFT: 'Nghỉ việc',
                      } as any
                    )[v.kind] || 'Cập nhật công tác'}{' '}
                    · {day(v.business_date)}
                    {v.payload?.reason && ' · ' + v.payload.reason}
                  </p>
                ))}
                {e.capabilities.leave && (
                  <button className="danger" onClick={() => setLeave(true)}>
                    Ghi nhận nghỉ việc
                  </button>
                )}
              </section>
              <section
                role="tabpanel"
                id="employee-panel-documents"
                aria-labelledby="employee-tab-documents"
                hidden={tab !== 'documents'}
              >
                <h3>Tài liệu nhân viên</h3>
                {!e.checklist_configured ? (
                  <p className="notice">
                    Chưa chốt danh mục hồ sơ bắt buộc. Không tự áp dụng checklist mẫu.
                  </p>
                ) : (
                  <p>
                    {e.missing_documents.length
                      ? 'Cần bổ sung: ' +
                        e.missing_documents
                          .map((v: string) => (documentNames as any)[v] || v)
                          .join(', ')
                      : 'Đã đủ tài liệu theo checklist đã chốt.'}
                  </p>
                )}
                {e.documents.map((d: any) => (
                  <div className="attachment-link" key={d.id}>
                    <a href={'/api/v1/assets/' + d.asset_id + '/download'}>{d.filename}</a>
                    {e.capabilities.edit &&
                      d.document_kind === 'PHOTO' &&
                      /\.(png|jpe?g|webp)$/i.test(d.filename) && (
                        <Form
                          fields={[]}
                          label="Đặt làm ảnh hồ sơ"
                          onSubmit={async (v, key) => {
                            await api(
                              '/employees/' + e.id + '/photo',
                              { asset_id: d.asset_id, expected_version: e.version },
                              'PUT',
                              key,
                            );
                            setNotice('Đã cập nhật ảnh hồ sơ.');
                            refresh();
                          }}
                        />
                      )}
                    <small>
                      {(documentNames as any)[d.document_kind] || d.document_kind} ·{' '}
                      {d.classification === 'SENSITIVE'
                        ? 'Quyền hồ sơ nhạy cảm'
                        : 'Trong phạm vi nhân sự'}
                    </small>
                  </div>
                ))}
                {!e.documents.length && <Empty>Chưa có tài liệu được phép xem.</Empty>}
                {e.capabilities.edit && <EmployeeDocuments e={e} onSaved={refresh} />}
              </section>
            </>
          )}
        </Loaded>
      </TaskDrawer>
      {edit && e && (
        <Modal compact title={'Chỉnh sửa · ' + e.name} onClose={() => setEdit(false)}>
          <EmployeeEditor
            employee={e}
            me={me}
            onSaved={() => {
              setEdit(false);
              setNotice('Đã lưu hồ sơ nhân viên.');
              refresh();
            }}
          />
        </Modal>
      )}
      {leave && e && (
        <Modal compact title={'Nghỉ việc · ' + e.name} onClose={() => setLeave(false)}>
          <p className="notice">
            Hồ sơ sẽ lưu trữ; tài khoản đăng nhập, session và quyền chia sẻ của người này bị thu
            hồi. Task, báo cáo và lịch sử mật khẩu được giữ. Không tự đổi mật khẩu bên ngoài.
          </p>
          <Loaded data={handover.data} error={handover.error}>
            <h3>Việc cần bàn giao</h3>
            {handover.data?.tasks.map((t: any) => (
              <p key={t.id}>{t.title}</p>
            ))}
            {!handover.data?.tasks.length && <p>Không có công việc đang mở.</p>}
          </Loaded>
          <Form
            fields={[
              { key: 'left_on', label: 'Ngày nghỉ việc', type: 'date', required: true },
              { key: 'reason', label: 'Lý do nghỉ việc', type: 'textarea', required: true },
              {
                key: 'confirm_disable',
                label: 'Tôi xác nhận khóa tài khoản và đã sắp xếp bàn giao',
                type: 'checkbox',
                required: true,
              },
            ]}
            onSubmit={async (v, key) => {
              await api(
                '/employees/' + id + '/leave',
                { ...v, expected_version: e.version },
                'POST',
                key,
              );
              setLeave(false);
              setNotice('Đã lưu trữ và thu hồi quyền đăng nhập.');
              refresh();
            }}
            label="Xác nhận nghỉ việc"
          />
        </Modal>
      )}
    </>
  );
}
function EmployeeDocuments({ e, onSaved }: any) {
  const [file, setFile] = useState<File | null>(null),
    [kind, setKind] = useState('OTHER'),
    [classification, setClassification] = useState('BASIC'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>();
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file || busy) return;
        setBusy(true);
        setError(null);
        try {
          const fd = new FormData();
          fd.set('employee_id', e.id);
          fd.set('document_kind', kind);
          fd.set('classification', classification);
          fd.set('file', file);
          await api('/assets', fd);
          onSaved();
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Phân loại tài liệu
        <select
          aria-label="Phân loại tài liệu"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            if (event.target.value === 'IDENTITY') setClassification('SENSITIVE');
          }}
        >
          {Object.entries(documentNames).map(([value, label]) => (
            <option
              value={value}
              key={value}
              disabled={value === 'IDENTITY' && !e.capabilities.sensitive}
            >
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quyền tài liệu
        <select
          aria-label="Quyền tài liệu"
          value={classification}
          onChange={(event) => setClassification(event.target.value)}
        >
          <option value="BASIC">Trong phạm vi nhân sự</option>
          {e.capabilities.sensitive && <option value="SENSITIVE">Hồ sơ nhạy cảm</option>}
        </select>
      </label>
      <p className="muted">Giấy tờ định danh, lương, BHXH và thuế phải chọn Hồ sơ nhạy cảm.</p>
      <label>
        Tệp hồ sơ nhân sự
        <input
          type="file"
          required
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
      </label>
      <ErrorBox error={error} />
      <button disabled={busy || !file}>{busy ? 'Đang tải…' : 'Tải tài liệu nhân sự'}</button>
    </form>
  );
}
function SensitiveProfile({ e, onSaved }: any) {
  const [open, setOpen] = useState(false),
    { data, error } = useLoad(open ? '/employees/' + e.id + '/sensitive' : null);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Thông tin nhạy cảm · có quyền riêng</summary>
      <Loaded data={data} error={error}>
        {data && (
          <Form
            fields={[
              { key: 'salary', label: 'Thông tin lương' },
              { key: 'identity_document', label: 'Giấy tờ định danh' },
              { key: 'tax_id', label: 'Mã số thuế' },
              { key: 'social_insurance', label: 'Mã số BHXH' },
              { key: 'bank_name', label: 'Ngân hàng nhận lương' },
              { key: 'bank_account', label: 'Tài khoản nhận lương' },
              { key: 'notes', label: 'Ghi chú nhạy cảm', type: 'textarea' },
            ]}
            initial={data.data || { salary: '', identity_document: '', notes: '' }}
            onSubmit={async (v, key) => {
              await api(
                '/employees/' + e.id + '/sensitive',
                { data: v, expected_version: e.version },
                'PUT',
                key,
              );
              onSaved();
            }}
            label="Lưu thông tin nhạy cảm"
          />
        )}
      </Loaded>
    </details>
  );
}
