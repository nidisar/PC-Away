/* PC Away — Service Worker v1.0 */
const CACHE = 'pc-away-v1';
const ASSETS = ['/', '/index.html', '/sw.js', '/manifest.json', '/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});

/* ── Push notifications ─────────────────────────────────────────────────── */
self.addEventListener('push', e => {
  if (!e.data) return;
  let msg;
  try { msg = e.data.json(); } catch { msg = { title: 'PC Away', body: e.data.text() }; }

  const title   = msg.title  || 'PC Away';
  const body    = msg.message || msg.body || '';
  const image   = msg.attachment?.url || null;
  const topic   = msg.topic  || '';
  const msgId   = msg.id     || '';

  // Determina colore badge in base alla coda
  const queueColor = topic.includes('cpt') ? '#4fc3f7'
                   : topic.includes('dpt') ? '#81c784'
                   : topic.includes('aa')  ? '#ffb74d'
                   : '#e94560';

  // Parsing azioni ntfy (es. pulsante Ordina)
  const actions = (msg.actions || []).map(a => ({
    action: a.id || a.label,
    title:  a.label,
    ...(a.url && { icon: '/icon.svg' })
  })).slice(0, 2); // max 2 azioni visibili su Android

  const opts = {
    body,
    icon:  '/icon.svg',
    badge: '/icon.svg',
    image,
    tag:   msgId || topic,
    renotify: true,
    vibrate: [200, 100, 200, 100, 400],
    actions,
    data: { msg, topic, url: self.location.origin }
  };

  e.waitUntil(
    self.registration.showNotification(title, opts)
      .then(() => playPushSound(topic))
  );
});

/* Suono push tramite AudioContext (nel SW non funziona, ma lo lasciamo per i client aperti) */
function playPushSound(topic) {
  return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(clients => clients.forEach(c => c.postMessage({ type: 'PUSH_SOUND', topic })));
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const msg  = data.msg || {};

  // Click sul pulsante Ordina
  if (e.action === '🎯 Ordina' || e.action === 'order') {
    const ntfyAction = (msg.actions || []).find(a => a.label === '🎯 Ordina');
    if (ntfyAction && ntfyAction.url && ntfyAction.body) {
      e.waitUntil(fetch(ntfyAction.url, {
        method: ntfyAction.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ntfyAction.body
      }));
      return;
    }
  }

  // Click sulla notifica → apre l'app
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin) && 'focus' in c);
      if (existing) return existing.focus().then(c => c.postMessage({ type: 'NOTIFICATION_CLICK', msg }));
      return self.clients.openWindow(data.url || '/');
    })
  );
});
