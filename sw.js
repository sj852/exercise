/* 서비스 워커 — 앱 셸 캐시(오프라인 지원) */
var CACHE = 'wchallenge-v1';
var ASSETS = [
  './', './index.html',
  './css/styles.css',
  './js/app.js', './js/data.js', './js/firebase-config.js',
  './manifest.webmanifest', './icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  // Firebase/구글폰트 등 외부 요청은 그냥 네트워크로 (캐시하지 않음)
  if (e.request.method !== 'GET' || url.indexOf('firebase') > -1 || url.indexOf('googleapis') > -1 || url.indexOf('gstatic') > -1) return;
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      return cached || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return cached; });
    })
  );
});
