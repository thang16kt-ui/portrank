import { Component, type ReactNode } from 'react';

/** Trình duyệt có tạo được WebGL context không (bản đồ MapLibre/deck.gl cần WebGL) */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

function MapFallback({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-well p-4 text-center" role="status">
      <div className="max-w-sm text-[12px] text-mute">
        <div className="mb-1 text-2xl">🗺️</div>
        <div className="font-semibold text-fg">Bản đồ không hiển thị được</div>
        <p className="mt-1">{reason}</p>
        <p className="mt-1">Bạn vẫn nhập thông tin, tính phương án và xem bảng kết quả bình thường.</p>
        <button className="btn mt-2" onClick={onRetry}>↻ Thử lại bản đồ</button>
      </div>
    </div>
  );
}

/**
 * Cô lập vùng bản đồ: lỗi WebGL / MapLibre (không tạo được context, mất context…) chỉ thay vùng bản đồ bằng thông báo,
 * không làm trắng toàn bộ app. Form và kết quả nằm ngoài boundary nên không bị unmount.
 */
export default class MapBoundary extends Component<{ children: ReactNode }, { error: string | null; attempt: number }> {
  state = { error: webglAvailable() ? null : 'Trình duyệt không tạo được WebGL (tăng tốc đồ hoạ bị tắt hoặc không hỗ trợ).', attempt: 0 };

  static getDerivedStateFromError(e: unknown) {
    return { error: `Lỗi khởi tạo bản đồ: ${(e as Error)?.message ?? String(e)}` };
  }

  componentDidCatch(e: unknown) {
    console.error('Bản đồ lỗi – đã cô lập:', e);
  }

  retry = () => {
    this.setState((s) => ({ error: webglAvailable() ? null : 'Vẫn chưa tạo được WebGL.', attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.error) return <MapFallback reason={this.state.error} onRetry={this.retry} />;
    return <div key={this.state.attempt} className="h-full w-full">{this.props.children}</div>;
  }
}
