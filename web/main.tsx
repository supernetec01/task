import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from './error-boundary';
import { api, setCsrf } from './api';
import {
  Form,
  ErrorBox,
  useLoad,
  Loaded,
  Empty,
  Badge,
  options,
  statusLabel,
  roleLabel,
  useHourlyRefresh,
} from './ui';
import { TaskTable, TaskDetail, CreateTask } from './tasks';
import { Reports, Plans, Summary } from './reports';
import { Team, Settings, Accounts } from './admin';
import { Records, Requests } from './modules';
import { TemplateAdmin } from './template-admin';
import { EmployeeDirectory } from './employees';
import { PasswordHistory } from './accounts';
import { Metrics, Claims } from './business';
import { WorkTasks, CreateChecklist } from './checklist';
import { SourceWorkspace, ResourceSettings, SourceRows, HandoffSettings } from './sources';
import { ContentWorkspace } from './content-v2';
import { HrWorkspace, RoleProvision } from './hr-v2';
import './style.css';
const names: Record<string, string> = {
  dashboard: 'Tổng quan công việc',
  mine: 'Việc của tôi',
  legacy: 'Công việc cũ',
  'legacy-users': 'Quản lý tài khoản cũ',
  'legacy-business': 'Nguồn số liệu cũ',
  'legacy-hr': 'Hồ sơ nhân sự cũ',
  'legacy-content': 'Hồ sơ nội dung cũ',
  team: 'Công việc nhóm',
  plans: 'Kế hoạch tuần',
  reports: 'Báo cáo',
  content: 'Nội dung & sản xuất',
  business: 'Kinh doanh',
  ads: 'Quảng cáo',
  hr: 'Nhân sự',
  warehouse: 'Kho & mẫu hàng',
  finance: 'Mua hàng & chứng từ',
  requests: 'Đề nghị & phê duyệt',
  accounts: 'Tài khoản nền tảng',
  users: 'Đội ngũ & phân quyền',
  settings: 'Thiết lập',
  templates: 'Mẫu công việc',
  notifications: 'Thông báo',
  profile: 'Tài khoản của tôi',
  history: 'Lịch sử mật khẩu',
  issues: 'Kiểm thử',
};
function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    mine: 'M20 11v8H4V4h10 M8 11l4 4 9-10',
    hr: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 22v-3a7 7 0 0 1 14 0v3 M17 4a4 4 0 0 1 0 8 M18 15a6 6 0 0 1 5 6',
    accounts: 'M15 4a6 6 0 1 1-4 10L4 21H1v-3l7-7a6 6 0 0 1 7-7z M16 8h.01',
    settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
    notifications: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4',
    users: 'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6',
  };
  const path =
    paths[name] || (['team'].includes(name) ? paths.hr : 'M4 3h16v18H4z M8 8h8 M8 12h8 M8 16h5');
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}
function App() {
  const [me, setMe] = useState<any>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState<any>(),
    [page, setPage] = useState('dashboard'),
    [open, setOpen] = useState(false),
    [create, setCreate] = useState(false),
    [task, setTask] = useState(''),
    [revision, setRevision] = useState(0),
    [sub, setSub] = useState(''),
    [filter, setFilter] = useState(''),
    [employeeFocus, setEmployeeFocus] = useState(''),
    [reportFocus, setReportFocus] = useState(''),
    [hrTarget, setHrTarget] = useState('');
  useHourlyRefresh(() => setRevision((r) => r + 1));
  const permissionKey = useRef('');
  const [accessRevision, setAccessRevision] = useState(0);
  const loadMe = async () => {
    try {
      const u = await api('/me');
      setCsrf(u.csrf);
      const next = JSON.stringify([u.permission_version, u.grants, u.capabilities]);
      if (permissionKey.current && permissionKey.current !== next) {
        setTask('');
        setCreate(false);
        setSub('');
        setFilter('');
        setAccessRevision((r) => r + 1);
        setRevision((r) => r + 1);
      }
      permissionKey.current = next;
      setMe(u);
      setError(null);
    } catch (e) {
      if ((e as any).status !== 401) setError(e);
      setMe(null);
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    loadMe();
    const timer = setInterval(loadMe, 60000);
    const refresh = () => {
      void loadMe();
    };
    const refreshList = () => setRevision((r) => r + 1);
    window.addEventListener('sn-list-refresh', refreshList);
    window.addEventListener('sn-access-refresh', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('sn-access-refresh', refresh);
      window.removeEventListener('sn-list-refresh', refreshList);
    };
  }, []);
  const groups: { id: string; label: string; items: string[] }[] =
    me?.capabilities?.menu_groups || [];
  const nav = groups.flatMap((g) => g.items);
  const current = nav.includes(page) || page === 'notifications' ? page : nav[0] || 'profile';
  useEffect(() => {
    if (!me) return;
    const expiry = me.grants
      .map((g: any) => Date.parse(g.valid_to))
      .filter((v: number) => v > Date.now())
      .sort((a: number, b: number) => a - b)[0];
    if (!expiry) return;
    const timer = setTimeout(loadMe, Math.min(expiry - Date.now() + 50, 2147483647));
    return () => clearTimeout(timer);
  }, [me]);
  const go = (v: string) => {
    if (
      document.querySelector('form[data-dirty="true"]') &&
      !confirm('Bạn có thay đổi chưa lưu. Chuyển màn hình và bỏ nội dung này?')
    )
      return;
    setPage(v);
    setOpen(false);
    setSub('');
    setFilter('');
  };
  if (!ready) return <div className="login">Đang kết nối Super Net…</div>;
  if (!me)
    return (
      <div className="login">
        <div className="brand">
          <b>S</b>
          <div>
            supernet.<small>WORKSPACE</small>
          </div>
        </div>
        <h1>Chào mừng trở lại</h1>
        <p className="muted">Đăng nhập để theo dõi công việc và kết nối cùng đội ngũ.</p>
        <ErrorBox error={error} />
        <Form
          fields={[
            { key: 'username', label: 'Tên đăng nhập', required: true },
            { key: 'password', label: 'Mật khẩu', type: 'password', required: true },
          ]}
          onSubmit={async (v) => {
            const r = await api('/auth/login', v);
            setCsrf(r.csrf);
            await loadMe();
          }}
          label="Đăng nhập"
        />
        <small>
          Liên hệ quản trị viên nếu bạn chưa có tài khoản hoặc cần khôi phục quyền truy cập.
        </small>
      </div>
    );
  return (
    <>
      <aside className={'sidebar ' + (open ? 'open' : '')}>
        <div className="brand">
          <b>S</b>
          <div>
            supernet.<small>WORKSPACE</small>
          </div>
        </div>
        <div className="nav">
          {groups.map((group) => (
            <React.Fragment key={group.id}>
              <div className="nav-heading">{group.label}</div>
              {group.items.map((n) => (
                <button key={n} className={current === n ? 'active' : ''} onClick={() => go(n)}>
                  <span className="nav-icon" aria-hidden="true">
                    <NavIcon name={n} />
                  </span>
                  {names[n]}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="userfoot">
          <strong>{me.name}</strong>
          <div className="row-meta">
            {(me.display_roles?.length
              ? me.display_roles.map((r: string) => roleLabel[r] || r)
              : ['Quyền cũ · cần phân loại']
            ).join(' · ')}
          </div>
          <button
            className="ghost"
            onClick={async () => {
              await api('/auth/logout', {});
              setMe(null);
              setTask('');
              setPage('dashboard');
            }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="actions">
            <button
              className="mobile-toggle ghost"
              aria-label="Mở menu"
              onClick={() => setOpen(!open)}
            >
              ☰
            </button>
            <small className="crumb">Không gian làm việc / {names[current]}</small>
          </div>
          <div className="actions">
            {me.demo && <Badge>MÔI TRƯỜNG DEMO</Badge>}
            <button className="ghost" aria-label="Thông báo" onClick={() => go('notifications')}>
              <NavIcon name="notifications" />
            </button>
            <span className="avatar">{me.name.slice(0, 1)}</span>
          </div>
        </header>
        <div className="content" key={accessRevision}>
          <div className="heading">
            <div>
              <div className="eyebrow">SUPER NET WORKSPACE</div>
              <h1>{names[current]}</h1>
            </div>
            {['dashboard', 'mine', 'team', 'legacy'].includes(current) &&
              me.capabilities.create_task && (
                <button className="primary" onClick={() => setCreate(true)}>
                  + {me.management ? 'Giao nhiệm vụ' : 'Thêm việc phát sinh'}
                </button>
              )}
          </div>
          {['dashboard', 'mine', 'team'].includes(current) && (
            <WorkTasks
              key={current}
              mode={current}
              me={me}
              revision={revision}
              onTask={setTask}
              onReport={(id: string) => {
                setReportFocus(id);
                go('reports');
              }}
              filter={filter}
              setFilter={setFilter}
              onList={(s: string) => {
                go(me.management ? 'team' : 'mine');
                setFilter(s);
              }}
            />
          )}
          {current === 'legacy' && (
            <Tasks
              mode={me.management ? 'team' : 'mine'}
              me={me}
              revision={revision}
              onTask={setTask}
              filter={filter}
              setFilter={setFilter}
              onList={() => {}}
            />
          )}
          {current === 'legacy-users' && me.admin && <Team me={me} />}
          {current === 'legacy-business' && <Metrics kind="SALES" />}
          {current === 'legacy-hr' && <EmployeeDirectory me={me} />}
          {current === 'legacy-content' && <Records module="content" me={me} />}
          {current === 'plans' && <Plans me={me} />}{' '}
          {current === 'reports' && (
            <Reports key={reportFocus} me={me} onTask={setTask} initialRevision={reportFocus} />
          )}{' '}
          {current === 'content' && <ContentWorkspace />}
          {current === 'business' && <SourceWorkspace />}
          {current === 'hr' && (
            <HrWorkspace
              key={hrTarget + employeeFocus}
              me={me}
              initialSelected={employeeFocus}
              initialTarget={hrTarget}
            />
          )}
          {['ads', 'warehouse', 'finance', 'issues'].includes(current) && (
            <>
              {['business', 'ads', 'content'].includes(current) && (
                <div className="tabs">
                  {(current === 'business'
                    ? ['Hồ sơ KOC', 'Số liệu bán hàng', 'Bồi hoàn']
                    : current === 'ads'
                      ? ['Số liệu quảng cáo']
                      : ['Hồ sơ sản xuất', 'Hiệu quả video', 'Hiệu quả livestream']
                  ).map((s, i) => (
                    <button
                      key={s}
                      className={sub === s || (!sub && i === 0) ? 'active' : ''}
                      onClick={() => setSub(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {current === 'ads' ? (
                <Metrics kind="ADS" />
              ) : sub === 'Số liệu bán hàng' ? (
                <Metrics kind="SALES" />
              ) : sub === 'Bồi hoàn' ? (
                <Claims />
              ) : sub === 'Hiệu quả video' ? (
                <Metrics kind="VIDEO" />
              ) : sub === 'Hiệu quả livestream' ? (
                <Metrics kind="LIVE" />
              ) : current === 'hr' ? (
                <EmployeeDirectory me={me} initialSelected={employeeFocus} />
              ) : (
                <Records key={current} module={current} me={me} />
              )}
            </>
          )}
          {current === 'requests' && <Requests me={me} />}{' '}
          {current === 'users' && <RoleProvision me={me} />}{' '}
          {current === 'templates' && <TemplateAdmin />}
          {current === 'settings' && (
            <>
              <HandoffSettings />
              <ResourceSettings />
              <Settings />
            </>
          )}{' '}
          {current === 'accounts' && <Accounts me={me} />}{' '}
          {current === 'notifications' && (
            <Notifications
              onOpen={async (path: string) => {
                if (/^\/tasks\/[0-9a-f-]{36}$/.test(path)) {
                  go('mine');
                  setTask(path.split('/')[2]);
                } else if (/^\/report-revisions\/[0-9a-f-]{36}$/.test(path)) {
                  go('reports');
                  setReportFocus(path.split('/')[2]);
                } else if (/^\/employees\/[0-9a-f-]{36}$/.test(path)) {
                  setEmployeeFocus(path.split('/')[2]);
                  setHrTarget('employees');
                  go('hr');
                } else if (/^\/candidates\/[0-9a-f-]{36}$/.test(path)) {
                  setEmployeeFocus(path.split('/')[2]);
                  setHrTarget('candidates');
                  go('hr');
                } else if (/^\/hr\/contracts\/[0-9a-f-]{36}$/.test(path)) {
                  const c = await api('/contracts/' + path.split('/')[3]);
                  setEmployeeFocus(c.employee_id);
                  setHrTarget('contracts');
                  go('hr');
                } else if (path === '/hr/birthdays') {
                  setHrTarget('birthdays');
                  go('hr');
                }
              }}
              onEmployee={(id: string) => {
                setEmployeeFocus(id);
                go('hr');
              }}
            />
          )}{' '}
          {current === 'history' && <PasswordHistory />}{' '}
          {current === 'profile' && (
            <div className="panel">
              <h2>Đổi mật khẩu đăng nhập</h2>
              <Form
                fields={[
                  {
                    key: 'current_password',
                    label: 'Mật khẩu hiện tại',
                    type: 'password',
                    required: true,
                  },
                  {
                    key: 'new_password',
                    label: 'Mật khẩu mới (ít nhất 11 ký tự)',
                    type: 'password',
                    required: true,
                  },
                  {
                    key: 'confirm',
                    label: 'Xác nhận mật khẩu mới',
                    type: 'password',
                    required: true,
                  },
                ]}
                onSubmit={(v) => {
                  if (v.confirm !== v.new_password) throw Error('Mật khẩu xác nhận chưa khớp');
                  return api('/auth/password', {
                    current_password: v.current_password,
                    new_password: v.new_password,
                  });
                }}
                label="Đổi mật khẩu"
              />
            </div>
          )}
          <footer className="footer">
            SUPER NET · INTERNAL WORKSPACE · Thời gian hiển thị Asia/Ho_Chi_Minh
          </footer>
        </div>
      </main>
      {create && current === 'legacy' && (
        <CreateTask
          me={me}
          onClose={() => setCreate(false)}
          onDone={(id: string) => {
            setCreate(false);
            setTask(id);
            setRevision((n) => n + 1);
          }}
        />
      )}
      {create && current !== 'legacy' && (
        <CreateChecklist
          me={me}
          onClose={() => setCreate(false)}
          onDone={(id: string) => {
            setCreate(false);
            setTask(id);
            setRevision((r) => r + 1);
          }}
        />
      )}
      {task && (
        <TaskDetail
          id={task}
          me={me}
          onClose={() => setTask('')}
          onChanged={() => setRevision((r) => r + 1)}
        />
      )}
    </>
  );
}
function Tasks({ mode, me, revision, onTask, filter, setFilter, onList }: any) {
  const [search, setSearch] = useState(''),
    [role, setRole] = useState(''),
    [cursor, setCursor] = useState('0'),
    [board, setBoard] = useState(false);
  const { data, error } = useLoad(
    `/tasks?mode=${mode === 'dashboard' ? (me.management ? 'team' : 'mine') : mode}&status=${filter}&role=${role}&search=${encodeURIComponent(search)}&cursor=${cursor}`,
    revision,
  );
  const items = data?.items || [];
  const s = data?.summary || {
    total: items.length,
    done: items.filter((t: any) => t.status === 'DONE').length,
    on_time: items.filter((t: any) => t.timing === 'ON_TIME').length,
    open: items.filter((t: any) => !['DONE', 'CANCELLED', 'DECLINED', 'DRAFT'].includes(t.status))
      .length,
  };
  return (
    <>
      <button
        className="list-refresh"
        onClick={() => window.dispatchEvent(new Event('sn-list-refresh'))}
      >
        Tải lại danh sách
      </button>
      <Loaded data={data} error={error}>
        {mode === 'dashboard' ? (
          <>
            <div className="welcome">
              <h3>Chào {me.name}.</h3>
              <p>
                {s.open} công việc đang mở trong phạm vi bạn được xem. Cùng theo dõi tiến độ, thời
                hạn và những việc cần hỗ trợ.
              </p>
            </div>
            <Summary s={s} onFilter={onList} />
            <small>
              Tổng hợp toàn bộ công việc trong phạm vi và bộ lọc hiện tại, không giới hạn theo
              trang. Báo cáo tuần có kỳ riêng.
            </small>
            <div className="grid">
              <div className="panel">
                <h2>Công việc cần theo dõi</h2>
                <TaskTable items={items} onOpen={onTask} />
              </div>
              <div className="panel">
                <h2>Trạng thái công việc</h2>
                {['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'CHANGES_REQUESTED', 'DONE'].map((st) => (
                  <div key={st} className="barrow">
                    <button className="text-link" onClick={() => onList(st)}>
                      {statusLabel[st]}
                    </button>
                    <div className="bar">
                      <i
                        style={{
                          width:
                            (s.total
                              ? ((s.status_counts?.[st] ??
                                  items.filter((t: any) => t.status === st).length) /
                                  s.total) *
                                100
                              : 0) + '%',
                        }}
                      />
                    </div>
                    <span>
                      {s.status_counts?.[st] ?? items.filter((t: any) => t.status === st).length}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="toolbar">
              <input
                aria-label="Tìm task"
                placeholder="Tìm tên / mã nhiệm vụ…"
                className="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCursor('0');
                }}
              />
              <select
                aria-label="Lọc trạng thái"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setCursor('0');
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(statusLabel)
                  .filter(([k]) =>
                    [
                      'DRAFT',
                      'ASSIGNED',
                      'ACCEPTED',
                      'IN_PROGRESS',
                      'SUBMITTED',
                      'CHANGES_REQUESTED',
                      'DONE',
                      'DECLINED',
                      'CANCELLED',
                    ].includes(k),
                  )
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Lọc role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setCursor('0');
                }}
              >
                <option value="">Tất cả vai trò</option>
                {Object.entries(roleLabel)
                  .filter(([k]) =>
                    [
                      'CONTENT',
                      'DESIGNER',
                      'MARKETPLACE',
                      'ADS',
                      'HR',
                      'ACCOUNTANT',
                      'WAREHOUSE',
                      'INTERN',
                    ].includes(k),
                  )
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
              <button onClick={() => setBoard(!board)}>{board ? 'Dạng bảng' : 'Dạng board'}</button>
            </div>
            {board ? (
              <div className="board">
                {[...new Set(items.map((t: any) => t.status))].map((st: any) => (
                  <div className="column" key={st}>
                    <h3>{statusLabel[st]}</h3>
                    {items
                      .filter((t: any) => t.status === st)
                      .map((t: any) => (
                        <button className="taskcard" key={t.id} onClick={() => onTask(t.id)}>
                          {t.title}
                          <div className="row-meta">
                            {t.owner_name}
                            {t.participation ? ' · Hỗ trợ' : ''}
                          </div>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="panel">
                <TaskTable items={items} onOpen={onTask} />
              </div>
            )}
          </>
        )}
        <div className="pager">
          {cursor !== '0' && <button onClick={() => setCursor('0')}>Về đầu</button>}
          {data?.next_cursor && (
            <button onClick={() => setCursor(data.next_cursor)}>Trang tiếp</button>
          )}
        </div>
      </Loaded>
    </>
  );
}
function Notifications({ onEmployee, onOpen }: any) {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/notifications', rev);
  useHourlyRefresh(() => setRev((r) => r + 1));
  return (
    <Loaded data={data} error={error}>
      <div className="panel">
        <button onClick={() => setRev((r) => r + 1)}>Tải lại thông báo</button>
        {data?.items.length ? (
          data.items.map((n: any) => (
            <div className="notification" key={n.id}>
              <p>{n.message}</p>
              {n.action_path && (
                <button onClick={() => onOpen(n.action_path)}>Mở nội dung liên quan</button>
              )}
              {!n.action_path && n.event_key.startsWith('contract:') && n.object_id && (
                <button onClick={() => onEmployee(n.object_id)}>Mở hồ sơ nhân sự</button>
              )}
              {n.read_at ? (
                <Badge>Đã đọc</Badge>
              ) : (
                <button
                  onClick={async () => {
                    await api('/notifications/' + n.id + '/read', {});
                    setRev((r) => r + 1);
                  }}
                >
                  Đánh dấu đã đọc
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty>Chưa có thông báo.</Empty>
        )}
      </div>
    </Loaded>
  );
}
createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
