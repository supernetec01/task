import React, { useState } from 'react';
import { api, iso, fmt, localInput } from './api';
import { Form, useLoad, Loaded, Modal, options, roleLabel, Badge, type Field } from './ui';
export function Team({ me }: { me: any }) {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/users', rev),
    [selected, setSelected] = useState<any>(null),
    [create, setCreate] = useState(false);
  const refresh = () => setRev((r) => r + 1),
    users = data?.items || [],
    teams = data?.teams || [];
  const userOptions = users.map((u: any) => ({ value: u.id, label: u.name })),
    teamOptions = teams.map((t: any) => ({ value: t.id, label: t.name }));
  return (
    <Loaded data={data} error={error}>
      <div className="heading">
        <p className="muted">
          Danh sách trong phạm vi được quản lý. Thay đổi quyền có hiệu lực ngay ở yêu cầu tiếp theo.
        </p>
        {me.admin && (
          <button className="primary" onClick={() => setCreate(true)}>
            + Tạo tài khoản
          </button>
        )}
      </div>
      <div className="panel tablewrap">
        <table>
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Trạng thái</th>
              <th>Vai trò / thời hạn</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td>
                  {u.name}
                  <div className="row-meta">
                    {u.username}
                    {u.email ? ` · ${u.email}` : ''}
                  </div>
                </td>
                <td>
                  <Badge>{u.active ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</Badge>
                </td>
                <td>
                  {u.grants
                    ?.filter((g: any) => !g.revoked_at)
                    .map((g: any) => (
                      <div key={g.id}>
                        {roleLabel[g.role]} · {g.scope} ·{' '}
                        {g.valid_to ? fmt(g.valid_to) : 'Không giới hạn'}
                      </div>
                    ))}
                </td>
                <td>{me.admin && <button onClick={() => setSelected(u)}>Quản lý</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {me.admin && (
        <details className="panel">
          <summary>Thêm nhóm</summary>
          <Form
            fields={[{ key: 'name', label: 'Tên nhóm', required: true }]}
            onSubmit={async (v, key) => {
              await api('/teams', v, 'POST', key);
              refresh();
            }}
          />
        </details>
      )}
      {create && (
        <Modal title="Tạo tài khoản" onClose={() => setCreate(false)}>
          <Form
            fields={[
              { key: 'name', label: 'Họ tên', required: true },
              { key: 'username', label: 'Tên đăng nhập', required: true },
              { key: 'email', label: 'Email liên hệ (không bắt buộc)', type: 'email' },
              {
                key: 'password',
                label: 'Mật khẩu khởi tạo (ít nhất 11 ký tự)',
                type: 'password',
                required: true,
              },
              { key: 'team_id', label: 'Nhóm', type: 'select', options: teamOptions },
              {
                key: 'manager_id',
                label: 'Quản lý trực tiếp',
                type: 'select',
                options: userOptions,
              },
              {
                key: 'reviewer_id',
                label: 'Người duyệt mặc định',
                type: 'select',
                options: userOptions,
              },
            ]}
            onSubmit={async (v, key) => {
              await api(
                '/users',
                {
                  ...v,
                  email: v.email || null,
                  team_id: v.team_id || null,
                  manager_id: v.manager_id || null,
                  reviewer_id: v.reviewer_id || null,
                },
                'POST',
                key,
              );
              setCreate(false);
              refresh();
            }}
            label="Tạo tài khoản"
          />
        </Modal>
      )}
      {selected && (
        <Modal title={'Quyền của ' + selected.name} onClose={() => setSelected(null)}>
          <Form
            fields={[
              { key: 'name', label: 'Họ tên', required: true },
              { key: 'active', label: 'Tài khoản đang hoạt động', type: 'checkbox' },
              { key: 'team_id', label: 'Nhóm', type: 'select', options: teamOptions },
              {
                key: 'manager_id',
                label: 'Quản lý',
                type: 'select',
                options: userOptions.filter((u: any) => u.value !== selected.id),
              },
              {
                key: 'reviewer_id',
                label: 'Người duyệt',
                type: 'select',
                options: userOptions.filter((u: any) => u.value !== selected.id),
              },
            ]}
            initial={selected}
            onSubmit={async (v, key) => {
              await api(
                '/users/' + selected.id,
                {
                  name: v.name,
                  active: v.active,
                  team_id: v.team_id || null,
                  manager_id: v.manager_id || null,
                  reviewer_id: v.reviewer_id || null,
                  expected_version: selected.permission_version,
                },
                'PATCH',
                key,
              );
              setSelected(null);
              refresh();
            }}
          />
          <div className="detail-section">
            <h3>Cấp vai trò có phạm vi và thời hạn</h3>
            <GrantForm
              userId={selected.id}
              teamOptions={teamOptions}
              jobs={data.jobs}
              access={data.access}
              onDone={() => {
                setSelected(null);
                refresh();
              }}
            />
          </div>
          <div className="detail-section">
            <h3>Lịch sử cấp quyền</h3>
            {selected.grants?.map((g: any) => (
              <div className="support-row" key={g.id}>
                <strong>{roleLabel[g.role]}</strong> · {g.scope}
                <div>
                  {fmt(g.valid_from)} → {g.valid_to ? fmt(g.valid_to) : 'Không giới hạn'}
                </div>
                <small>
                  {g.reason} · {g.revoked_at ? 'Thu hồi ' + fmt(g.revoked_at) : 'Chưa thu hồi'}
                </small>
                {!g.revoked_at && (
                  <Form
                    fields={[{ key: 'reason', label: 'Lý do thu hồi', required: true }]}
                    onSubmit={async (v, key) => {
                      await api('/role-grants/' + g.id + '/revoke', v, 'POST', key);
                      setSelected(null);
                      refresh();
                    }}
                    label="Thu hồi quyền"
                  />
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Loaded>
  );
}
function GrantForm({ userId, teamOptions, jobs, access, onDone }: any) {
  const [kind, setKind] = useState('JOB');
  return (
    <Form
      fields={[
        {
          key: 'kind',
          label: 'Loại quyền',
          type: 'select',
          required: true,
          options: [
            { value: 'JOB', label: 'Chuyên môn' },
            { value: 'ACCESS', label: 'Quyền truy cập' },
          ],
        },
        {
          key: 'role',
          label: 'Vai trò',
          type: 'select',
          required: true,
          options: options(kind === 'JOB' ? jobs : access, roleLabel),
        },
        {
          key: 'scope',
          label: 'Phạm vi',
          type: 'select',
          required: true,
          options:
            kind === 'JOB'
              ? [{ value: 'SELF', label: 'Cá nhân' }]
              : [
                  { value: 'SELF', label: 'Cá nhân' },
                  { value: 'TEAM', label: 'Nhóm được chọn' },
                  { value: 'ALL', label: 'Toàn tổ chức' },
                ],
        },
        {
          key: 'team_id',
          label: 'Nhóm áp dụng (khi phạm vi Nhóm)',
          type: 'select',
          options: teamOptions,
        },
        {
          key: 'valid_from',
          label: 'Có hiệu lực từ (giờ Việt Nam)',
          type: 'datetime-local',
          required: true,
        },
        {
          key: 'valid_to',
          label: 'Hết hiệu lực lúc (bỏ trống nếu không hạn)',
          type: 'datetime-local',
        },
        { key: 'reason', label: 'Lý do / người chốt', type: 'textarea', required: true },
      ]}
      initial={{ kind: 'JOB', scope: 'SELF', valid_from: localInput(new Date()) }}
      onChange={(v) => setKind(v.kind)}
      onSubmit={async (v, key) => {
        await api(
          '/role-grants',
          {
            ...v,
            user_id: userId,
            team_id: v.team_id || null,
            valid_from: iso(v.valid_from),
            valid_to: iso(v.valid_to),
          },
          'POST',
          key,
        );
        onDone();
      }}
      label="Cấp quyền"
    />
  );
}
export function Settings() {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/settings', rev),
    users = useLoad('/users'),
    refresh = () => setRev((r) => r + 1);
  const policy = data?.items.find((s: any) => s.key === 'policies'),
    cal = data?.items.find((s: any) => s.key === 'calendar');
  const policyLabels: Record<string, string> = {
    assignment_boundary_confirmed:
      'Q02 · Xác nhận phản hồi chỉ trước hạn; bật tự từ chối khi hết 8 giờ',
    report_week_confirmed: 'Q05 · Tuần T2–CN, task phát sinh theo ngày tạo',
    deadline_reviewer_approval: 'Q03 · Người duyệt task được quyết định gia hạn (không lùi hạn)',
    birthday_policy_confirmed:
      'Q19 · Nhắc sinh nhật trước 5 ngày làm việc, bỏ 29/02 ở năm không nhuận',
    retention_confirmed: 'Q24 · Đã chốt lưu trữ; hệ thống không tự purge',
    reopen_enabled: 'Q14 · Cho người duyệt mở lại task đã xong',
  };
  return (
    <Loaded data={data} error={error}>
      {policy && (
        <>
          <div className="notice">
            Chỉ bật chính sách sau khi chủ hệ thống đã chốt. Mỗi thay đổi được ghi nhận người thực
            hiện, thời gian và lý do.
          </div>
          <div className="panel">
            <h2>Chính sách nghiệp vụ</h2>
            <Form
              key={policy.version}
              fields={[
                ...Object.entries(policyLabels).map(([key, label]) => ({
                  key,
                  label,
                  type: 'checkbox',
                })),
                {
                  key: 'support_scope',
                  label: 'Q10 · Phạm vi mời hỗ trợ',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'TEAM', label: 'Cùng nhóm' },
                    { value: 'ALL', label: 'Toàn công ty' },
                  ],
                },
                {
                  key: 'reason',
                  label: 'Quyết định / người chốt / ngày chốt',
                  required: true,
                  type: 'textarea',
                },
              ]}
              initial={policy.value}
              onSubmit={async (v, key) => {
                const { reason, ...value } = v;
                await api(
                  '/settings/policies',
                  { value, reason, expected_version: policy.version },
                  'PUT',
                  key,
                );
                refresh();
              }}
            />
          </div>
          <div className="panel">
            <h2>Lịch làm việc · Asia/Ho_Chi_Minh</h2>
            <p>
              Thứ Hai–Thứ Bảy · 09:00–12:00 và 13:00–18:00. Bỏ Chủ nhật và các ngày ngoại lệ dưới
              đây.
            </p>
            <Form
              key={cal.version}
              fields={[
                {
                  key: 'holidays',
                  label: 'Ngày nghỉ (YYYY-MM-DD, mỗi dòng một ngày)',
                  type: 'textarea',
                },
                { key: 'reason', label: 'Quyết định và người chốt', required: true },
              ]}
              initial={{ holidays: cal.value.holidays.join('\n') }}
              onSubmit={async (v, key) => {
                await api(
                  '/settings/calendar',
                  {
                    value: {
                      timezone: 'Asia/Ho_Chi_Minh',
                      holidays: (v.holidays || '').split('\n').filter(Boolean),
                      version: cal.value.version + 1,
                    },
                    reason: v.reason,
                    expected_version: cal.version,
                  },
                  'PUT',
                  key,
                );
                refresh();
              }}
            />
          </div>
          <div className="panel">
            <h2>Chính sách phê duyệt đề nghị</h2>
            <p>
              Chưa cấu hình thì không tự duyệt. Thiếu giá chỉ duyệt nhu cầu, không duyệt ngân sách.
            </p>
            <Form
              fields={[
                {
                  key: 'kind',
                  label: 'Loại đề nghị',
                  type: 'select',
                  required: true,
                  options: options([
                    'PURCHASE',
                    'RENTAL',
                    'EQUIPMENT_LOAN',
                    'SAMPLE_ISSUE',
                    'ADVANCE',
                    'REIMBURSEMENT',
                    'SALES_INVOICE_REQUEST',
                    'DOCUMENT_COLLECTION',
                  ]),
                },
                { key: 'company', label: 'Pháp nhân', required: true },
                { key: 'max_amount', label: 'Hạn mức (bỏ trống nếu chỉ duyệt nhu cầu)' },
                { key: 'currency', label: 'Tiền tệ (VD: VND)', required: true },
                {
                  key: 'approvers',
                  label: 'Các bước phê duyệt',
                  type: 'array',
                  fields: [
                    {
                      key: 'id',
                      label: 'Người duyệt',
                      type: 'select',
                      required: true,
                      options: (users.data?.items || []).map((u: any) => ({
                        value: u.id,
                        label: u.name,
                      })),
                    },
                  ],
                },
                { key: 'enabled', label: 'Bật chính sách đã được chốt', type: 'checkbox' },
                {
                  key: 'reason',
                  label: 'Quyết định và người chốt',
                  required: true,
                  type: 'textarea',
                },
              ]}
              initial={{ currency: 'VND', enabled: false, approvers: [] }}
              onSubmit={async (v, key) => {
                await api(
                  '/approval-policies',
                  {
                    ...v,
                    max_amount: v.max_amount || null,
                    approvers: (v.approvers || []).map((u: any) => u.id),
                  },
                  'POST',
                  key,
                );
                refresh();
              }}
            />
            {data.policies.map((p: any) => (
              <p key={p.id}>
                {p.kind} · {p.company} · {p.enabled ? 'Đang bật' : 'Đang tắt'} · v{p.version}
              </p>
            ))}
          </div>
          <div className="panel">
            <h2>Quy tắc công việc định kỳ</h2>
            <Form
              fields={[
                {
                  key: 'owner_id',
                  label: 'Người phụ trách',
                  type: 'select',
                  required: true,
                  options: (users.data?.items || []).map((u: any) => ({
                    value: u.id,
                    label: u.name,
                  })),
                },
                {
                  key: 'role',
                  label: 'Chuyên môn',
                  type: 'select',
                  required: true,
                  options: options(
                    [
                      'CONTENT',
                      'DESIGNER',
                      'MARKETPLACE',
                      'ADS',
                      'HR',
                      'ACCOUNTANT',
                      'WAREHOUSE',
                      'INTERN',
                    ],
                    roleLabel,
                  ),
                },
                { key: 'title', label: 'Tên công việc', required: true },
                {
                  key: 'weekdays',
                  label: 'Ngày trong tuần (T2=1, … T7=6; phân cách dấu phẩy)',
                  required: true,
                },
                { key: 'due_hour', label: 'Giờ đến hạn (0–23)', type: 'number', required: true },
                { key: 'enabled', label: 'Bật quy tắc đã được duyệt', type: 'checkbox' },
              ]}
              initial={{ enabled: false, due_hour: 17 }}
              onSubmit={async (v, key) => {
                await api(
                  '/recurring-rules',
                  {
                    owner_id: v.owner_id,
                    role: v.role,
                    title: v.title,
                    type: 'OTHER',
                    iso_weekdays: v.weekdays.split(',').map(Number),
                    due_hour: v.due_hour,
                    enabled: v.enabled,
                  },
                  'POST',
                  key,
                );
                refresh();
              }}
            />
            {data.rules.map((r: any) => (
              <p key={r.id}>
                {r.title} · {r.name} · {r.enabled ? 'Đang bật' : 'Đang tắt'}
              </p>
            ))}
          </div>
        </>
      )}
    </Loaded>
  );
}
export function Accounts({ me }: { me: any }) {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/platform-accounts', rev),
    [selected, setSelected] = useState<any>(),
    [create, setCreate] = useState(false),
    [secret, setSecret] = useState(''),
    [history, setHistory] = useState<any[]>([]),
    [err, setErr] = useState<any>();
  const users = useLoad(me.admin ? '/users' : '/directory/invitees');
  const refresh = () => setRev((r) => r + 1);
  const reveal = async (id: string, old = false) => {
    setErr(null);
    try {
      const r = await api(
        old ? '/credential-versions/' + id + '/reveal' : '/platform-accounts/' + id + '/reveal',
        {},
      );
      setSecret(r.secret);
      setTimeout(() => setSecret(''), 30000);
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <>
      <div className="heading">
        <p className="muted">
          Tài khoản được cấp cho bạn. Mật khẩu chỉ hiện khi được yêu cầu; mọi lần xem được ghi nhật
          ký.
        </p>
        {me.admin && (
          <button className="primary" onClick={() => setCreate(true)}>
            + Thêm tài khoản nền tảng
          </button>
        )}
      </div>
      <Loaded data={data} error={error}>
        <div className="panel">
          {data?.items.map((r: any) => (
            <div className="support-row" key={r.id}>
              <h3>
                {r.label} <Badge>{r.platform}</Badge>
              </h3>
              <p>
                {r.login} · {r.company}
              </p>
              <button
                onClick={() => {
                  setSelected(r);
                  setSecret('');
                  setHistory([]);
                  setErr(null);
                }}
              >
                Mở tài khoản
              </button>
            </div>
          ))}
        </div>
      </Loaded>
      {create && (
        <Modal title="Thêm tài khoản nền tảng" onClose={() => setCreate(false)}>
          <Form
            fields={[
              { key: 'label', label: 'Nhãn tài khoản', required: true },
              { key: 'platform', label: 'Nền tảng', required: true },
              { key: 'login', label: 'Tên đăng nhập', required: true },
              { key: 'company', label: 'Pháp nhân', required: true },
            ]}
            onSubmit={async (v, key) => {
              await api('/platform-accounts', v, 'POST', key);
              setCreate(false);
              refresh();
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal
          title={selected.label}
          onClose={() => {
            setSelected(null);
            setSecret('');
            setHistory([]);
          }}
        >
          <div className="actions">
            <button onClick={() => reveal(selected.id)}>Xem mật khẩu hiện tại</button>
            {secret && <button onClick={() => setSecret('')}>Ẩn ngay</button>}
          </div>
          {secret && <p className="secret">{secret}</p>}
          {err && <div className="error">{err.message}</div>}
          <div className="detail-section">
            <h3>Cập nhật bản lưu</h3>
            <div className="notice">
              Bạn phải đổi mật khẩu trên nền tảng trước. Thao tác này chỉ cập nhật bản lưu nội bộ.
            </div>
            <Form
              fields={[
                {
                  key: 'secret',
                  label: 'Mật khẩu mới đã đổi trên nền tảng',
                  type: 'password',
                  required: true,
                },
                {
                  key: 'external_changed_confirmed',
                  label: 'Tôi xác nhận đã đổi trên nền tảng',
                  type: 'checkbox',
                  required: true,
                },
                { key: 'note', label: 'Ghi chú' },
              ]}
              initial={{ note: '' }}
              onSubmit={async (v, key) => {
                await api(
                  '/platform-accounts/' + selected.id + '/versions',
                  { ...v, expected_version: selected.version },
                  'POST',
                  key,
                );
                setSelected(null);
                setSecret('');
                refresh();
              }}
            />
          </div>
          {me.admin && (
            <>
              <div className="detail-section">
                <h3>Cấp quyền sử dụng</h3>
                <Form
                  fields={[
                    {
                      key: 'user_id',
                      label: 'Nhân viên',
                      type: 'select',
                      required: true,
                      options: (users.data?.items || []).map((u: any) => ({
                        value: u.id,
                        label: u.name,
                      })),
                    },
                    {
                      key: 'role',
                      label: 'Chuyên môn áp dụng',
                      type: 'select',
                      required: true,
                      options: options(
                        [
                          'CONTENT',
                          'DESIGNER',
                          'MARKETPLACE',
                          'ADS',
                          'HR',
                          'ACCOUNTANT',
                          'WAREHOUSE',
                          'INTERN',
                        ],
                        roleLabel,
                      ),
                    },
                    { key: 'valid_to', label: 'Hết hiệu lực lúc', type: 'datetime-local' },
                  ]}
                  onSubmit={async (v, key) => {
                    await api(
                      '/platform-accounts/' + selected.id + '/grants',
                      { ...v, valid_to: iso(v.valid_to) },
                      'POST',
                      key,
                    );
                    setSelected(null);
                    refresh();
                  }}
                />
                {selected.grants?.map((g: any) => (
                  <div key={g.id} className="support-row">
                    {g.user_id} · {g.role} · {g.revoked_at ? 'Đã thu hồi' : fmt(g.valid_to)}
                    {!g.revoked_at && (
                      <button
                        onClick={async () => {
                          await api('/account-grants/' + g.id + '/revoke', {});
                          setSelected(null);
                          refresh();
                        }}
                      >
                        Thu hồi
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="detail-section">
                <button
                  onClick={async () => {
                    try {
                      setHistory(
                        (await api('/platform-accounts/' + selected.id + '/history')).items,
                      );
                    } catch (e) {
                      setErr(e);
                    }
                  }}
                >
                  Xem lịch sử phiên bản
                </button>
                {history.map((v: any) => (
                  <p key={v.id}>
                    {fmt(v.created_at)} · {v.name} · {v.note}{' '}
                    <button onClick={() => reveal(v.id, true)}>Xem giá trị bản này</button>
                  </p>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
