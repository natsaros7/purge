import { Package } from '@phosphor-icons/react';
import { CategoryScan } from '../../types';
import { PanelShell } from './PanelShell';
import { CategoryActions } from './CategoryActions';
import { BigValue, NoAction } from './primitives';

interface Props { scan: CategoryScan; loading?: boolean; aiCount?: number; onRefetch: () => void; onLog?: (text: string) => void; }

export function CachePanel({ scan, loading, aiCount, onRefetch, onLog }: Props) {
  const hasActions = scan.actions.length > 0;
  const reclaimGB = scan.actions.reduce((s, a) => s + a.estimatedReclaimBytes, 0) / 1024 ** 3;

  return (
    <PanelShell title="Caches" icon={Package} score={scan.score} loading={loading} aiCount={aiCount} onRefetch={onRefetch} span={hasActions ? { row: 2 } : undefined}>
      {hasActions
        ? <BigValue value={reclaimGB.toFixed(2)} unit="GB" sub="reclaimable" score={scan.score} />
        : <BigValue value={scan.score} sub="caches clear" score={scan.score} />}
      {hasActions
        ? <CategoryActions category="caches" actions={scan.actions} onDone={onRefetch} onLog={onLog} />
        : <NoAction text="Nothing to reclaim" />}
    </PanelShell>
  );
}
