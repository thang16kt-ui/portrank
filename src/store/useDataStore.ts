import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RateEntry } from '../providers/RateProvider';
import type { ScheduleEntry } from '../providers/ScheduleProvider';
import type { TariffEntry } from '../providers/TariffProvider';
import type { Sourced } from '../types';

/** Dữ liệu người dùng tự nhập – lưu localStorage: bảng giá, biểu thuế, lịch tàu, thông tin cảng */
interface DataState {
  rates: RateEntry[];
  tariffs: TariffEntry[];
  schedules: ScheduleEntry[];
  /** Thông tin cảng do người dùng nhập: mã cảng → trường → giá trị có nguồn */
  portInfo: Record<string, Record<string, Sourced<string>>>;
  explainerAutoplay: boolean;
  /** Tự lấy thuế từ nguồn chính thức (UK Trade Tariff, US HTS) khi biểu thuế của bạn chưa có */
  officialTariffs: boolean;

  addRates: (e: RateEntry[]) => void;
  removeRate: (id: string) => void;
  clearRates: () => void;
  upsertTariff: (e: TariffEntry) => void;
  addTariffs: (e: TariffEntry[]) => void;
  removeTariff: (id: string) => void;
  addSchedules: (e: ScheduleEntry[]) => void;
  removeSchedule: (id: string) => void;
  clearSchedules: () => void;
  setPortField: (code: string, field: string, v: Sourced<string> | null) => void;
  setPortInfoBulk: (rows: { code: string; field: string; v: Sourced<string> }[]) => void;
  setExplainerAutoplay: (b: boolean) => void;
  setOfficialTariffs: (b: boolean) => void;
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      rates: [],
      tariffs: [],
      schedules: [],
      portInfo: {},
      explainerAutoplay: true,
      officialTariffs: true,

      addRates: (e) => set((s) => ({ rates: [...e, ...s.rates] })),
      removeRate: (id) => set((s) => ({ rates: s.rates.filter((r) => r.id !== id) })),
      clearRates: () => set({ rates: [] }),
      upsertTariff: (e) => set((s) => ({ tariffs: s.tariffs.some((t) => t.id === e.id) ? s.tariffs.map((t) => (t.id === e.id ? e : t)) : [e, ...s.tariffs] })),
      addTariffs: (e) => set((s) => ({ tariffs: [...e, ...s.tariffs] })),
      removeTariff: (id) => set((s) => ({ tariffs: s.tariffs.filter((t) => t.id !== id) })),
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
    }),
    { name: 'portrank.data.v2' },
  ),
);
