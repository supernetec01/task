import React, { useState } from 'react';
import { api, iso } from './api';
import { Form, Loaded, useLoad, roleLabel, options, ErrorBox } from './ui';
const scopeNames = { SELF: 'Cá nhân', TEAM: 'Bộ phận được chọn', ALL: 'Toàn công ty' };
function RolePicker({
  jobs,
  selected,
  onChange,
}: {
  jobs: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="role-picker">
      <legend>Chuyên môn / vị trí được cấp quyền</legend>
      <div className="check-grid">
        {jobs.map((role) => (
          <label className="check" key={role}>
            <input
              type="checkbox"
              checked={selected.includes(role)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...selected, role] : selected.filter((r) => r !== role),
                )
              }
            />
            {roleLabel[role]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function CustomDates({ value, onChange }: any) {
  return (
    <details className="create-details">
      <summary>Thời hạn quyền · mặc định hiệu lực ngay, không giới hạn</summary>
      <label>
        Có hiệu lực từ
        <input
          type="datetime-local"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </label>
      <label>
        Hết hiệu lực lúc
        <input
          type="datetime-local"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </label>
    </details>
  );
}
export function UserAccessWizard({ onCreated }: { onCreated: (id: string) => void }) {
  const { data, error } = useLoad('/user-access-options');
  const [roles, setRoles] = useState<string[]>([]),
    [access, setAccess] = useState('EMPLOYEE'),
    [scope, setScope] = useState('SELF'),
    [team, setTeam] = useState(''),
    [manager, setManager] = useState(''),
    [same, setSame] = useState(true),
    [dates, setDates] = useState({ from: '', to: '' });
  const eligible = (data?.people || []).filter((u: any) =>
    u.scopes.some((s: any) => s.scope === 'ALL' || (s.scope === 'TEAM' && s.team_id === team)),
  );
  return (
    <Loaded data={data} error={error}>
      <p className="muted">
        Một tài khoản, nhiều chuyên môn. Hồ sơ nhân sự và quyền website được quản lý riêng.
      </p>
      <Form
        fields={[
          { key: 'name', label: 'Họ tên', required: true },
          {
            key: 'username',
            label: 'Username',
            required: true,
            hint: '3–64 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.',
          },
          {
            key: 'password',
            label: 'Mật khẩu khởi tạo (ít nhất 11 ký tự)',
            type: 'password',
            required: true,
          },
          { key: 'email', label: 'Email liên hệ (không bắt buộc)', type: 'email' },
          {
            key: 'employee_id',
            label: 'Liên kết nhân viên đã có (không bắt buộc)',
            type: 'select',
            options: (data?.employees || []).map((e: any) => ({
              value: e.id,
              label: `${e.employee_code || 'Chưa có mã'} · ${e.name}`,
            })),
          },
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
            options: eligible.map((u: any) => ({ value: u.id, label: u.name })),
          },
          ...(!same
            ? [
                {
                  key: 'reviewer_id',
                  label: 'Người duyệt công việc',
                  type: 'select',
                  options: eligible.map((u: any) => ({ value: u.id, label: u.name })),
                },
              ]
            : []),
        ]}
        initial={{ team_id: '', manager_id: '', reviewer_id: '', employee_id: '' }}
        onChange={(v) => {
          setTeam(v.team_id || '');
          setManager(v.manager_id || '');
        }}
        onSubmit={async (v, key) => {
          if (!roles.length) throw Error('Chọn ít nhất một chuyên môn.');
          const date = {
            valid_from: dates.from ? iso(dates.from) : undefined,
            valid_to: dates.to ? iso(dates.to) : null,
          };
          const out = await api(
            '/users',
            {
              ...v,
              email: v.email || null,
              team_id: v.team_id || null,
              manager_id: v.manager_id || null,
              reviewer_id: (same ? v.manager_id : v.reviewer_id) || null,
              employee_id: v.employee_id || null,
              job_grants: roles.map((role) => ({ role, ...date })),
              access_grant: {
                role: access,
                scope,
                team_id: scope === 'TEAM' ? v.team_id : null,
                ...date,
              },
            },
            'POST',
            key,
          );
          onCreated(out.id);
        }}
        label="Tạo tài khoản và cấp quyền"
      >
        <RolePicker jobs={data?.jobs || []} selected={roles} onChange={setRoles} />
        <fieldset>
          <legend>Quyền truy cập</legend>
          <label>
            Cấp truy cập
            <select
              aria-label="Cấp truy cập"
              value={access}
              onChange={(e) => {
                setAccess(e.target.value);
                setScope(
                  e.target.value === 'ADMIN'
                    ? 'ALL'
                    : e.target.value === 'EMPLOYEE'
                      ? 'SELF'
                      : 'TEAM',
                );
              }}
            >
              {['EMPLOYEE', 'MANAGER', 'BOSS', 'ADMIN'].map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phạm vi
            <select
              aria-label="Phạm vi truy cập"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {(access === 'ADMIN'
                ? ['ALL']
                : access === 'EMPLOYEE'
                  ? ['SELF']
                  : ['TEAM', 'ALL']
              ).map((r) => (
                <option key={r} value={r}>
                  {(scopeNames as any)[r]}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />
          Người duyệt giống quản lý
        </label>
        {!manager && (
          <p className="notice">
            Chưa cấu hình người duyệt; sẽ chưa thể tạo công việc chính thức cho tài khoản này.
          </p>
        )}
        <CustomDates value={dates} onChange={setDates} />
      </Form>
    </Loaded>
  );
}
export function GrantBatch({
  user,
  jobs,
  onDone,
}: {
  user: any;
  jobs: string[];
  onDone: () => void;
}) {
  const [roles, setRoles] = useState<string[]>([]),
    [dates, setDates] = useState({ from: '', to: '' });
  const now = Date.now(),
    active = new Set(
      (user.grants || [])
        .filter(
          (g: any) =>
            g.kind === 'JOB' &&
            !g.revoked_at &&
            Date.parse(g.valid_from) <= now &&
            (!g.valid_to || Date.parse(g.valid_to) > now),
        )
        .map((g: any) => g.role),
    );
  return (
    <Form
      key={user.permission_version}
      fields={[
        { key: 'reason', label: 'Lý do cấp quyền / người chốt', type: 'textarea', required: true },
      ]}
      onSubmit={async (v, key) => {
        if (!roles.length) throw Error('Chọn chuyên môn muốn bổ sung.');
        await api(
          '/users/' + user.id + '/grants',
          {
            job_grants: roles.map((role) => ({
              role,
              valid_from: dates.from ? iso(dates.from) : undefined,
              valid_to: dates.to ? iso(dates.to) : null,
            })),
            expected_permission_version: user.permission_version,
            reason: v.reason,
          },
          'POST',
          key,
        );
        setRoles([]);
        onDone();
      }}
      label="Bổ sung các chuyên môn"
    >
      <RolePicker jobs={jobs.filter((r) => !active.has(r))} selected={roles} onChange={setRoles} />
      <p className="muted">Các chuyên môn đang có được giữ nguyên.</p>
      <CustomDates value={dates} onChange={setDates} />
    </Form>
  );
}
