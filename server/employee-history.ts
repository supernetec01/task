import { type DB, type Actor, cipher } from './base.js';

// Sensitive history is encrypted as a whole and never included in general audit/log payloads.
export async function employeeRevision(
  c: DB,
  a: Actor,
  id: string,
  action: string,
  before: unknown,
  after: unknown,
  category: 'BASIC' | 'PAYROLL' | 'SENSITIVE' = 'BASIC',
) {
  await c.query(
    'INSERT INTO employee_revisions(employee_id,actor_id,category,action,before_data,after_data,encrypted_change) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      id,
      a.id,
      category,
      action,
      category === 'BASIC' ? JSON.stringify(before) : null,
      category === 'BASIC' ? JSON.stringify(after) : null,
      category !== 'BASIC' ? cipher(JSON.stringify({ before, after })) : null,
    ],
  );
}

export function basicSnapshot(e: any, positions?: string[]) {
  return Object.fromEntries(
    [
      'employee_code',
      'name',
      'user_id',
      'birthday',
      'joined_on',
      'team_id',
      'manager_id',
      'employment_state',
      'employment_type',
      'probation_end',
      'contract_date',
      'contract_end',
      'left_on',
      'archived_at',
      'contact',
    ]
      .map((k) => [k, e[k] ?? null])
      .concat(positions ? [['positions', positions]] : []),
  );
}
