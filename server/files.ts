import { randomUUID } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { z } from 'zod';
import { type API } from './app.js';
import {
  one,
  need,
  dataDir,
  hash,
  audit,
  type Actor,
  type DB,
  hasJob,
  isAdmin,
  manages,
  management,
} from './base.js';
import { employeeRevision } from './employee-history.js';
import { hrAccess, sensitiveAllowed, payrollAllowed } from './employees.js';
import { taskAccess } from './tasks.js';
import { contentAccess } from './content.js';
import { hrV2 } from './handoff-access.js';
export async function recordAccess(c: DB, a: Actor, id: string, lock = false) {
  const r = await one(
    c,
    `SELECT r.*,u.team_id FROM records r JOIN users u ON u.id=r.owner_id WHERE r.id=$1 ${lock ? 'FOR UPDATE OF r' : ''}`,
    [id],
  );
  need(r, 'Không tìm thấy hồ sơ', 404, 'NOT_FOUND');
  if (r.module === 'hr' && hrV2(a)) return r;
  if (await one(c, 'SELECT id FROM content_items WHERE id=$1', [id])) {
    await contentAccess(c, a, id);
    return r;
  }
  if (await one(c, 'SELECT id FROM candidate_profiles WHERE id=$1', [id])) {
    need(hrV2(a), 'Không tìm thấy hồ sơ', 404, 'NOT_FOUND');
    return r;
  }
  need(
    isAdmin(a) ||
      (hasJob(a, r.role) &&
        (r.owner_id === a.id || manages(a, { id: r.owner_id, team_id: r.team_id }))),
    'Không tìm thấy hồ sơ',
    404,
    'NOT_FOUND',
  );
  return r;
}
export function sniff(ext: string, b: Buffer) {
  if (ext === 'pdf') return b.subarray(0, 5).toString() === '%PDF-';
  if (ext === 'png') return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (['jpg', 'jpeg'].includes(ext)) return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (['zip', 'docx', 'xlsx'].includes(ext)) return b[0] === 80 && b[1] === 75;
  if (ext === 'webp')
    return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  if (ext === 'mp4') return b.subarray(4, 8).toString() === 'ftyp';
  if (['txt', 'csv'].includes(ext)) return !b.includes(0);
  return false;
}
export function fileRoutes(api: API) {
  api('POST', '/task-attachments', async (c, a, b) => {
    need(a.grants.some((g) => g.kind === 'JOB') || management(a), 'Chưa có quyền tạo công việc');
    const ext = extname(b.filename).slice(1).toLowerCase();
    const allowed = (
      process.env.UPLOAD_EXTENSIONS || 'pdf,png,jpg,jpeg,webp,txt,csv,xlsx,docx,mp4,zip'
    ).split(',');
    need(
      allowed.includes(ext) && sniff(ext, b.buffer),
      'Loại/nội dung tệp không hợp lệ hoặc chưa được cho phép',
      422,
      'FILE_TYPE',
    );
    need(b.buffer.length > 0, 'Tệp rỗng', 422, 'FILE_EMPTY');
    const id = randomUUID(),
      key = id + '.' + ext,
      shared = b.fields.shared === 'true';
    await writeFile(join(dataDir, key), b.buffer, { mode: 0o600, flag: 'wx' });
    return one(
      c,
      'INSERT INTO staged_task_assets(id,uploaded_by,filename,storage_key,size,sha256,mime,shared) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,filename,size,shared',
      [
        id,
        a.id,
        String(b.filename)
          .replace(/[\\/\x00-\x1f]/g, '_')
          .slice(0, 200),
        key,
        b.buffer.length,
        hash(b.buffer),
        'application/octet-stream',
        shared,
      ],
    );
  });
  api('POST', '/assets', async (c, a, b) => {
    const v = z
      .object({
        task_id: z.uuid().optional(),
        record_id: z.uuid().optional(),
        employee_id: z.uuid().optional(),
        document_kind: z.string().trim().min(1).max(80).default('OTHER'),
        classification: z.enum(['BASIC', 'SENSITIVE']).default('BASIC'),
        shared: z.enum(['true', 'false']).default('false'),
      })
      .parse(b.fields);
    need(
      [v.task_id, v.record_id, v.employee_id].filter(Boolean).length === 1,
      'Cần đúng một công việc hoặc hồ sơ đính kèm',
      422,
      'VALIDATION',
    );
    let role = '';
    if (v.employee_id) {
      const e = await hrAccess(c, a, v.employee_id, true);
      need(!e.archived_at, 'Hồ sơ đã lưu trữ', 409, 'STATE');
      need(v.shared === 'false', 'Hồ sơ nhân sự không chia sẻ qua task', 422, 'VALIDATION');
      need(
        !['IDENTITY', 'PAYROLL', 'TAX', 'SOCIAL_INSURANCE'].includes(v.document_kind) ||
          v.classification === 'SENSITIVE',
        'Tài liệu định danh, thuế, BHXH và lương cần quyền hồ sơ nhạy cảm',
        422,
        'SENSITIVE_CLASSIFICATION',
      );
      if (v.classification === 'SENSITIVE')
        need(v.document_kind === 'PAYROLL' ? payrollAllowed(a) : await sensitiveAllowed(c, a, e));
      role = 'HR';
    } else if (v.task_id) {
      const x = await taskAccess(c, a, v.task_id, true);
      need(x.owner || x.manager || (x.support && x.s?.status === 'ACCEPTED'));
      need(!['DONE', 'CANCELLED'].includes(x.t.status), 'Công việc đã đóng', 409, 'STATE');
      role = x.owner || x.manager ? x.t.role : x.s.role;
      need(
        x.owner || x.manager || v.shared === 'true',
        'Tệp hỗ trợ phải được chia sẻ vào công việc',
        422,
        'VALIDATION',
      );
    } else {
      const r = await recordAccess(c, a, v.record_id!);
      need(
        r.owner_id === a.id ||
          isAdmin(a) ||
          (r.module === 'hr' && hrV2(a)) ||
          !!(await one(
            c,
            'SELECT id FROM content_items WHERE id=$1 AND (writer_id=$2 OR camera_operator_id=$2 OR editor_id=$2)',
            [r.id, a.id],
          )),
      );
      role = r.role;
    }
    const ext = extname(b.filename).slice(1).toLowerCase(),
      allowed = (
        process.env.UPLOAD_EXTENSIONS || 'pdf,png,jpg,jpeg,webp,txt,csv,xlsx,docx,mp4,zip'
      ).split(',');
    need(
      allowed.includes(ext) && sniff(ext, b.buffer),
      'Loại/nội dung tệp không hợp lệ hoặc chưa được cho phép',
      422,
      'FILE_TYPE',
    );
    need(b.buffer.length > 0, 'Tệp rỗng', 422, 'FILE_EMPTY');
    const id = randomUUID(),
      key = id + '.' + ext;
    await writeFile(join(dataDir, key), b.buffer, { mode: 0o600, flag: 'wx' });
    const f = await one(
      c,
      'INSERT INTO assets(id,task_id,record_id,uploaded_by,role,filename,storage_key,size,sha256,mime,shared,employee_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,filename,size,sha256',
      [
        id,
        v.task_id || null,
        v.record_id || null,
        a.id,
        role,
        String(b.filename)
          .replace(/[\\/\x00-\x1f]/g, '_')
          .slice(0, 200),
        key,
        b.buffer.length,
        hash(b.buffer),
        'application/octet-stream',
        v.shared === 'true',
        v.employee_id || null,
      ],
    );
    if (v.employee_id)
      await c.query(
        'INSERT INTO employee_documents(employee_id,asset_id,document_kind,classification) VALUES($1,$2,$3,$4)',
        [v.employee_id, id, v.document_kind, v.classification],
      );
    if (v.employee_id)
      await employeeRevision(
        c,
        a,
        v.employee_id,
        'DOCUMENT_UPLOADED',
        null,
        { asset_id: id, document_kind: v.document_kind, classification: v.classification },
        v.classification === 'BASIC'
          ? 'BASIC'
          : v.document_kind === 'PAYROLL'
            ? 'PAYROLL'
            : 'SENSITIVE',
      );
    await audit(c, a, 'FILE_UPLOADED', 'asset', id);
    return f;
  });
  api('GET', '/assets/:id/download', async (c, a, b, q, p, reply) => {
    const f = await one(c, 'SELECT * FROM assets WHERE id=$1', [p.id]);
    need(f, 'Không tìm thấy tệp', 404, 'NOT_FOUND');
    if (f.employee_id) {
      const e = await hrAccess(c, a, f.employee_id);
      const doc = await one(
        c,
        'SELECT classification,document_kind FROM employee_documents WHERE asset_id=$1 AND employee_id=$2',
        [f.id, e.id],
      );
      need(doc, 'Không tìm thấy tệp', 404, 'NOT_FOUND');
      if (doc.classification === 'SENSITIVE')
        need(doc.document_kind === 'PAYROLL' ? payrollAllowed(a) : await sensitiveAllowed(c, a, e));
    } else if (f.task_id) {
      const x = await taskAccess(c, a, f.task_id);
      need(x.owner || x.manager || (f.shared && x.support), 'Không tìm thấy tệp', 404, 'NOT_FOUND');
    } else await recordAccess(c, a, f.record_id);
    await audit(c, a, 'FILE_DOWNLOADED', 'asset', f.id);
    const buffer = await readFile(join(dataDir, f.storage_key));
    need(hash(buffer) === f.sha256, 'Tệp không khớp checksum', 500, 'FILE_INTEGRITY');
    if (q.preview === 'photo' && f.employee_id) {
      const doc = await one(
        c,
        "SELECT id FROM employee_documents WHERE asset_id=$1 AND classification='BASIC' AND document_kind='PHOTO'",
        [f.id],
      );
      const ext = extname(f.filename).slice(1).toLowerCase();
      need(
        doc && ['png', 'jpg', 'jpeg', 'webp'].includes(ext) && sniff(ext, buffer),
        'Không phải ảnh hồ sơ được phép',
        422,
        'PHOTO_INVALID',
      );
      reply.type(
        ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as any)[
          ext
        ],
      );
      return buffer;
    }
    reply
      .type('application/octet-stream')
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      );
    return buffer;
  });
}
