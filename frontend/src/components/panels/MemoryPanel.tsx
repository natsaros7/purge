import { Brain } from '@phosphor-icons/react';
import { CategoryScan } from '../../types';
import { PanelShell } from './PanelShell';
import { BigValue, NoAction } from './primitives';
import { COLORS, scoreColor, scoreTrack } from '../../theme';

interface Props { scan: CategoryScan; loading?: boolean; aiCount?: number; }

export function MemoryPanel({ scan, loading, aiCount }: Props) {
  const usedGB  = scan.metrics['usedGB']  as number ?? 0;
  const freeGB  = scan.metrics['freeGB']  as number ?? 0;
  const totalGB = scan.metrics['totalGB'] as number ?? 0;
  const usedPct = scan.metrics['usedPct'] as number ?? 0;
  const barColor = scoreColor(scan.score);
  const trackColor = scoreTrack(scan.score);

  return (
    <PanelShell
      title="Memory" icon={Brain} score={scan.score} loading={loading} aiCount={aiCount}
      error={scan.error && scan.error !== 'DAEMON_OFFLINE' ? scan.error : undefined}
    >
      <BigValue value={usedGB.toFixed(1)} unit="GB" sub={`used of ${totalGB} GB · ${freeGB.toFixed(1)} GB free`} score={scan.score} />
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: COLORS.textMute }}>
          <span>Memory pressure</span>
          <span style={{ color: barColor, fontWeight: 700 }}>{usedPct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: trackColor, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${usedPct}%`, borderRadius: 3, background: barColor, transition: 'width 0.4s ease' }} />
        </div>
      </div>
      <NoAction text="Read-only" />
    </PanelShell>
  );
}
