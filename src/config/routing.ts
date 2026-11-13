/** Cấu hình tìm tuyến & tốc độ tàu – chỉnh tại đây */
export const ROUTING_CONFIG = {
  /** 'searoute' = mạng lưới marnet của searoute-js; 'graph' = đồ thị dự phòng */
  defaultEngine: 'searoute' as 'searoute' | 'graph',
  /** Khoảng cách giữa 2 điểm sau khi làm dày (km) */
  densifyKm: 20,
  /** Bỏ các cạnh vượt vĩ độ này (tuyến Bắc Cực / Nam Cực) */
  maxLat: 66.5,
  minLat: -62,
};

export const VESSEL_CONFIG = {
  /** Tốc độ khai thác (hải lý/giờ) */
  speedKn: 16,
  reeferSpeedKn: 17,
  /** Ngày làm hàng hai đầu */
  portDays: 2,
  /** Ngày thêm cho mỗi kênh đào (Suez, Panama, Kiel) */
  canalDays: 1,
  /** Số ngày chờ chuyến kế tiếp sau ngày hàng sẵn sàng */
  cutoffDays: 3,
};

/** Thời lượng hoạt ảnh (giây) theo quãng đường */
export const ANIMATION_CONFIG = {
  minSec: 6,
  maxSec: 12,
  /** Quãng đường (hải lý) ứng với maxSec */
  nmForMax: 15000,
  trailRatio: 0.08,
};
