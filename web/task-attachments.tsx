import React, { useState } from 'react';
import { api } from './api';
import { Form, useLoad, options, roleLabel } from './ui';
export function Transfer({ t, onDone }: { t: any; onDone: () => void }) {
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
            Object.keys(roleLabel).filter((r) => ['CONTENT', 'MARKETPLACE', 'HR'].includes(r)),
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
