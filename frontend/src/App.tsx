import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowsClockwise, Lightning, Info, Sparkle, Sparkle as SparkleIcon } from '@phosphor-icons/react';
import { PurgeEvent, Category, AISuggestion } from './types';
import { useCategoryScans, CATEGORIES } from './hooks/useCategoryScans';
import { useGitScan } from './hooks/useGitScan';
import { useSSE } from './hooks/useSSE';
import { triggerRun, runDiagnose } from './lib/api';
import { useScoreHistory } from './hooks/useScoreHistory';
import { COLORS, scoreColor } from './theme';
import { AlertBanner } from './components/hud/AlertBanner';
import { AboutOverlay } from './components/hud/AboutOverlay';
import { ActionLog, LogEntry } from './components/hud/ActionLog';
import { HeroTile } from './components/hud/HeroTile';
import { DiskPanel } from './components/panels/DiskPanel';
import { DockerPanel } from './components/panels/DockerPanel';
import { CachePanel } from './components/panels/CachePanel';
import { BuildsPanel } from './components/panels/BuildsPanel';
import { ProcessPanel } from './components/panels/ProcessPanel';
import { NodeModulesPanel } from './components/panels/NodeModulesPanel';
import { MemoryPanel } from './components/panels/MemoryPanel';
import { GitPanel } from './components/panels/GitPanel';
import { AITile } from './components/panels/AITile';

type Phase = 'IDLE' | 'PLANNING' | 'EXECUTING' | 'EVALUATING' | 'REPLANNING' | 'COMPLETE' | 'FAILED';

const CAT_LABELS: Record<Category, string> = { disk: 'Disk', docker: 'Docker', caches: 'Caches', builds: 'Builds', process: 'Process', nodemodules: 'node_modules', memory: 'Memory' };
const EMPTY = (cat: Category) => ({ category: cat, score: 0, metrics: {}, actions: [] });

function categoryToLabel(c: string): string {
  return CAT_LABELS[c as Category] ?? c;
}

