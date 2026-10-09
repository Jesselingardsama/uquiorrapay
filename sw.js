// Uquiorrapay — service worker (app instalável).
// Estratégia: rede primeiro (o site está sempre actualizado); a cópia guardada só é usada sem internet.
// Nunca guarda pedidos à base de dados, pagamentos ou ficheiros de outros sites.
const CACHE = "uq-app-v2";
const OFFLINE = "/offline.html";
const PRE = [OFFLINE, "/favicon.svg", "/img/app/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/")) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && (req.mode === "navigate" || /\.(css|js|png|svg|webmanifest)$/.test(url.pathname))) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: req.mode !== "navigate" });
      if (hit) return hit;
      if (req.mode === "navigate") return (await caches.match(OFFLINE)) || Response.error();
      throw err;
    }
  })());
});

// Notificações de vendas (Web Push)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Uquiorrapay", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Uquiorrapay", {
    body: d.body || "",
    icon: "/img/app/icon-192.png",
    badge: "/img/app/badge-96.png",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    vibrate: [120, 60, 120],
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin && "focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
