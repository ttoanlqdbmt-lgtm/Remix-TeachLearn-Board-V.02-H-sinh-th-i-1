import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App.tsx';
import './index.css';

interface RootErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  RootErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Đã xảy ra sự cố hiển thị giao diện.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('TeachLearn Edu UI error:', error);
  }

  handleHardReset = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // Ignore cleanup failures and reload
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F1F5F9] p-6 text-[#334155]">
          <div className="w-full max-w-md rounded-[8px] border border-[#E2E8F0] bg-white p-6 shadow-lg">
            <h1 className="text-[18px] font-semibold text-[#0F172A]">
              TeachLearn Edu đang cần làm mới bộ nhớ đệm
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#334155]">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={this.handleHardReset}
              className="btn-glossy-3d-active mt-4 inline-flex items-center justify-center rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
            >
              Xóa bộ nhớ đệm &amp; Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      try {
        if (!sessionStorage.getItem('tl_sw_reloaded_v2')) {
          sessionStorage.setItem('tl_sw_reloaded_v2', '1');
          window.location.reload();
        }
      } catch {
        // Ignore sessionStorage restrictions
      }
    });

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => undefined);
      })
      .catch((err) => {
        console.warn('Service Worker registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
