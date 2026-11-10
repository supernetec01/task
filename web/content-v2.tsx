import React, { useState } from 'react';
import { api, iso, localInput, fmt } from './api';
import { Form, Loaded, useLoad, Empty, ErrorBox } from './ui';
import { TaskDrawer } from './task-drawer';
import { SourceWorkspace } from './sources';
const stageNames: Record<string, string> = {
  SCRIPTING: 'Đang viết kịch bản',
  WAITING_SHOOT: 'Chờ quay',
  WAITING_EDIT: 'Chờ dựng',
  CLIP_READY: 'Clip hoàn chỉnh',
};
const options = (items: any[]) => items.map((x) => ({ value: x.id, label: x.name || x.label }));
export function ContentWorkspace() {
  const [tab, setTab] = useState('content'),
    [rev, setRev] = useState(0),
    [selected, setSelected] = useState(''),
    [showCreate, setShowCreate] = useState(false),
    [filter, setFilter] = useState('');
  const list = useLoad('/content-items' + (filter ? '?stage=' + filter : ''), rev),
    publications = useLoad('/publications', rev),
    people = useLoad('/staff-directory');
  return (
    <>
      <div className="tabs">
        {[
          ['content', 'Sản xuất nội dung'],
          ['publications', 'Video đã đăng'],
          ['import', 'Nhập hiệu quả video'],
        ].map(([v, l]) => (
          <button className={tab === v ? 'active' : ''} key={v} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'content' && (
        <div className="panel">
          <div className="toolbar">
            <button className="primary" onClick={() => setShowCreate(true)}>
              Thêm nội dung
            </button>
            <label>
              Giai đoạn
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">Tất cả</option>
                {Object.entries(stageNames).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setRev((n) => n + 1)}>Tải lại</button>
          </div>
          <Loaded data={list.data} error={list.error}>
            {!list.data?.items.length ? (
              <Empty />
            ) : (
              <div className="handoff-cards">
                {list.data.items.map((r: any) => (
                  <button className="panel" key={r.id} onClick={() => setSelected(r.id)}>
                    <strong>{r.title}</strong>
                    <p>{stageNames[r.stage]}</p>
                    <p>Hạn: {fmt(r.due_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </Loaded>
        </div>
      )}
      {tab === 'publications' && (
        <div className="panel">
          <h2>Video đã đăng · từng lượt đăng</h2>
          <Loaded data={publications.data} error={publications.error}>
            {!publications.data?.items.length ? (
              <Empty />
            ) : (
              publications.data.items.map((p: any) => (
                <article className="panel" key={p.id}>
                  <a href={p.original_url} target="_blank" rel="noreferrer">
                    {p.title}
                  </a>
                  <p>
                    {p.origin === 'HISTORICAL_IMPORT'
                      ? 'Chưa liên kết nội dung'
                      : 'Nội dung đã liên kết'}{' '}
                    · {fmt(p.published_at)}
                  </p>
                  {p.snapshots[0] && (
                    <p>
                      Ngày đăng nguyên nguồn: {p.snapshots[0].published_raw} · Ngày thu thập nguyên
                      nguồn: {p.snapshots[0].collected_raw}
                    </p>
                  )}
                  <p>
                    D7: {p.d7.status} · GMV: {p.d7.gmv ?? 'N/A'}
                  </p>
                  {p.snapshots.length > 0 && (
                    <p>
                      Lượt xem: {p.snapshots[0].views} · Thích: {p.snapshots[0].likes} · Bình luận:{' '}
                      {p.snapshots[0].comments} · Chia sẻ: {p.snapshots[0].shares}
                    </p>
                  )}
                  {p.published_precision === 'UNKNOWN' && (
                    <Form
                      fields={[
                        {
                          key: 'published_at',
                          label: 'Ngày giờ đăng xác minh (giờ Việt Nam)',
                          type: 'datetime-local',
                          required: true,
                        },
                        { key: 'source', label: 'Căn cứ xác nhận thời gian', required: true },
                      ]}
                      onSubmit={async (v) => {
                        await api('/publications/' + p.id + '/confirm-date', {
                          ...v,
                          published_at: iso(v.published_at),
                          precision: 'MINUTE',
                          expected_version: p.version,
                        });
                        setRev((n) => n + 1);
                      }}
                      label="Xác nhận thời gian đăng"
                    />
                  )}
                  {['MISSING_SOURCE', 'READY'].includes(p.d7.status) && (
                    <WindowEvidence publication={p} onChanged={() => setRev((n) => n + 1)} />
                  )}
                </article>
              ))
            )}
          </Loaded>
        </div>
      )}
      {tab === 'import' && <SourceWorkspace video />}
      {showCreate && (
        <TaskDrawer
          title="Thêm hồ sơ nội dung"
          dialogLabel="Thêm hồ sơ nội dung"
          onClose={() => setShowCreate(false)}
        >
          <Form
            fields={[
              { key: 'title', label: 'Tên nội dung', required: true },
              { key: 'brief', label: 'Mục tiêu / brief', type: 'textarea' },
              {
                key: 'writer_id',
                label: 'Người viết kịch bản',
                type: 'select',
                options: options(people.data?.items || []),
              },
            ]}
            initial={{ brief: '' }}
            onSubmit={async (v) => {
              const r = await api('/content-items', { ...v, writer_id: v.writer_id || null });
              setShowCreate(false);
              setSelected(r.id);
              setRev((n) => n + 1);
            }}
            label="Lưu hồ sơ nội dung"
          />
        </TaskDrawer>
      )}
      {selected && (
        <ContentEditor
          id={selected}
          onClose={() => setSelected('')}
          onChanged={() => setRev((n) => n + 1)}
        />
      )}
    </>
  );
}
function ContentEditor({ id, onClose, onChanged }: any) {
  const [rev, setRev] = useState(0),
    [notice, setNotice] = useState(''),
    [editorTab, setEditorTab] = useState('production'),
    [newAssets, setNewAssets] = useState<any[]>([]);
  const load = useLoad('/content-items/' + id, rev),
    people = useLoad('/staff-directory'),
    resources = useLoad('/resources');
  const item = load.data;
  const assetList = [
    ...(item?.assets || []),
    ...newAssets.filter((f) => !item?.assets.some((a: any) => a.id === f.id)),
  ];
  const refresh = () => {
    setNotice('Đã lưu thành công');
    setRev((n) => n + 1);
    onChanged();
  };
  const p = options(people.data?.items || []);
  const upload = async (f: File) => {
    const body = new FormData();
    body.append('record_id', id);
    body.append('file', f);
    const asset = await api('/assets', body);
    setNewAssets((current) => [...current, asset]);
    setNotice('Đã tải tài liệu; bản đang nhập được giữ nguyên.');
  };
  return (
    <TaskDrawer
      title={item?.title || 'Đang tải nội dung…'}
      onClose={onClose}
      dialogLabel="Hồ sơ sản xuất nội dung"
    >
      {notice && <p role="status">{notice}</p>}
      <Loaded data={item} error={load.error}>
        {item && (
          <>
            <p>{stageNames[item.stage]}</p>
            <div className="tabs">
              <button
                className={editorTab === 'info' ? 'active' : ''}
                onClick={() => setEditorTab('info')}
              >
                Thông tin nội dung
              </button>
              <button
                className={editorTab === 'production' ? 'active' : ''}
                onClick={() => setEditorTab('production')}
              >
                Kịch bản / quay / dựng
              </button>
            </div>
            <Form
              key={item.version}
              activeSection={editorTab}
              fields={[
                { key: 'title', label: 'Tên nội dung', required: true },
                { key: 'brief', label: 'Brief', type: 'textarea' },
                { key: 'writer_id', label: 'Người viết', type: 'select', options: p },
                { key: 'script_text', label: 'Lời thoại / kịch bản', type: 'textarea' },
                {
                  key: 'script_asset_ids',
                  label: 'Tài liệu kịch bản',
                  type: 'multi-select',
                  options: options(assetList.map((f: any) => ({ ...f, name: f.filename }))),
                },
                {
                  key: 'raw_asset_ids',
                  label: 'File tư liệu quay',
                  type: 'multi-select',
                  options: options(assetList.map((f: any) => ({ ...f, name: f.filename }))),
                },
                {
                  key: 'final_asset_ids',
                  label: 'File clip hoàn chỉnh',
                  type: 'multi-select',
                  options: options(assetList.map((f: any) => ({ ...f, name: f.filename }))),
                },
                { key: 'camera_operator_id', label: 'Người quay', type: 'select', options: p },
                { key: 'editor_id', label: 'Người dựng', type: 'select', options: p },
                {
                  key: 'scheduled_shoot_at',
                  label: 'Lịch quay dự kiến (giờ Việt Nam)',
                  type: 'datetime-local',
                },
                { key: 'shoot_location', label: 'Địa điểm quay' },
                { key: 'actual_shot_at', label: 'Ngày giờ quay thực tế', type: 'datetime-local' },
                { key: 'edited_at', label: 'Ngày giờ dựng xong', type: 'datetime-local' },
                { key: 'no_actor_note', label: 'Ghi chú không có diễn viên' },
                {
                  key: 'participants',
                  label: 'Người tham gia',
                  type: 'array',
                  fields: [
                    { key: 'user_id', label: 'Người nội bộ', type: 'select', options: p },
                    { key: 'external_name', label: 'Hoặc tên người ngoài' },
                    {
                      key: 'participant_role',
                      label: 'Vai trò tham gia',
                      type: 'select',
                      options: ['ACTOR', 'CAMERA', 'EDITOR', 'SUPPORT'].map((value) => ({
                        value,
                        label: value,
                      })),
                    },
                    { key: 'note', label: 'Ghi chú' },
                  ],
                },
                { key: 'raw_url', label: 'Link tư liệu quay', type: 'url' },
                { key: 'final_url', label: 'Link clip hoàn chỉnh', type: 'url' },
              ]
                .filter(
                  (f) =>
                    item.capabilities.structure ||
                    (item.capabilities.script &&
                      ['script_text', 'script_asset_ids'].includes(f.key)) ||
                    (item.capabilities.shoot &&
                      [
                        'shoot_location',
                        'actual_shot_at',
                        'raw_url',
                        'raw_asset_ids',
                        'no_actor_note',
                      ].includes(f.key)) ||
                    (item.capabilities.edit &&
                      ['edited_at', 'final_url', 'final_asset_ids'].includes(f.key)),
                )
                .map((f) => ({
                  ...f,
                  section: [
                    'title',
                    'brief',
                    'writer_id',
                    'camera_operator_id',
                    'editor_id',
                    'scheduled_shoot_at',
                  ].includes(f.key)
                    ? 'info'
                    : 'production',
                }))}
              initial={{
                script_asset_ids: item.script_asset_ids || [],
                raw_asset_ids: item.raw_asset_ids || [],
                final_asset_ids: item.final_asset_ids || [],
                title: item.title,
                brief: item.brief,
                writer_id: item.writer_id || '',
                camera_operator_id: item.camera_operator_id || '',
                editor_id: item.editor_id || '',
                script_text: item.script_text,
                shoot_location: item.shoot_location || '',
                scheduled_shoot_at: localInput(item.scheduled_shoot_at),
                actual_shot_at: localInput(item.actual_shot_at),
                edited_at: localInput(item.edited_at),
                no_actor_note: item.no_actor_note,
                participants: item.participants.map((p: any) => ({
                  user_id: p.user_id || '',
                  external_name: p.external_name || '',
                  participant_role: p.participant_role,
                  note: p.note || '',
                })),
                raw_url: item.raw_links[0] || '',
                final_url: item.final_links[0] || '',
              }}
              onSubmit={async (v) => {
                const { raw_url, final_url, ...body } = v;
                const fullBody: any = {
                  ...body,
                  writer_id: v.writer_id || null,
                  camera_operator_id: v.camera_operator_id || null,
                  editor_id: v.editor_id || null,
                  scheduled_shoot_at: iso(v.scheduled_shoot_at),
                  actual_shot_at: iso(v.actual_shot_at),
                  edited_at: iso(v.edited_at),
                  raw_links: raw_url ? [raw_url] : [],
                  final_links: final_url ? [final_url] : [],
                  participants: (v.participants || []).map((p: any) => ({
                    ...p,
                    user_id: p.user_id || null,
                    external_name: p.external_name || null,
                  })),
                  expected_version: item.version,
                };
                const allowed = new Set([
                  'expected_version',
                  ...(item.capabilities.script ? ['script_text', 'script_asset_ids'] : []),
                  ...(item.capabilities.shoot
                    ? [
                        'shoot_location',
                        'actual_shot_at',
                        'raw_links',
                        'raw_asset_ids',
                        'no_actor_note',
                      ]
                    : []),
                  ...(item.capabilities.edit
                    ? ['edited_at', 'final_links', 'final_asset_ids']
                    : []),
                ]);
                await api(
                  '/content-items/' + id,
                  item.capabilities.structure
                    ? fullBody
                    : Object.fromEntries(Object.entries(fullBody).filter(([k]) => allowed.has(k))),
                  'PATCH',
                );
                refresh();
              }}
              label="Lưu nháp / thông tin sản xuất"
            />
            {item.stage !== 'CLIP_READY' && (
              <Form
                fields={[
                  {
                    key: 'confirmed',
                    label: 'Đã lưu đủ dữ liệu và kiểm tra bước hiện tại',
                    type: 'checkbox',
                    required: true,
                  },
                ]}
                onSubmit={async (v) => {
                  if (!v.confirmed) throw Error('Chưa xác nhận');
                  await api('/content-items/' + id + '/complete-stage', {
                    stage: { SCRIPTING: 'SCRIPT', WAITING_SHOOT: 'SHOOT', WAITING_EDIT: 'EDIT' }[
                      item.stage as string
                    ],
                    expected_version: item.version,
                  });
                  refresh();
                }}
                label="Hoàn tất bước hiện tại"
              />
            )}
            <label>
              Tài liệu nội dung
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f).catch((e) => alert(e.message));
                }}
              />
            </label>
            {assetList.map((f: any) => (
              <p key={f.id}>
                <a href={'/api/v1/assets/' + f.id + '/download'}>{f.filename}</a>
              </p>
            ))}
            {item.stage === 'CLIP_READY' && (
              <>
                <h3>Thêm lượt đăng</h3>
                <Form
                  fields={[
                    {
                      key: 'channel_id',
                      label: 'Kênh đăng',
                      type: 'select',
                      options: options(
                        (resources.data?.items || []).filter((r: any) => r.kind === 'CHANNEL'),
                      ),
                      required: true,
                    },
                    {
                      key: 'original_url',
                      label: 'Link video đã đăng',
                      type: 'url',
                      required: true,
                    },
                    {
                      key: 'published_at',
                      label: 'Ngày giờ đăng thực tế (giờ Việt Nam)',
                      type: 'datetime-local',
                      required: true,
                    },
                  ]}
                  onSubmit={async (v) => {
                    await api('/publications', {
                      ...v,
                      content_id: id,
                      published_at: iso(v.published_at),
                    });
                    refresh();
                  }}
                  label="Lưu lượt đăng"
                />
              </>
            )}
            <h3>Lịch sử giai đoạn</h3>
            {item.events.map((e: any) => (
              <p key={e.id}>
                {e.stage_code} · {e.kind} · {fmt(e.business_at)}
              </p>
            ))}
          </>
        )}
      </Loaded>
    </TaskDrawer>
  );
}

function WindowEvidence({ publication: p, onChanged }: any) {
  const [asset, setAsset] = useState(''),
    [error, setError] = useState<any>();
  const me = useLoad('/me');
  if (p.d7.status === 'READY' && !me.data?.admin) return null;
  return (
    <details>
      <summary>Ghi nhận nguồn GMV đúng cửa sổ D7</summary>
      <p>
        Chỉ dùng nguồn xác minh cửa sổ từ giờ đăng đến đúng 168 giờ sau đăng. Snapshot tích lũy ngày
        khác không đủ căn cứ.
      </p>
      <ErrorBox error={error} />
      <label>
        Chứng từ nguồn
        <input
          type="file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const b = new FormData();
            b.append('record_id', p.id);
            b.append('file', f);
            try {
              const r = await api('/assets', b);
              setAsset(r.id);
              setError(null);
            } catch (e) {
              setError(e);
            }
          }}
        />
      </label>
      {asset && (
        <Form
          fields={[
            { key: 'value', label: 'GMV theo nguồn cửa sổ (số thập phân)', required: true },
            { key: 'currency', label: 'Tiền tệ nguồn', required: true },
            {
              key: 'source_basis',
              label: 'Căn cứ nguồn và định nghĩa attribution',
              type: 'textarea',
              required: true,
            },
            {
              key: 'confirmed',
              label: 'Tôi đã xác minh chứng từ đúng cửa sổ 168 giờ',
              type: 'checkbox',
              required: true,
            },
            ...(me.data?.admin && p.d7.status === 'READY'
              ? [
                  {
                    key: 'replace',
                    label: 'Thay phiên bản cửa sổ đã có',
                    type: 'checkbox',
                    required: true,
                  },
                  { key: 'reason', label: 'Lý do thay phiên bản D7', required: true },
                ]
              : []),
          ]}
          initial={{ currency: 'VND' }}
          onSubmit={async (v) => {
            await api('/publications/' + p.id + '/window-facts', {
              ...v,
              expected_version: p.version,
              window_start: p.d7.window_start,
              window_end: p.d7.window_end,
              metric: 'GMV',
              attribution_key: 'PUBLISHED_168H',
              source_asset_id: asset,
            });
            onChanged();
          }}
          label="Lưu nguồn GMV D7 đã xác minh"
        />
      )}
    </details>
  );
}
