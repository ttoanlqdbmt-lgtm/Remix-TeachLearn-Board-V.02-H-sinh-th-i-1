import React, { useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { canInstall, showIOSPrompt, isInstalled, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || (!canInstall && !showIOSPrompt)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={canInstall ? () => void install() : () => setShowIOSGuide(true)}
        title="Cài đặt ứng dụng TeachLearn Edu"
        aria-label="Cài đặt ứng dụng TeachLearn Edu"
        className="btn-glossy-3d-inactive inline-flex h-10 w-10 items-center justify-center whitespace-nowrap rounded-[8px] text-[13.5px] font-medium transition-all duration-150 sm:w-auto sm:gap-1.5 sm:px-3"
      >
        <Download className="h-[18px] w-[18px] shrink-0 text-[#136F63]" strokeWidth={1.9} />
        <span className="hidden sm:inline">Cài ứng dụng</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-[8px] border border-[#E2E8F0] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-[#1E293B]">
                Cài đặt TeachLearn Edu lên Màn hình chính
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Đóng hướng dẫn"
                className="btn-glossy-3d-inactive flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-[13.5px] leading-relaxed text-[#334155]">
              Để cài TeachLearn Edu thành ứng dụng trên iPhone hoặc iPad:
            </p>
            <ol className="space-y-2.5 text-[13.5px] text-[#334155]">
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-[12px] font-semibold text-[#0369A1]">
                  1
                </span>
                <span>
                  Nhấn biểu tượng <strong>Chia sẻ</strong>{' '}
                  <Share className="inline h-3.5 w-3.5 text-[#136F63]" /> ở thanh công cụ Safari.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-[12px] font-semibold text-[#0369A1]">
                  2
                </span>
                <span>
                  Cuộn xuống chọn <strong>Thêm vào Màn hình chính</strong> (Add to Home Screen).
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-[12px] font-semibold text-[#0369A1]">
                  3
                </span>
                <span>
                  Nhấn <strong>Thêm</strong> để sử dụng TeachLearn Edu toàn màn hình &amp; ngoại tuyến.
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="no-print flex items-center justify-center gap-2 border-b border-[#FEF3C7] bg-[#FEF3C7] px-3 py-1.5 text-[12px] font-medium text-[#B45309]"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Đang ngoại tuyến — Kho đề Offline IndexedDB &amp; Xem đề A4 vẫn hoạt động.</span>
    </div>
  );
};
