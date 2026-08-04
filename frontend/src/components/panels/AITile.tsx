import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkle, Copy, Check, Warning } from '@phosphor-icons/react';
import { AISuggestion } from '../../types';
import { COLORS } from '../../theme';
import { runSuggestion } from '../../lib/api';

interface Props {
  suggestion: AISuggestion;
  index: number;
  onLog?: (text: string) => void;
  onDone?: (id: string) => void;
}

const AI = '#A78BFA';

const RISK: Record<AISuggestion['risk'], { fg: string; bg: string }> = {
  low:    { fg: COLORS.primary, bg: 'rgba(0,224,172,0.12)' },
  medium: { fg: COLORS.warn,    bg: 'rgba(255,194,75,0.12)' },
  high:   { fg: COLORS.crit,    bg: 'rgba(255,92,134,0.12)' },
};

export function AITile({ suggestion: s, index, onLog, onDone }: Props) {
  const [state, setState] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const risk = RISK[s.risk];

  const handleRun = async () => {
    if (state === 'idle')    { setState('confirm'); return; }
    if (state === 'confirm') {
      const ts = Date.now();
      setState('running');
      setErrorMsg(undefined);
      onLog?.(`AI: running "${s.title}"`);
      const res = await runSuggestion(s.id);
      if (res.ok) {
        setState('done');
        const gb = ((res.reclaimedBytes ?? 0) / 1024 ** 3).toFixed(2);
        onLog?.(`AI: done "${s.title}" — ~${gb} GB in ${((Date.now() - ts) / 1000).toFixed(1)}s`);
        // Remove tile after the done flash so the grid reflects reality.
        setTimeout(() => onDone?.(s.id), 1400);
      } else {
        setState('idle');
        const msg = res.error ?? 'unknown error';
        setErrorMsg(msg);
        onLog?.(`AI: failed "${s.title}" — ${msg}`);
        // Clear the inline error after 6s
        setTimeout(() => setErrorMsg(undefined), 6000);
      }
    }
  };

  const copy = () => {
    if (s.command) { navigator.clipboard.writeText(s.command); setCopied(true); setTimeout(() => setCopied(false), 1400); }
  };

  const runLabel = state === 'idle' ? 'RUN' : state === 'confirm' ? 'CONFIRM' : state === 'running' ? '···' : '✓ DONE';
  const runColor = state === 'confirm' ? COLORS.warn : state === 'done' ? COLORS.primary : AI;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: index * 0.1 }}
      style={{
        gridColumn: 'span 2',
        background: '#14201f',
        borderRadius: 20,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: 150,
      }}
    >
      {/* Header — matches PanelShell layout */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Sparkle size={20} color={AI} weight="duotone" />
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.02em', color: COLORS.textDim }}>{s.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
            background: risk.bg, color: risk.fg, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            {s.risk}
          </span>
          <span style={{ fontSize: 11, color: COLORS.textMute, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {s.category}
          </span>
          {s.estimatedGB ? (
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: AI }}>~{s.estimatedGB} GB</span>
          ) : null}
        </div>
      </div>

      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: COLORS.textDim, flex: 1 }}>{s.detail}</div>

      {s.command && (
        <code className="mono" style={{
          fontSize: 12, color: COLORS.textDim, background: COLORS.bg,
          padding: '9px 12px', borderRadius: 8,
          wordBreak: 'break-all', whiteSpace: 'pre-wrap',
          border: `1px solid ${COLORS.lineSoft}`,
        }}>
          {s.command}
        </code>
      )}

      {/* Inline error — shown on the tile, not just buried in the action log */}
      {errorMsg && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12,
            color: COLORS.crit, background: 'rgba(255,92,134,0.08)',
            padding: '8px 12px', borderRadius: 8, border: `1px solid rgba(255,92,134,0.2)`,
          }}
        >
          <Warning size={14} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.5 }}>{errorMsg}</span>
        </motion.div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {s.runnable ? (
          <button
            onClick={handleRun} disabled={state === 'running' || state === 'done'}
            className="mono"
            style={{
              flex: 1, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', padding: '10px', borderRadius: 8,
              cursor: (state === 'running' || state === 'done') ? 'default' : 'pointer',
              border: `1.5px solid ${runColor}`, color: runColor,
              background: 'transparent', opacity: state === 'running' ? 0.6 : 1, transition: 'all 0.15s',
            }}
          >
            {runLabel}
          </button>
        ) : (
          <span style={{ flex: 1, fontSize: 12, color: COLORS.textMute, fontStyle: 'italic', alignSelf: 'center' }}>
            {s.command ? 'manual — review before running' : 'advisory'}
          </span>
        )}
        {s.command && (
          <button
            onClick={copy}
            className="mono"
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
              padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${copied ? COLORS.primary : COLORS.line}`, color: copied ? COLORS.primary : COLORS.textDim,
              background: 'transparent', transition: 'all 0.15s',
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
