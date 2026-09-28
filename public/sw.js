// Service worker RC Planner. Версия подставляется сборкой.
// Навигация — из сети, кэш запасной. Кэшируются только файлы приложения,
// пользовательских данных здесь нет. Никакого skipWaiting в install:
// управление передаётся только по кнопке «Обновить» в настройках.
'use strict';

const VERSION = '905c935993';
const CACHE = 'rcplanner-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-180.png',
  // Картинки из assets/art — сборка подставляет существующие (метка ниже).
  './art/bg-dark.webp',
  './art/bg-dark-wide.webp',
  './art/bg-light.webp',
  './art/bg-light-wide.webp',
  './art/type-quad.webp',
  './art/type-plane.webp',
  './art/type-wing.webp',
  './art/type-other.webp',
  './art/welcome-1.webp',
  './art/welcome-2.webp',
  './art/welcome-3.webp',
  './art/empty-fleet.svg',
  './art/empty-journal.svg',
  './art/empty-batteries.svg',
  './art/empty-sites.svg',
  './art/empty-packing.svg',
  './art/empty-generic.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    // Сеть первой: обновление доезжает сразу; офлайн — из кэша.
    // В кэш оболочки кладём ТОЛЬКО саму оболочку: удачный HTML-ответ на
    // корень области или index.html. Раньше туда попадала любая навигация
    // внутри области — 404-страница или открытый по адресу файл картинки
    // становились «приложением» при следующем офлайн-запуске (ревью 3.0).
    e.respondWith(
      fetch(req)
        .then((res) => {
          const path = new URL(req.url).pathname;
          const scope = new URL(self.registration.scope).pathname;
          const shell = path === scope || path === scope + 'index.html';
          if (res.ok && shell && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    // ignoreSearch: иконки запрашиваются с ?v=<версия> (обновление значка
    // установленного приложения), а в кэше лежат без query.
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && new URL(req.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
