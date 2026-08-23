// Набор 4: PWA по папке public/ — manifest, service worker, офлайн.
'use strict';

const path = require('path');
const { chromium } = require('playwright');
const { ok, finish, serve, newPage } = require('./helpers');

const PUB = path.join(__dirname, '..', 'public');

(async () => {
  const srv = await serve(PUB);
  const browser = await chromium.launch();
  const { context, page, errors } = await newPage(browser);

  await page.goto(srv.url);
  await page.waitForSelector('#tabbar .tab');

  // Манифест
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    return (await fetch(link.href)).json();
  });
  ok(!!manifest, 'manifest подключён и загружается');
  ok(manifest.display === 'standalone' && manifest.icons.length >= 3, 'standalone и иконки на месте');

  // Версия сборки видна и совпадает с sw.js
  const build = await page.getAttribute('meta[name="build"]', 'content');
  ok(/^[0-9a-f]{10}$/.test(build), 'версия сборки в meta: ' + build);
  const swText = await page.evaluate(async () => (await fetch('sw.js')).text());
  ok(swText.includes(build), 'sw.js собран с той же версией');
  const more = await page.evaluate(() => { location.hash = '#/more'; return document.body.textContent; });
  ok(more.includes(build), 'версия видна в настройках');

  // Service worker активируется и берёт страницу под контроль
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 })
    .catch(() => {});
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  ok(controlled, 'service worker контролирует страницу');

  // Офлайн: страница открывается из кэша
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#tabbar .tab', { timeout: 15000 });
  ok(true, 'офлайн: приложение открылось из кэша');
  const offNav = await page.evaluate(() => {
    location.hash = '#/fleet';
    return document.getElementById('views').innerHTML.length;
  });
  ok(offNav > 100, 'офлайн: навигация работает');
  await context.setOffline(false);

  const realErrors = errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|fetch/i.test(e));
  ok(realErrors.length === 0, 'ошибок консоли нет' + (realErrors.length ? ': ' + realErrors.join('; ') : ''));

  await browser.close();
  await srv.close();
  finish('test:pwa');
})().catch((e) => { console.error(e); process.exit(1); });
