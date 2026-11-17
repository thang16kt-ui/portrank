import { Component, type ReactNode } from 'react';
import MapView from './MapView';
import MapOverlays from './MapOverlays';

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert" className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Không thể hiển thị bản đồ trên thiết bị này. Hãy mở mục Kết quả để tiếp tục xem chi phí và phương án vận chuyển.</div> : this.props.children;
  }
}

export default function MapPanel() {
  return <MapBoundary><div className="absolute inset-0"><MapView /><div className="pointer-events-none absolute inset-0 z-10"><MapOverlays /></div></div></MapBoundary>;
}
