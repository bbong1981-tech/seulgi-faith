// 슬기로운 신앙생활 서비스워커: 앱 화면과 성경 본문을 저장해 오프라인에서도 동작
const VERSION = "v32";
const SHELL = `shell-${VERSION}`, DATA = "bible-data-v2";
const SHELL_FILES = ["./", "index.html", "css/style.css", "js/icons.js", "js/books.js", "js/dict.js", "js/dict2.js", "js/dict3.js", "js/app.js", "js/import.js", "js/hymn.js", "js/media.js", "js/fellowship.js", "manifest.json", "icons/favicon-v2.svg", "icons/favicon-v2.ico", "icons/favicon-32-v2.png", "icons/apple-touch-icon-v2.png", "icons/badge-96-v2.png", "icons/icon-192-v2.png", "icons/icon-512-v2.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/data/")) {
    // 성경 본문: 한 번 받으면 캐시에서
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // 앱 화면: 네트워크 우선(업데이트 반영), 실패 시 캐시
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});
