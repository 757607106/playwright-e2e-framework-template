const { openSync, readFileSync, writeFileSync, closeSync, mkdirSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');

/** One owner spans archival, Playwright and attachment processing. Children borrow its token. */
function acquireReportLock(artifactsDir) {
  mkdirSync(artifactsDir, { recursive: true });
  const file = join(artifactsDir, '.report-lock');
  const token = randomUUID();
  let descriptor;
  try { descriptor = openSync(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(readFileSync(file, 'utf8')); } catch { /* An incomplete lock also blocks writes. */ }
    if (owner?.token && owner.token === process.env.E2E_REPORT_LOCK_TOKEN) {
      try { process.kill(owner.pid, 0); return () => {}; } catch { /* Do not borrow an orphaned lock. */ }
    }
    throw new Error(`Reports are locked at ${file}${Number.isInteger(owner?.pid) ? ` (owner PID ${owner.pid})` : ''}. Finish the active run; after a hard kill, verify the owner has exited before removing this lock.`);
  }
  try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token })); }
  catch (error) { unlinkSync(file); throw error; }
  finally { closeSync(descriptor); }
  const previousToken = process.env.E2E_REPORT_LOCK_TOKEN;
  process.env.E2E_REPORT_LOCK_TOKEN = token;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.removeListener('exit', release);
    try {
      const owner = JSON.parse(readFileSync(file, 'utf8'));
      if (owner.token === token && owner.pid === process.pid) unlinkSync(file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (process.env.E2E_REPORT_LOCK_TOKEN === token) {
      if (previousToken === undefined) delete process.env.E2E_REPORT_LOCK_TOKEN;
      else process.env.E2E_REPORT_LOCK_TOKEN = previousToken;
    }
  };
  process.once('exit', release);
  return release;
}

function withReportLock(artifactsDir, action) {
  const release = acquireReportLock(artifactsDir);
  try { return action(); } finally { release(); }
}

module.exports = { acquireReportLock, withReportLock };
