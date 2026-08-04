import { useState, useCallback, useEffect, useRef } from 'react';
import { Category, CategoryScan } from '../types';
import { fetchCategoryScan } from '../lib/api';

export type ScanMap = Partial<Record<Category, CategoryScan>>;

export const CATEGORIES: Category[] = ['disk', 'docker', 'caches', 'builds', 'process', 'nodemodules', 'memory'];

const WEIGHTS: Record<Category, number> = {
  disk: 0.10, docker: 0.30, caches: 0.25, builds: 0.10, process: 0.05, nodemodules: 0.20, memory: 0.10,
};

/** Compute overall score from whatever categories have arrived, re-normalizing weights. */
export function computeOverall(scans: ScanMap): number {
  const available = CATEGORIES.filter(c => scans[c]);
  if (!available.length) return 0;
  const totalWeight = available.reduce((s, c) => s + WEIGHTS[c], 0);
  const weighted    = available.reduce((s, c) => s + (scans[c]!.score * WEIGHTS[c]), 0);
  return Math.round(weighted / totalWeight);
}

export function useCategoryScans() {
  const [scans,   setScans]   = useState<ScanMap>({});
  const [loading, setLoading] = useState<Set<Category>>(new Set(CATEGORIES));
  const mountedRef = useRef(true);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const fetchOne = useCallback(async (cat: Category, force = false) => {
    if (!mountedRef.current) return;
    setLoading(prev => new Set([...prev, cat]));
    try {
      const data = await fetchCategoryScan(cat, force);
      if (!mountedRef.current) return;
      setScans(prev => ({ ...prev, [cat]: data }));
    } catch {
      // Leave stale data in place on error; don't crash the panel
    } finally {
      if (mountedRef.current)
        setLoading(prev => { const s = new Set(prev); s.delete(cat); return s; });
    }
  }, []);

  const refetchAll = useCallback((force = false) => {
    CATEGORIES.forEach(cat => fetchOne(cat, force));
  }, [fetchOne]);

  const refetchOne = useCallback((cat: Category) => fetchOne(cat, true), [fetchOne]);

  useEffect(() => { refetchAll(false); }, [refetchAll]);

  const overall = computeOverall(scans);

  return { scans, loading, overall, refetchAll, refetchOne };
}
