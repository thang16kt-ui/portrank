import { useEffect, useState } from 'react';
import { fetchRoadConfig, type RoadConfig } from '../providers/RoadProvider';

export function useRoadConfig(enabled = true) {
  const [config, setConfig] = useState<RoadConfig | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchRoadConfig().then((c) => {
      if (active) { setConfig(c); setError(''); }
    }, (e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [enabled, attempt]);
  return { config, error, retry: () => setAttempt((n) => n + 1) };
}
