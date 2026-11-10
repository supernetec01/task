import React, { useState } from 'react';
import { api, fmt } from './api';
import { useLoad, Loaded, Empty, ErrorBox } from './ui';
export function NotificationInbox({ revision, onOpen, onEmployee }: any) {
  const [category, setCategory] = useState('ALL'),
    [unread, setUnread] = useState(false),
    [page, setPage] = useState(0),
    [rev, setRev] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<any>();
  const load = useLoad(
      '/notifications?' +
        new URLSearchParams({ category, unread: unread ? 'true' : '', page: String(page) }),
      revision + rev,
    ),
    data = load.data;
  async function act(fn: () => Promise<any>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setRev((x) => x + 1);
      window.dispatchEvent(new Event('sn-notifications-refresh'));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const count =
    category === 'KOC'
      ? data?.koc_unread_count
      : category === 'OTHER'
        ? (data?.unread_count || 0) - (data?.koc_unread_count || 0)
        : data?.unread_count;
  return (
    <>
      <div className="order-section-head">
        <div>
          <h2>Hộp thông báo</h2>
          <p className="muted">
            {data?.unread_count || 0} thông báo chưa đọc · Nhắc việc gửi đến người phụ trách
          </p>
        </div>
        <div className="actions">
          <button
            onClick={() => {
              setRev((x) => x + 1);
              window.dispatchEvent(new Event('sn-notifications-refresh'));
            }}
          >
            Tải lại thông báo
          </button>
          <button
            disabled={busy || !count}
            onClick={() => void act(() => api('/notifications/read-all', { category }))}
          >
            Đánh dấu tất cả đã đọc
          </button>
        </div>
      </div>
      <div className="notification-tabs" role="tablist" aria-label="Loại thông báo">
        {[
          ['ALL', 'Tất cả'],
          ['KOC', 'Đơn hàng KOC'],
          ['OTHER', 'Thông báo khác'],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={category === key}
            key={key}
            onClick={() => {
              setCategory(key);
              setPage(0);
            }}
          >
            {label}
            {key === 'KOC' && data?.koc_unread_count > 0 ? ` (${data.koc_unread_count})` : ''}
          </button>
        ))}
      </div>
      <section className="panel">
        <label className="check">
          <input
            type="checkbox"
            checked={unread}
            onChange={(e) => {
              setUnread(e.target.checked);
              setPage(0);
            }}
          />
          Chỉ hiện chưa đọc
        </label>
        <ErrorBox error={error} />
        <Loaded data={data} error={load.error}>
          {data?.items.length ? (
            <>
              {data.items.map((n: any) => (
                <article key={n.id} className={'notification-item ' + (!n.read_at ? 'unread' : '')}>
                  <i
                    className={
                      'dot ' +
                      (!n.read_at ? (n.event_type === 'KOC_VIDEO_2' ? 'red' : 'green') : '')
                    }
                  />
                  <div className="notification-item-content">
                    <small>
                      {fmt(n.created_at)} ·{' '}
                      {n.event_key.startsWith('koc-video:') ? 'Theo dõi KOC' : 'Thông báo'} ·{' '}
                      {n.read_at ? 'Đã đọc' : 'Chưa đọc'}
                    </small>
                    <p>{n.message}</p>
                    <div className="actions">
                      {n.action_path && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              if (!n.read_at) await api('/notifications/' + n.id + '/read', {});
                              await onOpen(n.action_path);
                            })
                          }
                        >
                          {n.event_key.startsWith('koc-video:')
                            ? 'Mở đơn hàng'
                            : 'Mở nội dung liên quan'}
                        </button>
                      )}
                      {!n.action_path && n.event_key.startsWith('contract:') && n.object_id && (
                        <button onClick={() => onEmployee(n.object_id)}>Mở hồ sơ nhân sự</button>
                      )}
                      {!n.read_at && (
                        <button
                          className="ghost"
                          disabled={busy}
                          onClick={() =>
                            void act(() => api('/notifications/' + n.id + '/read', {}))
                          }
                        >
                          Đánh dấu đã đọc
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              <div className="order-pagination">
                <small>{data.filtered_count} thông báo</small>
                <div className="actions">
                  <button disabled={!page} onClick={() => setPage(page - 1)}>
                    Trước
                  </button>
                  <button
                    disabled={(page + 1) * 100 >= data.filtered_count}
                    onClick={() => setPage(page + 1)}
                  >
                    Tiếp
                  </button>
                </div>
              </div>
            </>
          ) : (
            <Empty>
              {unread
                ? 'Bạn đã đọc hết thông báo trong mục này.'
                : 'Chưa có thông báo trong mục này.'}
            </Empty>
          )}
        </Loaded>
      </section>
    </>
  );
}
