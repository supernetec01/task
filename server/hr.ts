import { z } from 'zod';
import type { API } from './app.js';
import {
  type Actor,
  type DB,
  need,
  one,
  rows,
  version,
  cipher,
  decipher,
  localDate,
  actor,
} from './base.js';
import { hrV2 } from './handoff-access.js';
import { hrAccess, createEmployee } from './employees.js';
import { employeeRevision, basicSnapshot } from './employee-history.js';

const reason = z.string().trim().min(1).max(5000),
  date = z.iso.date(),
  instant = z.iso.datetime({ offset: true });
async function hrRecord(c: DB, a: Actor, id: string, kind: string, lock = false) {
  need(hrV2(a));
  const r = await one(
    c,
    `SELECT * FROM records WHERE id=$1 AND module='hr' AND kind=$2 ${lock ? 'FOR UPDATE' : ''}`,
    [id, kind],
  );
  need(r, 'Không tìm thấy hồ sơ', 404, 'NOT_FOUND');
  return r;
}
async function record(c: DB, a: Actor, kind: string, title: string) {
  return one(
    c,
    `INSERT INTO records(module,kind,role,owner_id,title) VALUES('hr',$1,'HR',$2,$3) RETURNING id`,
    [kind, a.id, title],
  );
}
const candidateSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    birthday: date.nullable().default(null),
    contact: z
      .object({
        email: z.union([z.email(), z.literal('')]).default(''),
        phone: z.string().max(40).default(''),
      })
      .strict()
      .refine((v) => !!(v.email || v.phone), 'Cần email hoặc số điện thoại'),
    portfolio: z.union([z.url(), z.literal('')]).default(''),
  })
  .strict();
