import { Gauge } from '@phosphor-icons/react';
import { CategoryScan } from '../../types';
import { PanelShell } from './PanelShell';
import { BigValue, NoAction } from './primitives';

interface Props { scan: CategoryScan; loading?: boolean; aiCount?: number; onRefetch?: () => void; }

export function ProcessPanel({ scan, loading, aiCount, onRefetch }: Props) {
  const load = scan.metrics['load1m'] as number ?? 0;
  const topProc = (scan.metrics['proc0_name'] as string ?? '').split('/').pop();
  const topCpu  = scan.metrics['proc0_cpu'] as string ?? '';

  return (
    <PanelShell title="Process" icon={Gauge} score={scan.score} loading={loading} aiCount={aiCount} onRefetch={onRefetch}>
      <BigValue value={scan.score} sub={`load avg ${load.toFixed(2)}`} score={scan.score} />
      <NoAction text={topProc ? `top: ${topProc} ${topCpu}%` : 'Read-only'} />
    </PanelShell>
  );
}
