import { HardDrives } from '@phosphor-icons/react';
import { CategoryScan } from '../../types';
import { PanelShell } from './PanelShell';
import { BigValue, NoAction } from './primitives';

interface Props { scan: CategoryScan; loading?: boolean; aiCount?: number; onRefetch?: () => void; }

export function DiskPanel({ scan, loading, aiCount, onRefetch }: Props) {
  const freeGB  = scan.metrics['freeGB']  as number ?? 0;
  const totalGB = scan.metrics['totalGB'] as number ?? 0;
  return (
    <PanelShell
      title="Disk" icon={HardDrives} score={scan.score} loading={loading} aiCount={aiCount} onRefetch={onRefetch}
      error={scan.error && scan.error !== 'DAEMON_OFFLINE' ? scan.error : undefined}
    >
      <BigValue value={freeGB} unit="GB" sub={`free of ${totalGB} GB`} score={scan.score} />
      <NoAction text="Indicator only" />
    </PanelShell>
  );
}
