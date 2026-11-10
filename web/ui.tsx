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
  readonly?: boolean;
  section?: string;
};
export function ErrorBox({ error }: { error: any }) {
  return error ? (
    <div className="error" role="alert">
      {error.message || String(error)}
      {error.fields?.map((f: any, i: number) => (
        <div key={i}>
          {f.path
            ?.map(
              (p: string) =>
                (
                  ({
                    username: 'Tên đăng nhập',
                    employee_code: 'Mã nhân sự',
                    name: 'Họ tên',
                    password: 'Mật khẩu',
                    email: 'Email',
                    team_id: 'Bộ phận',
                  }) as Record<string, string>
                )[p] || p,
            )
            .join(' › ')}
          : {f.message}
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
  WAITING: 'Chưa thực hiện',
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
  CONTENT: 'Content Marketing',
  MARKETPLACE: 'Vận hành sàn',
  HR: 'Nhân sự',
  ADMIN: 'Quản trị viên',
  BOSS: 'Sếp',
  COMMON: 'Bổ sung chung',
};
export function FieldControl({
  field: f,
  value,
  onChange,
  error,
}: {
  field: Field;
  value: any;
  error?: string;
  onChange: (v: any) => void;
}) {
  const id = React.useId();
  if (f.type === 'multi-select')
    return (
      <fieldset>
        <legend>{f.label}</legend>
        <div className="check-grid">
          {f.options?.map((o) => (
            <label className="check" key={o.value}>
              <input
                type="checkbox"
                checked={(value || []).includes(o.value)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...(value || []), o.value]
                      : (value || []).filter((v: string) => v !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          ))}
        </div>
        {f.hint && <small>{f.hint}</small>}
      </fieldset>
    );
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
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? id + '-error' : undefined,
    required: f.required,
    disabled: f.readonly,
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
      {error && (
        <small className="field-error" id={id + '-error'}>
          {error}
        </small>
      )}
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
  specializedInline = false,
  childrenBeforeExtra = false,
  onConflict,
  activeSection,
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
  specializedInline?: boolean;
  childrenBeforeExtra?: boolean;
  onConflict?: () => Promise<any>;
  activeSection?: string;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>(),
    [saved, setSaved] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error) return;
    const summary = errorRef.current;
    summary?.scrollIntoView({ block: 'nearest' });
    summary?.focus();
    const field =
      error.fields?.[0]?.path?.[0] ||
      (error.code === 'EMPLOYEE_CODE_EXISTS' ? 'employee_code' : null);
    if (field) {
      const control = Array.from(
        summary?.closest('form')?.querySelectorAll<HTMLInputElement>('input,select,textarea') || [],
      ).find((x) => x.name === field);
      control?.setAttribute('aria-invalid', 'true');
      control?.setAttribute('aria-describedby', summary?.id || '');
      control?.focus();
    }
  }, [error]);
  const summaryId = React.useId();
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
          delete form.dataset.dirty;
          const secrets = [...fields, ...extraFields]
            .filter((f) => f.type === 'password')
            .map((f) => f.key);
          if (secrets.length)
            setValue((current: any) => ({
              ...current,
              ...Object.fromEntries(secrets.map((k) => [k, ''])),
            }));
          key.current = requestKey();
          setSaved(true);
          form.dispatchEvent(new Event('sn-saved', { bubbles: true }));
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}
      onChange={(e) => {
        e.currentTarget.dataset.dirty = 'true';
        setSaved(false);
        (e.target as HTMLElement).removeAttribute('aria-invalid');
      }}
    >
      <div ref={errorRef} id={summaryId} tabIndex={-1} className="form-error-summary">
        <ErrorBox error={error} />
      </div>
      <div className="form-fields">
        {fields.map((f) => {
          const control = (
            <FieldControl
              key={f.key}
              field={f}
              value={value[f.key]}
              error={
                error?.fields?.find((e: any) => e.path?.[0] === f.key)?.message ||
                (error?.code === 'EMPLOYEE_CODE_EXISTS' && f.key === 'employee_code'
                  ? error.message
                  : undefined)
              }
              onChange={(v) => {
                const next = { ...value, [f.key]: v };
                setValue(next);
                onChange?.(next);
              }}
            />
          );
          return activeSection ? (
            <div key={f.key} hidden={!!f.section && f.section !== activeSection}>
              {control}
            </div>
          ) : (
            control
          );
        })}
      </div>
      {childrenBeforeExtra && children}
      {extraFields.length > 0 && (
        <details className="specialized-fields" open={specializedInline || undefined}>
          <summary>{extraTitle || 'Thông tin chuyên môn'}</summary>
          <div className="form-fields">
            {extraFields.map((f, i) => (
              <React.Fragment key={f.key}>
                {f.section && (i === 0 || extraFields[i - 1].section !== f.section) && (
                  <h4 className="form-section-title">{f.section}</h4>
                )}
                <FieldControl
                  key={f.key}
                  field={f}
                  value={value[f.key]}
                  error={error?.fields?.find((e: any) => e.path?.[0] === f.key)?.message}
                  onChange={(v) => {
                    const next = { ...value, [f.key]: v };
                    setValue(next);
                    onChange?.(next);
                  }}
                />
              </React.Fragment>
            ))}
          </div>
        </details>
      )}
      {!childrenBeforeExtra && children}
      <div className="form-footer">
        <button
          disabled={busy || (fields.length > 0 && fields.every((f) => f.readonly))}
          className="primary"
        >
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
  values.map((v) => ({ value: v, label: labels[v] || businessLabels[v] || v }));

export function useHourlyRefresh(refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    const timer = setInterval(() => latest.current(), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);
}

export const businessLabels: Record<string, string> = {
  PURCHASE: 'Mua hàng',
  RENTAL: 'Thuê dịch vụ / thiết bị',
  EQUIPMENT_LOAN: 'Mượn thiết bị',
  SAMPLE_ISSUE: 'Đề nghị xuất mẫu',
  ADVANCE: 'Tạm ứng',
  REIMBURSEMENT: 'Hoàn chi',
  SALES_INVOICE_REQUEST: 'Yêu cầu xuất hóa đơn',
  DOCUMENT_COLLECTION: 'Thu chứng từ',
  UNSPECIFIED: 'Chưa xác định',
  CLAIMED: 'Đã yêu cầu',
  APPROVED: 'Đã duyệt',
  RECEIVED: 'Đã nhận',
  PERIOD: 'Theo kỳ',
  SNAPSHOT: 'Tại thời điểm',
  PERIOD_UNIQUE: 'Duy nhất trong kỳ',
  RATIO: 'Tỷ lệ',
  CUMULATIVE: 'Lũy kế',
  SALES: 'Bán hàng',
  ADS: 'Quảng cáo',
  VIDEO: 'Video',
  LIVE: 'Livestream',
  gmv: 'Tổng giá trị hàng hóa (GMV)',
  total_revenue: 'Doanh thu',
  orders: 'Số đơn',
  items_sold: 'Số sản phẩm bán',
  refunds_amount: 'Giá trị hoàn',
  sku_orders: 'Đơn theo SKU',
  page_views: 'Lượt xem trang',
  visitors: 'Khách truy cập duy nhất',
  customers: 'Khách mua duy nhất',
  product_impressions: 'Lượt hiển thị sản phẩm',
  unique_product_impressions: 'Người xem sản phẩm duy nhất',
  product_clicks: 'Lượt nhấp sản phẩm',
  conversion_rate: 'Tỷ lệ chuyển đổi',
  ad_spend: 'Chi phí quảng cáo',
  impressions: 'Lượt hiển thị',
  unique_impressions: 'Người xem duy nhất',
  clicks: 'Lượt nhấp',
  conversions: 'Chuyển đổi',
  attributed_gmv: 'GMV quy thuộc',
  views: 'Lượt xem',
  likes: 'Lượt thích',
  comments: 'Bình luận',
  shares: 'Lượt chia sẻ',
  DAY: 'Theo ngày',
  WEEK: 'Theo tuần',
  MONTH: 'Theo tháng',
  ROW: 'Theo dòng dữ liệu',
  ORDER: 'Theo đơn hàng',
  SUM: 'Cộng tổng',
  LATEST: 'Giá trị mới nhất',
  UNIQUE: 'Số lượng duy nhất',
  AVERAGE: 'Trung bình',
};
