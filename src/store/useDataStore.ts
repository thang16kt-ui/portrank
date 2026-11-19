import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RateEntry } from '../providers/RateProvider';
import type { ScheduleEntry } from '../providers/ScheduleProvider';
import type { TariffEntry } from '../providers/TariffProvider';
import type { ChargeRule, TradeMeasure } from '../lib/otherCharges';
import type { Sourced } from '../types';
import { DEFAULT_THEME_SETTING, type MapColors, type MapThemeSetting } from '../config/mapThemes';

/** Dữ liệu người dùng tự nhập – lưu localStorage: bảng giá, biểu thuế, lịch tàu, thông tin cảng */
interface DataState {
  rates: RateEntry[];
  tariffs: TariffEntry[];
  /** Bảng C của bạn (thuế/phí khác) và bảng B (phòng vệ thương mại) */
  charges: ChargeRule[];
  measures: TradeMeasure[];
  /** Dùng dữ liệu thuế đã tổng hợp đi kèm app (bảng A/B/C 2026-11-18) */
  curatedTariffs: boolean;
  /** Cho phép dữ liệu MÔ PHỎNG (lịch sử giá, tần suất tàu) tham gia xếp hạng – chế độ demo */
  simulatedMetrics: boolean;
  schedules: ScheduleEntry[];
  /** Thông tin cảng do người dùng nhập: mã cảng → trường → giá trị có nguồn */
  portInfo: Record<string, Record<string, Sourced<string>>>;
  explainerAutoplay: boolean;
  /** Tự lấy thuế từ nguồn chính thức (UK Trade Tariff, US HTS) khi biểu thuế của bạn chưa có */
  officialTariffs: boolean;
  /** Chủ đề màu bản đồ + màu người dùng chỉnh */
  mapTheme: MapThemeSetting;
  /** Màu giao diện (bảng nhập, bảng kết quả, các trang): tối hoặc sáng */
  uiTheme: 'dark' | 'light';

  addRates: (e: RateEntry[]) => void;
  removeRate: (id: string) => void;
  clearRates: () => void;
  upsertTariff: (e: TariffEntry) => void;
  addTariffs: (e: TariffEntry[]) => void;
  removeTariff: (id: string) => void;
  setCharges: (c: ChargeRule[]) => void;
  setMeasures: (m: TradeMeasure[]) => void;
  setCuratedTariffs: (b: boolean) => void;
  setSimulatedMetrics: (b: boolean) => void;
  addSchedules: (e: ScheduleEntry[]) => void;
  removeSchedule: (id: string) => void;
  clearSchedules: () => void;
  setPortField: (code: string, field: string, v: Sourced<string> | null) => void;
  setPortInfoBulk: (rows: { code: string; field: string; v: Sourced<string> }[]) => void;
  setExplainerAutoplay: (b: boolean) => void;
  setOfficialTariffs: (b: boolean) => void;
  setMapThemeBase: (id: string) => void;
  setMapColor: (k: keyof MapColors, v: string | null) => void;
  setMapGlow: (g: number | null) => void;
  resetMapTheme: () => void;
  setUiTheme: (t: 'dark' | 'light') => void;
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      rates: [],
      tariffs: [],
      charges: [],
      measures: [],
      curatedTariffs: true,
      simulatedMetrics: false,
      schedules: [],
      portInfo: {},
      explainerAutoplay: true,
      officialTariffs: true,
      mapTheme: DEFAULT_THEME_SETTING,
      uiTheme: 'light',

      addRates: (e) => set((s) => ({ rates: [...e, ...s.rates] })),
      removeRate: (id) => set((s) => ({ rates: s.rates.filter((r) => r.id !== id) })),
      clearRates: () => set({ rates: [] }),
      upsertTariff: (e) => set((s) => ({ tariffs: s.tariffs.some((t) => t.id === e.id) ? s.tariffs.map((t) => (t.id === e.id ? e : t)) : [e, ...s.tariffs] })),
      addTariffs: (e) => set((s) => ({ tariffs: [...e, ...s.tariffs] })),
      removeTariff: (id) => set((s) => ({ tariffs: s.tariffs.filter((t) => t.id !== id) })),
      setCharges: (charges) => set({ charges }),
      setMeasures: (measures) => set({ measures }),
      setCuratedTariffs: (curatedTariffs) => set({ curatedTariffs }),
      setSimulatedMetrics: (simulatedMetrics) => set({ simulatedMetrics }),
      addSchedules: (e) => set((s) => ({ schedules: [...e, ...s.schedules] })),
      removeSchedule: (id) => set((s) => ({ schedules: s.schedules.filter((r) => r.id !== id) })),
      clearSchedules: () => set({ schedules: [] }),
      setPortField: (code, field, v) =>
        set((s) => {
          const cur = { ...(s.portInfo[code] ?? {}) };
          if (v) cur[field] = v;
          else delete cur[field];
          return { portInfo: { ...s.portInfo, [code]: cur } };
        }),
      setPortInfoBulk: (rows) =>
        set((s) => {
          const next = { ...s.portInfo };
          for (const r of rows) next[r.code] = { ...(next[r.code] ?? {}), [r.field]: r.v };
          return { portInfo: next };
        }),
      setExplainerAutoplay: (explainerAutoplay) => set({ explainerAutoplay }),
      setOfficialTariffs: (officialTariffs) => set({ officialTariffs }),
      // chọn chủ đề có sẵn → bỏ các màu đã tự chỉnh
      setMapThemeBase: (base) => set({ mapTheme: { base, overrides: {}, glow: null } }),
      setMapColor: (k, v) =>
        set((s) => {
          const overrides = { ...s.mapTheme.overrides };
          if (v) overrides[k] = v;
          else delete overrides[k];
          return { mapTheme: { ...s.mapTheme, overrides } };
        }),
      setMapGlow: (glow) => set((s) => ({ mapTheme: { ...s.mapTheme, glow } })),
      resetMapTheme: () => set({ mapTheme: DEFAULT_THEME_SETTING }),
      setUiTheme: (uiTheme) => set({ uiTheme }),
    }),
    {
      name: 'portrank.data.v2',
      version: 2,
      // v0 → v1: nền mặc định đổi từ "Tối phát sáng" sang "Bản đồ chi tiết"; giữ nguyên nếu người dùng đã tự chọn/chỉnh
      migrate: (persisted: unknown, version: number) => {
        const st = (persisted ?? {}) as { mapTheme?: MapThemeSetting; uiTheme?: string };
        if (version < 1 && st.mapTheme && st.mapTheme.base === 'glow' && !Object.keys(st.mapTheme.overrides ?? {}).length && st.mapTheme.glow == null) st.mapTheme = DEFAULT_THEME_SETTING;
        // v1 → v2: giao diện mặc định đổi sang nền trắng kiểu V1
        if (version < 2) (st as { uiTheme?: string }).uiTheme = 'light';
        return st as never;
      },
      merge: (persisted, cur) => ({ ...cur, ...(persisted as object), mapTheme: { ...DEFAULT_THEME_SETTING, ...((persisted as { mapTheme?: MapThemeSetting })?.mapTheme ?? {}) } }) },
  ),
);
