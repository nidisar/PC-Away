/* PCU Away - Service Worker v1.27 */
const CACHE = 'pcu-away-v27';
/* Path base dinamico — funziona sia su localhost che su GitHub Pages /PC-Away/ */
const BASE = self.location.pathname.replace(/sw\.js$/, '');
const ASSETS = [BASE, BASE + 'index.html', BASE + 'manifest.json', BASE + 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  /* index.html → network-first: prende sempre la versione più recente */
  if (url.endsWith('/') || url.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  /* Tutto il resto → cache-first */
  e.respondWith(
    caches.match(e.request).then(function(cached) { return cached || fetch(e.request); })
  );
});

/* ── Push notifications ──────────────────────────────────────────────────── */
self.addEventListener('push', e => {
  if (!e.data) return;
  let msg;
  try { msg = e.data.json(); } catch(err) { msg = { title: 'PCU Away', body: e.data.text() }; }

  const title  = msg.title   || 'PCU Away';
  const body   = msg.message || msg.body || '';
  const image  = (msg.attachment && msg.attachment.url) || null;
  const topic  = msg.topic || '';
  const msgId  = msg.id    || '';

  const icon  = BASE + 'icon.svg';
  const appUrl = self.location.origin + BASE;

  const actions = (msg.actions || []).map(function(a) {
    var isOrder = String(a.label || '').indexOf('Ordina') !== -1;
    return { action: isOrder ? 'order' : (a.id || a.label), title: a.label };
  }).slice(0, 2);

  const opts = {
    body,
    icon,
    badge: icon,
    image,
    tag:      msgId || topic,
    renotify: true,
    vibrate:  [200, 100, 200, 100, 400],
    actions,
    data: { msg, topic, url: appUrl }
  };

  e.waitUntil(
    self.registration.showNotification(title, opts)
      .then(function() { return playPushSound(topic); })
  );
});

function playPushSound(topic) {
  return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(function(cls) {
      cls.forEach(function(c) { c.postMessage({ type: 'PUSH_SOUND', topic: topic }); });
    });
}

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var data = e.notification.data || {};
  var msg  = data.msg || {};
  var appUrl = data.url || (self.location.origin + BASE);

  if (e.action === 'order') {
    var ntfyAction = (msg.actions || []).find(function(a) { return String(a.label || '').indexOf('Ordina') !== -1; });
    var target = null;
    try { target = new URL(ntfyAction && ntfyAction.url || ''); } catch(err) {}
    if (ntfyAction && target && target.origin === 'https://ntfy.sh' && target.pathname === '/') {
      var safeHeaders = { 'Content-Type': 'application/json' };
      if (ntfyAction.headers && ntfyAction.headers.Authorization) safeHeaders.Authorization = ntfyAction.headers.Authorization;
      e.waitUntil(fetch(target.href, {
        method: ntfyAction.method || 'POST',
        headers: safeHeaders,
        body: ntfyAction.body || ''
      }).then(function(res) {
        return self.registration.showNotification(res.ok ? 'PCU Away' : 'PCU Away - invio fallito', {
          body: res.ok ? 'Comando pubblicato. Attendi la conferma di PCU/UV.' : 'ntfy HTTP ' + res.status,
          icon: BASE + 'icon.svg', tag: 'pcu-away-order-result'
        });
      }).catch(function(err) {
        return self.registration.showNotification('PCU Away - invio fallito', { body:String(err && err.message || err), icon:BASE+'icon.svg', tag:'pcu-away-order-result' });
      }));
      return;
    }
  }

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cls) {
      var existing = cls.find(function(c) { return c.url.startsWith(self.location.origin + BASE) && 'focus' in c; });
      if (existing) return existing.focus().then(function(c) { c.postMessage({ type: 'NOTIFICATION_CLICK', msg: msg }); });
      return self.clients.openWindow(appUrl);
    })
  );
});
