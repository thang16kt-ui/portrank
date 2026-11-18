import { useMemo } from 'react';
import { roadAvailability } from '../data/landBlocks';
import { createTableRateProvider } from '../providers/RateProvider';
import type { ScheduleEntry } from '../providers/ScheduleProvider';
import { createUserTariffProvider } from '../providers/TariffProvider';
import { useAppStore, usePlayback, type FormState } from '../store/useAppStore';
import { useDataStore } from '../store/useDataStore';
import { resolveCountryCoord } from './geocoding';
import { buildPlan, type PlanInput, type PlanOption } from './plan';
import { rankOptions, type RankedOption } from './ranking';
import { trackOf, type Track } from './track';
import { OFFICIAL_SOURCES } from './tariffSources';
import { fetchDcsaSchedules } from './dcsa';

export function planInputOf(f: FormState): PlanInput | null {
  if (!f.mine || !f.partner) return null;
  return {
    role: f.role, mine: f.mine, partner: f.partner, mode: f.mode,
    shipment: { cargo: f.cargo, mode: f.shipMode, container: f.container, quantity: f.quantity, cbm: f.cbm, weightKg: f.weightKg, woodPallet: f.woodPallet },
    goodsValue: f.goodsValue, valueTerm: f.valueTerm, hs: f.hs, origin: f.origin, hasCo: f.hasCo, readyDate: f.readyDate,
    dutyQty: { units: f.dutyUnits ?? 0, netKg: f.netKg ?? 0, liters: f.dutyLiters ?? 0 },
    radiusKm: f.radiusKm, avoidRedSea: f.avoidRedSea, avoidPanama: f.avoidPanama, carriers: f.carriers,
  };
}

let runSeq = 0;

/** Bấm "Tìm tuyến tối ưu": tính mọi phương án rồi đưa vào store */
export async function runPlan(opts: { keepSelection?: boolean } = {}) {
  const app = useAppStore.getState();
  const f = app.form;
  if (!f.mine || !f.partner) {
    app.showToast('Nhập điểm của bên bạn và bên đối tác trước');
    return;
  }
  const seq = ++runSeq;
  app.set({ planning: { done: 0, total: 1 }, planError: null });
  try {
    const [mine, partner] = await Promise.all([resolveCountryCoord(f.mine), resolveCountryCoord(f.partner)]);
    let form = { ...f, mine, partner };
    const sellerC = f.role === 'seller' ? mine.country : partner.country, buyerC = f.role === 'seller' ? partner.country : mine.country;
    if (form.mode === 'road' && !roadAvailability(sellerC, buyerC).ok) {
      useAppStore.getState().setMode('sea');
      form = { ...form, mode: 'sea', term: useAppStore.getState().form.term };
      useAppStore.getState().set({ notice: 'Hai điểm không nối được bằng đường bộ – đã chuyển sang đường biển.' });
    }
    const data = useDataStore.getState();
    const plan = await buildPlan(planInputOf(form)!, {
      rates: createTableRateProvider(data.rates),
      tariffs: createUserTariffProvider(data.tariffs),
      official: data.officialTariffs ? OFFICIAL_SOURCES : [],
      onProgress: (done, total) => seq === runSeq && useAppStore.getState().set({ planning: { done, total } }),
    });
    if (seq !== runSeq) return;
    const cur = useAppStore.getState();
    const keep = opts.keepSelection && cur.selectedKey && plan.options.some((o) => o.key === cur.selectedKey);
    cur.set({
      plan, planning: null, planRun: cur.planRun + 1,
      selectedKey: keep ? cur.selectedKey : null, scheduleId: keep ? cur.scheduleId : null,
      planError: plan.options.length ? null : 'Không tìm được phương án tuyến nào cho hai điểm này.',
      portView: null, follow: false, sheetOpen: false,
    });
    usePlayback.getState().setProgress(0);
    usePlayback.getState().setPlaying(true);
  } catch (e) {
    if (seq !== runSeq) return;
    console.error(e);
    useAppStore.getState().set({ planning: null, planError: `Lỗi khi tính tuyến: ${(e as Error).message}` });
  }
}

/** Danh sách phương án đã xếp hạng theo Incoterm / trọng số hiện tại (cập nhật tức thì, không tính lại tuyến) */
export function useRanked(): RankedOption[] {
  const plan = useAppStore((s) => s.plan);
  const term = useAppStore((s) => s.form.term);
  const weights = useAppStore((s) => s.weights);
  const basis = useAppStore((s) => s.costBasis);
  const destBySeller = useAppStore((s) => s.destChargesBySeller);
  return useMemo(
    () => (plan ? rankOptions(plan.options, term, plan.input.role, weights, basis, { destChargesBySeller: destBySeller }) : []),
    [plan, term, weights, basis, destBySeller],
  );
}

/** Phương án đang xem: phương án được chọn, nếu chưa chọn thì hạng 1 */
export function useCurrent(): RankedOption | null {
  const ranked = useRanked();
  const key = useAppStore((s) => s.selectedKey);
  return useMemo(() => ranked.find((r) => r.option.key === key) ?? ranked[0] ?? null, [ranked, key]);
}

export function useSchedule(): ScheduleEntry | null {
  const id = useAppStore((s) => s.scheduleId);
  const schedules = useDataStore((s) => s.schedules);
  const api = useAppStore((s) => s.apiSchedules);
  return useMemo(() => {
    if (!id) return null;
    const own = schedules.find((x) => x.id === id);
    if (own) return own;
    for (const v of Object.values(api)) if (v.status === 'ok') {
      const hit = v.entries.find((x) => x.id === id);
      if (hit) return hit;
    }
    return null;
  }, [id, schedules, api]);
}

/** Lấy lịch từ API hãng tàu (qua máy chủ PortRank) cho một cặp cảng */
export async function loadApiSchedules(pol: string, pod: string, from: string, carriers: string[]) {
  const key = `${pol}>${pod}`;
  const st = useAppStore.getState();
  st.set({ apiSchedules: { ...st.apiSchedules, [key]: { status: 'loading' } } });
  try {
    const r = await fetchDcsaSchedules({ pol, pod, from, carriers });
    useAppStore.setState((s) => ({ apiSchedules: { ...s.apiSchedules, [key]: { ...r, status: 'ok' } } }));
  } catch (e) {
    useAppStore.setState((s) => ({ apiSchedules: { ...s.apiSchedules, [key]: { status: 'error', error: (e as Error).message } } }));
  }
}

const trackCache = new WeakMap<PlanOption, Map<string, Track | null>>();
/** Quỹ đạo hoạt ảnh của một phương án (có cache) */
export function getTrack(o: PlanOption, schedule: ScheduleEntry | null): Track | null {
  const plan = useAppStore.getState().plan;
  if (!plan) return null;
  let m = trackCache.get(o);
  if (!m) trackCache.set(o, (m = new Map()));
  const k = schedule?.id ?? '';
  if (!m.has(k)) m.set(k, trackOf(o, plan.input.shipment.cargo, schedule, { avoidRedSea: plan.input.avoidRedSea, avoidPanama: plan.input.avoidPanama }));
  return m.get(k)!;
}
