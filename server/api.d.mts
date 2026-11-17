import type { IncomingMessage, ServerResponse } from 'node:http';

export interface DcsaCarrierConfig {
  id: string;
  url: string;
  headers: Record<string, string> | null;
  ok: boolean;
}
export function dcsaCarriers(env?: Record<string, string | undefined>): DcsaCarrierConfig[];
export function fetchDcsaRoutes(carrier: DcsaCarrierConfig, q: { pol: string; pod: string; from?: string; to?: string }): Promise<unknown[]>;
export function handleApi(method: string, url: string, env?: Record<string, string | undefined>): Promise<{ status: number; headers: Record<string, string>; body: string } | null>;
export function apiMiddleware(env?: Record<string, string | undefined>): (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>;
