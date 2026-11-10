import React, { useState } from 'react';
import { api, iso, fmt, localInput } from './api';
import { Form, Loaded, useLoad, Empty, roleLabel } from './ui';
import { EmployeeDirectory } from './employees';
import { SourceRows } from './sources';
const options = (xs: any[]) => xs.map((x) => ({ value: x.id, label: x.name || x.label }));
const jobs = ['MARKETPLACE', 'HR', 'CONTENT'];
export function HrWorkspace({ me, initialSelected, initialTarget }: any) {
  const [tab, setTab] = useState(initialTarget || 'employees'),
    [rev, setRev] = useState(0),
    [candidate, setCandidate] = useState(
      initialTarget === 'candidates' ? initialSelected || '' : '',
    ),
    [employee, setEmployee] = useState(initialTarget === 'contracts' ? initialSelected || '' : '');
  const candidates = useLoad('/candidates', rev),
    applications = useLoad('/applications', rev),
    interviews = useLoad('/interviews', rev),
    employees = useLoad('/employees', rev),
    people = useLoad('/staff-directory'),
    employeeOptions = useLoad('/employees/options'),
    birthdays = useLoad('/hr/birthdays', rev),
    reminders = useLoad('/hr/reminders', rev);
  const refresh = () => setRev((n) => n + 1);
  return (
    <>
      <div className="tabs">
        {[
          ['employees', 'Nhân viên'],
          ['candidates', 'Ứng viên & phỏng vấn'],
          ['contracts', 'Hợp đồng'],
          ['salary', 'Lịch sử lương'],
          ['birthdays', 'Sinh nhật'],
          ['reminders', 'Nhắc việc'],
          ['legacy', 'Tuyển dụng cũ'],
        ].map(([v, l]) => (
          <button
            key={v}
            className={tab === v ? 'active' : ''}
            onClick={() => {
              if (
                document.querySelector('form[data-dirty="true"]') &&
                !confirm('Bỏ thay đổi chưa lưu để chuyển màn hình?')
              )
                return;
              setTab(v);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'employees' && <EmployeeDirectory me={me} initialSelected={initialSelected} />}
      {tab === 'candidates' && (
        <>
          <div className="panel">
            <h2>Thêm ứng viên</h2>
            <Form
              fields={[
                { key: 'name', label: 'Họ tên ứng viên', required: true },
                { key: 'email', label: 'Email ứng viên', type: 'email' },
                { key: 'phone', label: 'Điện thoại ứng viên' },
                { key: 'birthday', label: 'Ngày sinh (nếu có)', type: 'date' },
                { key: 'portfolio', label: 'Portfolio', type: 'url' },
              ]}
              initial={{ email: '', phone: '', birthday: '', portfolio: '' }}
              onSubmit={async (v) => {
                const r = await api('/candidates', {
                  name: v.name,
                  contact: { email: v.email || '', phone: v.phone || '' },
                  birthday: v.birthday || null,
                  portfolio: v.portfolio || '',
                });
                setCandidate(r.id);
                refresh();
              }}
              label="Lưu ứng viên"
            />
            <Loaded data={candidates.data} error={candidates.error}>
              <label>
                Hồ sơ ứng viên
                <select
                  aria-label="Hồ sơ ứng viên"
                  value={candidate}
                  onChange={(e) => setCandidate(e.target.value)}
                >
                  <option value="">Chọn ứng viên</option>
                  {candidates.data?.items.map((c: any) => (
                    <option value={c.id} key={c.id}>
                      {c.name} · {c.contact.phone || c.contact.email}
                    </option>
                  ))}
                </select>
              </label>
            </Loaded>
            {candidate && (
              <>
                <h3>Hồ sơ ứng tuyển mới</h3>
                <Form
                  fields={[
                    {
                      key: 'position_code',
                      label: 'Vị trí ứng tuyển',
                      type: 'select',
                      options: jobs.map((j) => ({ value: j, label: roleLabel[j] })),
                      required: true,
                    },
                    { key: 'received_on', label: 'Ngày nhận CV', type: 'date', required: true },
                    {
                      key: 'recruiter_id',
                      label: 'Người tuyển',
                      type: 'select',
                      options: options(people.data?.items || []),
                      required: true,
                    },
                    { key: 'source', label: 'Nguồn ứng viên', required: true },
                    { key: 'next_action', label: 'Bước tiếp theo', type: 'textarea' },
                  ]}
                  initial={{ recruiter_id: me.id, next_action: '' }}
                  onSubmit={async (v) => {
                    await api('/applications', { ...v, candidate_id: candidate });
                    refresh();
                  }}
                  label="Lưu ứng tuyển"
                />
                <label>
                  CV riêng tư
                  <input
                    type="file"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const b = new FormData();
                      b.append('record_id', candidate);
                      b.append('file', f);
                      try {
                        await api('/assets', b);
                        refresh();
                      } catch (e: any) {
                        alert(e.message);
                      }
                    }}
                  />
                </label>
              </>
            )}
          </div>
          <div className="panel">
            <h2>Ứng tuyển</h2>
            <Loaded data={applications.data} error={applications.error}>
              {applications.data?.items
                .filter((j: any) => !candidate || j.candidate_id === candidate)
                .map((j: any) => (
                  <details key={j.id}>
                    <summary>
                      {j.candidate_name} · {roleLabel[j.position_code]} · {j.stage}
                    </summary>
                    <p>{j.next_action || 'Chưa có bước tiếp theo'}</p>
                    {j.employee_id ? (
                      <p>Đã tiếp nhận nhân viên</p>
                    ) : (
                      <>
                        <Form
                          fields={[
                            {
                              key: 'stage',
                              label: 'Giai đoạn ứng tuyển',
                              type: 'select',
                              options: ['NEW', 'INTERVIEW', 'EVALUATING', 'OFFER', 'REJECTED'].map(
                                (value) => ({ value, label: value }),
                              ),
                              required: true,
                            },
                            { key: 'next_action', label: 'Bước tiếp theo', type: 'textarea' },
                            { key: 'reason', label: 'Lý do (bắt buộc khi từ chối)' },
                          ]}
                          initial={{ stage: j.stage, next_action: j.next_action, reason: '' }}
                          onSubmit={async (v) => {
                            await api(
                              '/applications/' + j.id,
                              { ...v, expected_version: j.version },
                              'PATCH',
                            );
                            refresh();
                          }}
                        />
                        <h3>Tiếp nhận nhân viên</h3>
                        <Form
                          fields={[
                            { key: 'employee_code', label: 'Mã nhân viên', required: true },
                            {
                              key: 'joined_on',
                              label: 'Ngày thực tế vào làm',
                              type: 'date',
                              required: true,
                            },
                            {
                              key: 'phase',
                              label: 'Giai đoạn',
                              type: 'select',
                              options: [
                                { value: 'PROBATION', label: 'Thử việc' },
                                { value: 'OFFICIAL', label: 'Chính thức' },
                              ],
                              required: true,
                            },
                            {
                              key: 'employment_type',
                              label: 'Loại nhân sự',
                              type: 'select',
                              options: ['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR'].map(
                                (value) => ({ value, label: value }),
                              ),
                              required: true,
                            },
                            {
                              key: 'team_id',
                              label: 'Bộ phận',
                              type: 'select',
                              options: options(employeeOptions.data?.teams || []),
                              required: true,
                            },
                          ]}
                          onSubmit={async (v) => {
                            await api('/applications/' + j.id + '/onboard', {
                              ...v,
                              expected_version: j.version,
                            });
                            refresh();
                          }}
                          label="Tiếp nhận vào hồ sơ nhân viên"
                        />
                      </>
                    )}
                  </details>
                ))}
            </Loaded>
          </div>
          <div className="panel">
            <h2>Lịch phỏng vấn</h2>
            <Form
              fields={[
                {
                  key: 'application_id',
                  label: 'Hồ sơ ứng tuyển',
                  type: 'select',
                  options: (applications.data?.items || []).map((j: any) => ({
                    value: j.id,
                    label: j.candidate_name + ' · ' + roleLabel[j.position_code],
                  })),
                  required: true,
                },
                {
                  key: 'starts_at',
                  label: 'Bắt đầu (giờ Việt Nam)',
                  type: 'datetime-local',
                  required: true,
                },
                {
                  key: 'ends_at',
                  label: 'Kết thúc (giờ Việt Nam)',
                  type: 'datetime-local',
                  required: true,
                },
                {
                  key: 'interviewer_ids',
                  label: 'Người phỏng vấn',
                  type: 'multi-select',
                  options: options(people.data?.items || []),
                },
                { key: 'location', label: 'Địa điểm / link họp', required: true },
                { key: 'outcome', label: 'Kết quả đánh giá', type: 'textarea' },
                { key: 'notes', label: 'Ghi chú phỏng vấn', type: 'textarea' },
              ]}
              initial={{ interviewer_ids: [], outcome: '', notes: '' }}
              onSubmit={async (v) => {
                await api('/interviews', {
                  ...v,
                  starts_at: iso(v.starts_at),
                  ends_at: iso(v.ends_at),
                });
                refresh();
              }}
              label="Lưu lịch phỏng vấn"
            />
            <Loaded data={interviews.data} error={interviews.error}>
              {interviews.data?.items.map((i: any) => (
                <details key={i.id}>
                  <summary>
                    {i.candidate_name} · {fmt(i.starts_at)}
                  </summary>
                  <Form
                    key={i.version}
                    fields={[
                      {
                        key: 'starts_at',
                        label: 'Bắt đầu phỏng vấn',
                        type: 'datetime-local',
                        required: true,
                      },
                      {
                        key: 'ends_at',
                        label: 'Kết thúc phỏng vấn',
                        type: 'datetime-local',
                        required: true,
                      },
                      { key: 'location', label: 'Địa điểm phỏng vấn', required: true },
                      { key: 'outcome', label: 'Kết quả phỏng vấn', type: 'textarea' },
                      { key: 'notes', label: 'Ghi chú đánh giá', type: 'textarea' },
                    ]}
                    initial={{
                      starts_at: localInput(i.starts_at),
                      ends_at: localInput(i.ends_at),
                      location: i.location,
                      outcome: i.outcome,
                      notes: i.notes,
                    }}
                    onSubmit={async (v) => {
                      await api(
                        '/interviews/' + i.id,
                        {
                          ...v,
                          starts_at: iso(v.starts_at),
                          ends_at: iso(v.ends_at),
                          expected_version: i.version,
                        },
                        'PATCH',
                      );
                      refresh();
                    }}
                    label="Lưu kết quả phỏng vấn"
                  />
                </details>
              ))}
            </Loaded>
          </div>
        </>
      )}
      {['contracts', 'salary'].includes(tab) && (
        <>
          <div className="panel">
            <label>
              Nhân viên
              <select value={employee} onChange={(e) => setEmployee(e.target.value)}>
                <option value="">Chọn nhân viên</option>
                {employees.data?.items.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.employee_code} · {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {employee && (
            <EmployeeTerms
              key={employee + tab}
              id={employee}
              salary={tab === 'salary'}
              onChanged={refresh}
            />
          )}
        </>
      )}
      {tab === 'birthdays' && <Birthdays />}
      {tab === 'reminders' && (
        <div className="panel">
          <h2>Hồ sơ cần xử lý</h2>
          <Loaded data={reminders.data} error={reminders.error}>
            {!reminders.data?.items.length ? (
              <Empty />
            ) : (
              reminders.data.items.map((r: any) => (
                <article key={r.id}>
                  <p>
                    {r.name} · Hết hạn {r.expires_on}
                  </p>
                  <Form
                    fields={[{ key: 'reason', label: 'Ghi chú đã xử lý', required: true }]}
                    onSubmit={async (v) => {
                      await api('/hr/reminders/' + r.id + '/acknowledge', v);
                      refresh();
                    }}
                    label="Đánh dấu đã xử lý"
                  />
                </article>
              ))
            )}
          </Loaded>
        </div>
      )}
      {tab === 'legacy' && <LegacyRecruitment />}
    </>
  );
}
function LegacyRecruitment() {
  const load = useLoad('/hr/legacy-records');
  return (
    <div className="panel">
      <h2>Hồ sơ tuyển dụng cũ chưa liên kết</h2>
      <p>
        Giữ nguyên dữ liệu nguồn. Không suy vị trí, người tuyển hoặc thời gian lịch sử để chuyển tự
        động.
      </p>
      <Loaded data={load.data} error={load.error}>
        <SourceRows rows={load.data?.items} />
      </Loaded>
    </div>
  );
}
function Birthdays() {
  const [month, setMonth] = useState(new Date(Date.now() + 7 * 3600e3).getUTCMonth() + 1),
    [missing, setMissing] = useState(false);
  const data = useLoad('/hr/birthdays?month=' + month + '&missing=' + missing);
  return (
    <div className="panel">
      <h2>Sinh nhật</h2>
      <label>
        Tháng
        <select value={month} onChange={(e) => setMonth(+e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} />
        Chưa có ngày sinh
      </label>
      <Loaded data={data.data} error={data.error}>
        <h3>Nhân viên đang làm</h3>
        <SourceRows rows={data.data?.employees} />
        <h3>Ứng viên</h3>
        <SourceRows rows={data.data?.candidates} />
      </Loaded>
    </div>
  );
}
function EmployeeTerms({ id, salary, onChanged }: any) {
  const [rev, setRev] = useState(0),
    [correction, setCorrection] = useState<any>();
  const e = useLoad('/employees/' + id, rev),
    terms = useLoad('/employees/' + id + (salary ? '/salary-terms' : '/contracts'), rev);
  const refresh = () => {
    setRev((n) => n + 1);
    setCorrection(null);
    onChanged();
  };
  return (
    <div className="panel">
      <Loaded data={e.data && terms.data} error={e.error || terms.error}>
        {e.data && terms.data && (
          <>
            <h2>
              {salary ? 'Lương theo ngày hiệu lực' : 'Hợp đồng'} · {e.data.name}
            </h2>
            {salary ? (
              <>
                <p>
                  Mức hiện hành:{' '}
                  {terms.data.current
                    ? terms.data.current.payload.amount + ' ' + terms.data.current.currency
                    : 'N/A · chưa có điều khoản theo ngày'}
                </p>
                {terms.data.legacy_current_value_available && (
                  <p>Mức lưu cũ chưa xác nhận ngày hiệu lực (LEGACY_UNKNOWN_EFFECTIVE).</p>
                )}
                <Form
                  key={correction?.id || 'new'}
                  fields={[
                    {
                      key: 'phase',
                      label: 'Giai đoạn lương',
                      type: 'select',
                      options: [
                        { value: 'PROBATION', label: 'Thử việc' },
                        { value: 'OFFICIAL', label: 'Chính thức' },
                      ],
                      required: true,
                    },
                    {
                      key: 'effective_from',
                      label: 'Ngày hiệu lực',
                      type: 'date',
                      required: true,
                      readonly: !!correction,
                    },
                    { key: 'amount', label: 'Mức lương thực tế (số thập phân)', required: true },
                    { key: 'currency', label: 'Tiền tệ', required: true },
                    {
                      key: 'gross_or_net',
                      label: 'Gross / Net',
                      type: 'select',
                      options: ['GROSS', 'NET', 'UNSPECIFIED'].map((value) => ({
                        value,
                        label: value,
                      })),
                      required: true,
                    },
                    { key: 'basis', label: 'Căn cứ mức lương', required: true },
                    { key: 'note', label: 'Ghi chú', type: 'textarea' },
                    { key: 'reason', label: 'Lý do điều chỉnh' },
                  ]}
                  initial={{
                    phase: correction?.phase || e.data.employment_state,
                    effective_from: correction?.effective_from || '',
                    amount: correction?.payload.amount || '',
                    currency: correction?.currency || 'VND',
                    gross_or_net: correction?.payload.gross_or_net || 'UNSPECIFIED',
                    note: '',
                    reason: '',
                  }}
                  onSubmit={async (v) => {
                    const { phase, effective_from, currency, ...payload } = v;
                    await api('/employees/' + id + '/salary-terms', {
                      phase,
                      effective_from,
                      currency,
                      payload,
                      supersedes_id: correction?.id || null,
                      expected_employee_version: e.data.version,
                    });
                    refresh();
                  }}
                  label={correction ? 'Lưu bản điều chỉnh' : 'Thêm điều khoản lương'}
                />
                {terms.data.items.map((t: any) => (
                  <article key={t.id}>
                    <p>
                      {t.phase} · {t.effective_from} · v{t.revision}: {t.payload.amount}{' '}
                      {t.currency}{' '}
                      {t.effective_from >
                      new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
                        ? '· Sắp áp dụng'
                        : ''}
                    </p>
                    <button onClick={() => setCorrection(t)}>Điều chỉnh mốc này</button>
                  </article>
                ))}
              </>
            ) : (
              <>
                <Form
                  key={correction?.id || 'new'}
                  fields={[
                    { key: 'number', label: 'Số hợp đồng', required: true },
                    {
                      key: 'kind',
                      label: 'Loại hợp đồng',
                      type: 'select',
                      options: ['PROBATION', 'OFFICIAL', 'EXTENSION', 'ADDENDUM'].map((value) => ({
                        value,
                        label: value,
                      })),
                      required: true,
                    },
                    {
                      key: 'status',
                      label: 'Trạng thái hợp đồng',
                      type: 'select',
                      options: ['DRAFT', 'SIGNED', 'ACTIVE', 'EXPIRED', 'SUPERSEDED'].map(
                        (value) => ({ value, label: value }),
                      ),
                      required: true,
                    },
                    { key: 'signed_on', label: 'Ngày ký', type: 'date', required: true },
                    { key: 'effective_from', label: 'Ngày hiệu lực', type: 'date', required: true },
                    {
                      key: 'expires_on',
                      label: 'Ngày hết hạn (trống = không xác định)',
                      type: 'date',
                    },
                    {
                      key: 'asset_ids',
                      label: 'Tài liệu hợp đồng',
                      type: 'multi-select',
                      options: (e.data.documents || [])
                        .filter((f: any) => f.classification === 'BASIC')
                        .map((f: any) => ({ value: f.asset_id, label: f.filename })),
                    },
                    {
                      key: 'supersedes_contract_id',
                      label: 'Thay thế hợp đồng trước (nếu có)',
                      type: 'select',
                      options: terms.data.items
                        .filter((c: any) => c.id !== correction?.id)
                        .map((c: any) => ({ value: c.id, label: c.number })),
                    },
                    { key: 'reason', label: 'Lý do lưu / điều chỉnh', required: true },
                  ]}
                  initial={{
                    ...correction,
                    kind: correction?.kind || 'OFFICIAL',
                    status: correction?.status || 'DRAFT',
                    asset_ids: correction?.asset_ids || [],
                    supersedes_contract_id: correction?.supersedes_contract_id || '',
                    expires_on: correction?.expires_on || '',
                  }}
                  onSubmit={async (v) => {
                    await api('/employees/' + id + '/contracts', {
                      number: v.number,
                      kind: v.kind,
                      status: v.status,
                      signed_on: v.signed_on,
                      effective_from: v.effective_from,
                      expires_on: v.expires_on || null,
                      reason: v.reason,
                      asset_ids: v.asset_ids || [],
                      supersedes_contract_id: v.supersedes_contract_id || null,
                      ...(correction ? { contract_id: correction.id } : {}),
                      expected_version: correction?.version || 0,
                      expected_employee_version: e.data.version,
                    });
                    refresh();
                  }}
                  label={correction ? 'Lưu revision hợp đồng' : 'Thêm hợp đồng'}
                />
                {terms.data.items.map((t: any) => (
                  <article key={t.id}>
                    <p>
                      {t.number} · {t.kind} · {t.status} · Hết hạn:{' '}
                      {t.expires_on || 'Không xác định'} · v{t.version}
                    </p>
                    <button onClick={() => setCorrection(t)}>Tạo revision</button>
                  </article>
                ))}
                <h3>Lịch sử hợp đồng bất biến</h3>
                <SourceRows rows={terms.data.history} />
              </>
            )}
          </>
        )}
      </Loaded>
    </div>
  );
}
export function RoleProvision({ me }: any) {
  const [rev, setRev] = useState(0);
  const employees = useLoad('/employees', rev);
  return (
    <>
      <div className="panel">
        <h2>Cấp tài khoản gắn hồ sơ nhân viên</h2>
        <p>
          Mỗi hồ sơ chỉ liên kết một tài khoản. HR chỉ cấp ba chuyên môn; Admin mới cấp Admin/Sếp.
        </p>
        <Loaded data={employees.data} error={employees.error}>
          <Form
            fields={[
              {
                key: 'employee_id',
                label: 'Hồ sơ nhân viên',
                type: 'select',
                options: options(
                  (employees.data?.items || []).filter((e: any) => !e.user_id && !e.archived_at),
                ),
                required: true,
              },
              { key: 'name', label: 'Tên hiển thị', required: true },
              { key: 'username', label: 'Tên đăng nhập', required: true },
              {
                key: 'initial_password',
                label: 'Mật khẩu ban đầu (ít nhất 11 ký tự)',
                type: 'password',
                required: true,
              },
              {
                key: 'display_roles',
                label: 'ROLE',
                type: 'multi-select',
                options: [...(me.admin ? ['ADMIN', 'BOSS'] : []), ...jobs].map((r) => ({
                  value: r,
                  label: roleLabel[r],
                })),
              },
              { key: 'reason', label: 'Lý do cấp tài khoản', required: true },
            ]}
            initial={{ display_roles: [] }}
            onSubmit={async (v) => {
              await api('/users', v);
              setRev((n) => n + 1);
            }}
            label="Tạo tài khoản và cấp ROLE"
          />
        </Loaded>
      </div>
      <RoleManagement me={me} revision={rev} />
    </>
  );
}
function RoleManagement({ me, revision }: any) {
  const [rev, setRev] = useState(0),
    [q, setQ] = useState('');
  const users = useLoad('/role-users?q=' + encodeURIComponent(q), revision + rev);
  return (
    <div className="panel">
      <h2>Tài khoản & ROLE hiện hành</h2>
      <label>
        Tìm nhân viên
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <Loaded data={users.data} error={users.error}>
        {users.data?.items.map((u: any) => (
          <details key={u.id}>
            <summary>
              {u.name} · {u.username} · {u.active ? 'Đang hoạt động' : 'Đã khóa'}
            </summary>
            <p>
              {u.display_roles.map((r: string) => roleLabel[r]).join(' · ') ||
                'ROLE_MAPPING_REQUIRED · cần phân loại quyền cũ'}
            </p>
            {u.can_manage && u.active && u.employee_id && (
              <Form
                key={u.permission_version}
                fields={[
                  {
                    key: 'display_roles',
                    label: 'ROLE được giữ lại',
                    type: 'multi-select',
                    options: [...(me.admin ? ['ADMIN', 'BOSS'] : []), ...jobs].map((r) => ({
                      value: r,
                      label: roleLabel[r],
                    })),
                  },
                  { key: 'reason', label: 'Lý do thay ROLE', required: true },
                ]}
                initial={{ display_roles: u.display_roles }}
                onSubmit={async (v) => {
                  await api('/users/' + u.id + '/grants', {
                    ...v,
                    expected_version: u.permission_version,
                  });
                  setRev((n) => n + 1);
                }}
                label="Lưu ROLE"
              />
            )}
            {me.admin && u.active && (
              <>
                <h3>Đặt lại mật khẩu web</h3>
                <Form
                  fields={[
                    {
                      key: 'new_password',
                      label: 'Mật khẩu web mới (ít nhất 11 ký tự)',
                      type: 'password',
                      required: true,
                    },
                  ]}
                  onSubmit={async (v) => {
                    await api('/users/' + u.id + '/reset-password', {
                      ...v,
                      expected_version: u.permission_version,
                    });
                    setRev((n) => n + 1);
                  }}
                  label="Đặt lại mật khẩu"
                />
                <Form
                  fields={[{ key: 'reason', label: 'Lý do khóa tài khoản', required: true }]}
                  onSubmit={async (v) => {
                    await api('/users/' + u.id + '/disable', {
                      ...v,
                      expected_version: u.permission_version,
                    });
                    setRev((n) => n + 1);
                  }}
                  label="Khóa tài khoản"
                />
              </>
            )}
          </details>
        ))}
      </Loaded>
    </div>
  );
}
