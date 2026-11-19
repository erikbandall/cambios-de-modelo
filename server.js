// Servidor del tablero de cambios de modelo.
// - Sirve la app (public/index.html) y las plantillas de Excel.
// - API JSON bajo /api con login, roles y base de datos compartida (Turso).
// Funciona como función de Vercel (module.exports) y localmente con `npm start`.

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./lib/db');
const auth = require('./lib/auth');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv' };
const ROLES = ['admin', 'cap', 'ro'];
const newId = p => p + crypto.randomBytes(9).toString('base64url');
const fail = (status, msg) => Object.assign(new Error(msg), { status });

function send(res, status, obj, headers = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch (e) { throw fail(400, 'JSON inválido'); } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 8 * 1024 * 1024) throw fail(413, 'Archivo demasiado grande'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { throw fail(400, 'JSON inválido'); }
}
const pubUser = u => u && { id: u.id, name: u.name, username: u.username, role: u.role, active: !!Number(u.active) };
async function currentUser(req) {
  const p = auth.verify(auth.readCookie(req)); if (!p) return null;
  const u = await db.one('SELECT * FROM users WHERE id = ?', [p.uid]);
  return u && Number(u.active) ? u : null;
}
function need(user, ...roles) {
  if (!user) throw fail(401, 'Debes iniciar sesión.');
  if (roles.length && !roles.includes(user.role)) throw fail(403, 'No tienes permiso para hacer esto.');
}
const cleanName = (s, max) => String(s || '').trim().slice(0, max);
const version = async () => Number((await db.one("SELECT value FROM meta WHERE key = 'version'")).value);
const failedLogins = new Map();

