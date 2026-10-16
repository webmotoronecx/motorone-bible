/* MotorOne Proofing Bible — Vercel runtime.
   Gives the page the same `window.claude.use(name)` interface it uses on claude.ai,
   backed by this project's API routes (Vercel Blob for files and the client list).
   Editing is unlocked with the ADMIN_PASSWORD set in the Vercel project. */
(function () {
  'use strict';
  var KEY = 'motorone_admin_key';
  var key = '';
  try { key = localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch (e) {}

  var clients = null;
  var subs = [];
  var loading = null;

  function headers(json) {
    var h = {};
    if (json) h['content-type'] = 'application/json';
    if (key) h['x-admin-key'] = key;
    return h;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    if (loading) return loading;
    loading = (async function () {
      try {
        var r = await fetch('/api/clients', { cache: 'no-store' });
        if (r.ok) { var j = await r.json(); if (Array.isArray(j.clients)) return j.clients; }
      } catch (e) {}
      try {
        var r2 = await fetch('data/clients.json', { cache: 'no-store' });
        if (r2.ok) return await r2.json();
      } catch (e) {}
      return [];
    })();
    return loading;
  }
  function docSnap(c, id) {
    return { id: id, exists: !!c, data: function () { if (!c) return undefined; var o = clone(c); delete o.id; return o; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function querySnap() {
    var docs = clients.map(function (c) { return docSnap(c, c.id); });
    return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function emit() { subs.forEach(function (fn) { try { fn(querySnap()); } catch (e) {} }); }
  async function persist() {
    var r = await fetch('/api/clients', { method: 'PUT', headers: headers(true), body: JSON.stringify({ clients: clients }) });
    if (r.status === 401) throw { code: 'not_granted', message: 'Unlock editing with the admin password first.' };
    if (r.status === 503) throw { code: 'unavailable', message: 'Storage isn’t set up yet: add a Blob store to this Vercel project.' };
    if (!r.ok) throw { code: 'unavailable', message: 'Save failed (' + r.status + '). Try again.' };
  }

  var db = {
    collection: function (path) {
      return {
        path: path,
        onSnapshot: function (next, err) {
          subs.push(next);
          (clients ? Promise.resolve(clients) : load().then(function (c) { clients = c; return c; })).then(function () { next(querySnap()); }, function (e) { if (err) err({ code: 'unavailable', message: String(e) }); });
          return function () { subs = subs.filter(function (f) { return f !== next; }); };
        },
        doc: function (id) { return db.doc(path + '/' + id); },
        get: async function () { if (!clients) clients = await load(); return querySnap(); },
        where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; }
      };
    },
    doc: function (path) {
      var id = path.split('/').pop();
      return {
        id: id, path: path,
        get: async function () { if (!clients) clients = await load(); return docSnap(clients.find(function (x) { return x.id === id; }), id); },
        set: async function (body) {
          if (!clients) clients = await load();
          var doc = Object.assign({ id: id }, clone(body));
          var i = clients.findIndex(function (x) { return x.id === id; });
          if (i >= 0) clients[i] = doc; else clients.push(doc);
          await persist(); emit();
        },
        update: async function (body) {
          if (!clients) clients = await load();
          var i = clients.findIndex(function (x) { return x.id === id; });
          if (i < 0) throw { code: 'invalid_argument', message: 'No such client.' };
          clients[i] = Object.assign({}, clients[i], clone(body)); await persist(); emit();
        },
        delete: async function () {
          if (!clients) clients = await load();
          clients = clients.filter(function (x) { return x.id !== id; });
          await persist(); emit();
        }
      };
    }
  };

  var assets = {
    upload: async function (file, opts) {
      var type = (opts && opts.type) || file.type || 'application/octet-stream';
      var name = (file.name || 'file').replace(/[^\w.\-]+/g, '_');
      var pathname = 'motorone-bible/uploads/' + name;
      // Preferred: direct browser → Blob upload (no size limit from the function layer).
      try {
        var mod = await import('https://esm.sh/@vercel/blob@1.1.1/client');
        var b = await mod.upload(pathname, file, { access: 'public', handleUploadUrl: '/api/upload', clientPayload: key, contentType: type });
        return { id: b.url, url: b.url, sizeBytes: file.size, contentType: type };
      } catch (e) {
        if (e && /unauthori[sz]ed|password/i.test(String(e.message || e))) throw { code: 'not_granted', message: 'Unlock editing with the admin password first.' };
      }
      // Fallback: upload through the function (Vercel caps this at 4.5 MB).
      var r = await fetch('/api/upload?filename=' + encodeURIComponent(name), { method: 'POST', headers: Object.assign({ 'content-type': type }, headers(false)), body: file });
      if (r.status === 401) throw { code: 'not_granted', message: 'Unlock editing with the admin password first.' };
      if (r.status === 413) throw { code: 'too_large', message: 'Over 4.5 MB. Direct uploads are unavailable on this network, so try a smaller file.' };
      if (r.status === 503) throw { code: 'quota_or_state', message: 'Storage isn’t set up yet: add a Blob store to this Vercel project.' };
      if (!r.ok) throw { code: 'upstream_error', message: 'Upload failed (' + r.status + ').' };
      var j = await r.json();
      return { id: j.url, url: j.url, sizeBytes: file.size, contentType: type };
    },
    list: async function () { return { assets: [], usage: { files: 0, bytes: 0, maxFiles: 0, maxBytes: 0 } }; },
    delete: async function () { return { deleted: false }; }
  };

  var downloads = {
    save: async function (req) {
      var blob = req.data instanceof Blob ? req.data : new Blob([req.data]);
      var u = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = u; a.download = req.filename || 'file'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
      return { status: 'saved' };
    }
  };

  var user = {
    can: async function () { return !!key; },
    canEdit: async function () { return !!key; },
    isOwner: async function () { return !!key; },
    id: async function () { return key ? 'admin' : null; },
    me: async function () { return { id: key ? 'admin' : null, name: key ? 'Editor' : '', email: null, isOwner: !!key, canEdit: !!key, guest: false, isMe: true }; },
    profiles: async function () { return {}; }
  };

  window.claude = {
    use: function (name) {
      var map = { db: db, assets: key ? assets : null, downloads: downloads, user: user };
      return Promise.resolve(name in map ? map[name] : null);
    }
  };

  /* ---- unlock / lock control ---- */
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function mountLock() {
    var css = el('style', {}, '.mo-lock{position:fixed;right:16px;bottom:16px;z-index:70;font:600 12.5px Inter,system-ui,sans-serif;display:inline-flex;align-items:center;gap:7px;background:#182033;color:#A7B3C8;border:1px solid rgba(148,170,210,.24);border-radius:999px;padding:8px 12px;cursor:pointer}.mo-lock:hover{color:#fff}.mo-lock.on{color:#2BD576}.mo-modal{position:fixed;inset:0;z-index:90;background:rgba(5,8,14,.8);display:flex;align-items:center;justify-content:center;padding:20px}.mo-modal form{background:#121826;border:1px solid rgba(148,170,210,.24);border-radius:16px;padding:22px;width:min(380px,100%);display:flex;flex-direction:column;gap:10px;font-family:Inter,system-ui,sans-serif;color:#EDF2FA}.mo-modal h3{margin:0;font-size:16px}.mo-modal p{margin:0;color:#A7B3C8;font-size:13px}.mo-modal input{background:#182033;border:1px solid rgba(148,170,210,.24);border-radius:11px;padding:10px 12px;color:#fff;font:inherit;font-size:14px}.mo-modal .r{display:flex;gap:8px;justify-content:flex-end}.mo-modal button{font:inherit;font-weight:600;border-radius:11px;padding:9px 14px;border:1px solid rgba(148,170,210,.24);background:#182033;color:#fff;cursor:pointer}.mo-modal button.p{background:linear-gradient(135deg,#1F62FF,#00C8FF);border-color:transparent}.mo-modal .err{color:#FF5C6C;font-size:12.5px}');
    document.head.appendChild(css);
    var btn = el('button', { class: 'mo-lock' + (key ? ' on' : ''), type: 'button', title: key ? 'Lock editing on this device' : 'Unlock editing' }, key ? '&#9679; Editing unlocked · Lock' : '&#128274; Unlock editing');
    btn.addEventListener('click', function () {
      if (key) { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {} location.reload(); return; }
      showModal();
    });
    document.body.appendChild(btn);
  }
  function showModal() {
    var m = el('div', { class: 'mo-modal' });
    m.innerHTML = '<form><h3>Unlock editing</h3><p>Enter the admin password set in the Vercel project (ADMIN_PASSWORD). It stays on this device until you lock again.</p><input type="password" autocomplete="current-password" placeholder="Admin password" required><div class="err" hidden></div><div class="r"><button type="button" data-x>Cancel</button><button type="submit" class="p">Unlock</button></div></form>';
    document.body.appendChild(m);
    var form = m.querySelector('form'), inp = m.querySelector('input'), err = m.querySelector('.err');
    inp.focus();
    m.querySelector('[data-x]').addEventListener('click', function () { m.remove(); });
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); err.hidden = true;
      try {
        var r = await fetch('/api/auth', { headers: { 'x-admin-key': inp.value } });
        var j = await r.json();
        if (!j.configured) { err.textContent = 'No ADMIN_PASSWORD is set on the Vercel project yet. Add it under Settings → Environment Variables, then redeploy.'; err.hidden = false; return; }
        if (!j.ok) { err.textContent = 'That password didn’t match.'; err.hidden = false; return; }
        try { localStorage.setItem(KEY, inp.value); } catch (e2) {}
        location.reload();
      } catch (e3) { err.textContent = 'Couldn’t reach the server. Try again.'; err.hidden = false; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLock); else mountLock();
})();
