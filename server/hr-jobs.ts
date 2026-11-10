import { type DB, rows, one, setting, localDate, workingDate } from './base.js';
import { birthdayOccurrence } from './worker.js';

export async function hrJobs(c: DB, today = localDate()) {
  const policy = await setting(c, 'handoff_policies'),
    calendar = await setting(c, 'calendar');
  const recipients = await rows(
    c,
    `SELECT DISTINCT u.id FROM users u JOIN grants g ON g.user_id=u.id WHERE u.active AND g.kind='JOB' AND g.role='HR' AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now())`,
  );
  const enqueue = async (
    user: string,
    key: string,
    message: string,
    id: string,
    type: string,
    event: string,
    path: string,
  ) =>
    c.query(
      `INSERT INTO outbox(user_id,event_key,message,object_id,object_type,event_type,action_path) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [user, key, message, id, type, event, path],
    );
  const milestones =
    policy.hr_reminders_enabled === false
      ? []
      : [
          ...(await rows(
            c,
            `SELECT id,probation_end AS due,1 AS revision,'EMPLOYEE' AS type FROM employee_profiles WHERE employment_state='PROBATION' AND archived_at IS NULL AND probation_end IS NOT NULL`,
          )),
          ...(await rows(
            c,
            `SELECT co.id,r.expires_on AS due,r.revision,'CONTRACT' AS type FROM employee_contracts co JOIN employee_contract_revisions r ON r.id=co.current_revision_id JOIN employee_profiles e ON e.id=co.employee_id WHERE r.expires_on IS NOT NULL AND r.status IN ('ACTIVE','SIGNED','EXPIRED') AND e.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM employee_contracts newer JOIN employee_contract_revisions nr ON nr.id=newer.current_revision_id WHERE newer.supersedes_contract_id=co.id AND nr.status IN ('SIGNED','ACTIVE'))`,
          )),
        ];
  for (const m of milestones) {
    if (await one(c, 'SELECT id FROM hr_reminder_actions WHERE object_id=$1', [m.id])) continue;
    const days = Math.round(
      (+new Date(m.due + 'T12:00:00Z') - +new Date(today + 'T12:00:00Z')) / 86400e3,
    );
    const offsets: number[] =
      m.type === 'CONTRACT'
        ? policy.contract_offsets || [30, 7]
        : policy.probation_offsets || [7, 3];
    if (days > Math.max(...offsets)) continue;
    const offset = offsets.includes(days) ? String(days) : 'OVERDUE_MILESTONE';
    for (const u of recipients) {
      // Catch up once rather than emit every missed offset after a restart.
      if (
        offset === 'OVERDUE_MILESTONE' &&
        (await one(c, 'SELECT id FROM outbox WHERE user_id=$1 AND event_key LIKE $2', [
          u.id,
          `hr:${m.type}:${m.id}:${m.revision}:${m.due}:%`,
        ]))
      )
        continue;
      await enqueue(
        u.id,
        `hr:${m.type}:${m.id}:${m.revision}:${m.due}:${offset}`,
        days < 0 ? 'Có hồ sơ HR hết hạn chưa xử lý' : 'Có mốc thử việc/hợp đồng cần HR kiểm tra',
        m.id,
        m.type,
        m.type === 'CONTRACT' ? 'CONTRACT_EXPIRY' : 'PROBATION_END',
        m.type === 'CONTRACT' ? `/hr/contracts/${m.id}` : `/employees/${m.id}`,
      );
    }
  }
  const persons = [
    ...(await rows(
      c,
      "SELECT id,birthday,'EMPLOYEE' AS type FROM employee_profiles WHERE employment_state IN ('PROBATION','OFFICIAL') AND birthday IS NOT NULL",
    )),
    ...(await rows(
      c,
      "SELECT c.id,c.birthday,'CANDIDATE' AS type FROM candidate_profiles c WHERE c.birthday IS NOT NULL AND NOT EXISTS(SELECT 1 FROM candidate_employee_links l WHERE l.candidate_id=c.id)",
    )),
  ];
  const month = Number(today.slice(5, 7));
  for (const u of recipients) {
    if (
      policy.birthday_month_enabled !== false &&
      persons.some((p) => Number(p.birthday.slice(5, 7)) === month)
    )
      await enqueue(
        u.id,
        `hr:birthday-month:${today.slice(0, 7)}`,
        'Danh sách sinh nhật tháng đã có; HR kiểm tra',
        u.id,
        'BIRTHDAY_LIST',
        'BIRTHDAY_MONTH',
        '/hr/birthdays',
      );
    for (const p of persons) {
      const occurrence = birthdayOccurrence(p.birthday, today);
      if (!occurrence) continue;
      if (
        policy.birthday_soon_enabled !== false &&
        workingDate(occurrence, -(policy.birthday_offsets ?? 5), calendar.holidays || []) === today
      )
        await enqueue(
          u.id,
          `hr:birthday:${p.id}:${occurrence.slice(0, 4)}:5`,
          'Có sinh nhật sắp tới; HR xem danh sách',
          p.id,
          p.type,
          'BIRTHDAY_SOON',
          p.type === 'EMPLOYEE' ? `/employees/${p.id}` : `/candidates/${p.id}`,
        );
    }
  }
}
