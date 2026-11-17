import { parseManualCsv, parseProductsCsv } from '../../lib/tariff';
import manualCsv from './manual.csv?raw';
import productsCsv from './products.csv?raw';
import type { Product, TariffBook } from './types';

/**
 * Dữ liệu biểu thuế của app:
 *  - generated/*.json – tải tự động bằng `npm run tariffs:update` (USITC, UK Trade Tariff)
 *  - manual.csv       – nhập tay cho nước chưa có API (EU, Việt Nam…)
 *  - products.csv     – danh mục hàng hoá & mã quốc gia
 */
const generated = import.meta.glob<TariffBook>('./generated/[A-Z][A-Z].json', { eager: true, import: 'default' });
const hs6 = import.meta.glob<{ items: Record<string, string> }>('./generated/hs6.json', { eager: true, import: 'default' });

export const PRODUCTS: Product[] = parseProductsCsv(productsCsv);
export const TARIFF_BOOKS: TariffBook[] = [...Object.values(generated), ...parseManualCsv(manualCsv)];
/** Mô tả HS6 (HS 2022) từ GitHub datasets/harmonized-system */
export const HS6_DESC: Record<string, string> = Object.values(hs6)[0]?.items ?? {};

export const getProduct = (sku: string | null | undefined) => PRODUCTS.find((p) => p.sku === sku);
