import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { type API } from './app.js';
import {
  type DB,
  type Actor,
  one,
  rows,
  need,
  isAdmin,
  hasJob,
  management,
  jobs,
  audit,
  version,
} from './base.js';

export async function seedTemplateMigration(c: DB) {
  const seed = JSON.parse(readFileSync('config/task_templates.json', 'utf8')).templates;
  for (const t of seed) {
    await c.query('INSERT INTO task_templates(code,enabled) VALUES($1,$2)', [t.code, t.enabled]);
    await c.query('INSERT INTO task_template_versions(code,version,definition) VALUES($1,1,$2)', [
      t.code,
      JSON.stringify(t),
    ]);
    for (const role of t.roles)
      await c.query('INSERT INTO task_template_roles(code,role) VALUES($1,$2)', [t.code, role]);
  }
  await snapshotLegacyTasks(c);
}
export async function snapshotLegacyTasks(c: DB) {
  const seed = JSON.parse(readFileSync('config/task_templates.json', 'utf8')).templates;
  const legacy = JSON.parse(readFileSync('config/legacy_task_templates.json', 'utf8')).templates;
  const oldTasks = await rows(
    c,
    "SELECT id,type,template_version FROM tasks WHERE template_snapshot='{}'::jsonb",
  );
  for (const t of oldTasks) {
    const old = legacy.find((v: any) => v.code === t.type);
    const definition = {
      ...(old || legacy.find((v: any) => v.code === 'OTHER')),
      code: t.type,
      version: t.template_version,
      group: 'Mẫu lịch sử',
      output_policy: ['EDIT', 'SHOOT', 'DESIGN'].includes(t.type)
        ? 'ARTIFACT_REQUIRED'
        : 'TEXT_OR_ARTIFACT',
      legacy_contract: old ? 'ORIGINAL_TEMPLATE' : 'OTHER_V1_USED_BEFORE_REGISTRY',
    };
    const current = seed.find((v: any) => v.code === t.type);
    definition.name = current?.name || old?.name || 'Công việc lịch sử';
    await c.query('UPDATE tasks SET template_snapshot=$2 WHERE id=$1', [
      t.id,
      JSON.stringify(definition),
    ]);
  }
}
export async function currentTemplate(c: DB, code: string, role: string) {
  const t = await one(
    c,
    'SELECT v.* FROM task_templates t JOIN task_template_versions v ON v.code=t.code AND v.version=t.current_version JOIN task_template_roles r ON r.code=t.code WHERE t.code=$1 AND r.role=$2 AND t.enabled',
    [code, role],
  );
  need(
    t,
    'Mẫu công việc chưa được cấu hình hoặc đã tắt cho vai trò này. Liên hệ quản trị viên.',
    422,
    'TEMPLATE_CONFIG_REQUIRED',
  );
  return t;
}
export function taskTemplate(t: any) {
  need(
    t.template_snapshot?.code === t.type && Array.isArray(t.template_snapshot.fields),
    'Công việc chưa có phiên bản mẫu hợp lệ. Cần kiểm tra migration.',
    422,
    'TEMPLATE_CONFIG_REQUIRED',
  );
  return t.template_snapshot;
}
export async function availableTemplates(c: DB, a: Actor) {
  const all = await rows(
    c,
    'SELECT t.code,t.enabled,v.version,v.definition,array_agg(r.role ORDER BY r.role) AS roles FROM task_templates t JOIN task_template_versions v ON v.code=t.code AND v.version=t.current_version JOIN task_template_roles r ON r.code=t.code WHERE t.enabled GROUP BY t.code,v.id',
  );
  const allowed = all.filter(
    (t) => isAdmin(a) || management(a) || t.roles.some((r: string) => hasJob(a, r)),
  );
  const catalog: Record<string, string[]> = {};
  for (const t of allowed)
    for (const role of t.roles)
      if (isAdmin(a) || management(a) || hasJob(a, role)) (catalog[role] ||= []).push(t.code);
  return {
    items: allowed.map((t) => ({
      ...t.definition,
      version: t.version,
      roles: t.roles,
      enabled: t.enabled,
    })),
    catalog,
  };
}
const nestedType = z.enum(['string', 'url', 'date', 'integer', 'decimal', 'decimal_nullable']);
const field = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().trim().min(1).max(150),
  type: z.enum([
    'string',
    'url',
    'date',
    'datetime',
    'boolean',
    'decimal',
    'array',
    'metric_array',
    'reference',
    'reference_array',
    'link_array',
  ]),
  phase: z.enum(['WORK', 'SUBMIT']),
  required_at_action: z.boolean(),
  items: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), nestedType).optional(),
});
const edit = z.object({
  name: z.string().trim().min(1).max(150),
  group: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  roles: z.array(z.string()).min(1).max(20),
  fields: z.array(field).max(60),
  checkpoints: z.array(z.string().trim().min(1).max(150)).max(50),
  output_policy: z.enum(['TEXT_OR_ARTIFACT', 'ARTIFACT_REQUIRED']),
  ready_gate_enabled: z.boolean().default(false),
  reason: z.string().trim().min(1).max(1000),
});
export function templateRoutes(api: API) {
  api('GET', '/admin/task-templates', async (c, a) => {
    need(isAdmin(a));
    const list = await rows(
      c,
      "SELECT t.*,t.current_version AS version,v.definition FROM task_templates t JOIN task_template_versions v ON v.code=t.code AND v.version=t.current_version ORDER BY v.definition->>'group',v.definition->>'name'",
    );
    for (const t of list) {
      t.roles = (
        await rows(c, 'SELECT role FROM task_template_roles WHERE code=$1 ORDER BY role', [t.code])
      ).map((r) => r.role);
      t.history = await rows(
        c,
        'SELECT id,version,created_at FROM task_template_versions WHERE code=$1 ORDER BY version DESC',
        [t.code],
      );
    }
    return { items: list, jobs };
  });
  async function save(c: DB, a: Actor, b: any, code: string, create: boolean) {
    need(isAdmin(a));
    need(/^[A-Z][A-Z0-9_]{1,63}$/.test(code), 'Mã mẫu không hợp lệ', 422, 'VALIDATION');
    const v = edit.parse(b);
    need(
      v.roles.every((r) => jobs.includes(r)) && new Set(v.roles).size === v.roles.length,
      'Vai trò không hợp lệ hoặc trùng',
      422,
      'VALIDATION',
    );
    need(
      new Set(v.fields.map((f) => f.key)).size === v.fields.length,
      'Trường chuyên môn bị trùng mã',
      422,
      'VALIDATION',
    );
    const old = await one(
      c,
      'SELECT *,current_version AS version FROM task_templates WHERE code=$1 FOR UPDATE',
      [code],
    );
    need(
      create ? !old : !!old,
      create ? 'Mã mẫu đã tồn tại' : 'Không tìm thấy mẫu',
      create ? 409 : 404,
      create ? 'CONFLICT' : 'NOT_FOUND',
    );
    if (old) version(old, b.expected_version);
    need(
      code !== 'OTHER' || (v.enabled && jobs.every((r) => v.roles.includes(r))),
      'Mẫu công việc chung phải bật cho mọi chuyên môn',
      422,
      'VALIDATION',
    );
    const n = old ? old.current_version + 1 : 1;
    const previous = old
      ? await one(c, 'SELECT definition FROM task_template_versions WHERE code=$1 AND version=$2', [
          code,
          old.current_version,
        ])
      : null;
    const definition = {
      ...(previous?.definition || {}),
      code,
      version: n,
      name: v.name,
      group: v.group,
      fields: v.fields,
      checkpoints: v.checkpoints,
      output_policy: v.output_policy,
      ready_gate_enabled: v.ready_gate_enabled,
      roles: v.roles,
      enabled: v.enabled,
      submission_rule: previous?.definition?.submission_rule || {
        any_of: ['result_text', 'ready_asset_id', 'valid_url'],
      },
    };
    if (create)
      await c.query(
        'INSERT INTO task_templates(code,current_version,enabled,updated_by) VALUES($1,$2,$3,$4)',
        [code, n, v.enabled, a.id],
      );
    const record = await one(
      c,
      'INSERT INTO task_template_versions(code,version,definition,created_by) VALUES($1,$2,$3,$4) RETURNING id',
      [code, n, JSON.stringify(definition), a.id],
    );
    await c.query(
      'UPDATE task_templates SET current_version=$2,enabled=$3,updated_by=$4,updated_at=now() WHERE code=$1',
      [code, n, v.enabled, a.id],
    );
    await c.query('DELETE FROM task_template_roles WHERE code=$1', [code]);
    for (const role of v.roles)
      await c.query('INSERT INTO task_template_roles(code,role) VALUES($1,$2)', [code, role]);
    await audit(c, a, 'TASK_TEMPLATE_VERSION_CREATED', 'task_template', code, {
      version: n,
      reason: v.reason,
    });
    return { code, version: n, id: record.id };
  }
  api('POST', '/admin/task-templates', async (c, a, b) => save(c, a, b, b.code, true));
  api('POST', '/admin/task-templates/:code/versions', async (c, a, b, q, p) =>
    save(c, a, b, p.code, false),
  );
}
