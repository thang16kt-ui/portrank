import { create } from 'zustand';
import { WEIGHT_PRESETS, type Weights } from '../config/weights';
import type { Booker, CargoType, ContainerType, Incoterm, Priority, Role, RouteResult, ShipMode } from '../types';

export type Page = 'plan' | 'prices' | 'saved';
export type PickTarget = 'pol' | 'pod';
export type ResultTab = 'overview' | 'cost' | 'rules' | 'incoterm' | 'alts';

export interface FormState {
  cargo: CargoType;
  mode: ShipMode;
  container: ContainerType;
  quantity: number;
  cbm: number;
  weightKg: number;
  woodPallet: boolean;
  pol: string | null;
  pod: string | null;
  readyDate: string;
  role: Role;
  booker: Booker;
  priority: Priority;
  avoidRedSea: boolean;
  avoidPanama: boolean;
  radiusKm: number;
  engine: 'searoute' | 'graph';
}

export interface SimulationState {
  /** Mã cặp cảng đang hiển thị trên bản đồ */
  pol: string;
  pod: string;
  route: RouteResult;
  /** Đổi mỗi lần bấm "Tính & mô phỏng" để kích hoạt hoạt ảnh */
  runId: number;
}

export interface SavedQuote {
  id: string;
  createdAt: string;
  form: FormState;
  incoterm: Incoterm;
  summary: string;
  total: number;
  low: number;
  high: number;
  days: number;
  distanceNm: number;
}

const today = () => new Date().toISOString().slice(0, 10);

const SAVED_KEY = 'portrank.savedQuotes.v1';
function loadSaved(): SavedQuote[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function persistSaved(list: SavedQuote[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* bỏ qua */
  }
}

interface AppState {
  page: Page;
  form: FormState;
  pickTarget: PickTarget;
  weights: Weights;
  weightsCustom: boolean;
  /** Form đã "tính" (snapshot) – kết quả hiển thị dựa trên snapshot này */
  computed: FormState | null;
  sim: SimulationState | null;
  incoterm: Incoterm | null;
  tab: ResultTab;
  panelOpen: boolean;
  mapMode: 'globe' | 'mercator';
  follow: boolean;
  saved: SavedQuote[];
  toast: string | null;
  sidebarOpen: boolean;

  setPage: (p: Page) => void;
  setForm: (patch: Partial<FormState>) => void;
  setPort: (target: PickTarget, code: string) => void;
  swapPorts: () => void;
  setPickTarget: (t: PickTarget) => void;
  setPriority: (p: Priority) => void;
  setWeight: (k: keyof Weights, v: number) => void;
  compute: (route: RouteResult) => void;
  showRoute: (pol: string, pod: string, route: RouteResult) => void;
  setIncoterm: (i: Incoterm | null) => void;
  setTab: (t: ResultTab) => void;
  setPanelOpen: (o: boolean) => void;
  setMapMode: (m: 'globe' | 'mercator') => void;
  setFollow: (f: boolean) => void;
  saveQuote: (q: Omit<SavedQuote, 'id' | 'createdAt'>) => void;
  deleteQuote: (id: string) => void;
  loadQuote: (q: SavedQuote) => void;
  showToast: (msg: string) => void;
  setSidebarOpen: (o: boolean) => void;
}

export const DEFAULT_FORM: FormState = {
  cargo: 'dry',
  mode: 'FCL',
  container: '40HC',
  quantity: 1,
  cbm: 5,
  weightKg: 1500,
  woodPallet: true,
  pol: 'VNSGN',
  pod: 'DEHAM',
  readyDate: today(),
  role: 'seller',
  booker: 'me',
  priority: 'balanced',
  avoidRedSea: false,
  avoidPanama: false,
  radiusKm: 300,
  engine: 'searoute',
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = create<AppState>((set, get) => ({
  page: 'plan',
  form: DEFAULT_FORM,
  pickTarget: 'pol',
  weights: WEIGHT_PRESETS.balanced,
  weightsCustom: false,
  computed: null,
  sim: null,
  incoterm: null,
  tab: 'overview',
  panelOpen: true,
  mapMode: 'globe',
  follow: false,
  saved: loadSaved(),
  toast: null,
  sidebarOpen: true,

  setPage: (page) => set({ page }),
  setForm: (patch) =>
    set((s) => {
      const form = { ...s.form, ...patch };
      // hàng lạnh → container lạnh; container lạnh → hàng lạnh
      if (patch.cargo === 'reefer') form.container = '40RF';
      if (patch.cargo && patch.cargo !== 'reefer' && form.container === '40RF') form.container = '40HC';
      if (patch.container === '40RF') form.cargo = 'reefer';
      return { form };
    }),
  setPort: (target, code) =>
    set((s) => ({
      form: { ...s.form, [target]: code },
      // sau khi chọn điểm đi, tự chuyển sang chọn điểm đến
      pickTarget: target === 'pol' && !s.form.pod ? 'pod' : s.pickTarget,
    })),
  swapPorts: () => set((s) => ({ form: { ...s.form, pol: s.form.pod, pod: s.form.pol } })),
  setPickTarget: (pickTarget) => set({ pickTarget }),
  setPriority: (priority) => set((s) => ({ form: { ...s.form, priority }, weights: WEIGHT_PRESETS[priority], weightsCustom: false })),
  setWeight: (k, v) => set((s) => ({ weights: { ...s.weights, [k]: v }, weightsCustom: true })),
  compute: (route) => {
    const f = get().form;
    set((s) => ({
      computed: { ...f },
      sim: { pol: f.pol!, pod: f.pod!, route, runId: (s.sim?.runId ?? 0) + 1 },
      incoterm: null,
      panelOpen: true,
    }));
  },
  showRoute: (pol, pod, route) => set((s) => ({ sim: { pol, pod, route, runId: (s.sim?.runId ?? 0) + 1 } })),
  setIncoterm: (incoterm) => set({ incoterm }),
  setTab: (tab) => set({ tab, panelOpen: true }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setMapMode: (mapMode) => set({ mapMode }),
  setFollow: (follow) => set({ follow }),
  saveQuote: (q) => {
    const item: SavedQuote = { ...q, id: Math.random().toString(36).slice(2, 10), createdAt: new Date().toISOString() };
    const saved = [item, ...get().saved].slice(0, 50);
    persistSaved(saved);
    set({ saved });
  },
  deleteQuote: (id) => {
    const saved = get().saved.filter((q) => q.id !== id);
    persistSaved(saved);
    set({ saved });
  },
  loadQuote: (q) => set({ form: { ...DEFAULT_FORM, ...q.form }, page: 'plan', incoterm: q.incoterm }),
  showToast: (toast) => {
    clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));

/* ───────────── Playback (tách riêng để chỉ PlaybackBar/MapView re-render mỗi khung hình) ───────────── */

interface PlaybackState {
  /** 0..1 */
  progress: number;
  playing: boolean;
  speed: 1 | 2 | 5;
  setProgress: (p: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: 1 | 2 | 5) => void;
}

export const usePlayback = create<PlaybackState>((set) => ({
  progress: 0,
  playing: false,
  speed: 1,
  setProgress: (progress) => set({ progress: Math.max(0, Math.min(1, progress)) }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
}));
