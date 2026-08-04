import { motion } from 'framer-motion';
import { COLORS, overallVerdict } from '../../theme';
import type { HistoryEntry } from '../../hooks/useScoreHistory';

interface Props {
  score: number;
  loading?: boolean;
  reclaimableGB?: number;
  gitFindings?: number;
  history?: HistoryEntry[];
}

function Sparkline({ entries, fg }: { entries: HistoryEntry[]; fg: string }) {
  if (entries.length < 2) return null;
  const W = 160, H = 40, PAD = 2;
  const scores = entries.map(e => e.score);
  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const range = max - min || 1;
  const pts = scores.map((s, i) => {
    const x = PAD + (i / (scores.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((s - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastScore = scores[scores.length - 1];
  const dotX = PAD + (W - PAD * 2);
  const dotY = H - PAD - ((lastScore - min) / range) * (H - PAD * 2);
  return (
    <svg width={W} height={H} style={{ overflow: 'visible', opacity: 0.85 }}>
      <polyline points={pts} fill="none" stroke={fg} strokeWidth={1.5} strokeOpacity={0.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={dotX} cy={dotY} r={3} fill={fg} />
    </svg>
  );
}

// The big overall-health tile. Gradient when healthy, flat-tinted otherwise.
export function HeroTile({ score, loading, reclaimableGB = 0, gitFindings = 0, history = [] }: Props) {
  const verdict = overallVerdict(score);

  const bg = loading
    ? '#14201f'
    : score >= 80
    ? `radial-gradient(130% 130% at 0% 0%, ${COLORS.primary} 0%, ${COLORS.primaryDk} 55%, #037a5d 100%)`
    : score >= 50
    ? 'linear-gradient(135deg, #FFC24B, #c8901f)'
    : 'linear-gradient(135deg, #FF5C86, #c23458)';
  const fg = loading ? COLORS.textDim : '#04211a';

  const parts: string[] = [];
  if (reclaimableGB > 0.01) parts.push(`${reclaimableGB.toFixed(2)} GB reclaimable`);
  if (gitFindings > 0) parts.push(`${gitFindings} git finding${gitFindings !== 1 ? 's' : ''}`);
  const detail = parts.length ? parts.join(' · ') : 'Everything looks clean';

  return (
    <div style={{
      gridColumn: 'span 2', gridRow: 'span 2',
      background: bg, borderRadius: 24, padding: 32,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      minHeight: 316, color: fg, overflow: 'hidden', position: 'relative',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.75 }}>
        Overall Health
      </div>

      <motion.div
        className="mono"
        animate={{ opacity: loading ? [0.4, 0.8, 0.4] : 1 }}
        transition={loading ? { duration: 1.2, repeat: Infinity } : {}}
        style={{ fontSize: 132, fontWeight: 800, lineHeight: 0.85, letterSpacing: '-0.04em', color: loading ? COLORS.textMute : fg }}
      >
        {loading ? '··' : score}
      </motion.div>

      {!loading && (
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{verdict.title}</div>
          <div style={{ fontSize: 15, fontWeight: 500, opacity: 0.8, marginTop: 4 }}>{detail}</div>
          {history.length >= 2 && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <Sparkline entries={history} fg={fg} />
              <span style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                {history.length} scans
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
