import { useState, useEffect, useRef } from 'react';
import { fetchHistory, recordHistory } from '../lib/api';

export interface HistoryEntry { ts: number; score: number; }

export function useScoreHistory(overall: number, allLoaded: boolean) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const lastRecorded = useRef<number | null>(null);

  useEffect(() => {
    fetchHistory().then(setHistory);
  }, []);

  // Record the current overall score once all scans have settled.
  // Debounce: only record if the score changed from last recorded value.
  useEffect(() => {
    if (!allLoaded || overall === 0) return;
    if (lastRecorded.current === overall) return;
    lastRecorded.current = overall;
    recordHistory(overall).then(() =>
      fetchHistory().then(setHistory)
    );
  }, [overall, allLoaded]);

  return history;
}
