import React, { useEffect, useState, useRef } from 'react';
import { api, iso, fmt } from './api';
import { Form, ErrorBox, Loaded, Empty, roleLabel, statusLabel, useLoad } from './ui';
import { TaskDrawer } from './task-drawer';
import { TaskTable } from './tasks';

const jobs = ['MARKETPLACE', 'HR', 'CONTENT'];
const labels: Record<string, string> = {
  WAITING: 'Chưa thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  DONE: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
};
const opts = (xs: any[]) => xs.map((x) => ({ value: x.id, label: x.name || x.label }));
export function CreateChecklist({ me, onDone, onClose }: any) {
  const directory = useLoad('/directory/invitees');
  const selfJobs = jobs.filter((j) => me.grants.some((g: any) => g.kind === 'JOB' && g.role === j));
  const [owner, setOwner] = useState(me.id),
    [files, setFiles] = useState<string[]>([]),
    [uploadError, setUploadError] = useState<any>(),
    [uploading, setUploading] = useState(false);
  const selected = directory.data?.items?.find((u: any) => u.id === owner);
  const roles = jobs.filter((j) => (selected?.roles || selfJobs).includes(j));
  return (
    <TaskDrawer title="Thêm công việc" dialogLabel="Thêm công việc" onClose={onClose}>
      <ErrorBox error={uploadError} />
      <Loaded data={directory.data} error={directory.error}>
        <label>
          Tài liệu đính kèm
          <input
            type="file"
            disabled={uploading}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              try {
                const b = new FormData();
                b.append('file', f);
                const r = await api('/task-attachments', b);
                setFiles((v) => [...v, r.id]);
                setUploadError(null);
              } catch (err) {
                setUploadError(err);
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        <small>{files.length} tài liệu đã tải</small>
        <Form
          fields={[
            { key: 'title', label: 'Tên công việc', required: true },
            {
              key: 'owner_id',
              label: 'Người phụ trách',
              type: 'select',
              options: opts(
                (directory.data?.items || []).filter(
                  (u: any) => u.id === me.id || me.capabilities?.team_work,
                ),
              ),
              required: true,
            },
            {
              key: 'job_code',
              label: 'Chuyên môn',
              type: 'select',
              options: roles.map((j) => ({ value: j, label: roleLabel[j] })),
              required: true,
            },
            {
              key: 'due_at',
              label: 'Thời hạn (giờ Việt Nam)',
              type: 'datetime-local',
              required: true,
            },
            {
              key: 'priority',
              label: 'Ưu tiên',
              type: 'select',
              options: [
                { value: 'NORMAL', label: 'Bình thường' },
                { value: 'URGENT', label: 'Khẩn' },
              ],
            },
            { key: 'description', label: 'Mô tả', type: 'textarea' },
          ]}
          initial={{
            owner_id: owner,
            job_code: roles.length === 1 ? roles[0] : '',
            priority: 'NORMAL',
            description: '',
          }}
          onChange={(v) => setOwner(v.owner_id)}
          onSubmit={async (v) => {
            if (uploading) throw Error('Đợi tải tài liệu hoàn tất');
            const t = await api('/tasks', {
              ...v,
              flow_mode: 'CHECKLIST',
              due_at: iso(v.due_at),
              attachment_ids: files,
            });
            onDone(t.id);
          }}
          label="Lưu công việc"
        />
      </Loaded>
    </TaskDrawer>
  );
}
export function WorkTasks({ mode, me, revision, onTask, onReport }: any) {
  const overview = useLoad(mode === 'dashboard' ? '/work-overview' : null, revision);
  const team = me.capabilities?.team_work && mode !== 'mine',
    directory = useLoad('/staff-directory');
  const defaults = {
    q: '',
    status_group: 'OPEN',
    deadline_preset: 'NONE',
    sort: 'ATTENTION',
    flow_mode: 'ALL',
    owner_ids: '',
    team_ids: '',
    job_codes: '',
    statuses: '',
    priority: '',
    due_from: '',
    due_to: '',
    created_from: '',
    created_to: '',
    completed_from: '',
    completed_to: '',
  };
  const preferenceKey = `supernet-task-view-v1:${me.id}:${mode}`;
  const [filter, setFilter] = useState(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
        return {
          ...defaults,
          ...Object.fromEntries(
            Object.entries(saved).filter(
              ([k, v]) => k !== 'q' && k in defaults && typeof v === 'string',
            ),
          ),
        };
      } catch {
        return defaults;
      }
    }),
    [search, setSearch] = useState(''),
    [data, setData] = useState<any>(),
    [error, setError] = useState<any>(),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState(''),
    [refresh, setRefresh] = useState(0),
    [board, setBoard] = useState(false);
  useEffect(() => {
    try {
      const { q, ...preferences } = filter;
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    } catch {}
  }, [filter, preferenceKey]);
  const serial = useRef(0),
    lastRevision = useRef(revision);
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => ({ ...f, q: search })), 300);
    return () => clearTimeout(t);
  }, [search]);
  const params = new URLSearchParams({
    v2: '1',
    scope: team ? 'team' : 'mine',
    ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== '')),
  });
  for (const k of ['due_from', 'due_to'])
    if (params.get(k)) {
      const d = filter[k as 'due_from'];
      params.set(
        k,
        iso(
          k === 'due_to'
            ? new Date(+new Date(d + 'T00:00:00Z') + 86400e3).toISOString().slice(0, 10) + 'T00:00'
            : d + 'T00:00',
        )!,
      );
    }
  const path = '/tasks?' + params.toString();
  useEffect(() => {
    let alive = true;
    const id = ++serial.current;
    setLoading(true);
    api(path)
      .then((r) => {
        if (alive && id === serial.current) {
          setData(r);
          setNotice('');
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, refresh]);
  useEffect(() => {
    if (lastRevision.current !== revision) {
      lastRevision.current = revision;
      setNotice('Đã cập nhật; tải lại để sắp xếp');
      setData((d: any) => (d ? { ...d, next_cursor: null } : d));
    }
  }, [revision]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.querySelector('dialog[open],form[data-dirty="true"]'))
        setNotice('Có dữ liệu mới; bản đang sửa được giữ nguyên');
      else setRefresh((n) => n + 1);
    }, 3600000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const saved = (e: Event) => {
      const item = (e as CustomEvent).detail;
      setData((d: any) =>
        d
          ? {
              ...d,
              items: d.items.map((t: any) => (t.id === item.id ? item : t)),
              next_cursor: null,
            }
          : d,
      );
      setNotice('Đã cập nhật; tải lại để sắp xếp');
    };
    window.addEventListener('sn-task-saved', saved);
    return () => window.removeEventListener('sn-task-saved', saved);
  }, []);
  const set = (k: string, v: string) => setFilter((f) => ({ ...f, [k]: v }));
  const chip = (group: string, preset = 'NONE') =>
    setFilter((f) => ({
      ...f,
      status_group: group,
      statuses: '',
      deadline_preset: preset,
      due_from: '',
      due_to: '',
      completed_from: '',
      completed_to: '',
      sort: 'ATTENTION',
    }));
  const active = Object.entries(filter).filter(([k, v]) => v && v !== (defaults as any)[k]).length;
  return (
    <>
      {mode === 'dashboard' && data && (
        <div className="kpis">
          {[
            [
              'Công việc hiện có',
              Object.values(data.facets).reduce((n: number, v: any) => n + Number(v), 0),
              'ALL',
            ],
            ['Chưa thực hiện', data.facets.WAITING || 0, 'OPEN'],
            ['Đang thực hiện', data.facets.IN_PROGRESS || 0, 'OPEN'],
            ['Đã hoàn thành', data.facets.DONE || 0, 'DONE'],
          ].map(([label, count, group]) => (
            <div className="kpi" key={String(label)}>
              <small>{label}</small>
              <div className="value">{count as number}</div>
              <button className="text-link" onClick={() => chip(String(group))}>
                Xem công việc →
              </button>
            </div>
          ))}
        </div>
      )}
      {mode === 'dashboard' && (
        <Loaded data={overview.data} error={overview.error}>
          {overview.data && (
            <div className="handoff-cards">
              <div className="panel">
                <h2>Tiến độ {team ? 'đội ngũ' : 'cá nhân'}</h2>
                {overview.data.staff_progress.map((u: any) => (
                  <article key={u.id}>
                    <strong>{u.name}</strong>
                    <p>
                      {u.waiting} chưa thực hiện · {u.doing} đang thực hiện · {u.awaiting_review}{' '}
                      chờ duyệt cũ · {u.done} đã hoàn thành
                    </p>
                    <small>Hạn gần nhất: {fmt(u.nearest_due)}</small>
                  </article>
                ))}
              </div>
              <div className="panel">
                <h2>Báo cáo cuối tuần</h2>
                <p>Tuần bắt đầu {overview.data.report_period}</p>
                {overview.data.report_submission.map((u: any) => (
                  <article key={u.id}>
                    <strong>{u.name}</strong>
                    <p>
                      {u.revision_id ? (
                        <button onClick={() => onReport?.(u.revision_id)}>
                          Đã nộp · v{u.revision}
                        </button>
                      ) : (
                        'Chưa nộp'
                      )}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </Loaded>
      )}
      <div className="panel">
        <div className="toolbar">
          <input
            aria-label="Tìm công việc"
            placeholder="Tìm tên, mã, nhân viên…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={() => setRefresh((n) => n + 1)}>Tải lại</button>
          <button onClick={() => setBoard((v) => !v)}>{board ? 'Dạng bảng' : 'Dạng thẻ'}</button>
          <button
            onClick={() => {
              setFilter(defaults);
              setSearch('');
            }}
          >
            Xóa bộ lọc ({active})
          </button>
        </div>
        <div className="tabs">
          {[
            ['Đang mở', 'OPEN', 'NONE'],
            ['Quá hạn', 'OPEN', 'OVERDUE'],
            ['Hôm nay', 'OPEN', 'TODAY'],
            ['7 ngày tới', 'OPEN', 'NEXT_7_DAYS'],
            ['Hoàn thành', 'DONE', 'NONE'],
            ['Đã hủy', 'CANCELLED', 'NONE'],
            ['Tất cả', 'ALL', 'NONE'],
          ].map(([label, group, preset]) => (
            <button
              key={label}
              className={
                filter.status_group === group && filter.deadline_preset === preset ? 'active' : ''
              }
              onClick={() => chip(group, preset)}
            >
              {label}
            </button>
          ))}
        </div>
        <details>
          <summary>Bộ lọc nâng cao · múi giờ Việt Nam</summary>
          <div className="form-grid">
            {team && (
              <>
                <label>
                  Nhân viên
                  <select
                    multiple
                    value={filter.owner_ids ? filter.owner_ids.split(',') : []}
                    onChange={(e) =>
                      set(
                        'owner_ids',
                        Array.from(e.target.selectedOptions, (o) => o.value).join(','),
                      )
                    }
                  >
                    {(directory.data?.items || []).map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Bộ phận (mã)
                  <input
                    value={filter.team_ids}
                    onChange={(e) => set('team_ids', e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Chuyên môn
              <select value={filter.job_codes} onChange={(e) => set('job_codes', e.target.value)}>
                <option value="">Tất cả</option>
                {jobs.map((j) => (
                  <option key={j} value={j}>
                    {roleLabel[j]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trạng thái cụ thể
              <select
                multiple
                value={filter.statuses ? filter.statuses.split(',') : []}
                onChange={(e) =>
                  setFilter((f) => ({
                    ...f,
                    statuses: Array.from(e.target.selectedOptions, (o) => o.value).join(','),
                    status_group: 'CUSTOM',
                  }))
                }
              >
                {[
                  'WAITING',
                  'IN_PROGRESS',
                  'DONE',
                  'CANCELLED',
                  'ASSIGNED',
                  'ACCEPTED',
                  'SUBMITTED',
                  'CHANGES_REQUESTED',
                  'DRAFT',
                  'DECLINED',
                ].map((s) => (
                  <option key={s} value={s}>
                    {labels[s] || statusLabel[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quy trình
              <select value={filter.flow_mode} onChange={(e) => set('flow_mode', e.target.value)}>
                <option value="ALL">Tất cả</option>
                <option value="CHECKLIST">Checklist</option>
                <option value="LEGACY_REVIEW">Công việc cũ</option>
              </select>
            </label>
            <label>
              Ưu tiên
              <select value={filter.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="">Tất cả</option>
                <option value="NORMAL">Bình thường</option>
                <option value="URGENT">Khẩn</option>
              </select>
            </label>
            <label>
              Sắp xếp
              <select value={filter.sort} onChange={(e) => set('sort', e.target.value)}>
                {[
                  ['ATTENTION', 'Cần chú ý'],
                  ['DUE_ASC', 'Hạn gần trước'],
                  ['UPDATED_DESC', 'Cập nhật mới nhất'],
                  ['CREATED_DESC', 'Tạo mới nhất'],
                  ['COMPLETED_DESC', 'Hoàn thành mới nhất (chỉ DONE)'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {[
              ['due_from', 'Hạn từ'],
              ['due_to', 'Hạn đến (gồm ngày)'],
              ['created_from', 'Tạo từ'],
              ['created_to', 'Tạo đến'],
              ['completed_from', 'Hoàn thành từ'],
              ['completed_to', 'Hoàn thành đến'],
            ].map(([k, l]) => (
              <label key={k}>
                {l}
                <input
                  type="date"
                  value={(filter as any)[k]}
                  onChange={(e) => set(k, e.target.value)}
                />
              </label>
            ))}
          </div>
        </details>
        {notice && (
          <p role="status">
            {notice} <button onClick={() => setRefresh((n) => n + 1)}>Tải lại từ đầu</button>
          </p>
        )}
        <ErrorBox error={error} />
        {error && <button onClick={() => setRefresh((n) => n + 1)}>Thử lại</button>}
        {loading && <p>Đang tải…</p>}
        {data && (
          <>
            <p>
              {data.filtered_total} công việc · Phân bố theo bộ lọc khác:{' '}
              {Object.entries(data.facets)
                .map(([s, n]) => `${labels[s] || statusLabel[s]} ${n}`)
                .join(' · ')}
            </p>
            {board ? (
              <div className="handoff-cards">
                {data.items.map((t: any) => (
                  <button className="panel" key={t.id} onClick={() => onTask(t.id)}>
                    <strong>
                      SN-{t.code} · {t.title}
                    </strong>
                    <p>
                      {t.owner_name} · {roleLabel[t.role]}
                    </p>
                    <p>
                      {labels[t.status] || statusLabel[t.status]} · {fmt(t.due_at)}
                    </p>
                    {t.flow_mode === 'LEGACY_REVIEW' && <small>Công việc cũ</small>}
                  </button>
                ))}
              </div>
            ) : (
              <TaskTable items={data.items} onOpen={onTask} />
            )}{' '}
            {data.next_cursor && (
              <button
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const r = await api(path + '&cursor=' + encodeURIComponent(data.next_cursor));
                    setData({ ...r, items: [...data.items, ...r.items] });
                  } catch (e) {
                    setError(e);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Xem thêm 30 công việc
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
export function ChecklistDetail({ t, me, onClose, onChanged }: any) {
  const [item, setItem] = useState(t),
    [tab, setTab] = useState('info'),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);
  const comments = useLoad('/tasks/' + item.id + '/comments', revision),
    directory = useLoad('/staff-directory');
  const changed = async () => {
    const updated = await api('/tasks/' + item.id);
    setItem(updated);
    window.dispatchEvent(new CustomEvent('sn-task-saved', { detail: updated }));
    setNotice('Đã lưu; tải lại danh sách để sắp xếp');
    setRevision((n) => n + 1);
    onChanged();
  };
  const act = async (action: string, v: any) => {
    await api('/tasks/' + item.id + '/' + action, { ...v, expected_version: item.version });
    await changed();
  };
  const closed = ['DONE', 'CANCELLED'].includes(item.status),
    owner = me.id === item.owner_id,
    admin = me.admin;
  return (
    <TaskDrawer
      title={'SN-' + item.code + ' · ' + item.title}
      onClose={onClose}
      meta={
        <p>
          {labels[item.status]} · {item.owner_name} · {fmt(item.due_at)}
        </p>
      }
    >
      {notice && <p role="status">{notice}</p>}
      <div className="tabs">
        {[
          ['info', 'Thông tin'],
          ['work', 'Tiến độ & kết quả'],
          ['chat', 'Trao đổi'],
          ['history', 'Lịch sử'],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div hidden={tab !== 'info'}>
        <p>{item.description || 'Chưa có mô tả.'}</p>
        {item.assets.map((f: any) => (
          <p key={f.id}>
            <a href={'/api/v1/assets/' + f.id + '/download'}>{f.filename}</a>
          </p>
        ))}
        {!closed && (owner || admin) && (
          <Form
            fields={[
              { key: 'title', label: 'Tên công việc', required: true },
              { key: 'description', label: 'Mô tả', type: 'textarea' },
            ]}
            initial={{ title: item.title, description: item.description }}
            onSubmit={async (v) => {
              await api('/tasks/' + item.id, { ...v, expected_version: item.version }, 'PATCH');
              await changed();
            }}
            label="Lưu thông tin"
          />
        )}
        {admin && !closed && (
          <>
            <h3>Điều chỉnh thời hạn</h3>
            <Form
              fields={[
                {
                  key: 'due_at',
                  label: 'Thời hạn mới (giờ Việt Nam)',
                  type: 'datetime-local',
                  required: true,
                },
                { key: 'reason', label: 'Lý do thay hạn', required: true },
              ]}
              onSubmit={(v) => act('deadline', { ...v, due_at: iso(v.due_at) })}
            />
            <h3>Đổi người phụ trách</h3>
            <Form
              fields={[
                {
                  key: 'owner_id',
                  label: 'Người phụ trách mới',
                  type: 'select',
                  options: opts(directory.data?.items || []),
                  required: true,
                },
                { key: 'reason', label: 'Lý do bàn giao', required: true },
              ]}
              onSubmit={(v) => act('transfer', v)}
            />
          </>
        )}
      </div>
      <div hidden={tab !== 'work'}>
        <p>{item.result_text || 'Chưa có kết quả.'}</p>
        {!closed && (owner || admin) && (
          <>
            <Form
              fields={[
                {
                  key: 'status',
                  label: 'Trạng thái công việc',
                  type: 'select',
                  options: [
                    { value: 'IN_PROGRESS', label: 'Đang thực hiện' },
                    { value: 'DONE', label: 'Đã hoàn thành' },
                  ],
                  required: true,
                },
                {
                  key: 'summary',
                  label: 'Đã thực hiện / kết quả',
                  type: 'textarea',
                  required: true,
                },
              ]}
              initial={{ status: 'IN_PROGRESS', summary: item.result_text }}
              onSubmit={(v) => act('state', v)}
              label="Lưu tiến độ / kết quả"
            />
            <h3>Hủy công việc</h3>
            <Form
              fields={[{ key: 'reason', label: 'Lý do hủy', required: true }]}
              onSubmit={(v) => act('cancel', v)}
              label="Xác nhận hủy"
            />
          </>
        )}
        {closed && admin && (
          <Form
            fields={[{ key: 'reason', label: 'Lý do mở lại', required: true }]}
            onSubmit={(v) => act('reopen', v)}
            label="Mở lại công việc"
          />
        )}
        {item.updates.map((u: any) => (
          <article key={u.id}>
            <strong>
              {u.name} · {fmt(u.created_at)}
            </strong>
            <p>{u.summary}</p>
          </article>
        ))}
      </div>
      <div hidden={tab !== 'chat'}>
        <Loaded data={comments.data} error={comments.error}>
          {(comments.data?.items || []).map((m: any) => (
            <article key={m.id}>
              <strong>
                {m.name} · {fmt(m.created_at)}
              </strong>
              <p>{m.body}</p>
            </article>
          ))}
        </Loaded>
        <Form
          fields={[{ key: 'body', label: 'Nội dung trao đổi', type: 'textarea', required: true }]}
          onSubmit={async (v) => {
            await api('/tasks/' + item.id + '/comments', v);
            setRevision((n) => n + 1);
          }}
          label="Gửi trao đổi"
        />
      </div>
      <div hidden={tab !== 'history'}>
        {item.events.map((e: any) => (
          <article key={e.id}>
            <strong>
              {e.action} · {e.name} · {fmt(e.created_at)}
            </strong>
            {e.data.reason && <p>{e.data.reason}</p>}
          </article>
        ))}
      </div>
    </TaskDrawer>
  );
}
