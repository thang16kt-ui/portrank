import { create } from 'zustand';
import { SEA_ONLY_EQUIVALENT, termsForMode } from '../config/incoterms';
import { WEIGHT_PRESETS, type Weights } from '../config/weights';
import type { Plan } from '../lib/plan';
import type { DcsaFetchResult } from '../lib/dcsa';
import type { CostBasis } from '../lib/ranking';
import { useDataStore } from './useDataStore';
import type { CargoType, ContainerType, Incoterm, Place, Priority, Role, ShipMode, TransportMode } from '../types';

export type Page = 'plan' | 'rates' | 'tariffs' | 'schedules' | 'ports' | 'saved';
export type DetailTab = 'cost' | 'duty' | 'rules' | 'history' | 'schedule';

export interface FormState {
  role: Role;
  mine: Place | null;
  partner: Place | null;
  cargo: CargoType;
  shipMode: ShipMode;
  container: ContainerType;
  quantity: number;
  cbm: number;
  weightKg: number;
  woodPallet: boolean;
  hs: string;
  hsDesc: string;
  /** Để tính thuế tuyệt đối: số lượng sản phẩm (chiếc/đôi), khối lượng tịnh (kg, 0 = CHƯA NHẬP), thể tích (lít) */
  dutyUnits: number;
  netKg: number;
  dutyLiters: number;
  /** Xuất xứ (ISO2); rỗng = nước người bán */
  origin: string;
  /** Có C/O / chứng từ xuất xứ → xét thuế FTA. Mặc định KHÔNG (tính MFN, hiện mức ưu đãi để chọn) */
  hasCo: boolean;
  /** Hiệp định đã chọn (khi có C/O); rỗng = chưa chọn → dùng mức thấp nhất, ghi rõ là có điều kiện */
  fta: string;
  /** Ngày dự kiến khai hải quan nhập; rỗng = ngày hàng sẵn sàng */
  customsDate: string;
  /** Nhà sản xuất / xuất khẩu (mức phòng vệ thương mại riêng theo công ty) */
  company: string;
  goodsValue: number;
  valueTerm: Incoterm;
  readyDate: string;
  /** Local datetime input; converted to RFC3339 before requesting road directions. Empty = now. */
  roadDepartureTime: string;
  priority: Priority;
  radiusKm: number;
  avoidRedSea: boolean;
  avoidPanama: boolean;
  mode: TransportMode;
  term: Incoterm;
  /** id hãng tàu được chọn; rỗng = tất cả */
  carriers: string[];
}

export interface SavedPlan {
  id: string;
  createdAt: string;
  form: FormState;
  optionKey: string;
  title: string;
  summary: string;
  youPay: number;
  total: number;
  /** Google driving times are fetched again on reopening, not persisted as cached directions. */
  days: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);

