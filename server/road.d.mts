import type { RoadConfig, TrafficSection } from '../src/providers/RoadProvider';

export function googleTrafficSections(intervals: unknown, pointCount: number): TrafficSection[];
export function roadConfig(env?: Record<string, string | undefined>): RoadConfig;
export function handleRoad(url: URL, env?: Record<string, string | undefined>): Promise<{ status: number; headers: Record<string, string>; body: string }>;
