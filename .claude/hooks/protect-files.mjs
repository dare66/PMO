#!/usr/bin/env node
// PreToolUse hook (reviewed): blocks edits to secret files and to SQL migrations that already exist in git.
// Reads the hook JSON from stdin; exit code 2 blocks the tool call with the message on stderr.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let file = '';
  try { file = JSON.parse(input)?.tool_input?.file_path ?? ''; } catch { process.exit(0); }
  if (!file) process.exit(0);
  const base = path.basename(file);
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) {
    console.error('Blocked: .env files hold secrets and must not be edited by the agent.'); process.exit(2);
  }
  if (/backend\/migrations\/\d+_.*\.sql$/.test(file)) {
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', file], { stdio: 'ignore' });
      console.error('Blocked: this migration is already committed. Add a new migration file instead.'); process.exit(2);
    } catch { /* new, untracked migration: allowed */ }
  }
  process.exit(0);
});
