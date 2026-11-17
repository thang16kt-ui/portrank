// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../src/App';
import { DEFAULT_FORM, useAppStore, usePlayback } from '../src/store/useAppStore';
import { WEIGHT_PRESETS } from '../src/config/weights';
import MapView from '../src/components/MapView';

vi.mock('maplibre-gl', () => ({ default: { Map: class { constructor() { throw new Error('WebGL unavailable'); } } } }));
vi.mock('@deck.gl/mapbox', () => ({ MapboxOverlay: class {} }));
vi.mock('../src/components/DeckLayers', () => ({ buildLayers: () => [] }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAppStore.setState({ page: 'plan', workspaceView: 'setup', form: { ...DEFAULT_FORM }, computed: null, sim: null, incoterm: null, tab: 'overview', saved: [], toast: null, weights: WEIGHT_PRESETS.balanced });
  usePlayback.setState({ progress: 0, playing: false });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function mount() { await act(async () => root.render(createElement(App))); }
async function click(text: string) {
  const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  expect(button, `button ${text}`).toBeDefined();
  await act(async () => button!.click());
}

describe('planning UI regression', () => {
  it('starts with a usable form and keeps advanced options closed', async () => {
    await mount();
    expect(host.textContent).toContain('Lập kế hoạch vận chuyển');
    expect(host.querySelector('details')?.open).toBe(false);
    expect(host.querySelector('canvas')).toBeNull();
  });
  it('calculates results without starting animation, then exposes a stale-result notice', async () => {
    await mount(); await click('Tính & so sánh');
    expect(host.textContent).toContain('Kết quả lập kế hoạch');
    expect(useAppStore.getState().workspaceView).toBe('results');
    expect(usePlayback.getState().playing).toBe(false);
    await act(async () => useAppStore.getState().setForm({ quantity: 2 }));
    expect(host.textContent).toContain('Thông tin lô hàng đã thay đổi');
    await click('Tính & so sánh');
    expect(host.textContent).not.toContain('Thông tin lô hàng đã thay đổi');
  });
  it('opens the map safely and returns to results after WebGL failure', async () => {
    await mount(); await click('Tính & so sánh');
    await click('Xem mô phỏng');
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(host.textContent).toContain('Thiết bị này chưa mở được bản đồ');
    expect(usePlayback.getState().playing).toBe(false);
    await click('2. Kết quả');
    expect(host.textContent).toContain('Kết quả lập kế hoạch');
  });
  it('blocks fractional container counts before computing', async () => {
    await mount();
    await act(async () => useAppStore.getState().setForm({ quantity: 1.5 }));
    await click('Tính & so sánh');
    expect(host.querySelector('[role=alert]')?.textContent).toContain('số nguyên');
    expect(useAppStore.getState().computed).toBeNull();
  });
  it('keeps navigation available when the map constructor fails', async () => {
    await act(async () => root.render(createElement('div', {}, createElement('button', {}, 'Kết quả'), createElement(MapView))));
    expect(host.textContent).toContain('Thiết bị này chưa mở được bản đồ');
    expect(host.querySelector('button')?.textContent).toBe('Kết quả');
  });
});
