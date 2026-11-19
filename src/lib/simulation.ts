/** datetime-local belongs to the browser's time zone; API requests carry an explicit offset. */
export function departureIso(value: string, now = Date.now()): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  const date = new Date(value);
  if (!match || !Number.isFinite(date.getTime()) ||
    [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]
      .some((part, i) => part !== Number(match[i + 1] ?? 0)))
    throw new Error('Ngày, giờ khởi hành không hợp lệ. Hãy chọn lại trên lịch.');
  if (date.getTime() < now) throw new Error('Giờ khởi hành đã qua. Hãy chọn giờ tương lai hoặc bấm Đi ngay.');
  return date.toISOString();
}

export function minimumDeparture(now = Date.now()) {
  const d = new Date(Math.ceil(now / 60000) * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function formatSimulationTime(at: number, timeZone = deviceTimeZone()) {
  if (!Number.isFinite(new Date(at).getTime())) return '—';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${get('day')}/${get('month')}/${get('year')} · ${get('hour')}:${get('minute')}`;
}

/** Playback speed never participates in the journey clock or ETA calculation. */
export function simulationTimes(departureTime: string | undefined, elapsedSeconds: number, totalSeconds: number) {
  const start = Date.parse(departureTime ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(totalSeconds) || totalSeconds < 0 || !Number.isFinite(elapsedSeconds))
    return { current: NaN, arrival: NaN };
  return { current: start + Math.max(0, Math.min(totalSeconds, elapsedSeconds)) * 1000, arrival: start + totalSeconds * 1000 };
}
