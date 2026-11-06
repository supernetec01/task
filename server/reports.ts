import { z } from 'zod';
import ExcelJS from 'exceljs';
import { type API } from './app.js';
import {
  type DB,
  type Actor,
  rows,
  one,
  need,
  hasJob,
  isAdmin,
  manages,
  management,
  version,
  audit,
  notify,
  setting,
  localDate,
} from './base.js';
export function periodRange(period: string) {
  need(z.iso.date().safeParse(period).success, 'Ngày tuần không hợp lệ', 422, 'VALIDATION');
  const d = new Date(period + 'T00:00:00+07:00');
  need(
    new Date(d.getTime() + 7 * 3600e3).getUTCDay() === 1,
    'Chọn ngày thứ Hai bắt đầu tuần',
    422,
    'VALIDATION',
  );
  return { start: d, end: new Date(d.getTime() + 7 * 86400e3) };
}
export function counts(tasks: any[]) {
  const done = tasks.filter((t) => t.status === 'DONE');
  return {
    total: tasks.filter((t) => t.status !== 'DRAFT').length,
    draft: tasks.filter((t) => t.status === 'DRAFT').length,
    started: tasks.filter((t) => t.started_at).length,
    done: done.length,
    on_time: done.filter((t) => t.timing === 'ON_TIME').length,
    late: done.filter((t) => t.timing === 'LATE').length,
    unknown_timing: done.filter((t) => !t.timing).length,
    open: tasks.filter((t) =>
      ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'CHANGES_REQUESTED'].includes(t.status),
    ).length,
    cancelled: tasks.filter((t) => t.status === 'CANCELLED').length,
    declined: tasks.filter((t) => t.status === 'DECLINED').length,
  };
}
export function comparison(current: number, previous: number | null) {
  return {
    current,
    previous,
    delta: previous === null ? null : current - previous,
    delta_percent:
      previous === null || previous === 0 ? null : ((current - previous) / previous) * 100,
    note: previous === null ? 'Chưa đủ dữ liệu' : previous === 0 ? 'Kỳ trước bằng 0' : '',
  };
}
async function snapshot(c: DB, a: Actor, period: string) {
  const { start, end } = periodRange(period),
    roles = [...new Set(a.grants.filter((g) => g.kind === 'JOB').map((g) => g.role))];
  const cutoff = (await one(c, 'SELECT clock_timestamp() AS now')).now;
  const tasks = await rows(
    c,
    `SELECT t.*,u.name AS owner_name,s.submitted_at AS accepted_submitted_at FROM tasks t JOIN users u ON u.id=t.owner_id LEFT JOIN submissions s ON s.id=t.approved_submission_id WHERE owner_id=$1 AND role=ANY($2) AND t.created_at<$3 ORDER BY t.created_at`,
    [a.id, roles, end],
  );
  const principal = tasks.filter((t) => t.created_at >= start),
    carryover = tasks.filter(
      (t) => t.created_at < start && !['DONE', 'CANCELLED', 'DECLINED'].includes(t.status),
    );
  const support = await rows(
    c,
    `SELECT s.*,t.title,t.owner_id,t.status AS task_status,t.created_at,t.due_at,u.name AS owner_name FROM supporters s JOIN tasks t ON t.id=s.task_id JOIN users u ON u.id=t.owner_id WHERE s.user_id=$1 AND s.role=ANY($2) AND t.created_at>=$3 AND t.created_at<$4 ORDER BY t.created_at`,
    [a.id, roles, start, end],
  );
  const drafts = await rows(
    c,
    'SELECT role,narrative,version FROM report_drafts WHERE user_id=$1 AND period=$2 AND (role=ANY($3) OR role=$4)',
    [a.id, period, roles, 'COMMON'],
  );
  const previousStart = new Date(start.getTime() - 7 * 86400e3);
  const previous = await rows(
    c,
    'SELECT * FROM tasks WHERE owner_id=$1 AND role=ANY($2) AND created_at>=$3 AND created_at<$4',
    [a.id, roles, previousStart, start],
  );
  const metrics = await rows(
    c,
    `SELECT DISTINCT ON(platform,shop,kind,subject,metric,business_date,window_end,grain,currency) m.* FROM metrics m WHERE owner_id=$1 AND role=ANY($2) AND business_date>=$3::date AND business_date<$4::date ORDER BY platform,shop,kind,subject,metric,business_date,window_end,grain,currency,revision DESC`,
    [a.id, roles, period, localDate(end)],
  );
  const claims = roles.includes('MARKETPLACE')
    ? await rows(
        c,
        'SELECT id,order_id,amount,currency,stage,created_at FROM claims WHERE owner_id=$1 AND created_at>=$2 AND created_at<$3',
        [a.id, start, end],
      )
    : [];
  const activity = await rows(
    c,
    'SELECT id,kind,title,status,role FROM records WHERE owner_id=$1 AND role=ANY($2) AND created_at>=$3 AND created_at<$4',
    [a.id, roles, start, end],
  );
  return {
    user_id: a.id,
    user_name: a.name,
    period,
    start,
    end,
    cutoff,
    timezone: 'Asia/Ho_Chi_Minh',
    policy_version: 'P05-created_at-monday-v1',
    policy_confirmed: !!(await setting(c, 'policies')).report_week_confirmed,
    roles,
    summary: counts(principal),
    principal,
    support,
    carryover,
    narratives: drafts,
    sections: roles.map((role) => ({
      role,
      summary: counts(principal.filter((t) => t.role === role)),
      support: support.filter((s) => s.role === role),
      metrics: metrics.filter((m) => m.role === role),
      activity: activity.filter((r) => r.role === role),
      claims: role === 'MARKETPLACE' ? claims : [],
    })),
    comparison: {
      current_range: [start, end],
      previous_range: [previousStart, start],
      mode: 'FULL_PERIOD',
      total: comparison(counts(principal).total, counts(previous).total),
      note: 'Kỳ đang chạy là tạm tính; lựa chọn cả kỳ, không khẳng định tương đương số ngày',
    },
    source_manifest: {
      metric_revisions: metrics.map((m) => ({
        id: m.id,
        revision: m.revision,
        batch_id: m.batch_id,
      })),
      task_ids: principal.map((t) => ({ id: t.id, version: t.version })),
      calendar: await setting(c, 'calendar'),
    },
    support_summary: {
      pending: support.filter((s) => s.status === 'PENDING').length,
      accepted: support.filter((s) => s.status === 'ACCEPTED').length,
      reported_done: support.filter((s) => s.contribution_state === 'REPORTED_DONE').length,
    },
  };
}
export async function revisionAccess(c: DB, a: Actor, id: string) {
  const r = await one(
    c,
    'SELECT v.*,r.user_id,r.period,u.name,u.team_id FROM report_revisions v JOIN reports r ON r.id=v.report_id JOIN users u ON u.id=r.user_id WHERE v.id=$1',
    [id],
  );
  need(r, 'Không tìm thấy báo cáo', 404, 'NOT_FOUND');
  need(
    r.user_id === a.id || manages(a, { id: r.user_id, team_id: r.team_id }),
    'Không tìm thấy báo cáo',
    404,
    'NOT_FOUND',
  );
  if (r.user_id === a.id && !isAdmin(a)) {
    const roles = r.snapshot.roles.filter((role: string) => hasJob(a, role));
    r.snapshot = {
      ...r.snapshot,
      roles,
      principal: r.snapshot.principal.filter((t: any) => roles.includes(t.role)),
      support: r.snapshot.support.filter((t: any) => roles.includes(t.role)),
      carryover: r.snapshot.carryover.filter((t: any) => roles.includes(t.role)),
      sections: r.snapshot.sections.filter((t: any) => roles.includes(t.role)),
      narratives: r.snapshot.narratives.filter((n: any) =>
        n.role === 'COMMON' ? roles.length === r.snapshot.roles.length : roles.includes(n.role),
      ),
    };
    r.snapshot.summary = counts(r.snapshot.principal);
    r.snapshot.source_manifest = { note: 'Nguồn được giới hạn theo quyền hiện tại' };
    r.snapshot.comparison = null;
  }
  return r;
}
export function reportRoutes(api: API) {
  api('GET', '/reports/comparison', async (c, a, b, q) => {
    const { start } = periodRange(q.period);
    const monthly = q.range === 'MONTH',
      equivalent = q.mode === 'EQUIVALENT_DAYS';
    let currentStart = new Date(start),
      currentEnd = new Date(start.getTime() + 7 * 86400e3),
      previousStart = new Date(start.getTime() - 7 * 86400e3),
      previousEnd = new Date(start);
    if (monthly) {
      const local = new Date(start.getTime() + 7 * 3600e3);
      currentStart = new Date(
        Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 7 * 3600e3,
      );
      currentEnd = new Date(
        Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - 7 * 3600e3,
      );
      previousStart = new Date(
        Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - 7 * 3600e3,
      );
      previousEnd = new Date(currentStart);
    }
    if (equivalent) {
      const today = new Date(new Date().toISOString());
      const completed = new Date(today.getTime() + 7 * 3600e3);
      completed.setUTCHours(0, 0, 0, 0);
      const cutoff = new Date(completed.getTime() - 7 * 3600e3);
      if (cutoff < currentEnd) {
        currentEnd = new Date(Math.max(currentStart.getTime(), cutoff.getTime()));
        previousEnd = new Date(
          Math.min(
            previousEnd.getTime(),
            previousStart.getTime() + currentEnd.getTime() - currentStart.getTime(),
          ),
        );
      }
    }
    const roles = a.grants.filter((g) => g.kind === 'JOB').map((g) => g.role);
    const count = async (from: Date, to: Date) =>
      Number(
        (
          await one(
            c,
            "SELECT count(*) AS n FROM tasks WHERE owner_id=$1 AND role=ANY($2) AND created_at>=$3 AND created_at<$4 AND status<>'DRAFT'",
            [a.id, roles, from, to],
          )
        ).n,
      );
    return {
      range: monthly ? 'MONTH' : 'WEEK',
      mode: equivalent ? 'EQUIVALENT_DAYS' : 'FULL_PERIOD',
      current_range: [currentStart, currentEnd],
      previous_range: [previousStart, previousEnd],
      comparison: comparison(
        await count(currentStart, currentEnd),
        await count(previousStart, previousEnd),
      ),
      note: equivalent
        ? 'So số ngày đã hoàn tất, không gồm ngày đang chạy'
        : 'So toàn kỳ; kỳ đang chạy là tạm tính',
    };
  });
  api('GET', '/reports/live', async (c, a, b, q) => {
    need(!q.employee || q.employee === a.id);
    return snapshot(c, a, q.period);
  });
  api('PUT', '/reports/draft', async (c, a, b) => {
    const v = z
      .object({
        period: z.iso.date(),
        role: z.string(),
        narrative: z.object({
          results: z.string().max(20000),
          difficulties: z.string().max(20000),
          support: z.string().max(20000),
          next_week: z.string().max(20000),
        }),
        expected_version: z.number().int(),
      })
      .parse(b);
    periodRange(v.period);
    need(v.role === 'COMMON' || hasJob(a, v.role));
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      a.id + v.period + v.role,
    ]);
    const old = await one(
      c,
      'SELECT * FROM report_drafts WHERE user_id=$1 AND period=$2 AND role=$3 FOR UPDATE',
      [a.id, v.period, v.role],
    );
    if (old) version(old, v.expected_version);
    else need(v.expected_version === 0, 'Nháp đã thay đổi', 409, 'VERSION_CONFLICT');
    return one(
      c,
      'INSERT INTO report_drafts(user_id,period,role,narrative) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,period,role) DO UPDATE SET narrative=EXCLUDED.narrative,version=report_drafts.version+1,updated_at=now() RETURNING *',
      [a.id, v.period, v.role, JSON.stringify(v.narrative)],
    );
  });
  api('POST', '/reports/submit', async (c, a, b) => {
    const v = z
      .object({
        period: z.iso.date(),
        expected_draft_versions: z.record(z.string(), z.number().int()).default({}),
      })
      .parse(b);
    need(
      (await setting(c, 'policies')).report_week_confirmed,
      'Chưa xác nhận chính sách tuần/cohort Q05 trước khi nộp báo cáo thật',
      422,
      'CONFIG_REQUIRED',
    );
    periodRange(v.period);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      'report:' + a.id + v.period,
    ]);
    await c.query('LOCK TABLE tasks,supporters,submissions,report_drafts IN SHARE MODE');
    const drafts = await rows(
      c,
      'SELECT * FROM report_drafts WHERE user_id=$1 AND period=$2 FOR UPDATE',
      [a.id, v.period],
    );
    for (const d of drafts)
      if (d.role === 'COMMON' || hasJob(a, d.role))
        need(
          v.expected_draft_versions[d.role] === d.version,
          'Nháp đã được cập nhật ở nơi khác',
          409,
          'VERSION_CONFLICT',
        );
    const current = await snapshot(c, a, v.period);
    need(current.roles.length, 'Không có role chuyên môn hiệu lực', 403, 'FORBIDDEN');
    const people = await rows(
      c,
      'SELECT id,name,email,team_id FROM users WHERE active AND id<>$1',
      [a.id],
    );
    const recipients: string[] = [];
    for (const u of people) {
      u.grants = await rows(
        c,
        'SELECT * FROM grants WHERE user_id=$1 AND revoked_at IS NULL AND valid_from<=now() AND (valid_to IS NULL OR valid_to>now())',
        [u.id],
      );
      if (manages(u as Actor, { id: a.id, team_id: a.team_id }) && !isAdmin(u as Actor))
        recipients.push(u.id);
    }
    need(recipients.length, 'Chưa cấu hình quản lý/sếp nhận báo cáo Q09', 422, 'CONFIG_REQUIRED');
    const container = await one(
      c,
      'INSERT INTO reports(user_id,period) VALUES($1,$2) ON CONFLICT(user_id,period) DO UPDATE SET period=EXCLUDED.period RETURNING *',
      [a.id, v.period],
    );
    const r = await one(
      c,
      'INSERT INTO report_revisions(report_id,revision,snapshot,recipients) SELECT $1,coalesce(max(revision),0)+1,$2,$3 FROM report_revisions WHERE report_id=$1 RETURNING *',
      [container.id, JSON.stringify(current), recipients],
    );
    for (const id of recipients)
      await notify(c, id, `report:${r.id}`, 'Có báo cáo tuần mới được nộp', r.id);
    await audit(c, a, 'REPORT_SUBMITTED', 'report', r.id, { revision: r.revision });
    return r;
  });
  api('GET', '/reports/submitted', async (c, a, b, q) => {
    periodRange(q.period);
    const people = await rows(c, 'SELECT id,name,team_id FROM users WHERE active ORDER BY name');
    const items = [];
    for (const u of people) {
      if (u.id !== a.id && !manages(a, u)) continue;
      const revisions = await rows(
        c,
        'SELECT v.id,v.revision,v.created_at,r.id AS report_id FROM report_revisions v JOIN reports r ON r.id=v.report_id WHERE r.user_id=$1 AND r.period=$2 ORDER BY revision DESC',
        [u.id, q.period],
      );
      items.push({ ...u, revisions });
    }
    return { items };
  });
  api('GET', '/report-revisions/:id', async (c, a, b, q, p) => revisionAccess(c, a, p.id));
  api('POST', '/report-revisions/:id/exports', async (c, a, b, q, p) => {
    await revisionAccess(c, a, p.id);
    return {
      url: `/api/v1/report-revisions/${p.id}/export${b.role ? '?role=' + encodeURIComponent(b.role) : ''}`,
    };
  });
  api('GET', '/report-revisions/:id/export', async (c, a, b, q, p, reply) => {
    const r = await revisionAccess(c, a, p.id),
      s = r.snapshot;
    const roles = q.role ? [String(q.role)] : s.roles;
    need(roles.every((role: string) => s.roles.includes(role)));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Super Net';
    const sheet = (name: string, headers: string[], data: any[][]) => {
      const ws = workbook.addWorksheet(name);
      ws.addRow(headers);
      for (const row of data)
        ws.addRow(
          row.map((v) => (v instanceof Date ? v : typeof v === 'object' ? JSON.stringify(v) : v)),
        );
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176448' } };
      ws.columns.forEach((col) => (col.width = 28));
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      return ws;
    };
    const tasks = s.principal.filter((t: any) => roles.includes(t.role)),
      support = s.support.filter((t: any) => roles.includes(t.role));
    sheet(
      'Thong_tin',
      ['Nhân viên', 'Tuần', 'Phiên bản', 'Cutoff UTC', 'Múi giờ', 'Người xuất', 'Role'],
      [
        [
          r.name,
          String(r.period).slice(0, 10),
          r.revision,
          s.cutoff,
          s.timezone,
          a.name,
          roles.join(', '),
        ],
      ],
    );
    sheet('Tong_hop', ['Chỉ số', 'Giá trị'], Object.entries(counts(tasks)));
    sheet(
      'Theo_role',
      ['Role', 'Phát sinh', 'Hoàn thành', 'Đúng hạn', 'Trễ hạn'],
      roles.map((role: string) => {
        const v = counts(tasks.filter((t: any) => t.role === role));
        return [role, v.total, v.done, v.on_time, v.late];
      }),
    );
    sheet(
      'Task_chinh',
      [
        'Mã',
        'Tên',
        'Role',
        'Trạng thái',
        'Hạn UTC',
        'Nộp được duyệt UTC',
        'Đánh giá',
        'Kết quả',
        'Bước tiếp theo',
        'Khó khăn',
      ],
      tasks.map((t: any) => [
        String(t.code),
        t.title,
        t.role,
        t.status,
        t.due_at,
        t.accepted_submitted_at,
        t.timing,
        t.result_text,
        t.next_step,
        t.blocker,
      ]),
    );
    sheet(
      'Ho_tro',
      ['Task', 'Role hỗ trợ', 'Trạng thái', 'Phần hỗ trợ', 'Bước tiếp theo', 'Khó khăn'],
      support.map((t: any) => [t.title, t.role, t.status, t.summary, t.next_step, t.blocker]),
    );
    sheet(
      'Bo_sung',
      ['Role', 'Kết quả', 'Khó khăn', 'Hỗ trợ', 'Kế hoạch'],
      s.narratives
        .filter(
          (n: any) =>
            roles.includes(n.role) || (n.role === 'COMMON' && roles.length === s.roles.length),
        )
        .map((n: any) => [
          n.role,
          n.narrative.results,
          n.narrative.difficulties,
          n.narrative.support,
          n.narrative.next_week,
        ]),
    );
    sheet(
      'Nguon_du_lieu',
      ['Loại', 'Nguồn'],
      [
        ['Manifest', s.source_manifest],
        ['Cohort', s.policy_version],
      ],
    );
    await audit(c, a, 'REPORT_EXPORTED', 'report', r.id, { roles });
    const buffer = await workbook.xlsx.writeBuffer();
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="SuperNet-${r.revision}.xlsx"`);
    return Buffer.from(buffer);
  });
  api('GET', '/plans', async (c, a, b, q) => {
    periodRange(q.period);
    return {
      items: await rows(
        c,
        'SELECT * FROM plans WHERE user_id=$1 AND period=$2 ORDER BY created_at',
        [a.id, q.period],
      ),
    };
  });
  api('POST', '/plans', async (c, a, b) => {
    const v = z
      .object({
        period: z.iso.date(),
        role: z.string(),
        title: z.string().trim().min(1).max(500),
        task_id: z.uuid().nullable().default(null),
      })
      .parse(b);
    periodRange(v.period);
    need(hasJob(a, v.role));
    if (v.task_id)
      need(
        await one(c, 'SELECT id FROM tasks WHERE id=$1 AND owner_id=$2 AND role=$3', [
          v.task_id,
          a.id,
          v.role,
        ]),
      );
    return one(
      c,
      'INSERT INTO plans(user_id,period,role,title,task_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [a.id, v.period, v.role, v.title, v.task_id],
    );
  });
}
