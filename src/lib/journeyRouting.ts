import type { RoadDirections, RoadProvider } from '../providers/RoadProvider';
import type { Place } from '../types';

/** Query the last truck leg at its own departure, after the first truck and sea legs. */
export async function loadInlandJourney(input: {
  seller: Place; buyer: Place; pol: Place; pod: Place; seaSeconds: number; departureTime?: string; calculatedAt?: string;
}, lookup: RoadProvider['lookup']): Promise<{ origin?: RoadDirections; destination?: RoadDirections; departureTime: string }> {
  if (!Number.isFinite(input.seaSeconds) || input.seaSeconds < 0) throw new Error('Chưa có thời lượng chặng biển hợp lệ.');
  const origin = input.seller.kind === 'address' ? await lookup({
    origin: input.seller, destination: input.pol, departureTime: input.departureTime, context: 'inland',
  }) : undefined;
  if (origin?.provider === 'google') throw new Error('Chặng nội địa cần dữ liệu TomTom để hiển thị trên bản đồ này.');
  if (origin && !origin.routes.length) throw new Error('Chưa có tuyến đường bộ đến cảng đi.');
  const departureTime = origin?.departureTime ?? input.departureTime ?? input.calculatedAt ?? new Date().toISOString();
  const start = Date.parse(departureTime);
  if (!Number.isFinite(start)) throw new Error('Chưa xác định được giờ khởi hành của hành trình.');
  const destinationDeparture = new Date(start + ((origin?.routes[0].durationSeconds ?? 0) + input.seaSeconds) * 1000).toISOString();
  const destination = input.buyer.kind === 'address' ? await lookup({
    origin: input.pod, destination: input.buyer, departureTime: destinationDeparture, context: 'inland',
  }) : undefined;
  if (destination?.provider === 'google') throw new Error('Chặng nội địa cần dữ liệu TomTom để hiển thị trên bản đồ này.');
  if (destination && !destination.routes.length) throw new Error('Chưa có tuyến đường bộ từ cảng đến.');
  return { origin, destination, departureTime };
}
