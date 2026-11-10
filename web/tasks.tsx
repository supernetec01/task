import React, { useState, useRef, useEffect } from 'react';
import { api, fmt, iso, localInput } from './api';
import { requestKey } from './request-key';
import {
  Form,
  Modal,
  Loaded,
  useLoad,
  Empty,
  Badge,
  ErrorBox,
  options,
  statusLabel,
  roleLabel,
  type Field,
} from './ui';
import { TaskDrawer } from './task-drawer';
import { ChecklistDetail } from './checklist';
import { Upload, Transfer } from './task-attachments';
export { Upload } from './task-attachments';

export function taskDeadlineLabel(t: any, now = Date.now()) {
  if (t.status === 'SUBMITTED') {
    const submitted = t.submissions?.[0];
    if (submitted)
      return {
        label:
          new Date(submitted.submitted_at).getTime() <= new Date(t.due_at).getTime()
            ? 'Đã nộp đúng hạn · Chờ duyệt'
            : 'Đã nộp trễ hạn · Chờ duyệt',
        late: new Date(submitted.submitted_at) > new Date(t.due_at),
      };
    return { label: 'Đã nộp · Chờ duyệt', late: false };
  }
  if (
    !['DONE', 'CANCELLED', 'DECLINED', 'DRAFT'].includes(t.status) &&
    t.due_at &&
    new Date(t.due_at).getTime() < now
  )
    return { label: 'Quá hạn thực hiện', late: true };
  return { label: t.timing ? statusLabel[t.timing] : '', late: t.timing === 'LATE' };
}
export function TaskTable({ items, onOpen }: { items: any[]; onOpen: (id: string) => void }) {
  if (!items.length) return <Empty>Chưa có công việc phù hợp bộ lọc.</Empty>;
  return (
    <div className="tablewrap">
      <table className="task-table">
        <thead>
          <tr>
            <th>Nhiệm vụ</th>
            <th>Phụ trách / tham gia</th>
            <th>Thời hạn & kết quả</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => {
            const timing = taskDeadlineLabel(t);
            return (
              <tr key={t.id} className="clickable" onClick={() => onOpen(t.id)}>
                <td className="title">
                  <button
                    className="text-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(t.id);
                    }}
                  >
                    {t.title}
                  </button>
                  <div className="row-meta">
                    SN-{t.code} · {roleLabel[t.role]} ·{' '}
                    {t.template_name || t.template_snapshot?.name || 'Công việc'}
                  </div>
                </td>
                <td>
                  {t.owner_name}
                  <div className="row-meta">
                    {t.participation
                      ? 'Hỗ trợ · ' + statusLabel[t.participation.status]
                      : 'Phụ trách chính'}
                  </div>
                  {t.next_step && <small>{t.next_step}</small>}
                </td>
                <td>
                  {fmt(t.due_at)}
                  {timing.label && (
                    <div className={timing.late ? 'danger-text row-meta' : 'row-meta'}>
                      {timing.label}
                    </div>
                  )}
                </td>
                <td>
                  <Badge>
                    {t.flow_mode === 'CHECKLIST'
                      ? (
                          {
                            WAITING: 'Chưa thực hiện',
                            IN_PROGRESS: 'Đang thực hiện',
                            DONE: 'Đã hoàn thành',
                            CANCELLED: 'Đã hủy',
                          } as any
                        )[t.status]
                      : statusLabel[t.status]}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type DraftFile = { key: string; file: File; id?: string; error?: string; busy: boolean };
export function CreateTask({
  me,
  onDone,
  onClose,
}: {
  me: any;
  onDone: (id: string) => void;
  onClose: () => void;
}) {
  const directory = useLoad('/directory/invitees'),
    types = useLoad('/task-types');
  const jobs = [
    ...new Set(me.grants.filter((g: any) => g.kind === 'JOB').map((g: any) => g.role)),
  ] as string[];
  const [owner, setOwner] = useState(me.id),
    [role, setRole] = useState(jobs.length === 1 ? jobs[0] : ''),
    [type, setType] = useState('OTHER'),
    [priority, setPriority] = useState('NORMAL'),
    [occurred, setOccurred] = useState(''),
    [draft, setDraft] = useState(false),
    [shareFiles, setShareFiles] = useState(false),
    [supporters, setSupporters] = useState<Record<string, string>>({}),
    [files, setFiles] = useState<DraftFile[]>([]);
  const allPeople = directory.data?.items || [],
    owners = allPeople.filter((u: any) => u.assignment_eligible || u.id === me.id),
    selectedOwner = allPeople.find((u: any) => u.id === owner);
  const roles = selectedOwner?.roles || jobs,
    codes = role ? types.data?.catalog?.[role] || [] : ['OTHER'];
  const selectable = (types.data?.items || []).filter((t: any) => codes.includes(t.code));
  const changeOwner = (id: string) => {
    if (id === owner) return;
    setOwner(id);
    const next = allPeople.find((u: any) => u.id === id)?.roles || [];
    setRole(next.length === 1 ? next[0] : '');
    setType('OTHER');
    setSupporters((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
  };
  const stage = async (row: DraftFile) => {
    setFiles((f) => f.map((x) => (x.key === row.key ? { ...x, busy: true, error: undefined } : x)));
    try {
      const fd = new FormData();
      fd.set('file', row.file);
      const out = await api('/task-attachments', fd, 'POST', row.key);
      setFiles((f) => f.map((x) => (x.key === row.key ? { ...x, id: out.id, busy: false } : x)));
    } catch (error) {
      setFiles((f) =>
        f.map((x) =>
          x.key === row.key ? { ...x, error: (error as Error).message, busy: false } : x,
        ),
      );
    }
  };
  return (
    <Modal title={me.management ? 'Tạo nhiệm vụ' : 'Thêm việc phát sinh'} onClose={onClose}>
      <Loaded data={directory.data && types.data} error={directory.error || types.error}>
        <p className="muted quick-create-intro">
          Một việc rõ ràng, một người phụ trách và một thời hạn. Các thông tin bổ sung có thể hoàn
          thiện trong lúc làm.
        </p>
        <Form
          fields={[
            { key: 'title', label: 'Tên nhiệm vụ', required: true },
            ...(me.management
              ? [
                  {
                    key: 'owner_id',
                    label: 'Người phụ trách chính',
                    type: 'select',
                    required: true,
                    options: owners.map((u: any) => ({ value: u.id, label: u.name })),
                  },
                ]
              : []),
            {
              key: 'due_at',
              label: 'Thời hạn (giờ Việt Nam)',
              type: 'datetime-local',
              required: !draft,
            },
            { key: 'description', label: 'Mô tả (không bắt buộc)', type: 'textarea' },
          ]}
          initial={{ owner_id: me.id, description: '' }}
          onChange={(v) => changeOwner(v.owner_id || me.id)}
          label={draft ? 'Lưu nháp' : owner === me.id ? 'Lưu công việc' : 'Giao nhiệm vụ'}
          onSubmit={async (v, key) => {
            if (!role) throw Error('Chọn chuyên môn cho người có nhiều vai trò.');
            if (files.some((f) => f.busy || !f.id))
              throw Error(
                'Có tệp chưa tải xong. Vui lòng tải lại tệp lỗi hoặc bỏ tệp trước khi lưu.',
              );
            const out = await api(
              '/tasks',
              {
                ...v,
                owner_id: owner,
                role,
                type,
                priority,
                due_at: iso(v.due_at),
                occurred_at: iso(occurred),
                draft,
                attachment_ids: files.map((f) => f.id),
                share_attachments: shareFiles,
                supporters: Object.entries(supporters).map(([user_id, role]) => ({
                  user_id,
                  role,
                })),
              },
              'POST',
              key,
            );
            onDone(out.id);
          }}
        >
          {roles.length > 1 && (
            <label>
              Chuyên môn của công việc
              <select
                aria-label="Chuyên môn của công việc"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setType('OTHER');
                }}
                required
              >
                <option value="">Chọn chuyên môn…</option>
                {roles.map((r: string) => (
                  <option value={r} key={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="create-attachments">
            <label>
              Tài liệu đính kèm (không bắt buộc)
              <input
                type="file"
                multiple
                aria-label="Tài liệu khi tạo công việc"
                onChange={(e) => {
                  const added = Array.from(e.target.files || []).map((file) => ({
                    key: requestKey(),
                    file,
                    busy: true,
                  }));
                  setFiles((f) => [...f, ...added]);
                  for (const row of added) stage(row);
                  e.target.value = '';
                }}
              />
            </label>
            {files.map((row) => (
              <div className="draft-file" key={row.key}>
                <span>
                  {row.file.name}
                  <small>{row.busy ? ' · Đang tải…' : row.id ? ' · Sẵn sàng' : ''}</small>
                  {row.error && <span className="danger-text">{row.error}</span>}
                </span>
                <div className="actions">
                  {row.error && (
                    <button type="button" onClick={() => stage(row)}>
                      Tải lại
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost"
                    disabled={row.busy}
                    onClick={() => setFiles((f) => f.filter((x) => x.key !== row.key))}
                  >
                    Bỏ tệp
                  </button>
                </div>
              </div>
            ))}
            {files.length > 0 && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={shareFiles}
                  onChange={(e) => setShareFiles(e.target.checked)}
                />
                Cho người hỗ trợ được mời xem các tài liệu này
              </label>
            )}
          </div>
          <details className="create-details">
            <summary>
              Chọn mẫu công việc <small>Không bắt buộc</small>
            </summary>
            <label>
              Mẫu áp dụng
              <select
                aria-label="Mẫu công việc"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {selectable.map((t: any) => (
                  <option key={t.code} value={t.code}>
                    {t.name} · v{t.version}
                  </option>
                ))}
              </select>
            </label>
            {type !== 'OTHER' && (
              <p className="muted">
                Các trường của mẫu được bổ sung ở bước thực hiện và nộp kết quả.
              </p>
            )}
          </details>
          <details className="create-details">
            <summary>
              Người hỗ trợ{' '}
              <small>
                {Object.keys(supporters).length
                  ? `${Object.keys(supporters).length} người`
                  : 'Tùy chọn'}
              </small>
            </summary>
            {allPeople
              .filter((u: any) => u.id !== owner && u.invitation_eligible && u.roles.length)
              .map((u: any) => (
                <div className="support-choice" key={u.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!supporters[u.id]}
                      onChange={(e) =>
                        setSupporters((s) => {
                          const next = { ...s };
                          if (e.target.checked) next[u.id] = u.roles[0];
                          else delete next[u.id];
                          return next;
                        })
                      }
                    />
                    {u.name}
                  </label>
                  {supporters[u.id] && u.roles.length > 1 && (
                    <select
                      aria-label={'Vai trò hỗ trợ của ' + u.name}
                      value={supporters[u.id]}
                      onChange={(e) => setSupporters((s) => ({ ...s, [u.id]: e.target.value }))}
                    >
                      {u.roles.map((r: string) => (
                        <option key={r} value={r}>
                          {roleLabel[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
          </details>
          <details className="create-details">
            <summary>Tùy chọn nâng cao</summary>
            <label>
              Ưu tiên
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="NORMAL">Bình thường</option>
                <option value="URGENT">Khẩn cấp</option>
              </select>
            </label>
            <label>
              Ngày thực tế phát sinh (nếu ghi bổ sung)
              <input
                type="datetime-local"
                value={occurred}
                onChange={(e) => setOccurred(e.target.value)}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
              Lưu nháp, chưa giao
            </label>
          </details>
        </Form>
      </Loaded>
    </Modal>
  );
}

const nestedLabels: Record<string, string> = {
  order: 'Thứ tự',
  visual: 'Hình ảnh',
  dialogue: 'Lời thoại',
  duration_seconds: 'Thời lượng (giây)',
  name: 'Tên',
  url: 'Đường dẫn',
  observed_at: 'Ngày quan sát',
  price: 'Giá',
  strengths: 'Ưu điểm',
  weaknesses: 'Hạn chế',
  label: 'Nội dung',
  quantity: 'Số lượng',
  unit: 'Đơn vị',
  readiness: 'Mức độ sẵn sàng',
};
function specializedFields(template: any, people: any[] = []): Field[] {
  return template.fields.map((f: any) => ({
    key: 'payload_' + f.key,
    label: f.label,
    section: f.section,
    hint: f.required_at_action ? 'Bắt buộc khi nộp kết quả; có thể lưu dở.' : undefined,
    options:
      f.type === 'user_array' ? people.map((u) => ({ value: u.id, label: u.name })) : undefined,
    type:
      f.type === 'user_array'
        ? 'multi-select'
        : ['array', 'metric_array'].includes(f.type)
          ? 'array'
          : f.type === 'boolean'
            ? 'checkbox'
            : f.type === 'datetime'
              ? 'datetime-local'
              : f.type === 'decimal'
                ? 'number'
                : ['reference_array', 'link_array'].includes(f.type)
                  ? 'textarea'
                  : f.type === 'string'
                    ? 'textarea'
                    : f.type === 'reference'
                      ? 'text'
                      : f.type,
    fields: f.items
      ? Object.entries(f.items).map(([key, type]: any) => ({
          key,
          label: nestedLabels[key] || key,
          type:
            type === 'integer' || type.includes('decimal')
              ? 'number'
              : type === 'url'
                ? 'url'
                : type === 'date'
                  ? 'date'
                  : 'text',
        }))
      : [{ key: 'value', label: 'Nội dung' }],
  }));
}
function workInitial(t: any) {
  const value: any = {
    state: 'IN_PROGRESS',
    summary: t.updates?.[0]?.summary || '',
    next_step: t.next_step || '',
    blocker: t.blocker || '',
    links: '',
    artifact_refs: [],
  };
  for (const f of t.template_snapshot.fields) {
    const v = t.payload[f.key];
    value['payload_' + f.key] = ['reference_array', 'link_array'].includes(f.type)
      ? (v || []).join('\n')
      : f.type === 'datetime' && v
        ? localInput(v)
        : v;
  }
  if (t.template_snapshot.workflow?.length)
    value.payload_workflow_step = t.payload.workflow_step || t.template_snapshot.workflow[0].key;
  return value;
}
function specializedPayload(t: any, v: any) {
  const values = { ...t.payload };
  for (const f of t.template_snapshot.fields) {
    const value = v['payload_' + f.key];
    if (value === undefined) continue;
    values[f.key] = ['reference_array', 'link_array'].includes(f.type)
      ? String(value || '')
          .split('\n')
          .filter(Boolean)
      : f.type === 'datetime' && value
        ? iso(value)
        : value;
  }
  if (t.template_snapshot.workflow?.length)
    values.workflow_step =
      v.payload_workflow_step || t.payload.workflow_step || t.template_snapshot.workflow[0].key;
  return values;
}

export function TaskDetail({
  id,
  me,
  onClose,
  onChanged,
}: {
  id: string;
  me: any;
  onClose: () => void;
  onChanged: () => void;
}) {
  const formPeople = useLoad('/directory/invitees');
  const [revision, setRevision] = useState(0),
    { data: t, error } = useLoad('/tasks/' + id, revision),
    [tab, setTab] = useState('info'),
    [menu, setMenu] = useState(false),
    [dialog, setDialog] = useState(''),
    [notice, setNotice] = useState(''),
    [actionError, setActionError] = useState<any>(),
    [busy, setBusy] = useState(false),
    [workingDraft, setWorkingDraft] = useState<any>(),
    [commentDraft, setCommentDraft] = useState(''),
    [artifactIds, setArtifactIds] = useState<string[]>([]),
    [commentAfter, setCommentAfter] = useState('0');
  const refresh = () => {
    setRevision((r) => r + 1);
    onChanged();
  };
  const act = async (path: string, body: any) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await api(path, body);
      refresh();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  };
  const owner = t?.capabilities?.owner,
    review = t?.capabilities?.review,
    closed = ['DONE', 'CANCELLED', 'DECLINED'].includes(t?.status),
    pending = t?.pending_brief;
  const comments = useLoad(
      t?.capabilities?.comment ? '/tasks/' + id + '/comments?after=' + commentAfter : null,
      revision,
    ),
    canWork = t?.capabilities?.update;
  const support = t?.supporters?.find((s: any) => s.user_id === me.id && s.status === 'ACCEPTED');
  const title = t ? 'SN-' + t.code + ' · ' + t.title : 'Đang tải công việc…';
  const timeline: Record<string, string> = {
    CREATED: 'Tạo công việc',
    BRIEF_UPDATED: 'Điều chỉnh yêu cầu',
    PAYLOAD_UPDATED: 'Cập nhật thông tin chuyên môn',
    DISPATCHED: 'Giao công việc',
    ASSIGNMENT_ACCEPT: 'Nhận công việc',
    ASSIGNMENT_DECLINE: 'Từ chối công việc',
    ASSIGNMENT_TIMEOUT: 'Hết hạn phản hồi',
    STARTED: 'Bắt đầu thực hiện',
    PROGRESS: 'Cập nhật tiến độ',
    SUBMITTED: 'Nộp kết quả',
    REVIEW: 'Người duyệt phản hồi',
    DEADLINE_REQUEST: 'Đề nghị đổi hạn',
    DEADLINE_DECIDED: 'Xử lý đề nghị đổi hạn',
    CANCELLED: 'Hủy công việc',
    TRANSFERRED: 'Giao lại người phụ trách',
    REOPENED: 'Mở lại công việc',
    SUPPORT_RESPONSE: 'Phản hồi lời mời hỗ trợ',
    CONTRIBUTION: 'Cập nhật phần hỗ trợ',
    COMMENT_POSTED: 'Gửi trao đổi',
  };
  if (t?.flow_mode === 'CHECKLIST')
    return <ChecklistDetail t={t} me={me} onClose={onClose} onChanged={onChanged} />;
  return (
    <>
      <TaskDrawer
        title={title}
        onClose={onClose}
        dirty={!!workingDraft || !!commentDraft}
        meta={
          t && (
            <div className="drawer-meta">
              <Badge>
                {t.flow_mode === 'CHECKLIST'
                  ? (
                      {
                        WAITING: 'Chưa thực hiện',
                        IN_PROGRESS: 'Đang thực hiện',
                        DONE: 'Đã hoàn thành',
                        CANCELLED: 'Đã hủy',
                      } as any
                    )[t.status]
                  : statusLabel[t.status]}
              </Badge>
              <span>{t.owner_name}</span>
              <span>{fmt(t.due_at)}</span>
              <span>
                {t.template_name} · v{t.template_version}
              </span>
            </div>
          )
        }
        footer={
          <small>
            {pending
              ? 'Phản hồi lời mời trước khi tham gia công việc.'
              : closed
                ? 'Lịch sử được giữ nguyên.'
                : 'Dữ liệu chỉ được xác nhận sau khi lưu thành công.'}
          </small>
        }
      >
        <Loaded data={t} error={error}>
          {t && (
            <>
              <div className="drawer-actions">
                <div className="actions">
                  {owner && t.status === 'ASSIGNED' && (
                    <>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          act('/tasks/' + id + '/assignment-response', {
                            decision: 'ACCEPT',
                            expected_version: t.version,
                          })
                        }
                      >
                        Nhận việc
                      </button>
                      <button disabled={busy} onClick={() => setDialog('decline')}>
                        Từ chối
                      </button>
                    </>
                  )}
                  {owner && t.status === 'DRAFT' && (
                    <button className="primary" onClick={() => setDialog('dispatch')}>
                      Giao bản nháp
                    </button>
                  )}
                </div>
                {!pending && (t.capabilities.cancel || t.capabilities.manager || owner) && (
                  <div className="task-overflow">
                    <button
                      type="button"
                      aria-label="Thao tác khác"
                      aria-expanded={menu}
                      onClick={() => setMenu(!menu)}
                    >
                      ⋯
                    </button>
                    {menu && (
                      <div role="menu" className="task-menu">
                        {owner && !closed && (
                          <button
                            role="menuitem"
                            onClick={() => {
                              setDialog('deadline');
                              setMenu(false);
                            }}
                          >
                            Đề nghị đổi thời hạn
                          </button>
                        )}
                        {t.capabilities.manager && !closed && t.status !== 'SUBMITTED' && (
                          <button
                            role="menuitem"
                            onClick={() => {
                              setDialog('transfer');
                              setMenu(false);
                            }}
                          >
                            Giao lại công việc
                          </button>
                        )}
                        {t.capabilities.cancel && (
                          <button
                            role="menuitem"
                            className="danger"
                            onClick={() => {
                              setDialog('cancel');
                              setMenu(false);
                            }}
                          >
                            Hủy công việc
                          </button>
                        )}
                        {review && t.status === 'DONE' && me.policies.reopen_enabled && (
                          <button
                            role="menuitem"
                            onClick={() => {
                              setDialog('reopen');
                              setMenu(false);
                            }}
                          >
                            Mở lại công việc
                          </button>
                        )}
                        <button
                          role="menuitem"
                          onClick={() => {
                            setDialog('history');
                            setMenu(false);
                          }}
                        >
                          Lịch sử hệ thống
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {notice && (
                <div className="success" role="status">
                  {notice}
                </div>
              )}
              <ErrorBox error={actionError} />
              {pending ? (
                <section className="drawer-section">
                  <h3>Lời mời hỗ trợ</h3>
                  <p className="prewrap">
                    {t.description || 'Người phụ trách chưa bổ sung mô tả.'}
                  </p>
                  <Form
                    fields={[
                      { key: 'note', label: 'Ghi chú', type: 'textarea' },
                      {
                        key: 'decision',
                        label: 'Phản hồi',
                        type: 'select',
                        required: true,
                        options: [
                          { value: 'ACCEPT', label: 'Chấp nhận hỗ trợ' },
                          { value: 'DECLINE', label: 'Từ chối' },
                        ],
                      },
                    ]}
                    initial={{ note: '' }}
                    onSubmit={async (v, key) => {
                      await api(
                        '/support-invitations/' + t.participation.id + '/response',
                        { ...v, expected_version: t.participation.version },
                        'POST',
                        key,
                      );
                      onClose();
                      onChanged();
                    }}
                    label="Gửi phản hồi"
                  />
                  {t.assets.length > 0 && <Files t={t} />}
                </section>
              ) : (
                <>
                  <div className="drawer-tabs" role="tablist" aria-label="Nội dung công việc">
                    {[
                      ['info', 'Thông tin'],
                      ['result', 'Cập nhật & kết quả'],
                      ['comments', 'Trao đổi'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        aria-controls={'task-panel-' + key}
                        id={'task-tab-' + key}
                        className={tab === key ? 'active' : ''}
                        onClick={() => setTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <section
                    role="tabpanel"
                    id="task-panel-info"
                    aria-labelledby="task-tab-info"
                    hidden={tab !== 'info'}
                  >
                    <div className="drawer-section">
                      <h3>Yêu cầu công việc</h3>
                      <p className="prewrap">{t.description || 'Không có mô tả bổ sung.'}</p>
                      <dl className="task-facts">
                        <div>
                          <dt>Người giao</dt>
                          <dd>{t.giver_name}</dd>
                        </div>
                        <div>
                          <dt>Người duyệt</dt>
                          <dd>{t.reviewer_name || 'Chưa cấu hình'}</dd>
                        </div>
                        <div>
                          <dt>Chuyên môn</dt>
                          <dd>{roleLabel[t.role]}</dd>
                        </div>
                        <div>
                          <dt>Hạn ban đầu</dt>
                          <dd>{fmt(t.original_due_at)}</dd>
                        </div>
                      </dl>
                      {owner && !closed && t.status !== 'SUBMITTED' && (
                        <button className="text-link" onClick={() => setDialog('brief')}>
                          Chỉnh sửa mô tả
                        </button>
                      )}
                    </div>
                    {(t.assets.length > 0 ||
                      (!closed && (owner || t.capabilities.manager || support))) && (
                      <div className="drawer-section">
                        <Files t={t} />
                        {!closed && (owner || t.capabilities.manager || support) && (
                          <details>
                            <summary>Thêm tài liệu</summary>
                            <Upload
                              taskId={id}
                              shared={!owner && !t.capabilities.manager}
                              onDone={refresh}
                            />
                          </details>
                        )}
                      </div>
                    )}
                    {t.supporters.length > 0 && (
                      <div className="drawer-section">
                        <h3>
                          Người hỗ trợ <span className="count">{t.supporters.length}</span>
                        </h3>
                        {t.supporters.map((s: any) => (
                          <div className="support-roster-row" key={s.id}>
                            <div>
                              <strong>{s.name}</strong>
                              <small>
                                {roleLabel[s.role]} ·{' '}
                                {s.responded_at ? fmt(s.responded_at) : 'Chưa phản hồi'}
                              </small>
                              {s.note && <p className="prewrap">{s.note}</p>}
                              {s.summary && <p className="prewrap">{s.summary}</p>}
                            </div>
                            <Badge>{statusLabel[s.status]}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {t.deadlines.length > 0 && (
                      <div className="drawer-section">
                        <h3>Đề nghị thay đổi hạn</h3>
                        {t.deadlines.map((d: any) => (
                          <div className="support-row" key={d.id}>
                            <strong>{fmt(d.new_due_at)}</strong>
                            <p className="prewrap">{d.reason}</p>
                            <Badge>
                              {(
                                {
                                  PENDING: 'Chờ quyết định',
                                  APPROVE: 'Đã chấp thuận',
                                  REJECT: 'Đã từ chối',
                                } as Record<string, string>
                              )[d.state] || 'Đã xử lý'}
                            </Badge>
                            {review && d.state === 'PENDING' && (
                              <div className="actions">
                                {['APPROVE', 'REJECT'].map((decision) => (
                                  <button
                                    key={decision}
                                    disabled={busy}
                                    onClick={() =>
                                      act('/deadline-requests/' + d.id + '/decision', {
                                        decision,
                                        expected_version: d.version,
                                        expected_task_version: t.version,
                                      })
                                    }
                                  >
                                    {decision === 'APPROVE' ? 'Chấp thuận hạn' : 'Từ chối đổi hạn'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section
                    role="tabpanel"
                    id="task-panel-result"
                    aria-labelledby="task-tab-result"
                    hidden={tab !== 'result'}
                  >
                    {canWork && (
                      <div className="drawer-section">
                        <h3>{t.template_name}</h3>
                        {t.template_snapshot.workflow?.length && (
                          <ol className="workflow-steps">
                            {t.template_snapshot.workflow.map((step: any) => (
                              <li
                                key={step.key}
                                className={
                                  (workingDraft?.payload_workflow_step ||
                                    t.payload.workflow_step ||
                                    t.template_snapshot.workflow[0].key) === step.key
                                    ? 'active'
                                    : ''
                                }
                              >
                                {step.label}
                              </li>
                            ))}
                          </ol>
                        )}
                        {t.template_snapshot.output_policy === 'FILE_REQUIRED' && (
                          <p className="notice">
                            Kết quả cần file tài liệu phân tích. Tải file rồi chọn trong phần Tệp
                            dùng làm kết quả.
                          </p>
                        )}
                        <Form
                          key={'work-' + revision}
                          initial={workingDraft || workInitial(t)}
                          extraFields={
                            t.type === 'OTHER'
                              ? []
                              : [
                                  ...(t.template_snapshot.workflow?.length
                                    ? [
                                        {
                                          key: 'payload_workflow_step',
                                          label: 'Bước sản xuất hiện tại',
                                          type: 'select',
                                          options: t.template_snapshot.workflow.map(
                                            (step: any) => ({ value: step.key, label: step.label }),
                                          ),
                                          hint: 'Chuyển lần lượt từng bước; bổ sung đủ thông tin bước trước khi chuyển.',
                                        },
                                      ]
                                    : []),
                                  ...specializedFields(
                                    t.template_snapshot,
                                    formPeople.data?.items || [],
                                  ),
                                ]
                          }
                          specializedInline
                          extraTitle={'Biểu mẫu · ' + t.template_name}
                          onChange={(v) => setWorkingDraft(v)}
                          fields={[
                            {
                              key: 'state',
                              label: 'Tình trạng cập nhật',
                              type: 'select',
                              required: true,
                              options: [
                                { value: 'IN_PROGRESS', label: 'Đang làm' },
                                { value: 'SUBMITTED', label: 'Đã xong · Gửi người duyệt' },
                              ],
                            },
                            {
                              key: 'summary',
                              label: 'Nội dung cập nhật / kết quả',
                              type: 'textarea',
                            },
                            { key: 'next_step', label: 'Bước tiếp theo', type: 'textarea' },
                            { key: 'blocker', label: 'Khó khăn / cần hỗ trợ', type: 'textarea' },
                            {
                              key: 'links',
                              label: 'Đường dẫn kết quả (mỗi dòng một link)',
                              type: 'textarea',
                            },
                          ]}
                          onSubmit={async (v, key) => {
                            const out = await api(
                              '/tasks/' + id + '/update-result',
                              {
                                state: v.state,
                                summary: v.summary || '',
                                next_step: v.next_step || '',
                                blocker: v.blocker || '',
                                links: String(v.links || '')
                                  .split('\n')
                                  .filter(Boolean),
                                artifact_refs: artifactIds,
                                payload: specializedPayload(t, v),
                                expected_version: t.version,
                              },
                              'POST',
                              key,
                            );
                            setWorkingDraft(undefined);
                            setArtifactIds([]);
                            setNotice(
                              out.status === 'SUBMITTED'
                                ? 'Đã nộp kết quả, đang chờ người duyệt.'
                                : 'Đã lưu cập nhật công việc.',
                            );
                            refresh();
                          }}
                          label="Lưu cập nhật"
                        >
                          {t.assets.length > 0 && (
                            <fieldset>
                              <legend>Tệp dùng làm kết quả</legend>
                              {t.assets.map((f: any) => (
                                <label className="check" key={f.id}>
                                  <input
                                    type="checkbox"
                                    checked={artifactIds.includes(f.id)}
                                    onChange={(e) => {
                                      setWorkingDraft((d: any) => d || workInitial(t));
                                      setArtifactIds((ids) =>
                                        e.target.checked
                                          ? [...ids, f.id]
                                          : ids.filter((id) => id !== f.id),
                                      );
                                    }}
                                  />
                                  {f.filename}
                                </label>
                              ))}
                            </fieldset>
                          )}
                          <small>
                            “Đã xong” sẽ gửi kết quả để duyệt. Chỉ khi người duyệt chấp thuận, công
                            việc mới hoàn thành.
                          </small>
                        </Form>
                      </div>
                    )}
                    {owner && t.status === 'ASSIGNED' && (
                      <div className="notice">Nhận việc để bắt đầu cập nhật và nộp kết quả.</div>
                    )}
                    {support && !closed && (
                      <div className="drawer-section">
                        <h3>Phần hỗ trợ của tôi</h3>
                        <Form
                          key={'support-' + support.version}
                          fields={[
                            { key: 'summary', label: 'Phần hỗ trợ của tôi', type: 'textarea' },
                            {
                              key: 'next_step',
                              label: 'Bước tiếp theo của phần hỗ trợ',
                              type: 'textarea',
                            },
                            { key: 'blocker', label: 'Khó khăn khi hỗ trợ', type: 'textarea' },
                            {
                              key: 'reported_done',
                              label: 'Đã hoàn thành phần hỗ trợ',
                              type: 'checkbox',
                            },
                          ]}
                          initial={{
                            ...support,
                            reported_done: support.contribution_state === 'REPORTED_DONE',
                          }}
                          onSubmit={async (v, key) => {
                            await api(
                              '/support-invitations/' + support.id + '/contribution',
                              {
                                summary: v.summary,
                                next_step: v.next_step,
                                blocker: v.blocker,
                                reported_done: v.reported_done,
                                expected_version: support.version,
                              },
                              'PATCH',
                              key,
                            );
                            setNotice(
                              'Đã lưu phần hỗ trợ. Trạng thái công việc chính được giữ nguyên.',
                            );
                            refresh();
                          }}
                        />
                      </div>
                    )}
                    {t.checkpoints.length > 0 && (
                      <div className="drawer-section">
                        <h3>
                          Các mốc thực hiện{' '}
                          <span className="count">
                            {t.checkpoints.filter((c: any) => c.state === 'DONE').length}/
                            {t.checkpoints.length}
                          </span>
                        </h3>
                        {t.checkpoints.map((cp: any) => (
                          <label className="check checkpoint" key={cp.id}>
                            <input
                              type="checkbox"
                              checked={cp.state === 'DONE'}
                              disabled={!canWork || busy}
                              onChange={(e) =>
                                act('/checkpoints/' + cp.id, {
                                  state: e.target.checked ? 'DONE' : 'OPEN',
                                  evidence: cp.evidence,
                                  expected_version: cp.version,
                                })
                              }
                            />
                            {cp.title}
                            {cp.required && <small>Bắt buộc</small>}
                          </label>
                        ))}
                      </div>
                    )}
                    {t.submissions.length > 0 && (
                      <div className="drawer-section">
                        <h3>Kết quả đã nộp</h3>
                        <div className="submission-timing">
                          <Badge>{taskDeadlineLabel(t).label || statusLabel[t.status]}</Badge>
                          <small>Lần nộp mới nhất: {fmt(t.submissions[0].submitted_at)}</small>
                        </div>
                        <p className="prewrap">{t.submissions[0].result_text}</p>
                        {t.submissions[0].links.map((url: string) => (
                          <p key={url}>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {url}
                            </a>
                          </p>
                        ))}
                        {t.submissions[0].feedback && (
                          <div className="notice prewrap">{t.submissions[0].feedback}</div>
                        )}
                        {review && t.status === 'SUBMITTED' && (
                          <Form
                            fields={[
                              {
                                key: 'decision',
                                label: 'Quyết định',
                                type: 'select',
                                required: true,
                                options: [
                                  { value: 'APPROVE', label: 'Duyệt hoàn thành' },
                                  { value: 'CHANGES_REQUESTED', label: 'Yêu cầu chỉnh sửa' },
                                ],
                              },
                              {
                                key: 'feedback',
                                label: 'Nhận xét / nội dung cần sửa',
                                type: 'textarea',
                              },
                            ]}
                            initial={{ feedback: '' }}
                            onSubmit={async (v, key) => {
                              await api(
                                '/submissions/' + t.submissions[0].id + '/review',
                                { ...v, expected_task_version: t.version },
                                'POST',
                                key,
                              );
                              setNotice(
                                v.decision === 'APPROVE'
                                  ? 'Đã duyệt hoàn thành công việc.'
                                  : 'Đã gửi yêu cầu chỉnh sửa.',
                              );
                              refresh();
                            }}
                            label="Xác nhận quyết định"
                          />
                        )}
                        {t.submissions.length > 1 && (
                          <details>
                            <summary>Các lần nộp trước ({t.submissions.length - 1})</summary>
                            {t.submissions.slice(1).map((s: any) => (
                              <article className="submission-revision" key={s.id}>
                                <strong>
                                  Phiên bản {s.revision} · {fmt(s.submitted_at)}
                                </strong>
                                <p className="prewrap">{s.result_text}</p>
                                {s.feedback && <p className="prewrap">Nhận xét: {s.feedback}</p>}
                              </article>
                            ))}
                          </details>
                        )}
                      </div>
                    )}
                    {t.updates.length > 0 && (
                      <details className="drawer-section">
                        <summary>Các lần cập nhật ({t.updates.length})</summary>
                        {t.updates.map((u: any) => (
                          <article className="submission-revision" key={u.id}>
                            <strong>{u.name || 'Người thực hiện'}</strong>
                            <small>{fmt(u.created_at)}</small>
                            <p className="prewrap">{u.summary}</p>
                            {u.next_step && (
                              <p className="prewrap">Bước tiếp theo: {u.next_step}</p>
                            )}
                            {u.blocker && <p className="prewrap">Khó khăn: {u.blocker}</p>}
                          </article>
                        ))}
                      </details>
                    )}
                    {!canWork && !support && !t.submissions.length && !t.updates.length && (
                      <Empty>Chưa có cập nhật hoặc kết quả được nộp.</Empty>
                    )}
                  </section>
                  <section
                    role="tabpanel"
                    id="task-panel-comments"
                    aria-labelledby="task-tab-comments"
                    hidden={tab !== 'comments'}
                  >
                    <div className="drawer-section">
                      <h3>Trao đổi trong công việc</h3>
                      <p className="muted">
                        Nội dung được chia sẻ với những người đang có quyền tham gia công việc.
                      </p>
                      <Loaded data={comments.data} error={comments.error}>
                        {comments.data?.items.length ? (
                          comments.data.items.map((m: any) => (
                            <article
                              className={'comment ' + (m.author_id === me.id ? 'mine' : '')}
                              key={m.id}
                            >
                              <div>
                                <strong>{m.author_name}</strong>
                                <small>{fmt(m.created_at)}</small>
                              </div>
                              <p className="prewrap">{m.body}</p>
                            </article>
                          ))
                        ) : (
                          <Empty>Chưa có trao đổi. Bạn có thể gửi tin nhắn đầu tiên.</Empty>
                        )}
                      </Loaded>
                      <div className="pager">
                        {commentAfter !== '0' && (
                          <button onClick={() => setCommentAfter('0')}>Trao đổi đầu tiên</button>
                        )}
                        {comments.data?.next_cursor && (
                          <button onClick={() => setCommentAfter(comments.data.next_cursor)}>
                            Trao đổi tiếp theo
                          </button>
                        )}
                      </div>
                      {t.capabilities.comment && (
                        <Form
                          key={'comment-' + revision}
                          initial={{ body: commentDraft }}
                          fields={[
                            {
                              key: 'body',
                              label: 'Nội dung trao đổi',
                              type: 'textarea',
                              required: true,
                            },
                          ]}
                          onChange={(v) => setCommentDraft(v.body || '')}
                          onSubmit={async (v, key) => {
                            await api('/tasks/' + id + '/comments', v, 'POST', key);
                            setCommentDraft('');
                            refresh();
                          }}
                          label="Gửi trao đổi"
                        />
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </Loaded>
      </TaskDrawer>
      {dialog && t && (
        <Modal
          title={
            (
              {
                cancel: 'Hủy công việc',
                deadline: 'Đề nghị đổi thời hạn',
                transfer: 'Giao lại công việc',
                history: 'Lịch sử hệ thống',
                brief: 'Chỉnh sửa mô tả',
                dispatch: 'Giao bản nháp',
                decline: 'Từ chối công việc',
                reopen: 'Mở lại công việc',
              } as Record<string, string>
            )[dialog]
          }
          onClose={() => setDialog('')}
        >
          {dialog === 'cancel' && (
            <>
              <div className="notice">
                Công việc sẽ chuyển sang “Đã hủy”. Nội dung và lịch sử được giữ lại.
              </div>
              <Form
                fields={[{ key: 'reason', label: 'Lý do hủy', type: 'textarea', required: true }]}
                onSubmit={async (v, key) => {
                  await api(
                    '/tasks/' + id + '/cancel',
                    { reason: v.reason, expected_version: t.version },
                    'POST',
                    key,
                  );
                  setDialog('');
                  setNotice('Đã hủy công việc.');
                  refresh();
                }}
                label="Xác nhận hủy"
                secondary={
                  <button type="button" onClick={() => setDialog('')}>
                    Quay lại
                  </button>
                }
              />
            </>
          )}
          {dialog === 'decline' && (
            <Form
              fields={[{ key: 'note', label: 'Ghi chú từ chối', type: 'textarea' }]}
              initial={{ note: '' }}
              onSubmit={async (v, key) => {
                await api(
                  '/tasks/' + id + '/assignment-response',
                  { ...v, decision: 'DECLINE', expected_version: t.version },
                  'POST',
                  key,
                );
                setDialog('');
                refresh();
              }}
              label="Xác nhận từ chối"
            />
          )}
          {dialog === 'deadline' && (
            <Form
              fields={[
                {
                  key: 'new_due_at',
                  label: 'Thời hạn đề nghị',
                  type: 'datetime-local',
                  required: true,
                },
                { key: 'reason', label: 'Lý do', type: 'textarea', required: true },
              ]}
              onSubmit={async (v, key) => {
                await api(
                  '/tasks/' + id + '/deadline-requests',
                  { ...v, new_due_at: iso(v.new_due_at), expected_version: t.version },
                  'POST',
                  key,
                );
                setDialog('');
                setNotice('Đã gửi đề nghị đổi thời hạn.');
                refresh();
              }}
              label="Gửi đề nghị"
            />
          )}
          {dialog === 'dispatch' && (
            <Form
              fields={[
                {
                  key: 'due_at',
                  label: 'Thời hạn giao bản nháp',
                  type: 'datetime-local',
                  required: true,
                },
              ]}
              initial={{ due_at: localInput(t.due_at) }}
              onSubmit={async (v, key) => {
                await api(
                  '/tasks/' + id + '/dispatch',
                  { due_at: iso(v.due_at), expected_version: t.version },
                  'POST',
                  key,
                );
                setDialog('');
                refresh();
              }}
              label="Giao bản nháp"
            />
          )}
          {dialog === 'brief' && (
            <Form
              fields={[
                { key: 'title', label: 'Tên nhiệm vụ', required: true },
                { key: 'description', label: 'Mô tả', type: 'textarea' },
              ]}
              initial={t}
              onSubmit={async (v, key) => {
                await api(
                  '/tasks/' + id,
                  { title: v.title, description: v.description, expected_version: t.version },
                  'PATCH',
                  key,
                );
                setDialog('');
                refresh();
              }}
            />
          )}
          {dialog === 'transfer' && (
            <Transfer
              t={t}
              onDone={() => {
                setDialog('');
                refresh();
              }}
            />
          )}
          {dialog === 'reopen' && (
            <Form
              fields={[{ key: 'reason', label: 'Lý do mở lại', required: true, type: 'textarea' }]}
              onSubmit={async (v, key) => {
                await api(
                  '/tasks/' + id + '/reopen',
                  { ...v, expected_version: t.version },
                  'POST',
                  key,
                );
                setDialog('');
                refresh();
              }}
              label="Mở lại"
            />
          )}
          {dialog === 'history' && (
            <div className="event-timeline">
              {t.events.map((e: any) => (
                <article key={e.id}>
                  <strong>{timeline[e.action] || 'Cập nhật công việc'}</strong>
                  <small>
                    {e.name || 'Hệ thống'} · {fmt(e.created_at)}
                  </small>
                  {['summary', 'reason', 'feedback', 'note']
                    .filter((key) => typeof e.data[key] === 'string' && e.data[key])
                    .map((key) => (
                      <p className="prewrap" key={key}>
                        {e.data[key]}
                      </p>
                    ))}
                </article>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function Files({ t }: { t: any }) {
  return (
    <>
      <h3>
        Tài liệu đính kèm {t.assets.length > 0 && <span className="count">{t.assets.length}</span>}
      </h3>
      {t.assets.map((f: any) => (
        <div className="attachment-link" key={f.id}>
          <a href={'/api/v1/assets/' + f.id + '/download'}>{f.filename}</a>
          <small>
            {(Number(f.size) / 1024).toFixed(1)} KB ·{' '}
            {f.shared ? 'Đã chia sẻ cho người hỗ trợ' : 'Chủ việc và quản lý'}
          </small>
        </div>
      ))}
    </>
  );
}