async function apiHandler(req, res, url) {
  const route = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  const user = await currentUser(req);

  if (route === '/api/health') return send(res, 200, { ok: true });

  if (route === '/api/auth/status' && m === 'GET') {
    const n = Number((await db.one('SELECT COUNT(*) AS n FROM users')).n);
    return send(res, 200, { needsSetup: n === 0, user: pubUser(user) });
  }
  if (route === '/api/auth/setup' && m === 'POST') {
    const b = await readBody(req);
    const name = cleanName(b.name, 40), username = cleanName(b.username, 30).toLowerCase();
    if (!name || !username || String(b.password || '').length < 6) throw fail(400, 'Captura nombre, usuario y una contraseña de al menos 6 caracteres.');
    const n = Number((await db.one('SELECT COUNT(*) AS n FROM users')).n);
    if (n > 0) throw fail(409, 'El administrador ya fue creado. Inicia sesión.');
    const id = newId('u');
    await db.exec('INSERT INTO users (id, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [id, username, name, auth.hashPassword(b.password), 'admin']);
    const u = await db.one('SELECT * FROM users WHERE id = ?', [id]);
    return send(res, 200, { user: pubUser(u) }, { 'Set-Cookie': auth.sessionCookie(id) });
  }
  if (route === '/api/auth/login' && m === 'POST') {
    const b = await readBody(req); const username = cleanName(b.username, 30).toLowerCase();
    const key = username + '|' + (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
    const f = failedLogins.get(key) || { n: 0, t: 0 };
    if (f.n >= 5 && Date.now() - f.t < 5 * 60 * 1000) throw fail(429, 'Demasiados intentos. Espera 5 minutos.');
    const u = await db.one('SELECT * FROM users WHERE username = ?', [username]);
    if (!u || !Number(u.active) || !auth.checkPassword(b.password, u.password_hash)) {
      failedLogins.set(key, { n: f.n + 1, t: Date.now() });
      await new Promise(r => setTimeout(r, 400));
      throw fail(401, 'Usuario o contraseña incorrectos.');
    }
    failedLogins.delete(key);
    return send(res, 200, { user: pubUser(u) }, { 'Set-Cookie': auth.sessionCookie(u.id) });
  }
  if (route === '/api/auth/logout' && m === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
  if (route === '/api/auth/password' && m === 'POST') {
    need(user); const b = await readBody(req);
    if (!auth.checkPassword(b.current, user.password_hash)) throw fail(400, 'La contraseña actual no es correcta.');
    if (String(b.next || '').length < 6) throw fail(400, 'La nueva contraseña debe tener al menos 6 caracteres.');
    await db.exec('UPDATE users SET password_hash = ? WHERE id = ?', [auth.hashPassword(b.next), user.id]);
    return send(res, 200, { ok: true });
  }

  // ----- datos del tablero -----
  if (route === '/api/state' && m === 'GET') {
    need(user);
    const v = await version();
    if (url.searchParams.get('v') === String(v)) return send(res, 200, { version: v, unchanged: true });
    const c = await db.one('SELECT data FROM config WHERE id = 1');
    const rows = await db.q('SELECT id, data, by_user FROM records');
    const names = Object.fromEntries((await db.q('SELECT id, name FROM users')).map(u => [u.id, u.name]));
    const recs = rows.map(r => { const d = JSON.parse(r.data); d.id = r.id; if (r.by_user) d.by = r.by_user; return d; });
    return send(res, 200, { version: v, cfg: c ? JSON.parse(c.data) : { lines: [], std: {} }, recs, names });
  }
  if (route === '/api/config' && m === 'PUT') {
    need(user, 'admin'); const b = await readBody(req);
    if (!b.cfg || !Array.isArray(b.cfg.lines) || typeof b.cfg.std !== 'object') throw fail(400, 'Configuración inválida.');
    await db.batch([
      ['INSERT INTO config (id, data, updated_by, updated_at) VALUES (1, ?, ?, datetime(\'now\')) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at', [JSON.stringify(b.cfg), user.id]],
      db.BUMP,
    ]);
    return send(res, 200, { ok: true });
  }
  if (route === '/api/records' && m === 'POST') {
    need(user, 'admin', 'cap'); const b = await readBody(req);
    const list = Array.isArray(b.records) ? b.records : [];
    if (!list.length || list.length > 2000) throw fail(400, 'Envía entre 1 y 2000 registros.');
    const stmts = list.map(r => {
      if (!r || !r.lineId || !r.fromId || !r.toId || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || !(Number(r.minutes) >= 0)) throw fail(400, 'Registro incompleto.');
      const d = Object.assign({}, r); delete d.id; delete d.by; d.minutes = Number(d.minutes); d.createdAt = d.createdAt || Date.now();
      return ['INSERT INTO records (id, data, by_user) VALUES (?, ?, ?)', [newId('r'), JSON.stringify(d), user.id]];
    });
    stmts.push(db.BUMP); await db.batch(stmts);
    return send(res, 200, { ok: true, added: list.length });
  }
  if (route === '/api/records/delete' && m === 'POST') {
    need(user, 'admin'); const b = await readBody(req);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 5000);
    if (!ids.length) return send(res, 200, { ok: true, deleted: 0 });
    const stmts = [];
    for (let i = 0; i < ids.length; i += 200) { const part = ids.slice(i, i + 200); stmts.push([`DELETE FROM records WHERE id IN (${part.map(() => '?').join(',')})`, part]); }
    stmts.push(db.BUMP); await db.batch(stmts);
    return send(res, 200, { ok: true, deleted: ids.length });
  }

  // ----- usuarios (solo admin) -----
  if (route === '/api/users' && m === 'GET') {
    need(user, 'admin');
    const us = await db.q('SELECT * FROM users ORDER BY created_at');
    return send(res, 200, { users: us.map(pubUser) });
  }
  if (route === '/api/users' && m === 'POST') {
    need(user, 'admin'); const b = await readBody(req);
    const name = cleanName(b.name, 40), username = cleanName(b.username, 30).toLowerCase(), role = ROLES.includes(b.role) ? b.role : 'cap';
    if (!name || !username || String(b.password || '').length < 6) throw fail(400, 'Captura nombre, usuario y una contraseña de al menos 6 caracteres.');
    if (await db.one('SELECT id FROM users WHERE username = ?', [username])) throw fail(409, 'Ese usuario ya existe.');
    await db.exec('INSERT INTO users (id, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [newId('u'), username, name, auth.hashPassword(b.password), role]);
    return send(res, 200, { ok: true });
  }
  const um = route.match(/^\/api\/users\/([\w-]+)$/);
  if (um && (m === 'PATCH' || m === 'DELETE')) {
    need(user, 'admin'); const id = um[1];
    if (id === user.id) throw fail(400, 'No puedes cambiar ni eliminar tu propio usuario desde aquí.');
    const target = await db.one('SELECT * FROM users WHERE id = ?', [id]); if (!target) throw fail(404, 'Usuario no encontrado.');
    if (m === 'DELETE') { await db.exec('DELETE FROM users WHERE id = ?', [id]); return send(res, 200, { ok: true }); }
    const b = await readBody(req);
    if (b.role !== undefined) { if (!ROLES.includes(b.role)) throw fail(400, 'Rol inválido.'); await db.exec('UPDATE users SET role = ? WHERE id = ?', [b.role, id]); }
    if (b.name !== undefined) await db.exec('UPDATE users SET name = ? WHERE id = ?', [cleanName(b.name, 40) || target.name, id]);
    if (b.active !== undefined) await db.exec('UPDATE users SET active = ? WHERE id = ?', [b.active ? 1 : 0, id]);
    if (b.password !== undefined) { if (String(b.password).length < 6) throw fail(400, 'Mínimo 6 caracteres.'); await db.exec('UPDATE users SET password_hash = ? WHERE id = ?', [auth.hashPassword(b.password), id]); }
    return send(res, 200, { ok: true });
  }
  throw fail(404, 'Ruta no encontrada.');
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': rel === '/index.html' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  try { await db.ready; await apiHandler(req, res, url); }
  catch (e) {
    const status = e.status || 500; if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? (e.message || 'Error interno del servidor') : e.message });
  }
}

module.exports = handler;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  db.ready.then(() => http.createServer(handler).listen(PORT, () => console.log(`Tablero de cambios de modelo en http://localhost:${PORT}`)))
    .catch(e => { console.error('No se pudo iniciar la base de datos:', e); process.exit(1); });
}
