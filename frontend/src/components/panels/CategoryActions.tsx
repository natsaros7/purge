import { useState } from 'react';
import { Lightning } from '@phosphor-icons/react';
import { RemediationAction, Category } from '../../types';
import { runCategory } from '../../lib/api';
import { COLORS } from '../../theme';
import { ActionButton } from './ActionButton';

interface Props {
  category: Category;
  actions: RemediationAction[];
  onDone: () => void;
  onLog?: (text: string) => void;
}

const CAT_LABEL: Record<Category, string> = {
  disk: 'Disk', docker: 'Docker', caches: 'Caches', builds: 'Builds', process: 'Process', nodemodules: 'node_modules', memory: 'Memory',
};

/** Per-category action zone: a "Fix all" button plus individual actions. */
export function CategoryActions({ category, actions, onDone, onLog }: Props) {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle');
  const [expanded, setExpanded] = useState(false);

  if (actions.length === 0) return null;

  const totalGB = actions.reduce((s, a) => s + a.estimatedReclaimBytes, 0) / 1024 ** 3;

  const handleFixAll = async () => {
    if (phase === 'idle')    { setPhase('confirm'); return; }
    if (phase === 'confirm') {
      const ts = Date.now();
      setPhase('running');
      onLog?.(`Fixing ${CAT_LABEL[category]} — ${actions.length} action${actions.length !== 1 ? 's' : ''}`);
      const res = await runCategory(category);
      setPhase(res.ok ? 'done' : 'idle');
      if (res.ok) {
        const gb = ((res.reclaimedBytes ?? 0) / 1024 ** 3).toFixed(2);
        const secs = ((Date.now() - ts) / 1000).toFixed(1);
        onLog?.(`Done: ${CAT_LABEL[category]} — +${gb} GB reclaimed in ${secs}s`);
        setTimeout(onDone, 1200);
      } else {
        onLog?.(`Failed: ${CAT_LABEL[category]} cleanup`);
      }
    }
  };

  const fixLabel = phase === 'idle'    ? `Fix ${CAT_LABEL[category]} — reclaim ${totalGB.toFixed(2)} GB`
    : phase === 'confirm'  ? `Confirm — clean ${actions.length} item${actions.length !== 1 ? 's' : ''}`
    : phase === 'running'  ? 'Cleaning…'
    : '✓ Done';

  const fixBg = phase === 'confirm' ? COLORS.warn : phase === 'done' ? COLORS.primaryDk : COLORS.primary;

  return (
    <div style={{ borderTop: `1px solid ${COLORS.line}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button
        onClick={handleFixAll}
        disabled={phase === 'running'}
        style={{
          width: '100%', minHeight: 50, borderRadius: 10, border: 'none', cursor: phase === 'running' ? 'default' : 'pointer',
          background: fixBg, color: '#04211a', fontWeight: 800, fontSize: 15, letterSpacing: '0.04em',
          fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: phase === 'running' ? 'none' : `0 3px 16px ${fixBg}44`, opacity: phase === 'running' ? 0.7 : 1,
          transition: 'background .15s, opacity .15s',
        }}
      >
        <Lightning size={18} weight="fill" /> {fixLabel}
      </button>

      {actions.length > 1 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', color: COLORS.textDim, cursor: 'pointer', fontSize: 13, textAlign: 'left', fontFamily: 'Inter, sans-serif', padding: 0 }}
        >
          {expanded ? '▾ Hide individual actions' : `▸ Or pick individually (${actions.length})`}
        </button>
      )}

      {(expanded || actions.length === 1) && actions.map(a => (
        <ActionButton key={a.id} action={a} onDone={onDone} onLog={onLog} />
      ))}
    </div>
  );
}
