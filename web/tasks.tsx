import React, { useState } from 'react';
import { api, fmt, iso, localInput } from './api';
import {
  Form,
  Modal,
  Loaded,
  useLoad,
  Empty,
  Badge,
  options,
  statusLabel,
  roleLabel,
  type Field,
} from './ui';
export function TaskTable({ items, onOpen }: { items: any[]; onOpen: (id: string) => void }) {
  if (!items.length) return <Empty>Chưa có công việc phù hợp bộ lọc.</Empty>;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Nhiệm vụ</th>
            <th>Phụ trách / tham gia</th>
            <th>Thời hạn</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
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
                  SN-{t.code} · {roleLabel[t.role]} · {t.type}
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
                {new Date(t.due_at) < new Date() &&
                  !['DONE', 'CANCELLED', 'DECLINED'].includes(t.status) && (
                    <div className="danger-text">Quá hạn</div>
                  )}
              </td>
              <td>
                <Badge>{statusLabel[t.status]}</Badge>
                {t.timing && <div className="row-meta">{statusLabel[t.timing]}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function CreateTask({
  me,
  onDone,
  onClose,
}: {
  me: any;
  onDone: (id: string) => void;
  onClose: () => void;
}) {
  const { data, error } = useLoad('/directory/invitees'),
    types = useLoad('/task-types');
  const jobs = me.grants.filter((g: any) => g.kind === 'JOB').map((g: any) => g.role);
  const [owner, setOwner] = useState(me.id),
    [role, setRole] = useState(jobs[0] || ''),
    [supporters, setSupporters] = useState<Record<string, string>>({}),
    [draft, setDraft] = useState(false);
  const people = data?.items || [],
    ownerRoles = people.find((p: any) => p.id === owner)?.roles || jobs;
  return (
    <Modal title="Tạo nhiệm vụ" onClose={onClose}>
      <Loaded data={data && types.data} error={error || types.error}>
        <Form
          initial={{ owner_id: me.id, role: jobs[0], type: 'OTHER', priority: 'NORMAL' }}
          onChange={(v) => {
            setOwner(v.owner_id || me.id);
            setRole(v.role || jobs[0]);
          }}
          fields={[
            { key: 'title', label: 'Tên nhiệm vụ', required: true },
            ...(me.management
              ? [
                  {
                    key: 'owner_id',
                    label: 'Người phụ trách chính',
                    type: 'select',
                    required: true,
                    options: people.map((p: any) => ({ value: p.id, label: p.name })),
                  },
                ]
              : []),
            {
              key: 'due_at',
              label: 'Thời hạn (giờ Việt Nam)',
              type: 'datetime-local',
              required: !draft,
            },
            { key: 'description', label: 'Mô tả / kết quả mong muốn', type: 'textarea' },
            {
              key: 'role',
              label: 'Vai trò chính',
              type: 'select',
              required: true,
              options: options(ownerRoles, roleLabel),
            },
            {
              key: 'type',
              label: 'Loại nhiệm vụ',
              type: 'select',
              options: options(
                types.data?.catalog?.[role] || ['OTHER'],
                Object.fromEntries((types.data?.items || []).map((t: any) => [t.code, t.name])),
              ),
            },
            {
              key: 'priority',
              label: 'Ưu tiên',
              type: 'select',
              options: [
                { value: 'NORMAL', label: 'Bình thường' },
                { value: 'URGENT', label: 'Khẩn cấp' },
              ],
            },
            {
              key: 'occurred_at',
              label: 'Ngày thực tế phát sinh (nếu ghi bổ sung)',
              type: 'datetime-local',
            },
          ]}
          onSubmit={async (v, key) => {
            const t = await api(
              '/tasks',
              {
                ...v,
                owner_id: owner,
                due_at: iso(v.due_at),
                occurred_at: iso(v.occurred_at),
                draft,
                supporters: Object.entries(supporters).map(([user_id, role]) => ({
                  user_id,
                  role,
                })),
              },
              'POST',
              key,
            );
            onDone(t.id);
          }}
          label={draft ? 'Lưu nháp' : owner === me.id ? 'Lưu công việc' : 'Giao nhiệm vụ'}
        >
          <details>
            <summary>Người hỗ trợ · Tùy chọn</summary>
            {people
              .filter((p: any) => p.id !== owner)
              .map((p: any) => (
                <div key={p.id} className="support-row">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!supporters[p.id]}
                      onChange={(e) =>
                        setSupporters((s) => {
                          const n = { ...s };
                          if (e.target.checked) n[p.id] = p.roles[0];
                          else delete n[p.id];
                          return n;
                        })
                      }
                    />
                    {p.name}
                  </label>
                  {supporters[p.id] && (
                    <select
                      value={supporters[p.id]}
                      onChange={(e) => setSupporters((s) => ({ ...s, [p.id]: e.target.value }))}
                    >
                      {p.roles.map((r: string) => (
                        <option key={r} value={r}>
                          {roleLabel[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
          </details>
          <label className="check">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            Lưu nháp, chưa giao
          </label>
        </Form>
      </Loaded>
    </Modal>
  );
}
function templateFields(template: any): Field[] {
  return (template?.fields || []).map((f: any) => ({
    key: f.key,
    label: f.label,
    type: ['array', 'metric_array'].includes(f.type)
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
          label: key,
          type:
            type === 'integer' || type.includes('decimal')
              ? 'number'
              : type === 'url'
                ? 'url'
                : 'text',
        }))
      : [{ key: 'value', label: 'Nội dung' }],
  }));
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
  const [rev, setRev] = useState(0),
    { data: t, error } = useLoad('/tasks/' + id, rev),
    types = useLoad('/task-types'),
    [tab, setTab] = useState('Yêu cầu'),
    [actionError, setActionError] = useState<any>(),
    [busy, setBusy] = useState(false);
  const refresh = () => {
    setRev((r) => r + 1);
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
    template = types.data?.items.find((v: any) => v.code === t?.type);
  const payloadInitial = { ...t?.payload };
  for (const f of template?.fields || []) {
    if (['link_array', 'reference_array'].includes(f.type))
      payloadInitial[f.key] = (t?.payload?.[f.key] || []).join('\n');
    if (f.type === 'datetime' && payloadInitial[f.key])
      payloadInitial[f.key] = localInput(payloadInitial[f.key]);
  }
  return (
    <Modal title={t ? 'SN-' + t.code + ' · ' + t.title : 'Công việc'} onClose={onClose}>
      <Loaded data={t} error={error}>
        {t && (
          <>
            <div className="detail-meta">
              <Badge>{statusLabel[t.status]}</Badge>
              <span>{t.owner_name}</span>
              <span>{roleLabel[t.role]}</span>
              <span>Hạn: {fmt(t.due_at)}</span>
            </div>
            <div className="actions">
              {owner && t.status === 'ASSIGNED' && (
                <>
                  <button
                    disabled={busy}
                    className="primary"
                    onClick={() =>
                      act('/tasks/' + id + '/assignment-response', {
                        decision: 'ACCEPT',
                        expected_version: t.version,
                      })
                    }
                  >
                    Nhận việc
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      const note = prompt('Lý do từ chối (tùy chọn)');
                      if (note !== null)
                        act('/tasks/' + id + '/assignment-response', {
                          decision: 'DECLINE',
                          note,
                          expected_version: t.version,
                        });
                    }}
                  >
                    Từ chối
                  </button>
                </>
              )}
              {owner && ['ACCEPTED', 'CHANGES_REQUESTED'].includes(t.status) && (
                <button
                  disabled={busy}
                  onClick={() => act('/tasks/' + id + '/start', { expected_version: t.version })}
                >
                  Bắt đầu thực hiện
                </button>
              )}
              {(owner || t.capabilities.manager) && t.status === 'DRAFT' && (
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
                    refresh();
                  }}
                  label="Giao bản nháp"
                />
              )}
            </div>
            {actionError && (
              <div className="error" role="alert">
                {actionError.message}
              </div>
            )}
            {t.pending_brief ? (
              <>
                <p className="prewrap">{t.description || 'Không có mô tả bổ sung.'}</p>
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
              </>
            ) : (
              <>
                <div className="tabs">
                  {['Yêu cầu', 'Thực hiện', 'Nộp kết quả', 'Trao đổi & lịch sử'].map((x) => (
                    <button key={x} className={x === tab ? 'active' : ''} onClick={() => setTab(x)}>
                      {x}
                    </button>
                  ))}
                </div>
                {tab === 'Yêu cầu' && (
                  <>
                    <p className="prewrap">{t.description || 'Không có mô tả bổ sung.'}</p>
                    <small>
                      Người giao: {t.giver_name} · Người duyệt: {t.reviewer_name || 'Chưa cấu hình'}
                      <br />
                      Hạn gốc: {fmt(t.original_due_at)} · Nguồn: {t.source}
                    </small>
                    {owner && !closed && t.status !== 'SUBMITTED' && (
                      <details>
                        <summary>Chỉnh sửa yêu cầu</summary>
                        <Form
                          key={t.version}
                          fields={[
                            { key: 'title', label: 'Tên nhiệm vụ', required: true },
                            { key: 'description', label: 'Mô tả', type: 'textarea' },
                          ]}
                          initial={t}
                          onSubmit={async (v, key) => {
                            await api(
                              '/tasks/' + id,
                              {
                                title: v.title,
                                description: v.description,
                                expected_version: t.version,
                              },
                              'PATCH',
                              key,
                            );
                            refresh();
                          }}
                        />
                      </details>
                    )}
                  </>
                )}
                {tab === 'Thực hiện' && (
                  <>
                    {owner && !closed && t.status !== 'SUBMITTED' ? (
                      <>
                        <Form
                          key={'progress' + t.version}
                          fields={[
                            {
                              key: 'summary',
                              label: 'Tiến độ / việc đã thực hiện',
                              type: 'textarea',
                            },
                            { key: 'next_step', label: 'Bước tiếp theo', type: 'textarea' },
                            { key: 'blocker', label: 'Khó khăn / cần hỗ trợ', type: 'textarea' },
                          ]}
                          initial={{ summary: '', next_step: t.next_step, blocker: t.blocker }}
                          onSubmit={async (v, key) => {
                            await api(
                              '/tasks/' + id + '/updates',
                              { ...v, expected_version: t.version },
                              'POST',
                              key,
                            );
                            refresh();
                          }}
                          label="Cập nhật tiến độ"
                        />
                        {template && (
                          <details>
                            <summary>Thông tin chuyên môn · {template.name}</summary>
                            <Form
                              key={'payload' + t.version}
                              fields={templateFields(template)}
                              initial={payloadInitial}
                              onSubmit={async (v, key) => {
                                const values = { ...v };
                                for (const f of template.fields) {
                                  if (['link_array', 'reference_array'].includes(f.type))
                                    values[f.key] = String(v[f.key] || '')
                                      .split('\n')
                                      .filter(Boolean);
                                  if (f.type === 'datetime' && v[f.key])
                                    values[f.key] = iso(v[f.key]);
                                }
                                await api(
                                  '/tasks/' + id + '/payload',
                                  { values, expected_version: t.version },
                                  'PATCH',
                                  key,
                                );
                                refresh();
                              }}
                            />
                          </details>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="prewrap">{t.next_step || 'Chưa có bước tiếp theo.'}</p>
                        <p className="prewrap">{t.blocker}</p>
                      </>
                    )}
                    <div className="detail-section">
                      <h3>
                        Checkpoint · {t.checkpoints?.filter((c: any) => c.state === 'DONE').length}/
                        {t.checkpoints?.length}
                      </h3>
                      {t.checkpoints?.map((cp: any) => (
                        <label className="check" key={cp.id}>
                          <input
                            type="checkbox"
                            checked={cp.state === 'DONE'}
                            disabled={!owner || closed || t.status === 'SUBMITTED' || busy}
                            onChange={(e) =>
                              act('/checkpoints/' + cp.id, {
                                state: e.target.checked ? 'DONE' : 'OPEN',
                                evidence: cp.evidence,
                                expected_version: cp.version,
                              })
                            }
                          />
                          {cp.title}
                          {cp.required ? ' · Bắt buộc' : ''}
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {tab === 'Nộp kết quả' && (
                  <>
                    {owner && !closed && t.status !== 'SUBMITTED' && (
                      <Form
                        key={'submit' + t.version}
                        fields={[
                          { key: 'result_text', label: 'Kết quả công việc', type: 'textarea' },
                          {
                            key: 'links',
                            label: 'Link đầu ra (mỗi dòng một link)',
                            type: 'textarea',
                          },
                        ]}
                        initial={{ result_text: '', links: '' }}
                        onSubmit={async (v, key) => {
                          await api(
                            '/tasks/' + id + '/submissions',
                            {
                              ...v,
                              links: v.links.split('\n').filter(Boolean),
                              payload: t.payload,
                              artifact_refs: t.assets.map((f: any) => f.id),
                              expected_version: t.version,
                            },
                            'POST',
                            key,
                          );
                          refresh();
                        }}
                        label="Nộp cho người duyệt"
                      />
                    )}
                    {t.submissions?.map((s: any) => (
                      <div key={s.id} className="detail-section">
                        <h3>
                          Phiên bản {s.revision} · {fmt(s.submitted_at)}
                        </h3>
                        <p className="prewrap">{s.result_text}</p>
                        {s.links.map((link: string) => (
                          <p key={link}>
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              {link}
                            </a>
                          </p>
                        ))}
                        {s.feedback && <div className="notice">{s.feedback}</div>}
                        {review && t.status === 'SUBMITTED' && s.id === t.submissions[0].id && (
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
                                '/submissions/' + s.id + '/review',
                                { ...v, expected_task_version: t.version },
                                'POST',
                                key,
                              );
                              refresh();
                            }}
                            label="Xác nhận quyết định"
                          />
                        )}
                      </div>
                    ))}
                  </>
                )}
                {tab === 'Trao đổi & lịch sử' &&
                  t.events?.map((e: any) => (
                    <div className="history-row" key={e.id}>
                      <strong>{e.name || 'Hệ thống'}</strong> · {e.action}
                      <div className="row-meta">{fmt(e.created_at)}</div>
                      {Object.entries(e.data)
                        .filter(([k, v]) => typeof v === 'string' && !k.endsWith('_id'))
                        .map(([k, v]) => (
                          <p className="prewrap" key={k}>
                            {String(v)}
                          </p>
                        ))}
                    </div>
                  ))}
                <div className="detail-section">
                  <h3>Người hỗ trợ</h3>
                  {t.supporters?.length ? (
                    t.supporters.map((s: any) => (
                      <div className="support-row" key={s.id}>
                        <strong>{s.name}</strong> · {roleLabel[s.role]}{' '}
                        <Badge>{statusLabel[s.status]}</Badge>
                        <div className="row-meta">
                          {fmt(s.responded_at)} · {statusLabel[s.contribution_state]}
                        </div>
                        <p className="prewrap">{s.note || s.summary}</p>
                        {s.user_id === me.id && s.status === 'ACCEPTED' && !closed && (
                          <Form
                            key={s.version}
                            fields={[
                              { key: 'summary', label: 'Phần hỗ trợ của tôi', type: 'textarea' },
                              { key: 'next_step', label: 'Bước tiếp theo', type: 'textarea' },
                              { key: 'blocker', label: 'Khó khăn', type: 'textarea' },
                              {
                                key: 'reported_done',
                                label: 'Đã hoàn thành phần hỗ trợ',
                                type: 'checkbox',
                              },
                            ]}
                            initial={{
                              ...s,
                              reported_done: s.contribution_state === 'REPORTED_DONE',
                            }}
                            onSubmit={async (v, key) => {
                              await api(
                                '/support-invitations/' + s.id + '/contribution',
                                {
                                  summary: v.summary,
                                  next_step: v.next_step,
                                  blocker: v.blocker,
                                  reported_done: v.reported_done,
                                  expected_version: s.version,
                                },
                                'PATCH',
                                key,
                              );
                              refresh();
                            }}
                          />
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="muted">Không có người hỗ trợ.</p>
                  )}
                </div>
                {owner && !closed && (
                  <details>
                    <summary>Đề nghị thay đổi thời hạn</summary>
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
                        refresh();
                      }}
                      label="Gửi đề nghị"
                    />
                  </details>
                )}
                {t.deadlines?.map((d: any) => (
                  <div key={d.id} className="support-row">
                    Đề nghị hạn {fmt(d.new_due_at)} · {d.reason} · {d.state}
                    {review && d.state === 'PENDING' && (
                      <div className="actions">
                        {['APPROVE', 'REJECT'].map((decision) => (
                          <button
                            disabled={busy}
                            key={decision}
                            onClick={() =>
                              act('/deadline-requests/' + d.id + '/decision', {
                                decision,
                                expected_version: d.version,
                                expected_task_version: t.version,
                              })
                            }
                          >
                            {decision === 'APPROVE' ? 'Duyệt hạn' : 'Từ chối đổi hạn'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {t.capabilities.manager && !closed && (
                  <details>
                    <summary>Giao lại công việc</summary>
                    <Transfer t={t} onDone={refresh} />
                  </details>
                )}
                {(owner && t.created_by === me.id && !closed) ||
                (t.capabilities.manager && !closed) ? (
                  <details>
                    <summary>Hủy công việc</summary>
                    <Form
                      fields={[
                        { key: 'reason', label: 'Lý do hủy', required: true, type: 'textarea' },
                      ]}
                      onSubmit={async (v, key) => {
                        await api(
                          '/tasks/' + id + '/cancel',
                          { ...v, expected_version: t.version },
                          'POST',
                          key,
                        );
                        refresh();
                      }}
                      label="Xác nhận hủy"
                    />
                  </details>
                ) : null}
                {review && t.status === 'DONE' && me.policies.reopen_enabled && (
                  <Form
                    fields={[{ key: 'reason', label: 'Lý do mở lại', required: true }]}
                    onSubmit={async (v, key) => {
                      await api(
                        '/tasks/' + id + '/reopen',
                        { ...v, expected_version: t.version },
                        'POST',
                        key,
                      );
                      refresh();
                    }}
                    label="Mở lại"
                  />
                )}
              </>
            )}
            <div className="detail-section">
              <h3>Tài liệu đính kèm</h3>
              {t.assets?.map((f: any) => (
                <p key={f.id}>
                  <a href={'/api/v1/assets/' + f.id + '/download'}>{f.filename}</a>{' '}
                  <small>
                    {(Number(f.size) / 1024).toFixed(1)} KB ·{' '}
                    {f.shared ? 'Được chia sẻ' : 'Riêng chủ việc/quản lý'}
                  </small>
                </p>
              ))}
              {!t.pending_brief &&
                !closed &&
                (owner || t.capabilities.manager || t.participation?.status === 'ACCEPTED') && (
                  <Upload taskId={id} shared={!owner && !t.capabilities.manager} onDone={refresh} />
                )}
            </div>
          </>
        )}
      </Loaded>
    </Modal>
  );
}
function Transfer({ t, onDone }: { t: any; onDone: () => void }) {
  const { data } = useLoad('/directory/invitees');
  return (
    <Form
      fields={[
        {
          key: 'owner_id',
          label: 'Người phụ trách mới',
          type: 'select',
          required: true,
          options: (data?.items || []).map((u: any) => ({ value: u.id, label: u.name })),
        },
        {
          key: 'role',
          label: 'Role chính',
          type: 'select',
          required: true,
          options: options(
            Object.keys(roleLabel).filter(
              (r) =>
                !['ADMIN', 'MANAGER', 'BOSS', 'EMPLOYEE', 'COMMON', 'HR_SENSITIVE'].includes(r),
            ),
            roleLabel,
          ),
        },
        { key: 'reason', label: 'Lý do', type: 'textarea', required: true },
      ]}
      onSubmit={async (v, key) => {
        await api(
          '/tasks/' + t.id + '/transfer',
          { ...v, expected_version: t.version },
          'POST',
          key,
        );
        onDone();
      }}
      label="Giao lại"
    />
  );
}
export function Upload({
  taskId,
  recordId,
  shared = false,
  onDone,
}: {
  taskId?: string;
  recordId?: string;
  shared?: boolean;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [share, setShare] = useState(shared),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || busy) return;
        setBusy(true);
        setError(null);
        try {
          const fd = new FormData();
          if (taskId) fd.set('task_id', taskId);
          if (recordId) fd.set('record_id', recordId);
          fd.set('shared', String(share));
          fd.set('file', file);
          await api('/assets', fd);
          setFile(null);
          onDone();
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Chọn tệp
        <input type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      {taskId && !shared && (
        <label className="check">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          Chia sẻ tệp cho người hỗ trợ được mời
        </label>
      )}
      <small>
        Loại và dung lượng cho phép do máy chủ kiểm tra. Không tải hồ sơ nhạy cảm vào phần chia sẻ
        task.
      </small>
      {error && <div className="error">{error.message}</div>}
      <div className="form-footer">
        <button disabled={busy || !file}>{busy ? 'Đang tải…' : 'Tải tệp lên'}</button>
      </div>
    </form>
  );
}
