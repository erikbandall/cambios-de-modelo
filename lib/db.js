// Conexión a la base de datos.
//
// Producción (Vercel): Turso (libSQL), con las variables de entorno
// TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.
// Local: si @libsql/client está instalado usa el archivo data/cambios.db;
// si no, usa el SQLite que trae Node 22 (node:sqlite) contra el mismo archivo.

const path = require('path');
const fs = require('fs');

function localSqlite(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  const run = ({ sql, args = [] }) => {
    const st = db.prepare(sql);
    if (/^\s*(select|with)/i.test(sql)) return { rows: st.all(...args), rowsAffected: 0 };
    const r = st.run(...args); return { rows: [], rowsAffected: Number(r.changes) };
  };
  return {
    execute: async q => run(typeof q === 'string' ? { sql: q } : q),
    batch: async stmts => {
      db.exec('BEGIN');
      try { const out = stmts.map(s => run(typeof s === 'string' ? { sql: s } : s)); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    executeMultiple: async sql => { db.exec(sql); },
  };
}

function makeClient() {
  if (process.env.TURSO_DATABASE_URL) {
    const { createClient } = require('@libsql/client');
    return createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  if (process.env.VERCEL) throw new Error('Falta configurar TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en Vercel.');
  const dir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'cambios.db');
  try { const { createClient } = require('@libsql/client'); return createClient({ url: 'file:' + file }); }
  catch (e) { return localSqlite(file); }
}

const client = makeClient();

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','cap','ro')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    by_user TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO meta (key, value) VALUES ('version', '1')`,
];

const ready = (async () => { for (const sql of SCHEMA) await client.execute(sql); })();

const q = async (sql, args = []) => (await client.execute({ sql, args })).rows;
const one = async (sql, args = []) => (await q(sql, args))[0];
const exec = async (sql, args = []) => client.execute({ sql, args });
const batch = stmts => client.batch(stmts.map(([sql, args]) => ({ sql, args: args || [] })), 'write');
const BUMP = ["UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'version'"];

module.exports = { ready, q, one, exec, batch, BUMP };
