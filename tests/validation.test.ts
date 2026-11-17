import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM } from '../src/store/useAppStore';
import { validateShipment } from '../src/lib/validation';

describe('shipment input validation', () => {
  it('accepts a valid FCL shipment', () => expect(validateShipment(DEFAULT_FORM)).toBeNull());
  it.each([0, -1, 1.5, 501, Infinity, NaN])('rejects invalid quantity %s', (quantity) => {
    expect(validateShipment({ ...DEFAULT_FORM, quantity })).toMatch(/container/);
  });
  it.each(['', '2026-02-30', '2026-13-01', 'invalid'])('rejects invalid date %s', (readyDate) => {
    expect(validateShipment({ ...DEFAULT_FORM, readyDate })).toMatch(/ngày/);
  });
  it('rejects empty LCL cargo', () => expect(validateShipment({ ...DEFAULT_FORM, mode: 'LCL', cbm: 0, weightKg: 0 })).not.toBeNull());
  it('accepts minimum LCL values', () => expect(validateShipment({ ...DEFAULT_FORM, mode: 'LCL', cbm: 0.1, weightKg: 1 })).toBeNull());
  it('rejects the same port at both ends', () => expect(validateShipment({ ...DEFAULT_FORM, pod: DEFAULT_FORM.pol })).not.toBeNull());
});
