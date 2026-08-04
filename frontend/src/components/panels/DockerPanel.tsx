import { Cube } from '@phosphor-icons/react';
import { CategoryScan } from '../../types';
import { PanelShell } from './PanelShell';
import { CategoryActions } from './CategoryActions';
import { BigValue, Pill, NoAction } from './primitives';

interface Props { scan: CategoryScan; loading?: boolean; aiCount?: number; onRefetch: () => void; onLog?: (text: string) => void; }

export function DockerPanel({ scan, loading, aiCount, onRefetch, onLog }: Props) {
  const isDaemonDown = scan.error === 'DAEMON_OFFLINE';
  const hasActions = scan.actions.length > 0;
  const buildGB  = scan.metrics['buildReclaimableGB']  as number ?? 0;
  const imageGB  = scan.metrics['imageReclaimableGB']  as number ?? 0;
  const volumeGB = scan.metrics['volumeReclaimableGB'] as number ?? 0;
  const reclaimGB = buildGB + imageGB + volumeGB;

  if (isDaemonDown) {
    return (
      <PanelShell title="Docker" icon={Cube} score={100} loading={loading} aiCount={aiCount} headerRight={<Pill text="OFFLINE" tone="warn" />}>
        <BigValue value="—" sub="daemon not running" />
        <NoAction text="Start Colima to scan" />
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Docker" icon={Cube} score={scan.score} loading={loading} aiCount={aiCount} onRefetch={onRefetch} span={hasActions ? { row: 2 } : undefined}>
      {hasActions
        ? <BigValue value={reclaimGB.toFixed(2)} unit="GB" sub="reclaimable" score={scan.score} />
        : <BigValue value={scan.score} sub="no waste" score={scan.score} />}
      {hasActions
        ? <CategoryActions category="docker" actions={scan.actions} onDone={onRefetch} onLog={onLog} />
        : <NoAction text="Nothing to reclaim" />}
    </PanelShell>
  );
}
