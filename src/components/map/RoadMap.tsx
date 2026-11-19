import { useRoadConfig } from '../../hooks/useRoadConfig';
import { useCurrent } from '../../lib/actions';
import GoogleRoadMap from './GoogleRoadMap';
import JourneyMap from './JourneyMap';
import MapBoundary from './MapBoundary';

export default function RoadMap() {
  const current = useCurrent();
  const { config, error, retry } = useRoadConfig();
  const provider = current?.option.roadDirections?.provider ?? config?.provider;
  if (provider === 'google') return <GoogleRoadMap />;
  if (provider === 'tomtom' || provider === 'osrm') return <MapBoundary webgl={false}><JourneyMap /></MapBoundary>;
  return <div className="flex h-full items-center justify-center bg-well p-6 text-center text-[13px] text-mute" role="status">
    <div>{error || 'Đang kết nối nguồn đường bộ…'}{error && <button className="btn mx-auto mt-3 block" onClick={retry}>Thử lại kết nối</button>}</div>
  </div>;
}
