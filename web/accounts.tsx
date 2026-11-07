import React, { useEffect, useRef, useState } from 'react';
import { api, fmt } from './api';
import { Form, Modal, Loaded, useLoad, ErrorBox, Empty, Badge, roleLabel } from './ui';
export function useDebounced<T>(value: T, delay = 300) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setOut(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return out;
}
function SecretReveal({
  path,
  body = {},
  label = 'mật khẩu hiện tại',
  version,
}: {
  path: string;
  body?: any;
  label?: string;
  version?: number;
}) {
  const [secret, setSecret] = useState(''),
    [error, setError] = useState<any>(),
    [busy, setBusy] = useState(false),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => {
    generation.current++;
    setSecret('');
    setBusy(false);
    clearTimeout(timer.current);
  };
  useEffect(() => {
    clear();
    window.addEventListener('blur', clear);
    window.addEventListener('sn-access-refresh', clear);
    const visibility = () => {
      if (document.hidden) clear();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      generation.current++;
      clearTimeout(timer.current);
      window.removeEventListener('blur', clear);
      window.removeEventListener('sn-access-refresh', clear);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [path, version]);
  const reveal = async (copy = false) => {
    setBusy(true);
    setError(null);
    const token = ++generation.current;
    try {
      const r = await api(path, body);
      if (token !== generation.current) return;
      if (copy) {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(r.secret);
        else {
          setSecret(r.secret);
          throw Error(
            'Trình duyệt HTTP chưa hỗ trợ sao chép tự động. Bạn có thể chọn và sao chép mật khẩu đang hiển thị.',
          );
        }
      } else setSecret(r.secret);
      clearTimeout(timer.current);
      timer.current = setTimeout(clear, 30000);
    } catch (e) {
      if (token === generation.current) {
        if ((e as any).status) setSecret('');
        setError(e);
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  return (
    <div className="secret-control">
      <div className="secret-value" aria-live="polite">
        {secret || '••••••••••••'}
      </div>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => (secret ? clear() : reveal())}>
          {secret ? 'Ẩn' : 'Xem'} {label}
        </button>
        <button type="button" disabled={busy} onClick={() => reveal(true)}>
          Sao chép {label}
        </button>
      </div>
      <ErrorBox error={error} />
    </div>
  );
}
function activeJobRoles(u: any) {
  return [
    ...new Set(
      (u.grants || [])
        .filter(
          (g: any) =>
            g.kind === 'JOB' &&
            !g.revoked_at &&
            Date.parse(g.valid_from) <= Date.now() &&
            (!g.valid_to || Date.parse(g.valid_to) > Date.now()),
        )
        .map((g: any) => g.role),
    ),
  ] as string[];
}
export function ViewerPicker({
  people,
  value,
  roles,
  onChange,
}: {
  people: any[];
  value: string[];
  roles: Record<string, string[]>;
  onChange: (ids: string[], roles: Record<string, string[]>) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = people.filter(
    (u) =>
      u.active &&
      `${u.name} ${u.username} ${u.employee_code || ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <fieldset className="viewer-picker">
      <legend>Người được xem · {value.length} người</legend>
      <p className="muted">Để trống: chỉ Admin. Quyền được gắn với chuyên môn còn hiệu lực.</p>
      <input
        aria-label="Tìm người được xem"
        placeholder="Tìm tên hoặc mã nhân sự…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="viewer-options">
        {filtered.map((u) => {
          const jobs = activeJobRoles(u);
          return (
            <div key={u.id} className="viewer-option">
              <label className="check">
                <input
                  type="checkbox"
                  disabled={!jobs.length && !value.includes(u.id)}
                  checked={value.includes(u.id)}
                  onChange={(e) => {
                    const ids = e.target.checked
                      ? [...value, u.id]
                      : value.filter((id) => id !== u.id);
                    const next = { ...roles };
                    if (e.target.checked && !next[u.id]) next[u.id] = jobs.length === 1 ? jobs : [];
                    if (!e.target.checked) delete next[u.id];
                    onChange(ids, next);
                  }}
                />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.employee_code || 'Chưa có mã nhân sự'} ·{' '}
                    {jobs.map((r) => roleLabel[r]).join(', ') || 'Chưa có chuyên môn hiệu lực'}
                  </small>
                </span>
              </label>
              {value.includes(u.id) && jobs.length > 1 && (
                <div className="viewer-role-options">
                  {jobs.map((role) => (
                    <label className="check" key={role}>
                      <input
                        type="checkbox"
                        checked={(roles[u.id] || []).includes(role)}
                        onChange={(e) =>
                          onChange(value, {
                            ...roles,
                            [u.id]: e.target.checked
                              ? [...(roles[u.id] || []), role]
                              : (roles[u.id] || []).filter((r) => r !== role),
                          })
                        }
                      />
                      {roleLabel[role]}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!filtered.length && <Empty>Không có người phù hợp.</Empty>}
      </div>
    </fieldset>
  );
}
export function PlatformSettings() {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/platforms', rev),
    [selected, setSelected] = useState<any>(),
    [create, setCreate] = useState(false);
  return (
    <div className="panel">
      <div className="heading">
        <div>
          <h2>Nền tảng</h2>
          <p className="muted">
            Đổi tên giữ liên kết tài khoản và lịch sử. Tắt chỉ ngăn chọn khi tạo mới.
          </p>
        </div>
        <button onClick={() => setCreate(true)}>+ Thêm nền tảng</button>
      </div>
      <Loaded data={data} error={error}>
        {data?.items.map((p: any) => (
          <div className="support-row" key={p.id}>
            <strong>{p.name}</strong> <Badge>{p.enabled ? 'Đang bật' : 'Đã tắt'}</Badge>
            <button onClick={() => setSelected(p)}>Sửa {p.name}</button>
          </div>
        ))}
      </Loaded>
      {(selected || create) && (
        <Modal
          compact
          title={selected ? 'Chỉnh sửa nền tảng' : 'Thêm nền tảng'}
          onClose={() => {
            setSelected(undefined);
            setCreate(false);
          }}
        >
          <Form
            initial={selected || { name: '', enabled: true, sort_order: 0 }}
            fields={[
              { key: 'name', label: 'Tên nền tảng', required: true },
              ...(selected
                ? [
                    { key: 'enabled', label: 'Cho phép chọn khi tạo mới', type: 'checkbox' },
                    { key: 'sort_order', label: 'Thứ tự hiển thị', type: 'number', required: true },
                  ]
                : []),
            ]}
            onSubmit={async (v, key) => {
              await api(
                selected ? '/platforms/' + selected.id : '/platforms',
                { ...v, expected_version: selected?.version },
                selected ? 'PATCH' : 'POST',
                key,
              );
              setSelected(undefined);
              setCreate(false);
              setRev((r) => r + 1);
            }}
            label="Lưu nền tảng"
          />
        </Modal>
      )}
    </div>
  );
}
export function CredentialStorage() {
  const { data, error } = useLoad('/settings/credential-storage-status');
  return (
    <div className="panel">
      <h2>Lưu mật khẩu</h2>
      <Loaded data={data} error={error}>
        <Badge>
          {data?.state === 'ready'
            ? 'Đã cấu hình an toàn'
            : data?.state === 'missing_key'
              ? 'Chưa cấu hình khóa'
              : 'Không thể giải mã dữ liệu cũ'}
        </Badge>
        <p className="muted">
          {data?.state === 'ready'
            ? 'Mật khẩu nền tảng được mã hóa; mật khẩu đăng nhập website chỉ lưu hash.'
            : data?.state === 'missing_key'
              ? 'Người vận hành cần thiết lập VAULT_KEY riêng trên máy chủ, giữ ngoài source và database.'
              : 'Khôi phục đúng khóa đã dùng cho dữ liệu cũ. Không tạo khóa thay thế khi đang có mật khẩu được mã hóa.'}
        </p>
      </Loaded>
    </div>
  );
}
export function Accounts({ me }: { me: any }) {
  const [rev, setRev] = useState(0),
    [search, setSearch] = useState(''),
    [platform, setPlatform] = useState(''),
    [sort, setSort] = useState('updated'),
    [cursor, setCursor] = useState('0'),
    [selected, setSelected] = useState<any>(),
    [mode, setMode] = useState(''),
    [notice, setNotice] = useState('');
  const query = useDebounced(search),
    catalog = useLoad('/platforms', rev),
    users = useLoad(me.admin ? '/users' : null),
    list = useLoad(
      `/platform-accounts?search=${encodeURIComponent(query)}&platform_id=${platform}&sort=${sort}&cursor=${cursor}`,
      rev,
    );
  useEffect(() => {
    const timer = setInterval(() => setRev((r) => r + 1), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const changed = () => {
      setMode('');
      setSelected(undefined);
      setNotice('Dữ liệu quyền vừa được kiểm tra lại. Các mật khẩu đang mở đã được ẩn.');
    };
    window.addEventListener('sn-access-refresh', changed);
    return () => window.removeEventListener('sn-access-refresh', changed);
  }, []);
  const close = () => {
      setMode('');
      setSelected(undefined);
    },
    saved = () => {
      close();
      setNotice('Đã lưu thành công.');
      setRev((r) => r + 1);
    };
  return (
    <>
      <div className="heading">
        <p className="muted">
          Tài khoản bạn được chia sẻ. Đổi mật khẩu trên nền tảng trước, sau đó cập nhật tại đây.
        </p>
        {me.admin && (
          <button className="primary" onClick={() => setMode('create')}>
            + Thêm tài khoản nền tảng
          </button>
        )}
      </div>
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      <div className="toolbar">
        <input
          className="search"
          aria-label="Tìm tài khoản nền tảng"
          placeholder="Tên tài khoản hoặc tên đăng nhập…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor('0');
          }}
        />
        <select
          aria-label="Lọc nền tảng"
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value);
            setCursor('0');
          }}
        >
          <option value="">Tất cả nền tảng</option>
          {catalog.data?.items.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sắp xếp tài khoản"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">Mới cập nhật</option>
          <option value="name">Tên A–Z</option>
          <option value="platform">Nền tảng</option>
        </select>
      </div>
      <Loaded data={list.data} error={list.error}>
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>Nền tảng / tài khoản</th>
                <th>Tên đăng nhập</th>
                <th>Mật khẩu</th>
                {me.admin && <th>Người được xem</th>}
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <span className="platform-mark">{r.platform.name.slice(0, 1)}</span>
                    <strong>{r.label}</strong>
                    <small className="row-meta">
                      {r.platform.name} · {r.company}
                    </small>
                  </td>
                  <td>
                    {r.login}
                    <small className="row-meta">{r.note}</small>
                  </td>
                  <td>
                    {r.has_password ? (
                      <SecretReveal
                        path={'/platform-accounts/' + r.id + '/reveal'}
                        version={r.version}
                      />
                    ) : (
                      <span>Chưa lưu mật khẩu</span>
                    )}
                  </td>
                  {me.admin && (
                    <td>
                      {[
                        ...new Set(
                          r.viewers
                            .filter(
                              (g: any) =>
                                !g.revoked_at &&
                                (!g.valid_to || Date.parse(g.valid_to) > Date.now()),
                            )
                            .map((g: any) => g.name),
                        ),
                      ].join(', ') || 'Chỉ Admin'}
                    </td>
                  )}
                  <td>
                    <div className="stack-actions">
                      <button
                        onClick={() => {
                          setSelected(r);
                          setMode('password');
                        }}
                      >
                        Cập nhật mật khẩu
                      </button>
                      {me.admin && (
                        <>
                          <button
                            onClick={() => {
                              setSelected(r);
                              setMode('edit');
                            }}
                          >
                            Sửa thông tin
                          </button>
                          <button
                            onClick={() => {
                              setSelected(r);
                              setMode('viewers');
                            }}
                          >
                            Người được xem
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.items.length === 0 && <Empty>Chưa có tài khoản được chia sẻ cho bạn.</Empty>}
        </div>
        <div className="pager">
          {cursor !== '0' && <button onClick={() => setCursor('0')}>Về đầu</button>}
          {list.data?.next_cursor && (
            <button onClick={() => setCursor(list.data.next_cursor)}>Trang tiếp</button>
          )}
        </div>
      </Loaded>
      {mode && (
        <Modal
          compact
          title={
            mode === 'create'
              ? 'Thêm tài khoản nền tảng'
              : mode === 'edit'
                ? 'Sửa thông tin tài khoản'
                : mode === 'viewers'
                  ? 'Người được xem · ' + selected.label
                  : 'Cập nhật mật khẩu · ' + selected.label
          }
          onClose={close}
        >
          {mode === 'password' ? (
            <>
              <p className="notice">Đổi mật khẩu trên nền tảng trước, sau đó cập nhật tại đây.</p>
              <Form
                fields={[
                  { key: 'secret', label: 'Mật khẩu mới', type: 'password', required: true },
                  { key: 'note', label: 'Ghi chú', type: 'textarea' },
                ]}
                onSubmit={async (v, key) => {
                  const r = await api(
                    '/platform-accounts/' + selected.id + '/versions',
                    { ...v, expected_version: selected.version },
                    'POST',
                    key,
                  );
                  saved();
                  setNotice(
                    r.changed
                      ? 'Đã cập nhật mật khẩu.'
                      : 'Mật khẩu không thay đổi; không tạo phiên bản mới.',
                  );
                }}
                onConflict={async () => setSelected(await api('/platform-accounts/' + selected.id))}
                label="Lưu mật khẩu"
              />
            </>
          ) : (
            <Loaded data={users.data} error={users.error}>
              <AccountEditor
                selected={selected}
                mode={mode}
                platforms={catalog.data?.items || []}
                people={users.data?.items || []}
                onSaved={saved}
                onReload={async () => setSelected(await api('/platform-accounts/' + selected.id))}
                onPlatformAdded={() => setRev((r) => r + 1)}
              />
            </Loaded>
          )}
        </Modal>
      )}
    </>
  );
}
function AccountEditor({
  selected,
  mode,
  platforms,
  people,
  onSaved,
  onPlatformAdded,
  onReload,
}: any) {
  const usable = (selected?.viewers || []).filter((g: any) => {
    const person = people.find((u: any) => u.id === g.user_id && u.active);
    return (
      !g.revoked_at &&
      (!g.valid_to || Date.parse(g.valid_to) > Date.now()) &&
      person &&
      activeJobRoles(person).includes(g.role)
    );
  });
  const ids = [...new Set<string>(usable.map((g: any) => g.user_id))];
  const [viewers, setViewers] = useState<string[]>(ids),
    [roles, setRoles] = useState<Record<string, string[]>>(() =>
      Object.fromEntries(
        ids.map((id) => [id, usable.filter((g: any) => g.user_id === id).map((g: any) => g.role)]),
      ),
    ),
    [addPlatform, setAddPlatform] = useState(false);
  return (
    <>
      <Form
        fields={
          mode === 'viewers'
            ? []
            : [
                {
                  key: 'platform_id',
                  label: 'Nền tảng',
                  type: 'select',
                  required: true,
                  options: platforms
                    .filter((p: any) => p.enabled || p.id === selected?.platform.id)
                    .map((p: any) => ({ value: p.id, label: p.name })),
                },
                { key: 'label', label: 'Tên tài khoản / cửa hàng', required: true },
                { key: 'login', label: 'Tài khoản đăng nhập', required: true },
                ...(mode === 'create'
                  ? [
                      {
                        key: 'secret',
                        label: 'Mật khẩu nền tảng',
                        type: 'password',
                        required: true,
                      },
                      { key: 'company', label: 'Pháp nhân', required: true },
                    ]
                  : []),
                { key: 'note', label: 'Ghi chú', type: 'textarea' },
              ]
        }
        initial={selected ? { ...selected, platform_id: selected.platform.id } : { note: '' }}
        onSubmit={async (v, key) => {
          if (mode !== 'edit' && viewers.some((id) => !roles[id]?.length))
            throw Error('Chọn chuyên môn áp dụng cho người được xem.');
          await api(
            mode === 'create'
              ? '/platform-accounts'
              : mode === 'edit'
                ? '/platform-accounts/' + selected.id
                : '/platform-accounts/' + selected.id + '/viewers',
            {
              ...v,
              viewer_ids: viewers,
              viewer_roles: roles,
              expected_version: selected?.version,
              expected_sharing_version: selected?.sharing_version,
            },
            mode === 'create' ? 'POST' : mode === 'edit' ? 'PATCH' : 'PUT',
            key,
          );
          onSaved();
        }}
        onConflict={mode !== 'create' ? onReload : undefined}
        label={mode === 'viewers' ? 'Lưu người được xem' : 'Lưu tài khoản'}
      >
        {mode !== 'viewers' && (
          <button type="button" className="text-link" onClick={() => setAddPlatform(true)}>
            + Thêm nền tảng
          </button>
        )}
        {mode !== 'edit' && (
          <ViewerPicker
            people={people}
            value={viewers}
            roles={roles}
            onChange={(ids, roles) => {
              setViewers(ids);
              setRoles(roles);
            }}
          />
        )}
      </Form>
      {addPlatform && (
        <Modal compact title="Thêm nền tảng" onClose={() => setAddPlatform(false)}>
          <Form
            fields={[{ key: 'name', label: 'Tên nền tảng', required: true }]}
            onSubmit={async (v, key) => {
              await api('/platforms', v, 'POST', key);
              setAddPlatform(false);
              onPlatformAdded();
            }}
            label="Thêm nền tảng"
          />
        </Modal>
      )}
    </>
  );
}
export function PasswordHistory() {
  const [filters, setFilters] = useState({
      platform_id: '',
      account_id: '',
      actor_id: '',
      from: '',
      to: '',
    }),
    [cursor, setCursor] = useState('0'),
    [selected, setSelected] = useState<any>();
  const platforms = useLoad('/platforms'),
    accounts = useLoad('/platform-accounts?limit=100'),
    users = useLoad('/users');
  const query = new URLSearchParams({ ...filters, cursor });
  const { data, error } = useLoad('/credential-history?' + query);
  return (
    <>
      <p className="muted">
        Chỉ các lần lưu hoặc cập nhật mật khẩu nền tảng. Mật khẩu website không có lịch sử đọc lại.
      </p>
      <div className="toolbar">
        {[
          ['platform_id', 'Nền tảng', platforms.data?.items],
          [
            'account_id',
            'Tài khoản',
            accounts.data?.items?.map((r: any) => ({ id: r.id, name: r.label })),
          ],
          ['actor_id', 'Người cập nhật', users.data?.items],
        ].map(([key, label, items]: any) => (
          <label key={key}>
            {label}
            <select
              aria-label={'Lọc lịch sử theo ' + label}
              value={(filters as any)[key]}
              onChange={(e) => {
                setFilters({ ...filters, [key]: e.target.value });
                setCursor('0');
              }}
            >
              <option value="">Tất cả</option>
              {items?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Từ ngày
          <input
            type="date"
            value={filters.from}
            onChange={(e) => {
              setFilters({ ...filters, from: e.target.value });
              setCursor('0');
            }}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={filters.to}
            onChange={(e) => {
              setFilters({ ...filters, to: e.target.value });
              setCursor('0');
            }}
          />
        </label>
      </div>
      <Loaded data={data} error={error}>
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Nền tảng / tài khoản</th>
                <th>Người cập nhật</th>
                <th>Loại thay đổi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r: any) => (
                <tr key={r.id}>
                  <td>{fmt(r.created_at)}</td>
                  <td>
                    <strong>{r.account_snapshot.label}</strong>
                    <small className="row-meta">
                      {r.account_snapshot.platform_name} · {r.account_snapshot.login}
                    </small>
                  </td>
                  <td>{r.actor_name || 'Người dùng đã lưu trữ'}</td>
                  <td>{r.has_previous ? 'Cập nhật mật khẩu' : 'Lưu mật khẩu lần đầu'}</td>
                  <td>
                    <button onClick={() => setSelected(r)}>Xem phiên bản</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.items.length && <Empty>Chưa có lịch sử phù hợp.</Empty>}
        </div>
        <div className="pager">
          {cursor !== '0' && <button onClick={() => setCursor('0')}>Về đầu</button>}
          {data?.next_cursor && (
            <button onClick={() => setCursor(data.next_cursor)}>Trang tiếp</button>
          )}
        </div>
      </Loaded>
      {selected && (
        <Modal
          compact
          title={'Lịch sử mật khẩu · ' + selected.account_snapshot.label}
          onClose={() => setSelected(undefined)}
        >
          <p>
            {selected.actor_name || 'Người dùng đã lưu trữ'} · {fmt(selected.created_at)} · Phiên
            bản {selected.revision}
          </p>
          <p>
            {selected.account_snapshot.platform_name} · {selected.account_snapshot.login}
          </p>
          {selected.account_snapshot.legacy_metadata && (
            <p className="notice">
              Thông tin tài khoản cũ được ghi nhận lúc nâng cấp; trước đây chưa có snapshot
              metadata.
            </p>
          )}
          <h3>Mật khẩu trước</h3>
          {selected.has_previous ? (
            <SecretReveal
              path={'/credential-history/' + selected.id + '/reveal'}
              body={{ which: 'before' }}
              label="mật khẩu trước"
            />
          ) : (
            <p>Bản lưu đầu tiên không có mật khẩu trước.</p>
          )}
          <h3>Mật khẩu sau</h3>
          <SecretReveal
            path={'/credential-history/' + selected.id + '/reveal'}
            body={{ which: 'after' }}
            label="mật khẩu sau"
          />
          <p>{selected.note || 'Không có ghi chú.'}</p>
        </Modal>
      )}
    </>
  );
}
export function EmployeeChecklistSettings() {
  const [rev, setRev] = useState(0),
    { data, error } = useLoad('/settings', rev);
  const policy = data?.items.find((p: any) => p.key === 'policies');
  const [selected, setSelected] = useState<Record<string, string[]> | null>(null);
  const types: Record<string, string> = {
    FULL_TIME: 'Toàn thời gian',
    PART_TIME: 'Bán thời gian',
    INTERN: 'Thực tập',
    CONTRACTOR: 'Cộng tác',
  };
  const docs: Record<string, string> = {
    IDENTITY: 'Giấy tờ định danh',
    CONTRACT: 'Hợp đồng',
    QUALIFICATION: 'Bằng cấp / chứng chỉ',
    PHOTO: 'Ảnh hồ sơ',
    OTHER: 'Tài liệu khác',
  };
  const current = selected || policy?.value.employee_document_checklists || {};
  return (
    <div className="panel">
      <h2>Nhân sự & thông báo</h2>
      <p className="muted">
        Checklist theo loại hình chỉ áp dụng sau khi lưu quyết định. Không tự bật nhắc hết thử
        việc/hợp đồng; ngưỡng ngày còn chờ chốt.
      </p>
      <Loaded data={data} error={error}>
        {policy && (
          <Form
            key={policy.version}
            fields={[
              {
                key: 'reason',
                label: 'Quyết định checklist / người chốt',
                type: 'textarea',
                required: true,
              },
            ]}
            onSubmit={async (v, key) => {
              await api(
                '/settings/policies',
                {
                  value: { ...policy.value, employee_document_checklists: current },
                  expected_version: policy.version,
                  reason: v.reason,
                },
                'PUT',
                key,
              );
              setSelected(null);
              setRev((r) => r + 1);
            }}
            label="Lưu checklist đã chốt"
          >
            {Object.entries(types).map(([type, label]) => (
              <fieldset key={type}>
                <legend>{label}</legend>
                <div className="check-grid">
                  {Object.entries(docs).map(([kind, name]) => (
                    <label className="check" key={kind}>
                      <input
                        type="checkbox"
                        checked={(current[type] || []).includes(kind)}
                        onChange={(e) =>
                          setSelected({
                            ...current,
                            [type]: e.target.checked
                              ? [...(current[type] || []), kind]
                              : (current[type] || []).filter((v: string) => v !== kind),
                          })
                        }
                      />
                      {name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </Form>
        )}
      </Loaded>
    </div>
  );
}
