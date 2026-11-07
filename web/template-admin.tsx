import React, { useState } from 'react';
import { api, fmt } from './api';
import { Form, Modal, Loaded, useLoad, Badge, Empty, options, roleLabel, type Field } from './ui';

const types: Record<string, string> = {
  string: 'Văn bản',
  url: 'Đường dẫn',
  date: 'Ngày',
  datetime: 'Ngày giờ',
  boolean: 'Có / Không',
  decimal: 'Số',
  array: 'Danh sách dòng',
  metric_array: 'Danh sách chỉ số',
  reference: 'Mã liên kết',
  reference_array: 'Danh sách mã',
  link_array: 'Danh sách đường dẫn',
};
const rowTypes = {
  string: 'Văn bản',
  url: 'Đường dẫn',
  date: 'Ngày',
  integer: 'Số nguyên',
  decimal: 'Số',
  decimal_nullable: 'Số (có thể để trống)',
};
export function TemplateAdmin() {
  const [revision, setRevision] = useState(0),
    { data, error } = useLoad('/admin/task-templates', revision);
  const [selected, setSelected] = useState<any>(),
    [create, setCreate] = useState(false),
    [search, setSearch] = useState('');
  const items = (data?.items || []).filter((t: any) =>
    `${t.definition.name} ${t.definition.group}`.toLowerCase().includes(search.toLowerCase()),
  );
  const fieldFields: Field[] = [
    {
      key: 'key',
      label: 'Mã trường',
      required: true,
      hint: 'Chữ thường, số và dấu gạch dưới; giữ nguyên khi trường đã có dữ liệu.',
    },
    { key: 'label', label: 'Nhãn hiển thị', required: true },
    {
      key: 'type',
      label: 'Kiểu nhập',
      type: 'select',
      required: true,
      options: options(Object.keys(types), types),
    },
    {
      key: 'phase',
      label: 'Bổ sung ở bước',
      type: 'select',
      required: true,
      options: [
        { value: 'WORK', label: 'Thực hiện' },
        { value: 'SUBMIT', label: 'Nộp kết quả' },
      ],
    },
    { key: 'required_at_action', label: 'Bắt buộc khi nộp kết quả', type: 'checkbox' },
    {
      key: 'items',
      label: 'Cấu trúc dòng (chỉ dùng cho kiểu danh sách)',
      type: 'array',
      fields: [
        { key: 'key', label: 'Mã cột', required: true },
        {
          key: 'type',
          label: 'Kiểu cột',
          type: 'select',
          required: true,
          options: options(Object.keys(rowTypes), rowTypes),
        },
      ],
    },
  ];
  const initial = selected
    ? {
        ...selected.definition,
        enabled: selected.enabled,
        roles: selected.roles.map((role: string) => ({ role })),
        fields: selected.definition.fields.map((f: any) => ({
          ...f,
          items: Object.entries(f.items || {}).map(([key, type]) => ({ key, type })),
        })),
        checkpoints: selected.definition.checkpoints.map((title: string) => ({ title })),
        reason: '',
      }
    : {
        name: '',
        group: 'Công việc chung',
        enabled: true,
        roles: [],
        fields: [],
        checkpoints: [],
        output_policy: 'TEXT_OR_ARTIFACT',
        ready_gate_enabled: false,
        reason: '',
      };
  return (
    <>
      <div className="heading">
        <p className="muted">
          Mỗi lần lưu tạo một phiên bản mới. Công việc đã tạo giữ nguyên tên, trường và quy tắc của
          phiên bản cũ.
        </p>
        <button className="primary" onClick={() => setCreate(true)}>
          + Tạo mẫu công việc
        </button>
      </div>
      <div className="toolbar">
        <input
          aria-label="Tìm mẫu công việc"
          placeholder="Tìm tên hoặc nhóm mẫu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Loaded data={data} error={error}>
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>Mẫu công việc</th>
                <th>Nhóm</th>
                <th>Chuyên môn</th>
                <th>Phiên bản</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t: any) => (
                <tr key={t.code}>
                  <td>
                    <strong>{t.definition.name}</strong>
                    <div className="code">{t.code}</div>
                  </td>
                  <td>{t.definition.group}</td>
                  <td>{t.roles.map((r: string) => roleLabel[r]).join(', ')}</td>
                  <td>v{t.version}</td>
                  <td>
                    <Badge>{t.enabled ? 'Đang bật' : 'Đã tắt'}</Badge>
                  </td>
                  <td>
                    <button onClick={() => setSelected(t)}>Chỉnh sửa mẫu</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <Empty />}
        </div>
      </Loaded>
      {(selected || create) && (
        <Modal
          title={selected ? 'Chỉnh sửa · ' + selected.definition.name : 'Tạo mẫu công việc'}
          onClose={() => {
            setSelected(undefined);
            setCreate(false);
          }}
        >
          <Form
            key={selected?.code || 'new'}
            fields={[
              ...(!selected
                ? [
                    {
                      key: 'code',
                      label: 'Mã mẫu',
                      required: true,
                      hint: 'Chữ hoa, số và gạch dưới; mã duy nhất.',
                    },
                  ]
                : []),
              { key: 'name', label: 'Tên mẫu tiếng Việt', required: true },
              { key: 'group', label: 'Nhóm hiển thị', required: true },
              { key: 'enabled', label: 'Cho phép chọn khi tạo công việc mới', type: 'checkbox' },
              {
                key: 'roles',
                label: 'Chuyên môn được sử dụng',
                type: 'array',
                fields: [
                  {
                    key: 'role',
                    label: 'Chuyên môn',
                    type: 'select',
                    required: true,
                    options: options(data?.jobs || [], roleLabel),
                  },
                ],
              },
              { key: 'fields', label: 'Trường chuyên môn', type: 'array', fields: fieldFields },
              {
                key: 'checkpoints',
                label: 'Các mốc thực hiện (không bắt buộc)',
                type: 'array',
                fields: [{ key: 'title', label: 'Tên mốc', required: true }],
              },
              {
                key: 'output_policy',
                label: 'Đầu ra khi nộp',
                type: 'select',
                required: true,
                options: [
                  { value: 'TEXT_OR_ARTIFACT', label: 'Văn bản hoặc tệp / link' },
                  { value: 'ARTIFACT_REQUIRED', label: 'Bắt buộc có tệp / link' },
                ],
              },
              {
                key: 'ready_gate_enabled',
                label: 'Bật kiểm tra sẵn sàng theo quy tắc của mẫu (chỉ khi đã chốt)',
                type: 'checkbox',
              },
              {
                key: 'reason',
                label: 'Lý do thay đổi / người chốt',
                type: 'textarea',
                required: true,
              },
            ]}
            initial={initial}
            onSubmit={async (v, key) => {
              const payload = {
                ...v,
                roles: v.roles.map((r: any) => r.role),
                checkpoints: v.checkpoints.map((r: any) => r.title),
                fields: v.fields.map((f: any) => ({
                  ...f,
                  required_at_action: !!f.required_at_action,
                  items:
                    ['array', 'metric_array'].includes(f.type) && f.items?.length
                      ? Object.fromEntries(f.items.map((i: any) => [i.key, i.type]))
                      : undefined,
                })),
                expected_version: selected?.version,
              };
              await api(
                selected
                  ? '/admin/task-templates/' + selected.code + '/versions'
                  : '/admin/task-templates',
                payload,
                'POST',
                key,
              );
              setSelected(undefined);
              setCreate(false);
              setRevision((r) => r + 1);
            }}
            label={selected ? 'Lưu phiên bản mới' : 'Tạo mẫu'}
          />
          {selected?.history?.length > 0 && (
            <details>
              <summary>Lịch sử phiên bản</summary>
              {selected.history.map((h: any) => (
                <p key={h.id}>
                  v{h.version} · {fmt(h.created_at)}
                </p>
              ))}
            </details>
          )}
        </Modal>
      )}
    </>
  );
}
