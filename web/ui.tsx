import { api } from './api';
import { requestKey } from './request-key';
import React, { useEffect, useState, useRef, type ReactNode } from 'react';
export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  fields?: Field[];
  hint?: string;
};
export function ErrorBox({ error }: { error: any }) {
  return error ? (
    <div className="error" role="alert">
      {error.message || String(error)}
      {error.fields?.map((f: any, i: number) => (
        <div key={i}>
          {f.path?.join(' › ')}: {f.message}
        </div>
      ))}
    </div>
  ) : null;
}
export function Empty({ children = 'Chưa có dữ liệu.' }: { children?: ReactNode }) {
  return (
    <div className="empty">
      <span>◇</span>
      <p>{children}</p>
    </div>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export const statusLabel: Record<string, string> = {
  DRAFT: 'Nháp',
  ASSIGNED: 'Chờ nhận',
  ACCEPTED: 'Đã nhận',
  IN_PROGRESS: 'Đang làm',
  SUBMITTED: 'Chờ duyệt',
  CHANGES_REQUESTED: 'Cần sửa',
  DONE: 'Hoàn thành',
  DECLINED: 'Từ chối',
  CANCELLED: 'Đã hủy',
  PENDING: 'Chờ phản hồi',
  REVOKED: 'Đã thu hồi',
  NOT_STARTED: 'Chưa bắt đầu',
  REPORTED_DONE: 'Đã báo xong',
  ON_TIME: 'Đúng hạn',
  LATE: 'Trễ hạn',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  NEEDS_INFO: 'Cần bổ sung',
  NEEDS_QUOTE: 'Đã duyệt nhu cầu · Cần báo giá',
  FULFILLED: 'Đã ghi nhận xử lý bên ngoài',
};
export const roleLabel: Record<string, string> = {
  CONTENT: 'Content',
  DESIGNER: 'Thiết kế',
  MARKETPLACE: 'Vận hành sàn',
  ADS: 'Quảng cáo',
  HR: 'Nhân sự',
  ACCOUNTANT: 'Kế toán',
  WAREHOUSE: 'Kho',
  INTERN: 'Thực tập sinh',
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý',
  BOSS: 'Sếp',
  EMPLOYEE: 'Nhân viên',
  HR_SENSITIVE: 'Hồ sơ nhạy cảm HR',
  COMMON: 'Bổ sung chung',
  TESTER_OPTIONAL: 'Kiểm thử',
};
export function FieldControl({
  field: f,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  const id = React.useId();
  if (f.type === 'array')
    return (
      <fieldset>
        <legend>{f.label}</legend>
        {(value || []).map((row: any, i: number) => (
          <div className="array-row" key={i}>
            {f.fields?.map((sub) => (
              <FieldControl
                key={sub.key}
                field={sub}
                value={row[sub.key]}
                onChange={(v) =>
                  onChange(value.map((r: any, n: number) => (n === i ? { ...r, [sub.key]: v } : r)))
                }
              />
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => onChange(value.filter((_: any, n: number) => n !== i))}
            >
              Bỏ dòng
            </button>
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => onChange([...(value || []), {}])}>
          + Thêm dòng
        </button>
      </fieldset>
    );
  const props = {
    id,
    name: f.key,
    'aria-label': f.label,
    required: f.required,
    value: value ?? '',
    onChange: (e: any) =>
      onChange(
        f.type === 'checkbox'
          ? e.target.checked
          : f.type === 'number'
            ? e.target.value === ''
              ? undefined
              : Number(e.target.value)
            : e.target.value,
      ),
  };
  return (
    <label className={f.type === 'checkbox' ? 'check' : ''} htmlFor={id}>
      {f.label}
      {f.required && ' *'}
      {f.type === 'select' ? (
        <select {...props}>
          <option value="">Chọn…</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.type === 'textarea' ? (
        <textarea {...props} rows={3} />
      ) : f.type === 'checkbox' ? (
        <input {...props} value={undefined} type="checkbox" checked={!!value} />
      ) : (
        <input {...props} type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} />
      )}{' '}
      {f.hint && <small>{f.hint}</small>}
    </label>
  );
}
export function Form({
  fields,
  initial = {},
  onSubmit,
  label = 'Lưu',
  children,
  onChange,
  secondary,
  extraFields = [],
  extraTitle,
  onConflict,
}: {
  fields: Field[];
  initial?: any;
  onSubmit: (v: any, key: string) => Promise<any>;
  label?: string;
  children?: ReactNode;
  onChange?: (v: any) => void;
  secondary?: ReactNode;
  extraFields?: Field[];
  extraTitle?: string;
  onConflict?: () => Promise<any>;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>(),
    [saved, setSaved] = useState(false);
  const key = useRef('');
  if (!key.current) key.current = requestKey();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (busy) return;
        setBusy(true);
        setSaved(false);
        setError(null);
        try {
          await onSubmit(value, key.current);
          key.current = requestKey();
          setSaved(true);
          form.dispatchEvent(new Event('sn-saved', { bubbles: true }));
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}
      onChange={() => setSaved(false)}
    >
      <div className="form-fields">
        {fields.map((f) => (
          <FieldControl
            key={f.key}
            field={f}
            value={value[f.key]}
            onChange={(v) => {
              const next = { ...value, [f.key]: v };
              setValue(next);
              onChange?.(next);
            }}
          />
        ))}
      </div>
      {extraFields.length > 0 && (
        <details className="specialized-fields">
          <summary>{extraTitle || 'Thông tin chuyên môn'}</summary>
          <div className="form-fields">
            {extraFields.map((f) => (
              <FieldControl
                key={f.key}
                field={f}
                value={value[f.key]}
                onChange={(v) => {
                  const next = { ...value, [f.key]: v };
                  setValue(next);
                  onChange?.(next);
                }}
              />
            ))}
          </div>
        </details>
      )}
      {children}
      <ErrorBox error={error} />
      <div className="form-footer">
        <button disabled={busy} className="primary">
          {busy ? 'Đang lưu…' : label}
        </button>
        {secondary}
        {error?.status === 409 && onConflict && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConflict();
                key.current = requestKey();
                setError(null);
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Lấy phiên bản mới, giữ nội dung đang nhập
          </button>
        )}
        {saved && <span role="status">Đã lưu thành công</span>}
      </div>
    </form>
  );
}
export function Modal({
  title,
  children,
  onClose,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    dirty = useRef(false);
  const close = () => {
    if (!dirty.current || confirm('Bạn có thay đổi trong biểu mẫu. Đóng và bỏ nội dung chưa lưu?'))
      onClose();
  };
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    const saved = () => {
      dirty.current = false;
    };
    el?.addEventListener('sn-saved', saved);
    return () => el?.removeEventListener('sn-saved', saved);
  }, []);
  return (
    <dialog
      className={compact ? 'compact-dialog' : undefined}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onChange={() => (dirty.current = true)}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="ghost" aria-label="Đóng" onClick={close}>
          ×
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function useLoad(path: string | null, revision = 0) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState<any>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    if (!path) return;
    api(path).then(
      (d) => {
        if (live) setData(d);
      },
      (e) => {
        if (live) setError(e);
      },
    );
    return () => {
      live = false;
    };
  }, [path, revision]);
  return { data, error };
}
export function Loaded({ data, error, children }: { data: any; error: any; children: ReactNode }) {
  return error ? (
    <ErrorBox error={error} />
  ) : !data ? (
    <div role="status" className="empty">
      Đang tải dữ liệu…
    </div>
  ) : (
    <>{children}</>
  );
}
export const options = (values: string[], labels: Record<string, string> = {}) =>
  values.map((v) => ({ value: v, label: labels[v] || v }));
