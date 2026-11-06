import {
  pool,
  tx,
  one,
  rows,
  setting,
  notify,
  event,
  localDate,
  workingDate,
  actor,
  hasJob,
  audit,
} from './base.js';
import { logStream } from './logging.js';
import { createTask } from './tasks.js';
export async function runJobs() {
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock_shared(3002003)');
    await c.query('SELECT pg_advisory_xact_lock(3002002)');
    const policy = await setting(c, 'policies'),
      calendar = await setting(c, 'calendar');
    if (policy.assignment_boundary_confirmed) {
      const pending = await rows(
        c,
        "SELECT a.*,t.created_by FROM assignments a JOIN tasks t ON t.id=a.task_id WHERE a.status='PENDING' AND a.response_due_at<=clock_timestamp() AND t.status='ASSIGNED' FOR UPDATE OF t,a SKIP LOCKED",
      );
      for (const a of pending) {
        await c.query(
          "UPDATE assignments SET status='TIMED_OUT',responded_at=clock_timestamp() WHERE id=$1 AND status='PENDING'",
          [a.id],
        );
        await c.query(
          "UPDATE tasks SET status='DECLINED',version=version+1,updated_at=now() WHERE id=$1",
          [a.task_id],
        );
        await event(c, null, a.task_id, 'ASSIGNMENT_TIMEOUT', { assignment_id: a.id });
        await notify(
          c,
          a.created_by,
          'timeout:' + a.id,
          'Công việc hết hạn phản hồi; cần xem xét giao lại hoặc hủy',
          a.task_id,
        );
      }
    }
    const today = localDate(),
      date = new Date(today + 'T12:00:00Z'),
      weekday = date.getUTCDay() || 7;
    const rules = await rows(
      c,
      'SELECT * FROM recurring_rules WHERE enabled AND $1=ANY(iso_weekdays)',
      [weekday],
    );
    if (!calendar.holidays.includes(today) && weekday !== 7)
      for (const rule of rules) {
        if (await one(c, 'SELECT 1 FROM generations WHERE rule_id=$1 AND day=$2', [rule.id, today]))
          continue;
        try {
          const a = await actor(c, rule.owner_id);
          if (!hasJob(a, rule.role)) continue;
          const u = await one(c, 'SELECT reviewer_id FROM users WHERE id=$1', [a.id]);
          if (!u.reviewer_id) continue;
          const t = await createTask(c, a, {
            title: rule.title,
            role: rule.role,
            type: rule.type,
            due_at: `${today}T${String(rule.due_hour).padStart(2, '0')}:00:00+07:00`,
          });
          await c.query("UPDATE tasks SET source='ROLE_RECURRING' WHERE id=$1", [t.id]);
          await c.query('INSERT INTO generations(rule_id,day,task_id) VALUES($1,$2,$3)', [
            rule.id,
            today,
            t.id,
          ]);
        } catch (e) {
          throw e;
        }
      }
    if (policy.birthday_policy_confirmed) {
      const employees = await rows(
        c,
        "SELECT * FROM employee_profiles WHERE employment_state IN ('PROBATION','OFFICIAL') AND birthday IS NOT NULL",
      );
      for (const e of employees) {
        const b =
          e.birthday instanceof Date ? localDate(e.birthday) : String(e.birthday).slice(0, 10);
        const birthday = today.slice(0, 4) + b.slice(4);
        if (new Date(birthday + 'T12:00:00Z').toISOString().slice(0, 10) !== birthday) continue;
        if (workingDate(birthday, -5, calendar.holidays) !== today) continue;
        const creator = await actor(c, e.created_by).catch(() => null);
        if (!creator || !hasJob(creator, 'HR')) continue;
        await notify(
          c,
          e.created_by,
          `birthday:${e.id}:${today.slice(0, 4)}`,
          'Có sinh nhật nhân viên sau 5 ngày làm việc; HR xem hồ sơ',
          e.id,
        );
      }
    }
    const outbox = await rows(
      c,
      'SELECT o.* FROM outbox o JOIN users u ON u.id=o.user_id WHERE o.processed_at IS NULL AND u.active AND o.attempts<10 ORDER BY id FOR UPDATE OF o SKIP LOCKED LIMIT 100',
    );
    for (const o of outbox) {
      await c.query(
        'INSERT INTO notifications(user_id,event_key,message,object_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [o.user_id, o.event_key, o.message, o.object_id],
      );
      await c.query('UPDATE outbox SET processed_at=now(),attempts=attempts+1 WHERE id=$1', [o.id]);
    }
  });
}
if (/[/\\]worker\.(ts|js)$/.test(process.argv[1] || '')) {
  const logs = logStream('worker');
  logs.write(JSON.stringify({ time: new Date().toISOString(), event: 'worker_started' }) + '\n');
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runJobs();
    } catch (e: any) {
      logs.write(
        JSON.stringify({
          time: new Date().toISOString(),
          event: 'worker_failed',
          code: e.code || 'ERROR',
        }) + '\n',
      );
    } finally {
      running = false;
    }
  };
  await tick();
  const timer = setInterval(tick, 30000);
  for (const sig of ['SIGTERM', 'SIGINT'])
    process.on(sig, async () => {
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 100));
      await pool.end();
      process.exit(0);
    });
}
