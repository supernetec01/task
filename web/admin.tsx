import React, { useState, useEffect } from 'react';
import { UserAccessWizard, GrantBatch } from './user-access';
import { api, iso, fmt, localInput } from './api';
import { PlatformSettings, CredentialStorage, EmployeeChecklistSettings } from './accounts';
import { Form, useLoad, Loaded, Modal, options, roleLabel, Badge, type Field } from './ui';
export function Team({ me }: { me: any }) {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/users', rev),
    [selected, setSelected] = useState<any>(null),
    [create, setCreate] = useState(false),
    [createdId, setCreatedId] = useState(''),
    [editingTeam, setEditingTeam] = useState('');
  const refresh = () => setRev((r) => r + 1),
    users = data?.items || [],
    teams = data?.teams || [];
  const userOptions = users.map((u: any) => ({ value: u.id, label: u.name })),
    teamOptions = teams.map((t: any) => ({ value: t.id, label: t.name }));
  useEffect(() => {
    if (data) {
      const id = createdId || selected?.id;
      const fresh = data.items.find((u: any) => u.id === id);
      if (fresh) {
        setSelected(fresh);
        setEditingTeam(fresh.team_id || '');
        setCreatedId('');
      }
    }
  }, [data]);
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
                <td>
                  {me.admin && (
                    <button
                      onClick={() => {
                        setSelected(u);
                        setEditingTeam(u.team_id || '');
                      }}
                    >
                      Quản lý
                    </button>
                  )}
                </td>
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
        <Modal compact title="Tạo tài khoản" onClose={() => setCreate(false)}>
          <UserAccessWizard
            onCreated={(id) => {
              setCreate(false);
              setCreatedId(id);
              refresh();
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal compact title={'Quyền của ' + selected.name} onClose={() => setSelected(null)}>
          <Form
            key={selected.permission_version}
            fields={[
              { key: 'name', label: 'Họ tên', required: true },
              { key: 'active', label: 'Tài khoản đang hoạt động', type: 'checkbox' },
              { key: 'team_id', label: 'Nhóm', type: 'select', options: teamOptions },
              {
                key: 'manager_id',
                label: 'Quản lý',
                type: 'select',
                options: users
                  .filter(
                    (u: any) =>
                      u.active &&
                      u.id !== selected.id &&
                      u.grants?.some(
                        (g: any) =>
                          g.kind === 'ACCESS' &&
                          !g.revoked_at &&
                          Date.parse(g.valid_from) <= Date.now() &&
                          (!g.valid_to || Date.parse(g.valid_to) > Date.now()) &&
                          ((g.role === 'ADMIN' && g.scope === 'ALL') ||
                            (['MANAGER', 'BOSS'].includes(g.role) &&
                              (g.scope === 'ALL' ||
                                (g.scope === 'TEAM' && g.team_id === editingTeam)))),
                      ),
                  )
                  .map((u: any) => ({ value: u.id, label: u.name })),
              },
              {
                key: 'reviewer_id',
                label: 'Người duyệt',
                type: 'select',
                options: users
                  .filter(
                    (u: any) =>
                      u.active &&
                      u.id !== selected.id &&
                      u.grants?.some(
                        (g: any) =>
                          g.kind === 'ACCESS' &&
                          !g.revoked_at &&
                          Date.parse(g.valid_from) <= Date.now() &&
                          (!g.valid_to || Date.parse(g.valid_to) > Date.now()) &&
                          ((g.role === 'ADMIN' && g.scope === 'ALL') ||
                            (['MANAGER', 'BOSS'].includes(g.role) &&
                              (g.scope === 'ALL' ||
                                (g.scope === 'TEAM' && g.team_id === editingTeam)))),
                      ),
                  )
                  .map((u: any) => ({ value: u.id, label: u.name })),
              },
            ]}
            initial={selected}
            onChange={(v) => setEditingTeam(v.team_id || '')}
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
            <GrantBatch user={selected} jobs={data.jobs} onDone={refresh} />
            <h3>Cấp quyền truy cập bổ sung</h3>
            <GrantForm
              userId={selected.id}
              teamOptions={teamOptions}
              jobs={data.jobs}
              access={data.access}
              onDone={() => {
                refresh();
              }}
            />
          </div>
          <div className="detail-section">
            <h3>Lịch sử cấp quyền</h3>
            {selected.grants?.map((g: any) => (
              <div className="support-row" key={g.id}>
                <strong>{roleLabel[g.role]}</strong> ·{' '}
                {({ SELF: 'Cá nhân', TEAM: 'Bộ phận', ALL: 'Toàn công ty' } as any)[g.scope]}
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
function GrantForm({ userId, teamOptions, access, onDone }: any) {
  const [role, setRole] = useState('EMPLOYEE'),
    [scope, setScope] = useState('SELF');
  return (
    <Form
      fields={[
        ...(scope === 'TEAM'
          ? [
              {
                key: 'team_id',
                label: 'Bộ phận áp dụng',
                type: 'select',
                required: true,
                options: teamOptions,
              },
            ]
          : []),
        { key: 'reason', label: 'Lý do / người chốt', type: 'textarea', required: true },
        { key: 'valid_from', label: 'Có hiệu lực từ (bỏ trống là ngay)', type: 'datetime-local' },
        {
          key: 'valid_to',
          label: 'Hết hiệu lực lúc (bỏ trống là không hạn)',
          type: 'datetime-local',
        },
      ]}
      onSubmit={async (v, key) => {
        await api(
          '/role-grants',
          {
            ...v,
            user_id: userId,
            kind: 'ACCESS',
            role,
            scope,
            team_id: scope === 'TEAM' ? v.team_id : null,
            valid_from: v.valid_from ? iso(v.valid_from) : undefined,
            valid_to: iso(v.valid_to),
          },
          'POST',
          key,
        );
        onDone();
      }}
      label="Cấp quyền truy cập"
    >
      <label>
        Vai trò truy cập
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setScope(
              ['ADMIN', 'EXECUTIVE'].includes(e.target.value)
                ? 'ALL'
                : e.target.value === 'EMPLOYEE'
                  ? 'SELF'
                  : 'TEAM',
            );
          }}
        >
          {access.map((r: string) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Phạm vi
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          {(['ADMIN', 'EXECUTIVE'].includes(role)
            ? ['ALL']
            : role === 'EMPLOYEE'
              ? ['SELF']
              : role === 'HR_SENSITIVE'
                ? ['SELF', 'TEAM', 'ALL']
                : ['TEAM', 'ALL']
          ).map((r) => (
            <option key={r} value={r}>
              {({ SELF: 'Cá nhân', TEAM: 'Bộ phận', ALL: 'Toàn công ty' } as any)[r]}
            </option>
          ))}
        </select>
      </label>
    </Form>
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
    employee_leave_confirmed:
      'Xác nhận nghỉ việc hiệu lực ngay: khóa user/session, thu hồi quyền, quản lý tự bàn giao',
    recruiter_reminders_confirmed:
      'Đã chốt tiếp tục nhắc HR kiểm tra giới thiệu khi bắt đầu thử việc',
    retention_confirmed: 'Q24 · Đã chốt lưu trữ; hệ thống không tự purge',
    reopen_enabled: 'Q14 · Cho người duyệt mở lại task đã xong',
  };
  return (
    <Loaded data={data} error={error}>
      <PlatformSettings />
      <CredentialStorage />
      <EmployeeChecklistSettings />
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
                  options: options(
                    [
                      'PURCHASE',
                      'RENTAL',
                      'EQUIPMENT_LOAN',
                      'SAMPLE_ISSUE',
                      'ADVANCE',
                      'REIMBURSEMENT',
                      'SALES_INVOICE_REQUEST',
                      'DOCUMENT_COLLECTION',
                    ],
                    {
                      PURCHASE: 'Mua hàng',
                      RENTAL: 'Thuê dịch vụ',
                      EQUIPMENT_LOAN: 'Mượn thiết bị',
                      SAMPLE_ISSUE: 'Xuất hàng mẫu',
                      ADVANCE: 'Tạm ứng',
                      REIMBURSEMENT: 'Hoàn ứng / thanh toán',
                      SALES_INVOICE_REQUEST: 'Đề nghị hóa đơn',
                      DOCUMENT_COLLECTION: 'Thu thập chứng từ',
                    },
                  ),
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
                {
                  (
                    {
                      PURCHASE: 'Mua hàng',
                      RENTAL: 'Thuê dịch vụ',
                      EQUIPMENT_LOAN: 'Mượn thiết bị',
                      SAMPLE_ISSUE: 'Xuất hàng mẫu',
                      ADVANCE: 'Tạm ứng',
                      REIMBURSEMENT: 'Hoàn ứng / thanh toán',
                      SALES_INVOICE_REQUEST: 'Đề nghị hóa đơn',
                      DOCUMENT_COLLECTION: 'Thu thập chứng từ',
                    } as any
                  )[p.kind]
                }{' '}
                · {p.company} · {p.enabled ? 'Đang bật' : 'Đang tắt'} · v{p.version}
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
export { Accounts } from './accounts';
