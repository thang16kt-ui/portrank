import { describe, expect, it } from 'vitest';
import { COLOR_FIELDS, DEFAULT_THEME_SETTING, MAP_THEMES, hexToRgb, labelVars, luminance, mix, resolveTheme } from '../src/config/mapThemes';

describe('chủ đề màu bản đồ', () => {
  it('mặc định là "Tối phát sáng" với nền #070b14 như đặc tả', () => {
    const t = resolveTheme(DEFAULT_THEME_SETTING);
    expect(t.id).toBe('glow');
    expect(t.colors.sea).toBe('#070b14');
    expect(t.light).toBe(false);
  });
  it('mọi chủ đề có đủ màu cho mọi ô tùy chỉnh, mã màu hợp lệ', () => {
    for (const th of MAP_THEMES) for (const f of COLOR_FIELDS) expect(th.colors[f.key]).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('ghi đè màu, bỏ qua giá trị không hợp lệ, chủ đề lạ → mặc định', () => {
    const t = resolveTheme({ base: 'navy', overrides: { rank1: '#FF0000', land: 'red', sea: '#12' as string }, glow: null });
    expect(t.colors.rank1).toBe('#ff0000');
    expect(t.colors.land).toBe(MAP_THEMES.find((x) => x.id === 'navy')!.colors.land);
    expect(resolveTheme({ base: 'khong-co', overrides: {}, glow: null }).id).toBe('glow');
  });
  it('nền sáng/tối theo màu biển → nhãn đổi chữ tối/sáng', () => {
    expect(resolveTheme({ base: 'chart', overrides: {}, glow: null }).light).toBe(true);
    const darkSea = resolveTheme({ base: 'chart', overrides: { sea: '#05080f' }, glow: null });
    expect(darkSea.light).toBe(false);
    expect(labelVars(darkSea)['--map-label-fg']).toBe('#e8f1fb');
    expect(labelVars(resolveTheme({ base: 'light', overrides: {}, glow: null }))['--map-label-fg']).toBe('#0f172a');
  });
  it('độ phát sáng bị giới hạn 0..1', () => {
    expect(resolveTheme({ base: 'glow', overrides: {}, glow: 3 }).glow).toBe(1);
    expect(resolveTheme({ base: 'glow', overrides: {}, glow: -1 }).glow).toBe(0);
    expect(resolveTheme({ base: 'glow', overrides: {}, glow: null }).glow).toBe(0.4);
  });
  it('tiện ích màu', () => {
    expect(hexToRgb('#fbbf24')).toEqual([251, 191, 36]);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(luminance('#ffffff')).toBeCloseTo(1, 6);
    expect(luminance('#000000')).toBe(0);
  });
});

import { ringsToLines } from '../src/lib/world';
describe('đường bờ biển qua kinh tuyến 180°', () => {
  it('cắt đoạn nối hai điểm lệch kinh độ > 180° (không vẽ vệt ngang bản đồ)', () => {
    const fiji = [[[177, -17], [180, -17.5], [-180, -17.5], [-179, -16], [177, -17]]];
    const lines = ringsToLines(fiji);
    expect(lines).toEqual([[[177, -17], [180, -17.5]], [[-180, -17.5], [-179, -16]], [[177, -17]]].filter((l) => l.length > 1));
    for (const l of lines) for (let i = 1; i < l.length; i++) expect(Math.abs(l[i][0] - l[i - 1][0])).toBeLessThanOrEqual(180);
  });
  it('vòng bình thường giữ nguyên', () => {
    const r = [[[0, 0], [1, 0], [1, 1], [0, 0]]];
    expect(ringsToLines(r)).toEqual(r);
  });
});
