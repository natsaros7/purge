import { homedir } from 'node:os';
import path from 'node:path';

const HOME = homedir();

// Shell metacharacters — reject anything that could chain/redirect/expand.
const SHELL_METACHAR = /[;&|`$()<>\\'"\n\r]/;

// Safe command prefixes the AI is allowed to have executed. Anything else is copy-only.
const ALLOWED_AI_PREFIXES: RegExp[] = [
  /^npm cache clean\b/,
  /^brew cleanup\b/,
  /^brew autoremove\b/,
  /^docker (system|image|volume|builder|container) prune\b/,
  /^git (-C \S+ )?branch -d\b/,
  /^git (-C \S+ )?worktree remove\b/,
  /^xcrun simctl delete\b/,
  /^rm (-[rf]+ )?\//,   // rm of an absolute path (denylist-checked below)
];

// Paths that must never be touched, regardless of AI output.
const DENYLIST = [
  path.join(HOME, '.ssh'),
  path.join(HOME, '.gnupg'),
  path.join(HOME, 'Library', 'Keychains'),
  path.join(HOME, 'Library', 'Application Support', 'Google'),
  path.join(HOME, 'Library', 'Application Support', 'Firefox'),
  path.join(HOME, 'Library', 'Application Support', 'Microsoft Edge'),
  '/System',
  '/Library',
];

function pathDenied(arg: string): boolean {
  if (arg.startsWith('-')) return false;
  if (!arg.startsWith('/') && !arg.startsWith('~')) return false;
  const resolved = path.resolve(arg.replace(/^~/, HOME));
  return DENYLIST.some(d => resolved === d || resolved.startsWith(d + path.sep));
}

/** True if this AI command is safe to run via /api/diagnose/run. */
export function isRunnable(command: string | undefined): boolean {
  if (!command) return false;
  if (SHELL_METACHAR.test(command)) return false;
  if (!ALLOWED_AI_PREFIXES.some(re => re.test(command))) return false;
  // Full-string scan catches denylist paths that contain spaces (which the whitespace
  // split below would fragment). This is the primary guard for paths like
  // "Application Support/Google".
  if (DENYLIST.some(d => command.includes(d))) return false;
  // Per-arg scan handles tilde-expanded paths and catches args that aren't
  // picked up by the substring scan (e.g. exact ~ paths).
  const args = command.trim().split(/\s+/).slice(1);
  if (args.some(pathDenied)) return false;
  return true;
}
