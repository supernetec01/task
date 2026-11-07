import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskDeadlineLabel } from '../web/tasks.js';
test('F08 · on-time submission awaiting late approval never appears overdue', () => {
  const due = '2026-11-01T10:00:00Z',
    now = Date.parse('2026-11-03T10:00:00Z');
  assert.deepEqual(
    taskDeadlineLabel(
      { status: 'SUBMITTED', due_at: due, submissions: [{ submitted_at: due }] },
      now,
    ),
    { label: 'Đã nộp đúng hạn · Chờ duyệt', late: false },
  );
  assert.equal(taskDeadlineLabel({ status: 'IN_PROGRESS', due_at: due }, now).late, true);
  assert.equal(
    taskDeadlineLabel(
      { status: 'SUBMITTED', due_at: due, submissions: [{ submitted_at: '2026-11-02T10:00:00Z' }] },
      now,
    ).label,
    'Đã nộp trễ hạn · Chờ duyệt',
  );
  assert.equal(
    taskDeadlineLabel({ status: 'DONE', due_at: due, timing: 'ON_TIME' }, now).late,
    false,
  );
});