export function hrRoutes(api: API) {
  api('GET', '/hr/legacy-records', async (c, a, b, q) => {
    need(hrV2(a));
    return {
      items: await rows(
        c,
        `SELECT r.id,r.title,r.kind,r.payload,r.created_at FROM records r WHERE r.module='hr' AND NOT EXISTS(SELECT 1 FROM candidate_profiles c WHERE c.id=r.id) AND NOT EXISTS(SELECT 1 FROM job_applications j WHERE j.id=r.id) AND NOT EXISTS(SELECT 1 FROM interview_sessions i WHERE i.id=r.id) ORDER BY r.created_at DESC,r.id LIMIT 100`,
      ),
      availability: 'LEGACY_UNLINKED',
    };
  });
  api('GET', '/contracts/:id', async (c, a, b, q, p) => {
    need(hrV2(a));
    const r = await one(c, 'SELECT * FROM employee_contracts WHERE id=$1', [p.id]);
    need(r, 'Không tìm thấy hợp đồng', 404, 'NOT_FOUND');
    return r;
  });
  api('POST', '/candidates', async (c, a, b) => {
    need(hrV2(a));
    const v = candidateSchema.parse(b);
    const r = await record(c, a, 'CANDIDATE', v.name);
    await c.query(
      'INSERT INTO candidate_profiles(id,birthday,contact,version) VALUES($1,$2,$3,1)',
      [r.id, v.birthday, JSON.stringify({ ...v.contact, portfolio: v.portfolio })],
    );
    return { id: r.id, version: 1 };
  });
  api('GET', '/candidates', async (c, a, b, q) => {
    need(hrV2(a));
    return {
      items: await rows(
        c,
        `SELECT cp.*,r.title AS name FROM candidate_profiles cp JOIN records r ON r.id=cp.id WHERE ($1='' OR r.title ILIKE '%'||$1||'%' OR cp.contact->>'email' ILIKE '%'||$1||'%' OR cp.contact->>'phone' ILIKE '%'||$1||'%') ORDER BY r.created_at DESC,cp.id LIMIT 100`,
        [String(q.q || '').slice(0, 255)],
      ),
    };
  });
  api('PATCH', '/candidates/:id', async (c, a, b, q, p) => {
    await hrRecord(c, a, p.id, 'CANDIDATE', true);
    const current = await one(c, 'SELECT * FROM candidate_profiles WHERE id=$1 FOR UPDATE', [p.id]);
    const v = candidateSchema.safeExtend({ expected_version: z.number().int() }).parse(b);
    version(current, v.expected_version);
    await c.query(
      'UPDATE candidate_profiles SET birthday=$2,contact=$3,version=version+1 WHERE id=$1',
      [p.id, v.birthday, JSON.stringify({ ...v.contact, portfolio: v.portfolio })],
    );
    await c.query('UPDATE records SET title=$2 WHERE id=$1', [p.id, v.name]);
    return { ok: true, version: current.version + 1 };
  });
  api('POST', '/applications', async (c, a, b) => {
    need(hrV2(a));
    const v = z
      .object({
        candidate_id: z.uuid(),
        position_code: z.enum(['MARKETPLACE', 'HR', 'CONTENT']),
        received_on: date,
        recruiter_id: z.uuid(),
        source: z.string().trim().min(1).max(1000),
        next_action: z.string().max(5000).default(''),
      })
      .strict()
      .parse(b);
    await hrRecord(c, a, v.candidate_id, 'CANDIDATE');
    await actor(c, v.recruiter_id);
    const r = await record(c, a, 'APPLICATION', v.position_code);
    await c.query(
      `INSERT INTO job_applications(id,candidate_id,position_code,received_on,recruiter_id,stage,source,next_action,version) VALUES($1,$2,$3,$4,$5,'NEW',$6,$7,1)`,
      [
        r.id,
        v.candidate_id,
        v.position_code,
        v.received_on,
        v.recruiter_id,
        v.source,
        v.next_action,
      ],
    );
    await c.query(
      "INSERT INTO hr_application_events(application_id,actor_id,after_stage,reason) VALUES($1,$2,'NEW','APPLICATION_CREATED')",
      [r.id, a.id],
    );
    return { id: r.id, version: 1 };
  });
  api('GET', '/applications', async (c, a, b, q) => {
    need(hrV2(a));
    return {
      items: await rows(
        c,
        `SELECT j.*,r.title AS candidate_name,l.employee_id FROM job_applications j JOIN records r ON r.id=j.candidate_id LEFT JOIN candidate_employee_links l ON l.application_id=j.id WHERE ($1::uuid IS NULL OR j.candidate_id=$1) ORDER BY j.received_on DESC,j.id LIMIT 100`,
        [q.candidate_id || null],
      ),
    };
  });
  api('PATCH', '/applications/:id', async (c, a, b, q, p) => {
    await hrRecord(c, a, p.id, 'APPLICATION', true);
    const v = z
      .object({
        stage: z.enum(['NEW', 'INTERVIEW', 'EVALUATING', 'OFFER', 'REJECTED']),
        next_action: z.string().max(5000),
        reason: z.string().max(5000).default(''),
        expected_version: z.number().int(),
      })
      .strict()
      .parse(b);
    const j = await one(c, 'SELECT * FROM job_applications WHERE id=$1 FOR UPDATE', [p.id]);
    version(j, v.expected_version);
    need(j.stage !== 'HIRED', 'Hồ sơ đã tiếp nhận', 409, 'STATE');
    need(v.stage !== 'REJECTED' || v.reason.trim(), 'Cần lý do từ chối', 422, 'REASON_REQUIRED');
    await c.query(
      'UPDATE job_applications SET stage=$2,next_action=$3,version=version+1 WHERE id=$1',
      [p.id, v.stage, v.next_action],
    );
    await c.query('UPDATE records SET payload=payload||$2::jsonb WHERE id=$1', [
      p.id,
      JSON.stringify({ reason: v.reason }),
    ]);
    await c.query(
      'INSERT INTO hr_application_events(application_id,actor_id,before_stage,after_stage,reason) VALUES($1,$2,$3,$4,$5)',
      [j.id, a.id, j.stage, v.stage, v.reason || 'STAGE_UPDATED'],
    );
    return { ok: true };
  });
  api('POST', '/interviews', async (c, a, b) => {
    need(hrV2(a));
    const v = z
      .object({
        application_id: z.uuid(),
        starts_at: instant,
        ends_at: instant,
        location: z.string().trim().min(1).max(1000),
        interviewer_ids: z.array(z.uuid()).min(1).max(50),
        outcome: z.string().max(5000).default(''),
        notes: z.string().max(10000).default(''),
      })
      .strict()
      .parse(b);
    await hrRecord(c, a, v.application_id, 'APPLICATION');
    need(
      +new Date(v.ends_at) > +new Date(v.starts_at),
      'Giờ kết thúc phải sau bắt đầu',
      422,
      'VALIDATION',
    );
    const r = await record(c, a, 'INTERVIEW', 'Phỏng vấn');
    await c.query(
      'INSERT INTO interview_sessions(id,application_id,starts_at,ends_at,location,outcome,notes,version) VALUES($1,$2,$3,$4,$5,$6,$7,1)',
      [r.id, v.application_id, v.starts_at, v.ends_at, v.location, v.outcome, v.notes],
    );
    for (const uid of new Set(v.interviewer_ids)) {
      await actor(c, uid);
      await c.query('INSERT INTO interview_users(interview_id,user_id) VALUES($1,$2)', [r.id, uid]);
    }
    return { id: r.id, version: 1 };
  });
  api('GET', '/interviews', async (c, a) => {
    need(hrV2(a));
    return {
      items: await rows(
        c,
        'SELECT i.*,r.title AS candidate_name FROM interview_sessions i JOIN job_applications j ON j.id=i.application_id JOIN records r ON r.id=j.candidate_id ORDER BY i.starts_at,i.id LIMIT 100',
      ),
    };
  });
  api('PATCH', '/interviews/:id', async (c, a, b, q, p) => {
    await hrRecord(c, a, p.id, 'INTERVIEW', true);
    const old = await one(c, 'SELECT * FROM interview_sessions WHERE id=$1 FOR UPDATE', [p.id]);
    const v = z
      .object({
        starts_at: instant,
        ends_at: instant,
        location: z.string().trim().min(1).max(1000),
        outcome: z.string().max(5000),
        notes: z.string().max(10000),
        expected_version: z.number().int(),
      })
      .strict()
      .parse(b);
    version(old, v.expected_version);
    need(
      +new Date(v.ends_at) > +new Date(v.starts_at),
      'Giờ kết thúc phải sau bắt đầu',
      422,
      'VALIDATION',
    );
    await c.query(
      'UPDATE interview_sessions SET starts_at=$2,ends_at=$3,location=$4,outcome=$5,notes=$6,version=version+1 WHERE id=$1',
      [p.id, v.starts_at, v.ends_at, v.location, v.outcome, v.notes],
    );
    return { ok: true, version: old.version + 1 };
  });
  api('POST', '/applications/:id/onboard', async (c, a, b, q, p) => {
    await hrRecord(c, a, p.id, 'APPLICATION', true);
    const j = await one(c, 'SELECT * FROM job_applications WHERE id=$1 FOR UPDATE', [p.id]);
    const old = await one(
      c,
      'SELECT employee_id FROM candidate_employee_links WHERE application_id=$1',
      [p.id],
    );
    if (old) return old;
    const v = z
      .object({
        employee_code: z.string().trim().min(1),
        joined_on: date,
        phase: z.enum(['PROBATION', 'OFFICIAL']),
        employment_type: z.enum(['FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACTOR']),
        team_id: z.uuid(),
        expected_version: z.number().int(),
      })
      .strict()
      .parse(b);
    version(j, v.expected_version);
    const candidate = await one(
      c,
      'SELECT c.*,r.title AS name FROM candidate_profiles c JOIN records r ON r.id=c.id WHERE c.id=$1',
      [j.candidate_id],
    );
    const e = await createEmployee(c, a, {
      employee_code: v.employee_code,
      name: candidate.name,
      joined_on: v.joined_on,
      phase: v.phase,
      employment_type: v.employment_type,
      team_id: v.team_id,
      positions: [j.position_code],
      birthday: candidate.birthday,
      contact: { phone: candidate.contact.phone || '', email: candidate.contact.email || '' },
    });
    await c.query('UPDATE employee_profiles SET candidate_id=$2,recruiter_id=$3 WHERE id=$1', [
      e.id,
      candidate.id,
      j.recruiter_id,
    ]);
    await c.query(
      'INSERT INTO candidate_employee_links(application_id,candidate_id,employee_id,accepted_at,created_by) VALUES($1,$2,$3,now(),$4)',
      [j.id, candidate.id, e.id, a.id],
    );
    await c.query("UPDATE job_applications SET stage='HIRED',version=version+1 WHERE id=$1", [
      j.id,
    ]);
    await c.query(
      "INSERT INTO hr_application_events(application_id,actor_id,before_stage,after_stage,reason) VALUES($1,$2,$3,'HIRED','ONBOARDED')",
      [j.id, a.id, j.stage],
    );
    return { employee_id: e.id };
  });
  api('GET', '/employees/:id/salary-terms', async (c, a, b, q, p) => {
    need(hrV2(a));
    const e = await hrAccess(c, a, p.id);
    const terms = await rows(
      c,
      'SELECT * FROM employee_salary_terms WHERE employee_id=$1 ORDER BY effective_from DESC,revision DESC',
      [e.id],
    );
    const items = terms.map(({ encrypted_payload, ...t }) => ({
      ...t,
      payload: JSON.parse(decipher(encrypted_payload)),
    }));
    const current = items.find(
      (t) => t.effective_from <= localDate() && t.phase === e.employment_state,
    );
    return {
      items,
      current: current || null,
      future: items.filter((t) => t.effective_from > localDate()),
      legacy_current_value_available: !!e.payroll_cipher,
      legacy_availability: e.payroll_cipher ? 'LEGACY_UNKNOWN_EFFECTIVE' : null,
    };
  });
  api('POST', '/employees/:id/salary-terms', async (c, a, b, q, p) => {
    need(hrV2(a));
    const e = await hrAccess(c, a, p.id, true);
    const v = z
      .object({
        phase: z.enum(['PROBATION', 'OFFICIAL']),
        effective_from: date,
        currency: z.string().regex(/^[A-Z]{3}$/),
        payload: z
          .object({
            amount: z.string().regex(/^\d{1,18}(\.\d{1,10})?$/),
            gross_or_net: z.enum(['GROSS', 'NET', 'UNSPECIFIED']),
            basis: z.string().trim().min(1).max(1000),
            note: z.string().max(5000).default(''),
            reason: z.string().max(5000).default(''),
          })
          .strict(),
        supersedes_id: z.uuid().nullable().default(null),
        expected_employee_version: z.number().int(),
      })
      .strict()
      .parse(b);
    version(e, v.expected_employee_version);
    const old = await one(
      c,
      'SELECT * FROM employee_salary_terms WHERE employee_id=$1 AND phase=$2 AND effective_from=$3 ORDER BY revision DESC LIMIT 1',
      [e.id, v.phase, v.effective_from],
    );
    need(
      old ? old.id === v.supersedes_id : !v.supersedes_id,
      'Mốc lương đã có; cần correction đúng bản mới nhất',
      409,
      'SALARY_TERM_CONFLICT',
    );
    need(!old || v.payload.reason.trim(), 'Điều chỉnh cần lý do', 422, 'REASON_REQUIRED');
    const term = await one(
      c,
      `INSERT INTO employee_salary_terms(employee_id,phase,effective_from,revision,currency,encrypted_payload,supersedes_id,change_reason_code,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        e.id,
        v.phase,
        v.effective_from,
        (old?.revision || 0) + 1,
        v.currency,
        cipher(JSON.stringify(v.payload)),
        v.supersedes_id,
        old ? 'CORRECTION' : 'INITIAL_TERM',
        a.id,
      ],
    );
    await c.query('UPDATE employee_profiles SET version=version+1 WHERE id=$1', [e.id]);
    return { id: term.id, employee_version: e.version + 1 };
  });
  const contractSchema = z
    .object({
      number: z.string().trim().min(1).max(100),
      kind: z.enum(['PROBATION', 'OFFICIAL', 'EXTENSION', 'ADDENDUM']),
      status: z.enum(['DRAFT', 'SIGNED', 'ACTIVE', 'EXPIRED', 'SUPERSEDED']),
      signed_on: date,
      effective_from: date,
      expires_on: date.nullable(),
      asset_ids: z.array(z.uuid()).max(50).default([]),
      reason,
      supersedes_contract_id: z.uuid().nullable().default(null),
      contract_id: z.uuid().optional(),
      expected_version: z.number().int(),
      expected_employee_version: z.number().int(),
    })
    .strict();
  api('GET', '/employees/:id/contracts', async (c, a, b, q, p) => {
    need(hrV2(a));
    await hrAccess(c, a, p.id);
    return {
      items: await rows(
        c,
        'SELECT co.*,r.number,r.kind,r.status,r.signed_on,r.effective_from,r.expires_on,r.asset_ids,r.revision FROM employee_contracts co JOIN employee_contract_revisions r ON r.id=co.current_revision_id WHERE co.employee_id=$1 ORDER BY r.expires_on NULLS LAST,co.id',
        [p.id],
      ),
      history: await rows(
        c,
        'SELECT r.* FROM employee_contract_revisions r JOIN employee_contracts co ON co.id=r.contract_id WHERE co.employee_id=$1 ORDER BY r.created_at,r.id',
        [p.id],
      ),
    };
  });
  api('POST', '/employees/:id/contracts', async (c, a, b, q, p) => {
    need(hrV2(a));
    const e = await hrAccess(c, a, p.id, true),
      v = contractSchema.parse(b);
    version(e, v.expected_employee_version);
    need(
      !v.expires_on || v.expires_on >= v.effective_from,
      'Ngày hết hạn trước hiệu lực',
      422,
      'VALIDATION',
    );
    for (const id of v.asset_ids)
      need(
        await one(
          c,
          "SELECT d.id FROM employee_documents d WHERE d.asset_id=$1 AND d.employee_id=$2 AND d.classification='BASIC'",
          [id, e.id],
        ),
        'File hợp đồng phải thuộc hồ sơ và là tài liệu cơ bản',
        422,
        'ASSET_SCOPE',
      );
    let co = v.contract_id
      ? await one(c, 'SELECT * FROM employee_contracts WHERE id=$1 AND employee_id=$2 FOR UPDATE', [
          v.contract_id,
          e.id,
        ])
      : null;
    if (v.contract_id) {
      need(co, 'Không tìm thấy hợp đồng', 404, 'NOT_FOUND');
      version(co, v.expected_version);
    } else {
      need(v.expected_version === 0, 'Bản mới cần version 0', 422, 'VALIDATION');
      co = await one(
        c,
        'INSERT INTO employee_contracts(employee_id,supersedes_contract_id,version,created_by) VALUES($1,$2,1,$3) RETURNING *',
        [e.id, v.supersedes_contract_id, a.id],
      );
    }
    const rev = await one(
      c,
      `INSERT INTO employee_contract_revisions(contract_id,revision,number,kind,status,signed_on,effective_from,expires_on,asset_ids,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        co.id,
        co.current_revision_id ? co.version + 1 : 1,
        v.number,
        v.kind,
        v.status,
        v.signed_on,
        v.effective_from,
        v.expires_on,
        v.asset_ids,
        v.reason,
        a.id,
      ],
    );
    await c.query('UPDATE employee_contracts SET current_revision_id=$2,version=$3 WHERE id=$1', [
      co.id,
      rev.id,
      rev.revision,
    ]);
    await c.query('UPDATE employee_profiles SET version=version+1 WHERE id=$1', [e.id]);
    return { id: co.id, revision: rev.revision, employee_version: e.version + 1 };
  });
  api('GET', '/hr/birthdays', async (c, a, b, q) => {
    need(hrV2(a));
    const month = z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .parse(q.month || Number(localDate().slice(5, 7))),
      missing = q.missing === 'true';
    const employees = await rows(
      c,
      `SELECT id,name,birthday,'EMPLOYEE' AS entity_type FROM employee_profiles WHERE employment_state IN ('PROBATION','OFFICIAL') AND CASE WHEN $2 THEN birthday IS NULL ELSE extract(month FROM birthday)=$1 END ORDER BY extract(day FROM birthday),name,id LIMIT 100`,
      [month, missing],
    );
    const candidates = await rows(
      c,
      `SELECT c.id,r.title AS name,c.birthday,'CANDIDATE' AS entity_type FROM candidate_profiles c JOIN records r ON r.id=c.id WHERE CASE WHEN $2 THEN c.birthday IS NULL ELSE extract(month FROM c.birthday)=$1 END ORDER BY extract(day FROM c.birthday),r.title,c.id LIMIT 100`,
      [month, missing],
    );
    return { employees, candidates, month };
  });
  api('GET', '/hr/reminders', async (c, a) => {
    need(hrV2(a));
    const probation = await rows(
      c,
      "SELECT id,name,probation_end AS expires_on,version AS revision,'EMPLOYEE' AS object_type FROM employee_profiles WHERE employment_state='PROBATION' AND archived_at IS NULL AND probation_end IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hr_reminder_actions a WHERE a.object_id=employee_profiles.id) ORDER BY probation_end,id LIMIT 100",
    );
    return {
      items: [
        ...probation,
        ...(await rows(
          c,
          `SELECT co.id,e.name,r.expires_on,r.revision,'CONTRACT' AS object_type FROM employee_contracts co JOIN employee_contract_revisions r ON r.id=co.current_revision_id JOIN employee_profiles e ON e.id=co.employee_id WHERE r.expires_on IS NOT NULL AND r.status IN ('SIGNED','ACTIVE','EXPIRED') AND e.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM employee_contracts newer JOIN employee_contract_revisions nr ON nr.id=newer.current_revision_id WHERE newer.supersedes_contract_id=co.id AND nr.status IN ('ACTIVE','SIGNED')) AND NOT EXISTS(SELECT 1 FROM hr_reminder_actions h WHERE h.object_id=co.id) ORDER BY r.expires_on,co.id LIMIT 100`,
        )),
      ]
        .sort((a, b) => a.expires_on.localeCompare(b.expires_on))
        .slice(0, 100),
    };
  });
  api('POST', '/hr/reminders/:id/acknowledge', async (c, a, b, q, p) => {
    need(hrV2(a));
    const v = z.object({ reason }).strict().parse(b);
    const contract = await one(c, 'SELECT id FROM employee_contracts WHERE id=$1', [p.id]);
    need(
      contract || (await one(c, 'SELECT id FROM employee_profiles WHERE id=$1', [p.id])),
      'Không tìm thấy',
      404,
      'NOT_FOUND',
    );
    await c.query(
      'INSERT INTO hr_reminder_actions(object_type,object_id,reason,actor_id) VALUES($1,$2,$3,$4)',
      [contract ? 'CONTRACT' : 'EMPLOYEE', p.id, v.reason, a.id],
    );
    return { ok: true };
  });
}

export async function employmentV2(c: DB, a: Actor, id: string, b: any) {
  need(hrV2(a));
  const e = await hrAccess(c, a, id, true);
  const v = z
    .object({ phase: z.literal('OFFICIAL'), date, reason, expected_version: z.number().int() })
    .strict()
    .parse(b);
  version(e, v.expected_version);
  need(e.employment_state === 'PROBATION', 'Chỉ chuyển từ thử việc', 409, 'STATE');
  await c.query(
    "UPDATE employee_profiles SET employment_state='OFFICIAL',official_start=$2,version=version+1 WHERE id=$1",
    [e.id, v.date],
  );
  await c.query(
    "INSERT INTO employment_events(employee_id,kind,business_date,actor_id,payload) VALUES($1,'OFFICIAL',$2,$3,$4)",
    [e.id, v.date, a.id, JSON.stringify({ reason: v.reason })],
  );
  await employeeRevision(
    c,
    a,
    e.id,
    'OFFICIAL',
    basicSnapshot(e),
    basicSnapshot({ ...e, employment_state: 'OFFICIAL', official_start: v.date }),
  );
  return { ok: true };
}
