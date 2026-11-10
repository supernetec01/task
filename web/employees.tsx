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
  useHourlyRefresh,
} from './ui';
import { UserAccessWizard } from './user-access';
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
  PAYROLL: 'Lương / thưởng',
  TAX: 'Thuế',
  SOCIAL_INSURANCE: 'BHXH',
};
function day(v: any) {
  return v
    ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
        new Date(v + 'T12:00:00+07:00'),
      )
    : 'Chưa bổ sung';
}
export function EmployeeDirectory({
  me,
  initialSelected = '',
}: {
  me: any;
  initialSelected?: string;
}) {
  const [rev, setRev] = useState(0),
    [status, setStatus] = useState('active'),
    [search, setSearch] = useState(''),
    [team, setTeam] = useState(''),
    [position, setPosition] = useState(''),
    [phase, setPhase] = useState(''),
    [type, setType] = useState(''),
    [cursor, setCursor] = useState('0'),
    [selected, setSelected] = useState(initialSelected),
    [create, setCreate] = useState(false),
    [error, setError] = useState<any>(),
    [showFilters, setShowFilters] = useState(false);
  const query = useDebounced(search),
    conf = useLoad('/employees/options');
  const filters = { status, search: query, team_id: team, position, phase, type };
  const list = useLoad('/employees?' + new URLSearchParams({ ...filters, cursor }), rev);
  const refresh = () => setRev((r) => r + 1);
  useHourlyRefresh(refresh);
  const canEdit = me.admin || me.grants.some((g: any) => g.kind === 'JOB' && g.role === 'HR');
  return (
    <>
      <div className="heading">
        <p className="muted">
          Hồ sơ toàn công ty · Tự cập nhật mỗi 60 phút. Hồ sơ nhân viên và quyền đăng nhập được quản
          lý riêng.
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
          <button onClick={refresh}>Tải lại danh sách</button>
          {canEdit && (
            <button className="primary" onClick={() => setCreate(true)}>
              + Thêm nhân viên
            </button>
          )}
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
      <div className="toolbar hr-toolbar">
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
        <button aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          Bộ lọc
          {[team, position, phase, type].filter(Boolean).length
            ? ` · ${[team, position, phase, type].filter(Boolean).length}`
            : ''}
        </button>
      </div>
      <div className="hr-filters" hidden={!showFilters}>
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
        <button
          onClick={() => {
            setTeam('');
            setPosition('');
            setPhase('');
            setType('');
            setCursor('0');
          }}
        >
          Xóa bộ lọc
        </button>
      </div>
      <Loaded data={list.data} error={list.error}>
        <div className="kpis">
          {[
            ['Đang làm', list.data?.summary.active],
            ['Đang thử việc', list.data?.summary.probation],
            [
              'Cần bổ sung hồ sơ',
              list.data?.checklist_configured ? list.data?.summary.incomplete : '—',
            ],
          ].map(([label, value]) => (
            <div className="kpi" key={label}>
              <small>{label}</small>
              <div className="value">{value}</div>
            </div>
          ))}
        </div>
        <p className="muted list-scope">
          Số liệu theo bộ lọc hiện tại · {list.data?.total || 0} hồ sơ
          {!list.data?.checklist_configured && ' · Chưa cấu hình checklist bắt buộc'}
        </p>
        <div className="panel tablewrap employee-list">
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
                  <td className="employee-name">
                    <button className="text-link" onClick={() => setSelected(e.id)}>
                      {e.name}
                    </button>
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
                  <td className="employee-date">{day(e.joined_on)}</td>
                  <td className="employee-phase">
                    <Badge>{(phaseNames as any)[e.employment_state]}</Badge>
                    <small className="row-meta">
                      {(typeNames as any)[e.employment_type] || 'Chưa bổ sung loại hình'}
                    </small>
                  </td>
                  <td className="employee-open">
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
      required: !employee,
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
      readonly: !!employee,
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
        fields={fields.filter((f) =>
          ['employee_code', 'name', 'joined_on', 'team_id', 'phase', 'employment_type'].includes(
            f.key,
          ),
        )}
        extraFields={fields.filter(
          (f) =>
            !['employee_code', 'name', 'joined_on', 'team_id', 'phase', 'employment_type'].includes(
              f.key,
            ),
        )}
        extraTitle="Thông tin liên hệ, hợp đồng & liên kết"
        childrenBeforeExtra
        initial={{
          phase: employee?.employment_state === 'OFFICIAL' ? 'OFFICIAL' : 'PROBATION',
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
    [notice, setNotice] = useState(''),
    [provision, setProvision] = useState(false);
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
                  ['history', 'Lịch sử chỉnh sửa'],
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
                <p className="notice">
                  Định danh, thuế, BHXH và ngân hàng: Admin / Ban lãnh đạo. Lương, thưởng: HR /
                  Admin / Ban lãnh đạo.
                </p>
                {e.capabilities.payroll && (
                  <SensitiveProfile
                    e={e}
                    payroll
                    onSaved={() => {
                      setNotice('Đã lưu lương / thưởng.');
                      refresh();
                    }}
                  />
                )}
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
                    [
                      'Tài khoản đăng nhập',
                      e.linked_user
                        ? `${e.linked_user.username} · ${e.linked_user.active ? 'Đang hoạt động' : 'Đã khóa'}`
                        : 'Chưa liên kết tài khoản',
                    ],
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
                {e.capabilities.provision_user && (
                  <button onClick={() => setProvision(true)}>Cấp tài khoản cho nhân viên</button>
                )}
                {e.capabilities.edit && e.employment_state === 'PROBATION' && (
                  <details>
                    <summary>Chuyển sang chính thức</summary>
                    <Form
                      fields={[
                        {
                          key: 'date',
                          label: 'Ngày chính thức có hiệu lực',
                          type: 'date',
                          required: true,
                        },
                        { key: 'reason', label: 'Căn cứ chuyển chính thức', required: true },
                      ]}
                      onSubmit={async (v) => {
                        await api('/employees/' + id + '/employment', {
                          ...v,
                          phase: 'OFFICIAL',
                          expected_version: e.version,
                        });
                        setNotice('Đã ghi nhận chuyển chính thức.');
                        refresh();
                      }}
                      label="Xác nhận chuyển chính thức"
                    />
                  </details>
                )}
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
                id="employee-panel-history"
                aria-labelledby="employee-tab-history"
                hidden={tab !== 'history'}
              >
                {tab === 'history' && <EmployeeHistory e={e} revision={rev} />}
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
      {provision && e && (
        <Modal compact title={'Cấp tài khoản · ' + e.name} onClose={() => setProvision(false)}>
          <UserAccessWizard
            employee={e}
            onCreated={() => {
              setProvision(false);
              setNotice('Đã cấp và liên kết tài khoản.');
              refresh();
            }}
          />
        </Modal>
      )}
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
              setNotice(
                v.left_on > new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
                  ? 'Đã lưu ngày nghỉ dự kiến; tài khoản vẫn hoạt động.'
                  : 'Đã lưu trữ và thu hồi quyền đăng nhập.',
              );
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
            if (['IDENTITY', 'PAYROLL', 'TAX', 'SOCIAL_INSURANCE'].includes(event.target.value))
              setClassification('SENSITIVE');
          }}
        >
          {Object.entries(documentNames).map(([value, label]) => (
            <option
              value={value}
              key={value}
              disabled={
                (['IDENTITY', 'TAX', 'SOCIAL_INSURANCE'].includes(value) &&
                  !e.capabilities.sensitive) ||
                (value === 'PAYROLL' && !e.capabilities.payroll)
              }
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
          {(e.capabilities.sensitive || e.capabilities.payroll) && (
            <option value="SENSITIVE">Hồ sơ nhạy cảm</option>
          )}
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
function SensitiveProfile({ e, onSaved, payroll = false }: any) {
  const [open, setOpen] = useState(false),
    { data, error } = useLoad(
      open ? '/employees/' + e.id + (payroll ? '/payroll' : '/sensitive') : null,
    );
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {payroll
          ? 'Lương / thưởng · HR, Admin và Ban lãnh đạo'
          : 'Thông tin nhạy cảm · Admin và Ban lãnh đạo'}
      </summary>
      <Loaded data={data} error={error}>
        {data && (
          <Form
            fields={(payroll
              ? [
                  { key: 'salary', label: 'Thông tin lương' },
                  { key: 'bonus', label: 'Thông tin thưởng' },
                  { key: 'notes', label: 'Ghi chú lương / thưởng', type: 'textarea' },
                ]
              : [
                  { key: 'identity_document', label: 'Giấy tờ định danh' },
                  { key: 'tax_id', label: 'Mã số thuế' },
                  { key: 'social_insurance', label: 'Mã số BHXH' },
                  { key: 'bank_name', label: 'Ngân hàng nhận lương' },
                  { key: 'bank_account', label: 'Tài khoản nhận lương' },
                  { key: 'notes', label: 'Ghi chú nhạy cảm', type: 'textarea' },
                ]
            ).map((f) => ({ ...f, readonly: !e.capabilities.edit }))}
            initial={data.data || { salary: '', identity_document: '', notes: '' }}
            onSubmit={async (v, key) => {
              await api(
                '/employees/' + e.id + (payroll ? '/payroll' : '/sensitive'),
                { data: v, expected_version: e.version },
                'PUT',
                key,
              );
              onSaved();
            }}
            label={payroll ? 'Lưu lương / thưởng' : 'Lưu thông tin nhạy cảm'}
            secondary={!e.capabilities.edit ? <span>Quyền chỉ xem</span> : undefined}
          />
        )}
      </Loaded>
    </details>
  );
}

const historyLabels: Record<string, string> = {
  employee_code: 'Mã nhân sự',
  name: 'Họ tên',
  user_id: 'Tài khoản liên kết',
  birthday: 'Ngày sinh',
  joined_on: 'Ngày vào làm',
  team_id: 'Bộ phận',
  manager_id: 'Quản lý',
  employment_state: 'Giai đoạn',
  employment_type: 'Loại hình',
  probation_end: 'Hết thử việc',
  contract_date: 'Ngày ký hợp đồng',
  contract_end: 'Hết hợp đồng',
  left_on: 'Ngày nghỉ',
  archived_at: 'Lưu trữ',
  contact: 'Liên hệ',
  'contact.phone': 'Điện thoại',
  'contact.email': 'Email',
  'contact.address': 'Địa chỉ',
  'contact.emergency_name': 'Liên hệ khẩn cấp',
  'contact.emergency_phone': 'Điện thoại khẩn cấp',
  'contact.photo_asset_id': 'Ảnh hồ sơ',
  positions: 'Vị trí',
  salary: 'Lương',
  bonus: 'Thưởng',
  notes: 'Ghi chú',
  identity_document: 'Định danh',
  tax_id: 'Mã số thuế',
  social_insurance: 'BHXH',
  bank_name: 'Ngân hàng',
  bank_account: 'Số tài khoản',
};
function EmployeeHistory({ e, revision }: any) {
  const [category, setCategory] = useState('BASIC'),
    [cursor, setCursor] = useState('0');
  const history = useLoad(
    `/employees/${e.id}/history?category=${category}&cursor=${cursor}`,
    revision,
  );
  const conf = useLoad('/employees/options');
  const flatten = (value: any): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const [key, v] of Object.entries(value || {})) {
      if (key === 'contact' && v && typeof v === 'object')
        for (const [sub, x] of Object.entries(v)) out['contact.' + sub] = x;
      else out[key] = v;
    }
    return out;
  };
  const changes = (r: any) => {
    const before = flatten(r.before),
      after = flatten(r.after);
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
      .map((key) => ({ key, before: before[key], after: after[key] }));
  };
  const text = (v: any, key: string): string => {
    if (v === null || v === undefined || v === '') return 'Chưa có';
    if (Array.isArray(v)) return v.map((x) => roleLabel[x] || x).join(', ');
    if (key === 'team_id')
      return conf.data?.teams.find((t: any) => t.id === v)?.name || 'Bộ phận đã lưu trữ';
    if (key === 'manager_id')
      return conf.data?.managers.find((u: any) => u.id === v)?.name || 'Quản lý đã lưu trữ';
    if (key === 'user_id')
      return e.linked_user?.id === v ? e.linked_user.username : 'Tài khoản đã lưu trữ';
    if (key === 'contact.photo_asset_id') return 'Đã chọn ảnh hồ sơ';
    if (typeof v === 'boolean') return v ? 'Có' : 'Không';
    return (phaseNames as any)[v] || (typeNames as any)[v] || String(v);
  };
  return (
    <div>
      <h3>Lịch sử chỉnh sửa</h3>
      <p className="muted">
        Lưu người sửa, thời gian và giá trị trước / sau. Lịch sử chỉ được bổ sung, không ghi đè.
      </p>
      <select
        aria-label="Loại lịch sử nhân sự"
        value={category}
        onChange={(ev) => {
          setCategory(ev.target.value);
          setCursor('0');
        }}
      >
        <option value="BASIC">Hồ sơ cơ bản</option>
        {e.capabilities.payroll && <option value="PAYROLL">Lương / thưởng</option>}
        {e.capabilities.sensitive && <option value="SENSITIVE">Thông tin nhạy cảm</option>}
      </select>
      <Loaded {...history}>
        {history.data?.items.map((r: any) => (
          <article className="history-entry" key={r.id}>
            <strong>{r.actor_name}</strong>
            <small className="row-meta">
              {fmt(r.created_at)} ·{' '}
              {r.action === 'PROFILE_CREATED'
                ? 'Tạo hồ sơ'
                : r.action === 'USER_LINKED'
                  ? 'Liên kết tài khoản'
                  : 'Cập nhật hồ sơ'}
            </small>
            <details>
              <summary>Xem thay đổi</summary>
              {changes(r).map((change) => (
                <div className="change-row" key={change.key}>
                  <strong>{historyLabels[change.key] || change.key}</strong>
                  <div>
                    <del>{text(change.before, change.key)}</del>
                    <br />
                    <ins>{text(change.after, change.key)}</ins>
                  </div>
                </div>
              ))}
            </details>
          </article>
        ))}
        {history.data?.items.length === 0 && (
          <Empty>Chưa có chỉnh sửa được ghi nhận từ bản nâng cấp này.</Empty>
        )}
        {cursor !== '0' && <button onClick={() => setCursor('0')}>Về đầu</button>}
        {history.data?.next_cursor && (
          <button onClick={() => setCursor(history.data.next_cursor)}>Lịch sử trước</button>
        )}
      </Loaded>
    </div>
  );
}
