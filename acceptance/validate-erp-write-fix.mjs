// Validates the patched supabaseRepository write path (create + update + read-back).
// Uses a scratch row in the `tasks` table (envelope, currently empty) and cleans up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = 'D:/Duplicate/Prime ERP System/backend/.env';
const env = fs.readFileSync(envPath, 'utf8').split('\n');
for (const line of env) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const repo = (await import(pathToFileURL('D:/Duplicate/Prime ERP System/backend/services/supabaseRepository.cjs').href)).default;
// The module exports a plain object
const mod = await import('file:///D:/Duplicate/Prime ERP System/backend/services/supabaseRepository.cjs');
const repoMod = mod.default || mod;

function pathToFileURL(p) { return { href: 'file:///' + p.replace(/\\/g, '/') }; }

const id = `scratch_accept_${Date.now()}`;
let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

try {
  // 1. CREATE (no version)
  const created = await repoMod.upsert('tasks', {
    id,
    title: 'scratch-create',
    status: 'Pending',
    priority: 'Low',
    created_at: new Date().toISOString(),
  });
  check('create returns row', !!created && created.id === id, JSON.stringify(created?.id));

  // 2. READ-BACK via repo
  const read = await repoMod.getById('tasks', id);
  check('create persisted (getById)', !!read && read.title === 'scratch-create' && read.status === 'Pending',
    JSON.stringify(read ? { id: read.id, title: read.title, version: read.version } : null));
  check('created row has version 1', read && Number(read.version) === 1, `version=${read?.version}`);

  // 3. RAW cloud shape — envelope must be FLAT (data = {id, fields}, no nesting)
  const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const SECRET = process.env.SUPABASE_SECRET_KEY || '';
  const rawRes = await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${id}&select=id,data,version`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  const raw = await rawRes.json();
  const rawRow = Array.isArray(raw) ? raw[0] : raw;
  const dataKeys = rawRow?.data ? Object.keys(rawRow.data) : [];
  check('raw envelope is flat (no nested data key)', rawRow && !dataKeys.includes('data') && !dataKeys.includes('version'),
    `data keys: ${dataKeys.join(',')} | version=${rawRow?.version}`);

  // 4. UPDATE (with version from read)
  const updated = await repoMod.upsert('tasks', { ...read, title: 'scratch-updated', status: 'Done' });
  check('update returns row', !!updated, JSON.stringify(updated?.id));
  const read2 = await repoMod.getById('tasks', id);
  check('update persisted', !!read2 && read2.title === 'scratch-updated' && read2.status === 'Done',
    JSON.stringify(read2 ? { title: read2.title, status: read2.status, version: read2.version } : null));
  check('updated row version bumped to 2', read2 && Number(read2.version) === 2, `version=${read2?.version}`);

  // 5. CLEANUP — soft delete (tombstone: row kept, flagged deleted)
  await repoMod.softDelete('tasks', id);
  const after = await repoMod.getById('tasks', id);
  check('soft-delete applied (tombstone)', after && after.deleted === true && !!after.deletedAt,
    after ? `deleted=${after.deleted}` : 'row missing entirely');
} catch (err) {
  failures++;
  console.error('ERROR:', err?.stack || err);
} finally {
  // hard-remove scratch row if soft delete left a tombstone (cleanup)
  try {
    const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const SECRET = process.env.SUPABASE_SECRET_KEY || '';
    await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
    });
  } catch {}
}
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