const SAVED_KEY = 'portrank.saved.v2';
function loadSaved(): SavedPlan[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function persistSaved(list: SavedPlan[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* bỏ qua */
  }
}

export const DEFAULT_FORM: FormState = {
  role: 'seller',
  mine: null,
  partner: null,
  cargo: 'dry',
  shipMode: 'FCL',
  container: '40HC',
  quantity: 1,
  cbm: 5,
  weightKg: 1500,
  woodPallet: true,
  hs: '',
  dutyUnits: 0,
  netKg: 0,
  dutyLiters: 0,
  hsDesc: '',
  origin: '',
  hasCo: false,
  fta: '',
  customsDate: '',
  company: '',
  goodsValue: 0,
  valueTerm: 'FOB',
  readyDate: today(),
  roadDepartureTime: '',
  priority: 'balanced',
  radiusKm: 400,
  avoidRedSea: false,
  avoidPanama: false,
  mode: 'sea',
  term: 'FCA',
  carriers: [],
};

interface AppState {
  page: Page;
  form: FormState;
  weights: Weights;
  weightsCustom: boolean;
  costBasis: CostBasis;
  /** Nhóm C: tính phí cảng đến cho người bán */
  destChargesBySeller: boolean;
  plan: Plan | null;
  /** Dấu vân tay đầu vào của `plan` và ảnh chụp form lúc tính (dùng khi lưu) */
  planKey: string | null;
  planForm: FormState | null;
  planning: { done: number; total: number } | null;
  planError: string | null;
  /** Đổi mỗi lần tính xong để bản đồ căn lại khung nhìn */
  planRun: number;
  selectedKey: string | null;
  hoverKey: string | null;
  showSeaRoute: boolean;
  view3d: boolean;
  follow: boolean;
  /** Mã cảng đang xem ở chế độ "cảng 3D" */
  portView: string | null;
  /** Mã cảng đang mở thẻ thông tin */
  portCard: string | null;
  explainerOpen: boolean;
  allTermsOpen: boolean;
  detailTab: DetailTab;
  detailOpen: boolean;
  /** id lộ trình hãng tàu đang chọn */
  scheduleId: string | null;
  /** Lịch lấy từ API hãng tàu (DCSA) theo cặp cảng "POL>POD" – không lưu lâu dài */
  apiSchedules: Record<string, (DcsaFetchResult & { status: 'ok' }) | { status: 'loading' } | { status: 'error'; error: string }>;
  notice: string | null;
  toast: string | null;
  saved: SavedPlan[];
  sheetOpen: boolean;

  setPage: (p: Page) => void;
  setForm: (patch: Partial<FormState>) => void;
  setMode: (m: TransportMode) => void;
  setTerm: (t: Incoterm, opts?: { silent?: boolean }) => void;
  setPriority: (p: Priority) => void;
  setWeight: (k: keyof Weights, v: number) => void;
  set: (patch: Partial<AppState>) => void;
  select: (key: string | null) => void;
  showToast: (msg: string) => void;
  savePlan: (p: Omit<SavedPlan, 'id' | 'createdAt'>) => void;
  deleteSaved: (id: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = create<AppState>((set, get) => ({
  page: 'plan',
  form: DEFAULT_FORM,
  weights: WEIGHT_PRESETS.balanced,
  weightsCustom: false,
  costBasis: 'mine',
  destChargesBySeller: false,
  plan: null,
  planKey: null,
  planForm: null,
  planning: null,
  planError: null,
  planRun: 0,
  selectedKey: null,
  hoverKey: null,
  showSeaRoute: true,
  view3d: false,
  follow: false,
  portView: null,
  portCard: null,
  explainerOpen: false,
  allTermsOpen: false,
  detailTab: 'cost',
  detailOpen: false,
  scheduleId: null,
  apiSchedules: {},
  notice: null,
  toast: null,
  saved: loadSaved(),
  sheetOpen: true,

  setPage: (page) => set({ page }),
  setForm: (patch) =>
    set((s) => {
      const form = { ...s.form, ...patch };
      if (patch.cargo === 'reefer') form.container = '40RF';
      if (patch.cargo && patch.cargo !== 'reefer' && form.container === '40RF') form.container = '40HC';
      if (patch.container === '40RF') form.cargo = 'reefer';
      return { form };
    }),
  setMode: (mode) =>
    set((s) => {
      let term = s.form.term, notice: string | null = null;
      if (!termsForMode(mode).includes(term)) {
        const eq = SEA_ONLY_EQUIVALENT[term] ?? 'FCA';
        notice = `${term} chỉ dùng cho đường biển – đã chuyển sang điều kiện tương đương ${eq}.`;
        term = eq;
      }
      return { form: { ...s.form, mode, term }, notice, scheduleId: null };
    }),
  setTerm: (term, opts) => set((s) => ({ form: { ...s.form, term }, notice: null, explainerOpen: opts?.silent || !useDataStore.getState().explainerAutoplay ? s.explainerOpen : true })),
  setPriority: (priority) => set((s) => ({ form: { ...s.form, priority }, weights: WEIGHT_PRESETS[priority], weightsCustom: false })),
  setWeight: (k, v) => set((s) => ({ weights: { ...s.weights, [k]: v }, weightsCustom: true })),
  set: (patch) => set(patch),
  select: (selectedKey) => set((s) => ({ selectedKey, scheduleId: null, follow: false, portView: selectedKey ? s.portView : null })),
  showToast: (toast) => {
    clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 2800);
  },
  savePlan: (p) => {
    const item: SavedPlan = { ...p, id: Math.random().toString(36).slice(2, 10), createdAt: new Date().toISOString() };
    const saved = [item, ...get().saved].slice(0, 50);
    persistSaved(saved);
    set({ saved });
  },
  deleteSaved: (id) => {
    const saved = get().saved.filter((q) => q.id !== id);
    persistSaved(saved);
    set({ saved });
  },
}));

/* ───────────── Playback (tách riêng để chỉ thanh tiến trình / bản đồ re-render mỗi khung hình) ───────────── */

export type Speed = 0.5 | 1 | 2 | 5;

interface PlaybackState {
  /** 0..1 */
  progress: number;
  playing: boolean;
  speed: Speed;
  setProgress: (p: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: Speed) => void;
}

export const usePlayback = create<PlaybackState>((set) => ({
  progress: 0,
  playing: true,
  speed: 1,
  setProgress: (progress) => set({ progress: Math.max(0, Math.min(1, progress)) }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
}));
