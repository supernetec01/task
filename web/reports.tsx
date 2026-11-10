import React, { useState } from 'react';
import { api, monday, fmt } from './api';
import { Form, Loaded, useLoad, Empty, Badge, options, roleLabel } from './ui';
import { Comparison } from './comparison';
import { TaskTable } from './tasks';
export function Summary({ s, onFilter }: { s: any; onFilter?: (v: string) => void }) {
  return (
    <div className="kpis">
      {[
        ['Phát sinh', s.total, ''],
        ['Hoàn thành', s.done, 'DONE'],
        ['Đúng hạn', s.on_time, 'DONE'],
        ['Chưa xong', s.open, 'IN_PROGRESS'],
      ].map(([label, value, status]) => (
        <div key={label} className="kpi">
          <small>{label}</small>
          <div className="value">{value}</div>
          {onFilter && (
            <button className="text-link" onClick={() => onFilter(String(status))}>
              Xem công việc →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export function Reports({
  me,
  onTask,
  initialRevision = '',
}: {
  me: any;
  onTask: (id: string) => void;
  initialRevision?: string;
}) {
  const [period, setPeriod] = useState(
      me.capabilities.team_work
        ? new Date(+new Date(monday() + 'T12:00:00Z') - 7 * 86400e3).toISOString().slice(0, 10)
        : monday(),
    ),
    [rev, setRev] = useState(0),
    [mode, setMode] = useState(initialRevision || me.capabilities.team_work ? 'submitted' : 'own'),
    [revision, setRevision] = useState(initialRevision);
  const list = useLoad('/reports/submitted?schema_version=2&period=' + period, rev),
    live = useLoad('/reports/live?schema_version=2&period=' + period, rev);
  const selected = useLoad(revision ? '/report-revisions/' + revision : null, rev);
  const snap = mode === 'own' ? live.data : selected.data?.snapshot;
  const [role, setRole] = useState(''),
    [error, setError] = useState<any>(),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState<number | null>(null),
    [unsaved, setUnsaved] = useState<Record<string, any>>({});
  const refresh = () => setRev((v) => v + 1);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api('/report-revisions/' + revision + '/exports', {
        role: role || undefined,
      });
      window.location.assign(d.url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const tasks = snap?.principal?.filter((t: any) => !role || t.role === role) || [];
  const drafts = snap?.narratives || [];
  const narrative = drafts.find((n: any) => n.role === (role || 'COMMON'));
  return (
    <>
      <div className="toolbar">
        <label>
          Tuần bắt đầu (thứ Hai)
          <input
            type="date"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setRevision('');
            }}
          />
        </label>
        <button
          className={mode === 'own' ? 'primary' : ''}
          onClick={() => {
            setMode('own');
            setRole('');
          }}
        >
          Báo cáo của tôi
        </button>
        <button
          className={mode === 'submitted' ? 'primary' : ''}
          onClick={() => {
            setMode('submitted');
            setRole('');
          }}
        >
          Báo cáo đã nộp
        </button>
      </div>
      {submitted && (
        <div className="success" role="status">
          Báo cáo đã nộp thành công · v{submitted}
        </div>
      )}
      {mode === 'submitted' && (
        <Loaded data={list.data} error={list.error}>
          <div className="panel">
            <h2>Chọn nhân viên và phiên bản</h2>
            {list.data?.items.map((u: any) => (
              <div className="support-row" key={u.id}>
                <strong>{u.name}</strong>{' '}
                {u.revisions.length ? (
                  <select
                    aria-label={'Phiên bản của ' + u.name}
                    value={u.revisions.some((r: any) => r.id === revision) ? revision : ''}
                    onChange={(e) => {
                      setRevision(e.target.value);
                      setRole('');
                    }}
                  >
                    <option value="">Chọn bản đã nộp…</option>
                    {u.revisions.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        v{r.revision} · {fmt(r.created_at)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge>Chưa nộp · Đang chờ nhân viên</Badge>
                )}
              </div>
            ))}
          </div>
        </Loaded>
      )}
      {mode === 'own' || revision ? (
        <Loaded data={snap} error={mode === 'own' ? live.error : selected.error}>
          {snap && (
            <>
              <div className="heading">
                <div>
                  <h2>
                    {snap.user_name} ·{' '}
                    {mode === 'own'
                      ? 'Bản tổng hợp trực tiếp'
                      : 'Bản đã nộp v' + selected.data?.revision}
                  </h2>
                  <small>
                    Tuần {period} · Cập nhật lúc {fmt(snap.cutoff)} · Asia/Ho_Chi_Minh
                  </small>
                </div>
                <div className="actions">
                  <select
                    aria-label="Lọc vai trò báo cáo"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="">Tất cả vai trò</option>
                    {snap.roles.map((r: string) => (
                      <option key={r} value={r}>
                        {roleLabel[r]}
                      </option>
                    ))}
                  </select>
                  {mode === 'submitted' && (
                    <button disabled={busy} onClick={download}>
                      Xuất Excel
                    </button>
                  )}
                </div>
              </div>
              <div className="notice">
                {mode === 'own'
                  ? 'Bản xem trước theo người phụ trách và trạng thái hiện tại tại thời điểm tải. Chọn tuần cũ không khôi phục trạng thái ở cuối tuần đó.'
                  : 'Bản đã nộp được giữ nguyên tại thời điểm nộp. Chuyển người phụ trách hoặc cập nhật công việc sau đó không sửa nội dung bản này.'}
              </div>
              {!snap.policy_confirmed && (
                <div className="notice">
                  Chính sách tuần đang là đề xuất T2–CN, task phát sinh theo ngày tạo. Quản trị cần
                  chốt Q05 trước khi nộp báo cáo thật.
                </div>
              )}
              {error && <div className="error">{error.message}</div>}
              <Summary
                s={
                  role
                    ? snap.sections.find((s: any) => s.role === role)?.summary || snap.summary
                    : snap.summary
                }
              />
              {snap.schema_version === 2 && (
                <>
                  <div className="panel">
                    <h3>Hoàn thành trong kỳ</h3>
                    <TaskTable
                      items={snap.task_sections.completed_in_period.filter(
                        (t: any) => !role || t.role === role,
                      )}
                      onOpen={onTask}
                    />
                  </div>
                  <div className="handoff-cards">
                    {snap.professional_sections
                      .filter((s: any) => !role || s.role === role)
                      .map((s: any, i: number) => (
                        <div className="panel" key={i}>
                          <h3>{roleLabel[s.role]}</h3>
                          {s.role === 'CONTENT' ? (
                            <>
                              <p>
                                Kịch bản: {s.scripts_completed} · Lượt quay: {s.shoots_completed} ·
                                Clip hoàn chỉnh: {s.clips_completed}
                              </p>
                              <p>Lượt đăng: {s.publications.length}</p>
                              <p>
                                GMV D7: {s.video_d7.gmv ?? 'N/A'} · {s.video_d7.missing_reason}
                              </p>
                              {s.video_d7.windows?.map((w: any) => (
                                <p key={w.publication_id}>
                                  Lượt đăng · D7: {w.status} · GMV {w.gmv ?? 'N/A'}
                                </p>
                              ))}
                            </>
                          ) : s.role === 'HR' ? (
                            <>
                              <p>
                                Nhận việc: {s.hires} · Phỏng vấn: {s.interviews} · Hợp đồng:{' '}
                                {s.contracts}
                              </p>
                            </>
                          ) : (
                            <>
                              <p>
                                {s.currency} · Doanh thu nguồn: {s.sales?.revenue ?? 'N/A'} · Độ phủ{' '}
                                {s.sales?.days ?? 0}/7 ngày
                              </p>
                              <p>
                                GMV KOC: {s.koc?.gmv ?? 'N/A'} ·{' '}
                                {s.koc?.availability === 'UNCONFIRMED_PERIOD'
                                  ? 'Chưa có kỳ nguồn khớp tuần'
                                  : ''}
                              </p>
                              <p>Hoa hồng ước tính: {s.koc?.estimated_commission ?? 'N/A'}</p>
                              <p>Hoa hồng quyết toán: N/A · chưa có nguồn</p>
                              {s.missing_reason && <p>{s.missing_reason}</p>}
                            </>
                          )}
                        </div>
                      ))}
                  </div>
                </>
              )}
              <div className="split">
                {snap.sections
                  .filter((s: any) => !role || s.role === role)
                  .map((s: any) => (
                    <div className="panel" key={s.role}>
                      <h3>{roleLabel[s.role]}</h3>
                      <p>
                        {s.summary.total} phát sinh · {s.summary.started} đã làm · {s.summary.done}{' '}
                        hoàn thành
                      </p>
                      <p>
                        {s.summary.on_time} đúng hạn · {s.summary.late} trễ hạn ·{' '}
                        {s.summary.cancelled} hủy · {s.summary.declined} từ chối
                      </p>
                      <div className="bar">
                        <i
                          style={{
                            width:
                              (s.summary.total ? (s.summary.done / s.summary.total) * 100 : 0) +
                              '%',
                          }}
                        />
                      </div>
                      <small>Hoàn thành được duyệt / phát sinh</small>
                      {s.metrics?.map((m: any) => (
                        <p key={m.id}>
                          {m.metric}: {m.value === null ? 'N/A · ' + m.missing_reason : m.value}{' '}
                          {m.currency} · {m.shop} · {m.grain}
                          <br />
                          <small>
                            {m.source} · v{m.revision}
                          </small>
                        </p>
                      ))}
                      {s.activity?.length > 0 && (
                        <p>{s.activity.length} hồ sơ chuyên môn phát sinh</p>
                      )}
                      {s.claims?.map((c: any) => (
                        <p key={c.id}>
                          Bồi hoàn đơn {c.order_id}: {c.amount} {c.currency} · {c.stage}
                        </p>
                      ))}
                    </div>
                  ))}
              </div>
              {mode === 'own' && <Comparison period={period} />}{' '}
              {snap.comparison && (
                <div className="panel">
                  <h3>So sánh task tuần trước · Cả kỳ</h3>
                  <p>
                    {snap.comparison.total.current} kỳ này / {snap.comparison.total.previous} kỳ
                    trước ·{' '}
                    {snap.comparison.total.delta_percent === null
                      ? snap.comparison.total.note
                      : snap.comparison.total.delta_percent.toFixed(1) + '%'}
                  </p>
                  <small>
                    {snap.comparison.note}
                    <br />
                    Kỳ này: {fmt(snap.comparison.current_range[0])} –{' '}
                    {fmt(snap.comparison.current_range[1])}
                    <br />
                    Kỳ trước: {fmt(snap.comparison.previous_range[0])} –{' '}
                    {fmt(snap.comparison.previous_range[1])}
                  </small>
                </div>
              )}
              {mode === 'own' ? (
                <div className="panel">
                  <h2>Bổ sung báo cáo · {roleLabel[role || 'COMMON']}</h2>
                  <Form
                    key={period + role + rev}
                    fields={[
                      {
                        key: 'results',
                        label: 'Kết quả khác chưa có trong task',
                        type: 'textarea',
                      },
                      {
                        key: 'difficulties',
                        label: 'Khó khăn / nguyên nhân chưa xong',
                        type: 'textarea',
                      },
                      { key: 'support', label: 'Đề nghị hỗ trợ', type: 'textarea' },
                      { key: 'next_week', label: 'Kế hoạch tuần tới', type: 'textarea' },
                    ]}
                    initial={
                      unsaved[role || 'COMMON'] ||
                      narrative?.narrative || {
                        results: '',
                        difficulties: '',
                        support: '',
                        next_week: '',
                      }
                    }
                    onChange={(v) => setUnsaved((s) => ({ ...s, [role || 'COMMON']: v }))}
                    onSubmit={async (v, key) => {
                      await api(
                        '/reports/draft',
                        {
                          period,
                          role: role || 'COMMON',
                          narrative: v,
                          expected_version: narrative?.version || 0,
                        },
                        'PUT',
                        key,
                      );
                      setUnsaved((s) => {
                        const n = { ...s };
                        delete n[role || 'COMMON'];
                        return n;
                      });
                      refresh();
                    }}
                    label="Lưu nháp riêng tư"
                  />
                  <div className="detail-section">
                    <Form
                      fields={[]}
                      onSubmit={async (v, key) => {
                        const versions = Object.fromEntries(
                          drafts.map((d: any) => [d.role, d.version]),
                        );
                        for (const [scope, narrative] of Object.entries(unsaved)) {
                          const saved = await api(
                            '/reports/draft',
                            {
                              period,
                              role: scope,
                              narrative,
                              expected_version: versions[scope] || 0,
                            },
                            'PUT',
                            key + '-' + scope,
                          );
                          versions[scope] = saved.version;
                        }
                        const report = await api(
                          '/reports/submit',
                          { schema_version: 2, period, expected_draft_versions: versions },
                          'POST',
                          key,
                        );
                        setUnsaved({});
                        setSubmitted(report.revision);
                        refresh();
                      }}
                      label="Nộp báo cáo tuần"
                    />
                    <small>
                      Nộp tất cả vai trò hiện có; người nhận được giải từ phạm vi quản lý đã cấu
                      hình. Nội dung vừa nhập sẽ được lưu nháp trước khi nộp.
                    </small>
                  </div>
                </div>
              ) : (
                <div className="panel">
                  <h2>Nội dung bổ sung đã nộp</h2>
                  {drafts
                    .filter((n: any) => !role || n.role === role)
                    .map((n: any) => (
                      <div key={n.role}>
                        <h3>{roleLabel[n.role]}</h3>
                        {Object.entries(n.narrative).map(([k, v]) => (
                          <p className="prewrap" key={k}>
                            {String(v)}
                          </p>
                        ))}
                      </div>
                    ))}
                </div>
              )}
              <div className="panel">
                <h2>Công việc chi tiết · Phụ trách chính</h2>
                <TaskTable items={tasks} onOpen={onTask} />
              </div>
              <div className="panel">
                <h2>Phần việc hỗ trợ · Tách khỏi task chính</h2>
                {snap.support.filter((s: any) => !role || s.role === role).length ? (
                  snap.support
                    .filter((s: any) => !role || s.role === role)
                    .map((s: any) => (
                      <div key={s.id} className="support-row">
                        <button className="text-link" onClick={() => onTask(s.task_id)}>
                          {s.title}
                        </button>{' '}
                        · <Badge>{s.status}</Badge>
                        <p className="prewrap">{s.summary}</p>
                      </div>
                    ))
                ) : (
                  <Empty />
                )}
              </div>
              <div className="panel">
                <h2>Việc chuyển tiếp · Không cộng vào phát sinh</h2>
                <TaskTable
                  items={snap.carryover.filter((s: any) => !role || s.role === role)}
                  onOpen={onTask}
                />
              </div>
            </>
          )}
        </Loaded>
      ) : (
        <Empty>Chọn báo cáo đã nộp để xem.</Empty>
      )}
    </>
  );
}
export function Plans({ me }: { me: any }) {
  const [period, setPeriod] = useState(monday()),
    [rev, setRev] = useState(0),
    { data, error } = useLoad('/plans?period=' + period, rev);
  return (
    <>
      <div className="toolbar">
        <label>
          Tuần bắt đầu
          <input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
      </div>
      <div className="split">
        <div className="panel">
          <h2>Kế hoạch tuần</h2>
          <Loaded data={data} error={error}>
            {data?.items.length ? (
              data.items.map((p: any) => (
                <div className="support-row" key={p.id}>
                  <Badge>{roleLabel[p.role]}</Badge>
                  <p>{p.title}</p>
                </div>
              ))
            ) : (
              <Empty />
            )}
          </Loaded>
        </div>
        <div className="panel">
          <h2>Thêm mục kế hoạch</h2>
          <Form
            fields={[
              { key: 'title', label: 'Nội dung kế hoạch', required: true, type: 'textarea' },
              {
                key: 'role',
                label: 'Vai trò',
                type: 'select',
                required: true,
                options: options(
                  me.grants.filter((g: any) => g.kind === 'JOB').map((g: any) => g.role),
                  roleLabel,
                ),
              },
              { key: 'task_id', label: 'Mã task liên quan (tùy chọn)' },
            ]}
            onSubmit={async (v, key) => {
              await api('/plans', { ...v, period, task_id: v.task_id || null }, 'POST', key);
              setRev((r) => r + 1);
            }}
            label="Lưu kế hoạch"
          />
        </div>
      </div>
    </>
  );
}
