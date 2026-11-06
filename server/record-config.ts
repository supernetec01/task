import { z } from 'zod';
const text = (label: string, required = false) => ({ label, type: 'text', required });
const date = (label: string) => ({ label, type: 'date' });
const time = (label: string) => ({ label, type: 'datetime-local' });
const url = (label: string) => ({ label, type: 'url' });
const number = (label: string) => ({ label, type: 'number' });
export const recordKinds: Record<
  string,
  { module: string; role: string; name: string; fields: Record<string, any> }
> = {
  PRODUCT: {
    module: 'content',
    role: 'CONTENT',
    name: 'Sản phẩm',
    fields: { sku: text('SKU', true), description: text('Mô tả'), source: url('Nguồn tham khảo') },
  },
  CAMPAIGN: {
    module: 'content',
    role: 'CONTENT',
    name: 'Chiến dịch',
    fields: { objective: text('Mục tiêu'), start: date('Bắt đầu'), end: date('Kết thúc') },
  },
  CONTENT: {
    module: 'content',
    role: 'CONTENT',
    name: 'Nội dung / kịch bản',
    fields: {
      script: text('Kịch bản'),
      hook: text('Hook'),
      cta: text('CTA'),
      campaign_id: text('Mã chiến dịch'),
      task_id: text('Mã task liên quan'),
    },
  },
  DELIVERABLE: {
    module: 'content',
    role: 'DESIGNER',
    name: 'Sản phẩm bàn giao',
    fields: {
      content_id: text('Mã nội dung'),
      task_id: text('Mã task duyệt'),
      url: url('Link đầu ra'),
      revision: number('Phiên bản'),
    },
  },
  SHOOT: {
    module: 'content',
    role: 'CONTENT',
    name: 'Lịch quay',
    fields: {
      start_at: time('Bắt đầu'),
      end_at: time('Kết thúc'),
      location: text('Địa điểm'),
      participants: text('Người quay / diễn'),
      props: text('Đạo cụ / shotlist'),
      equipment_id: text('Mã thiết bị'),
    },
  },
  PUBLICATION: {
    module: 'content',
    role: 'CONTENT',
    name: 'Bài đăng',
    fields: {
      content_id: text('Mã nội dung', true),
      approved_task_id: text('Mã task được duyệt', true),
      channel: text('Kênh', true),
      url: url('Link bài đăng'),
      platform_id: text('ID bài đăng'),
      published_at: time('Ngày giờ đăng'),
    },
  },
  LIVE: {
    module: 'content',
    role: 'CONTENT',
    name: 'Phiên livestream',
    fields: {
      start_at: time('Bắt đầu'),
      end_at: time('Kết thúc'),
      url: url('Link phiên'),
      rundown: text('Kịch bản / sản phẩm'),
      results: text('Kết quả có nguồn'),
    },
  },
  RESOURCE: {
    module: 'resources',
    role: 'CONTENT',
    name: 'Tài nguyên / hướng dẫn',
    fields: {
      url: url('Link'),
      description: text('Mô tả / quyền sử dụng'),
      expires_on: date('Quyền dùng đến'),
    },
  },
  KOC: {
    module: 'business',
    role: 'MARKETPLACE',
    name: 'Liên hệ KOC',
    fields: {
      platform: text('Nền tảng'),
      profile_url: url('Trang KOC'),
      contact: text('Liên hệ công việc'),
    },
  },
  KOC_COLLAB: {
    module: 'business',
    role: 'MARKETPLACE',
    name: 'Hợp tác KOC',
    fields: {
      koc_id: text('Mã KOC', true),
      brief: text('Brief'),
      due_on: date('Hạn đăng'),
      tracking: text('Vận đơn / mẫu hàng'),
    },
  },
  KOC_POST: {
    module: 'business',
    role: 'MARKETPLACE',
    name: 'Bài đăng KOC',
    fields: {
      collaboration_id: text('Mã hợp tác', true),
      url: url('Link bài'),
      published_at: time('Ngày đăng'),
      source: text('Nguồn chỉ số'),
    },
  },
  CANDIDATE: {
    module: 'hr',
    role: 'HR',
    name: 'Ứng viên',
    fields: {
      contact: text('Liên hệ'),
      position: text('Vị trí'),
      source: text('Nguồn'),
      recruiter: text('Người tuyển'),
      cv_url: url('Portfolio công khai'),
      received_on: date('Ngày nhận'),
    },
  },
  APPLICATION: {
    module: 'hr',
    role: 'HR',
    name: 'Hồ sơ ứng tuyển',
    fields: {
      candidate_id: text('Mã ứng viên', true),
      position: text('Vị trí', true),
      stage: text('Giai đoạn'),
      next_action: text('Bước tiếp theo'),
    },
  },
  INTERVIEW: {
    module: 'hr',
    role: 'HR',
    name: 'Lịch phỏng vấn',
    fields: {
      application_id: text('Mã ứng tuyển', true),
      start_at: time('Ngày giờ'),
      interviewer: text('Người phỏng vấn'),
      outcome: text('Kết quả / nhận xét'),
    },
  },
  EQUIPMENT: {
    module: 'warehouse',
    role: 'WAREHOUSE',
    name: 'Thiết bị',
    fields: {
      tag: text('Asset tag / serial', true),
      condition: text('Tình trạng'),
      location: text('Vị trí'),
    },
  },
  LOAN: {
    module: 'warehouse',
    role: 'WAREHOUSE',
    name: 'Mượn / trả thiết bị',
    fields: {
      equipment_id: text('Mã thiết bị', true),
      borrower: text('Người mượn'),
      start_at: time('Ngày mượn'),
      end_at: time('Hạn trả'),
      returned_at: time('Ngày trả'),
      condition: text('Tình trạng bàn giao'),
    },
  },
  SAMPLE: {
    module: 'warehouse',
    role: 'WAREHOUSE',
    name: 'Xuất / trả mẫu',
    fields: {
      sku: text('SKU', true),
      quantity: number('Số lượng'),
      unit: text('Đơn vị'),
      kind: text('Tặng / mượn / trả'),
      tracking: text('Vận đơn'),
      external_id: text('Tham chiếu BigSeller'),
    },
  },
  BIGSELLER_OUTBOUND: {
    module: 'warehouse',
    role: 'WAREHOUSE',
    name: 'Báo cáo xuất kho BigSeller',
    fields: {
      external_id: text('ID dòng xuất', true),
      order_id: text('ID đơn'),
      package_id: text('ID kiện'),
      sku: text('SKU'),
      quantity: number('Số lượng'),
      unit: text('Đơn vị'),
      source: text('Nguồn BigSeller', true),
      occurred_on: date('Ngày xuất'),
    },
  },
  DOCUMENT: {
    module: 'finance',
    role: 'ACCOUNTANT',
    name: 'Chứng từ / hóa đơn',
    fields: {
      request_id: text('Mã đề nghị'),
      supplier: text('Nhà cung cấp / khách'),
      series: text('Series'),
      invoice_number: text('Số hóa đơn'),
      invoice_date: date('Ngày hóa đơn'),
      amount: number('Số tiền chứng từ'),
      currency: text('Tiền tệ'),
      check_status: text('Tình trạng kiểm tra'),
      external_id: text('ID hóa đơn ngoài hệ thống'),
    },
  },
  ISSUE: {
    module: 'issues',
    role: 'TESTER_OPTIONAL',
    name: 'Lỗi / kiểm thử',
    fields: {
      environment: text('Build / môi trường'),
      steps: text('Bước tái hiện', true),
      expected: text('Kỳ vọng'),
      actual: text('Thực tế'),
      severity: text('Mức độ'),
      fixed_build: text('Build đã sửa'),
      retest: text('Kết quả kiểm lại'),
    },
  },
};
export function recordSchema(kind: string) {
  const conf = recordKinds[kind];
  if (!conf) return null;
  return z
    .object(
      Object.fromEntries(
        Object.entries(conf.fields).map(([k, f]) => {
          let v: any = f.type === 'number' ? z.number().nonnegative() : z.string().max(20000);
          if (f.type === 'url')
            v = z.union([z.literal(''), z.url().refine((x) => /^https?:\/\//.test(x))]);
          if (f.type === 'date') v = z.union([z.literal(''), z.iso.date()]);
          if (f.type === 'datetime-local')
            v = z.union([z.literal(''), z.iso.datetime({ offset: true })]);
          return [k, f.required ? z.string().trim().min(1).max(20000) : v.optional()];
        }),
      ),
    )
    .strict();
}
