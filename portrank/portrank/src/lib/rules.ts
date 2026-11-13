import { RULES, type CountryGroup, type Rule, type RuleCondition, type RuleItem } from '../config/rules';
import { ASEAN_COUNTRIES, EU_COUNTRIES } from '../data/ports';
import type { Port, RouteResult, ShipmentInput } from '../types';

export interface RuleContext {
  pol: Port;
  pod: Port;
  route: RouteResult;
  shipment: ShipmentInput;
  avoidRedSea: boolean;
  /** Số ngày chênh so với tuyến qua Suez (nếu đi vòng) */
  detourDays?: number;
}

export interface ChecklistItem extends RuleItem {
  ruleId: string;
}

export function countryGroups(country: string): CountryGroup[] {
  const g: CountryGroup[] = [];
  if (EU_COUNTRIES.has(country)) g.push('EU');
  if (ASEAN_COUNTRIES.has(country)) g.push('ASEAN');
  if (country === 'GB') g.push('UK');
  if (country === 'US') g.push('US');
  if (country === 'CA') g.push('CA');
  return g;
}

export function matches(when: RuleCondition, ctx: RuleContext): boolean {
  const { pol, pod, route, shipment } = ctx;
  if (when.cargo && !when.cargo.includes(shipment.cargo)) return false;
  if (when.mode && !when.mode.includes(shipment.mode)) return false;
  if (when.originCountry && !when.originCountry.includes(pol.country)) return false;
  if (when.destCountry && !when.destCountry.includes(pod.country)) return false;
  if (when.destGroup && !countryGroups(pod.country).some((g) => when.destGroup!.includes(g))) return false;
  if (when.originGroup && !countryGroups(pol.country).some((g) => when.originGroup!.includes(g))) return false;
  if (when.passes && !route.passages.some((p) => when.passes!.includes(p.id))) return false;
  if (when.woodPallet !== undefined && when.woodPallet !== shipment.woodPallet) return false;
  if (when.capeDetour !== undefined) {
    const isDetour = ctx.avoidRedSea && route.passages.some((p) => p.id === 'CAPE_GOOD_HOPE');
    if (when.capeDetour !== isDetour) return false;
  }
  return true;
}

function fill(s: string, ctx: RuleContext): string {
  return s
    .replace(/\{pol\}/g, ctx.pol.name)
    .replace(/\{pod\}/g, ctx.pod.name)
    .replace(/\{polCountry\}/g, ctx.pol.countryName)
    .replace(/\{podCountry\}/g, ctx.pod.countryName)
    .replace(/\{detourDays\}/g, ctx.detourDays !== undefined ? String(Math.round(ctx.detourDays)) : '10–14');
}

/** Chạy rule engine, trả về checklist */
export function evaluateRules(ctx: RuleContext, rules: Rule[] = RULES): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const r of rules) {
    if (!matches(r.when, ctx)) continue;
    for (const it of r.items) out.push({ ...it, title: fill(it.title, ctx), detail: fill(it.detail, ctx), ruleId: r.id });
  }
  return out;
}
