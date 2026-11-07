import React, { useEffect, useRef, type ReactNode } from 'react';

export function TaskDrawer({
  title,
  meta,
  children,
  footer,
  onClose,
  dirty = false,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    forms = useRef(new Set<HTMLFormElement>()),
    previous = useRef<HTMLElement | null>(null);
  const close = () => {
    const unsaved = dirty || [...forms.current].some((f) => f.isConnected);
    if (!unsaved || confirm('Bạn có thay đổi chưa lưu. Đóng và bỏ nội dung này?')) onClose();
  };
  useEffect(() => {
    const el = ref.current;
    previous.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el?.showModal();
    const saved = (event: Event) => {
      if (event.target instanceof HTMLFormElement) forms.current.delete(event.target);
    };
    el?.addEventListener('sn-saved', saved);
    return () => {
      el?.removeEventListener('sn-saved', saved);
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, []);
  return (
    <dialog
      className="task-drawer"
      ref={ref}
      aria-label="Chi tiết công việc"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onChange={(e) => {
        const target = e.target as HTMLElement;
        const form = target.closest('form');
        if (form) forms.current.add(form);
      }}
    >
      <header className="drawer-header">
        <div className="drawer-title">
          <div className="eyebrow">CHI TIẾT CÔNG VIỆC</div>
          <h2>{title}</h2>
          {meta}
        </div>
        <button type="button" className="ghost drawer-close" aria-label="Đóng" onClick={close}>
          ×
        </button>
      </header>
      <div className="drawer-body">{children}</div>
      <footer className="drawer-footer">
        {footer}
        <button type="button" aria-label="Đóng chi tiết" onClick={close}>
          Đóng
        </button>
      </footer>
    </dialog>
  );
}
