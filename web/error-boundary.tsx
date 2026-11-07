import React, { type ReactNode } from 'react';

export class AppErrorBoundary extends React.Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="login" role="alert">
          <h1>Không thể hiển thị trang</h1>
          <p>Giao diện gặp lỗi. Hãy tải lại trang; nếu lỗi tiếp tục, liên hệ quản trị viên.</p>
          <button onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>
      );
    return this.props.children;
  }
}
