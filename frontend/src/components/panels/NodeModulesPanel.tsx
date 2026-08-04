import { Package } from '@phosphor-icons/react';
import { CategoryScan } from '../../types';
import { PanelShell } from './PanelShell';
import { CategoryActions } from './CategoryActions';
import { BigValue, NoAction } from './primitives';

interface Props { scan: CategoryScan; loading?: boolean; aiCount?: number; onRefetch: () => void; onLog?: (text: string) => void; }

export function NodeModulesPanel({ scan, loading, aiCount, onRefetch, onLog }: Props) {
  const hasActions = scan.actions.length > 0;
  const totalGB  = scan.metrics['totalGB']  as number ?? 0;
  const dirCount = scan.metrics['dirCount'] as number ?? 0;

  return (
    <PanelShell title="node_modules" icon={Package} score={scan.score} loading={loading} aiCount={aiCount} span={hasActions ? { row: 2 } : undefined}>
      {hasActions
        ? <BigValue value={totalGB.toFixed(2)} unit="GB" sub={`across ${dirCount} project${dirCount !== 1 ? 's' : ''}`} score={scan.score} />
        : <BigValue value={scan.score} sub="no stale node_modules" score={scan.score} />}
      {hasActions
        ? <CategoryActions category="nodemodules" actions={scan.actions} onDone={onRefetch} onLog={onLog} />
        : <NoAction text="Nothing to reclaim" />}
    </PanelShell>
  );
}