export default function App() {
  const { scans, loading, overall, refetchAll, refetchOne } = useCategoryScans();
  const { git, loading: gitLoading, refetch: refetchGit } = useGitScan();
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | undefined>();
  const [aiRan, setAiRan] = useState(false);
  const allLoaded = CATEGORIES.every(c => !loading.has(c)) && overall > 0;
  const scoreHistory = useScoreHistory(overall, allLoaded);

  const addLog = useCallback((text: string, type: LogEntry['type']) => {
    setLog(prev => [...prev.slice(-99), { id: `${Date.now()}-${Math.random()}`, text, type, timestamp: Date.now() }]);
  }, []);

  const handleEvent = useCallback((event: PurgeEvent) => {
    switch (event.phase) {
      case 'PLANNING':  setPhase('PLANNING'); addLog('Diagnostic scan complete — building remediation plan', 'info'); break;
      case 'EXECUTING': setPhase('EXECUTING');
        if (event.status === 'start') addLog(`Executing: ${event.label}`, 'info');
        if (event.status === 'done')  addLog(`Done: ${event.label} — ${event.reclaimedBytes ? `+${(event.reclaimedBytes / 1024 ** 3).toFixed(2)} GB reclaimed` : 'complete'}`, 'success');
        break;
      case 'EVALUATING': setPhase('EVALUATING');
        addLog(`Evaluating ${categoryToLabel(event.category)}: ${event.passed ? `PASS (score ${event.newScore})` : 'FAIL — replanning'}`, event.passed ? 'success' : 'warning');
        if (event.passed) refetchOne(event.category as Category);
        break;
      case 'REPLANNING': setPhase('REPLANNING'); addLog(`Replanning — cycle ${event.cycle}, ${event.tasksRemaining} tasks remaining`, 'warning'); break;
      case 'COMPLETE':
        setPhase('COMPLETE');
        addLog(`Complete — ${(event.summary.totalReclaimedBytes / 1024 ** 3).toFixed(2)} GB reclaimed, ${event.summary.passCount} pass, ${event.summary.failCount} fail`, 'success');
        refetchAll(true);
        setTimeout(() => setPhase('IDLE'), 5000);
        break;
      case 'FAILED': setPhase('FAILED'); addLog(`Task failed: ${event.reason}`, 'error'); break;
    }
  }, [addLog, refetchAll, refetchOne]);

  const handleRescan = useCallback(() => {
    addLog('Rescanning all subsystems…', 'info');
    refetchAll(true);
    refetchGit(true);
  }, [addLog, refetchAll, refetchGit]);

  const handleDiagnose = useCallback(async () => {
    if (aiLoading) return;
    setAiLoading(true); setAiRan(true); setAiError(undefined);
    addLog('AI diagnosis started — Claude is analyzing your system…', 'info');
    const res = await runDiagnose();
    setAiSuggestions(res.suggestions);
    setAiError(res.error);
    setAiLoading(false);
    addLog(res.error ? `AI diagnosis failed: ${res.error}` : `AI diagnosis complete — ${res.suggestions.length} suggestions`, res.error ? 'error' : 'success');
  }, [aiLoading, addLog]);

  useSSE(handleEvent);

  const handleExecute = async () => {
    if (phase !== 'IDLE') return;
    setLog([]);
    addLog('Initiating diagnostic sequence...', 'info');
    await triggerRun();
  };

  const getScan = (cat: Category) => scans[cat] ?? EMPTY(cat);
  const isLoading = (cat: Category) => loading.has(cat);
  const isRunning = phase !== 'IDLE' && phase !== 'COMPLETE';
  const anyLoading = CATEGORIES.some(c => loading.has(c));
  const overallColor = scoreColor(overall);
  const reclaimableGB = CATEGORIES.reduce((sum, c) =>
    sum + getScan(c).actions.reduce((s, a) => s + a.estimatedReclaimBytes, 0), 0) / 1024 ** 3;
  const gitFindings = git?.findings.length ?? 0;
  const aiCountByCat = aiSuggestions.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const btnBase: React.CSSProperties = {
    fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 700, letterSpacing: '0.06em',
    cursor: 'pointer', borderRadius: 8, padding: '12px 22px', minHeight: 48,
    display: 'inline-flex', alignItems: 'center', gap: 9, transition: 'all .15s', border: '1.5px solid transparent',
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: COLORS.bg, color: COLORS.text, display: 'flex', flexDirection: 'column' }}>
      <AboutOverlay open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 32px', borderBottom: `1px solid ${COLORS.line}`,
        background: 'linear-gradient(180deg, rgba(0,224,172,0.04), transparent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.15, 1] }}
            transition={{ duration: 2.4, repeat: Infinity }}
            style={{ width: 12, height: 12, borderRadius: '50%', background: overallColor, boxShadow: `0 0 12px ${overallColor}` }}
          />
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.14em', color: COLORS.text }}>
            PURGE
          </span>
          <span style={{ fontSize: 13, letterSpacing: '0.2em', color: COLORS.textMute, textTransform: 'uppercase' }}>
            System Diagnostics
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setAboutOpen(true)}
            title="What is Purge?"
            style={{ ...btnBase, padding: '12px 14px', background: 'transparent', borderColor: COLORS.line, color: COLORS.textDim }}
          >
            <Info size={17} /> About
          </button>
          <button
            onClick={handleRescan} disabled={isRunning || anyLoading || gitLoading}
            style={{ ...btnBase, background: 'transparent', borderColor: COLORS.line, color: COLORS.textDim, opacity: (isRunning || anyLoading || gitLoading) ? 0.4 : 1 }}
          >
            <ArrowsClockwise size={17} className={(anyLoading || gitLoading) ? 'spin' : ''} /> Rescan
          </button>
          <button
            onClick={handleDiagnose} disabled={aiLoading}
            style={{ ...btnBase, background: 'transparent', borderColor: '#A78BFA66', color: '#A78BFA', opacity: aiLoading ? 0.5 : 1 }}
          >
            <Sparkle size={17} weight="fill" className={aiLoading ? 'spin' : ''} /> {aiLoading ? 'Analyzing…' : 'AI Diagnose'}
          </button>
          <button
            onClick={handleExecute} disabled={isRunning}
            style={{ ...btnBase, background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDk})`, color: '#04211a', boxShadow: `0 4px 20px rgba(0,224,172,0.3)`, opacity: isRunning ? 0.7 : 1 }}
          >
            <Lightning size={17} weight="fill" /> {isRunning ? phase : 'Auto-Fix All'}
          </button>
        </div>
      </header>

      <AlertBanner phase={phase} />

      {/* Bento grid */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: 'minmax(150px, auto)',
          gridAutoFlow: 'dense',
          gap: 18,
          maxWidth: 1500,
          margin: '0 auto',
        }}>
          <HeroTile score={overall} loading={anyLoading} reclaimableGB={reclaimableGB} gitFindings={gitFindings} history={scoreHistory} />

          <DiskPanel    scan={getScan('disk')}    loading={isLoading('disk')}    aiCount={aiCountByCat['disk']}    onRefetch={() => refetchOne('disk')} />
          <DockerPanel  scan={getScan('docker')}  loading={isLoading('docker')}  aiCount={aiCountByCat['docker']}  onRefetch={() => refetchOne('docker')}  onLog={t => addLog(t, 'info')} />
          <CachePanel   scan={getScan('caches')}  loading={isLoading('caches')}  aiCount={aiCountByCat['caches']}  onRefetch={() => refetchOne('caches')}  onLog={t => addLog(t, 'info')} />
          <BuildsPanel      scan={getScan('builds')}      loading={isLoading('builds')}      aiCount={aiCountByCat['builds']}      onRefetch={() => refetchOne('builds')}      onLog={t => addLog(t, 'info')} />
          <ProcessPanel     scan={getScan('process')}     loading={isLoading('process')}     aiCount={aiCountByCat['process']}     onRefetch={() => refetchOne('process')} />
          <NodeModulesPanel scan={getScan('nodemodules')} loading={isLoading('nodemodules')} aiCount={aiCountByCat['nodemodules']} onRefetch={() => refetchOne('nodemodules')} onLog={t => addLog(t, 'info')} />
          <MemoryPanel      scan={getScan('memory')}      loading={isLoading('memory')}      aiCount={aiCountByCat['memory']} />

          {/* AI Insights — a header strip plus a spawned tile per suggestion */}
          {(aiRan || aiLoading) && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <SparkleIcon size={20} color="#A78BFA" weight="fill" />
              <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>AI Insights</span>
              {aiLoading && <span style={{ fontSize: 14, color: '#A78BFA' }}>Claude is analyzing your system…</span>}
              {!aiLoading && !aiError && <span style={{ fontSize: 14, color: COLORS.textDim }}>{aiSuggestions.length} suggestion{aiSuggestions.length !== 1 ? 's' : ''} — review & run individually</span>}
              {!aiLoading && aiError && <span style={{ fontSize: 14, color: COLORS.warn }}>Failed: {aiError} (is the Claude CLI installed & authenticated?)</span>}
            </div>
          )}
          <AnimatePresence mode="popLayout">
            {aiLoading
              ? [0, 1, 2].map(i => (
                <motion.div
                  key={`sk-${i}`}
                  style={{ gridColumn: 'span 2', minHeight: 150, borderRadius: 20, background: 'rgba(167,139,250,0.06)' }}
                  animate={{ opacity: [0.4, 0.75, 0.4] }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
                />
              ))
              : aiSuggestions.map((s, i) => (
                <AITile
                  key={s.id} index={i} suggestion={s}
                  onLog={t => addLog(t, 'info')}
                  onDone={id => {
                    setAiSuggestions(prev => prev.filter(x => x.id !== id));
                    refetchAll(true); refetchGit(true);
                  }}
                />
              ))
            }
          </AnimatePresence>

          {/* Git — full width */}
          <div style={{ gridColumn: '1 / -1' }}>
            {gitLoading ? (
              <div style={{ padding: 24, background: '#14201f', borderRadius: 20, fontSize: 15, color: COLORS.textMute, fontStyle: 'italic' }}>
                Scanning git repositories…
              </div>
            ) : git && <GitPanel git={git} />}
          </div>

          {/* Activity — full width */}
          <div style={{ gridColumn: '1 / -1' }}>
            <ActionLog entries={log} />
          </div>
        </div>
      </div>
    </div>
  );
}
