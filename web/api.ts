export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: any,
  ) {
    super(message);
  }
}
let csrf = '';
export const setCsrf = (s: string) => (csrf = s);
export async function api(
  path: string,
  body?: any,
  method = body === undefined ? 'GET' : 'POST',
  key?: string,
): Promise<any> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['x-csrf-token'] = csrf;
    headers['idempotency-key'] = key || crypto.randomUUID();
    if (!(body instanceof FormData)) headers['content-type'] = 'application/json';
  }
  const opts: RequestInit = {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  };
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, opts);
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    try {
      response = await fetch('/api/v1' + path, opts);
    } catch {
      throw new ApiError(
        0,
        'OFFLINE',
        'Mất kết nối. Chưa xác nhận đã lưu; nội dung của bạn vẫn được giữ.',
      );
    }
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.code, data.message, data.field_errors);
  return data;
}
export function iso(local: string) {
  return local ? new Date(local.length === 16 ? local + ':00+07:00' : local).toISOString() : null;
}
export function localInput(utc: string | Date) {
  if (!utc) return '';
  return new Date(new Date(utc).getTime() + 7 * 3600e3).toISOString().slice(0, 16);
}
export function fmt(utc: any) {
  return utc
    ? new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(utc))
    : '—';
}
export function monday() {
  const now = new Date(Date.now() + 7 * 3600e3);
  now.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  return now.toISOString().slice(0, 10);
}
