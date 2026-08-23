// Набор 2: аудит экранов по dist/rc-planner.html (file://).
// Все экраны отрисовываются без ошибок консоли; пользовательский
// текст экранируется (XSS-проба).
'use strict';

const path = require('path');
const { chromium } = require('playwright');
const { ok, finish, newPage } = require('./helpers');

const DIST = path.join(__dirname, '..', 'dist', 'rc-planner.html');

// Экраны без обязательного аргумента. Должен совпадать со списком в app.js —
// новый экран добавлять и туда, и сюда, иначе его никто не проверит.
const VIEWS = ['today', 'fleet', 'flight', 'prep', 'log', 'packing', 'weather',
  'more', 'tools', 'sites', 'batteries', 'templates', 'backup', 'privacy'];

(async () => {
  const browser = await chromium.launch();
  const { page, errors } = await newPage(browser);
  await page.goto('file://' + DIST);
  await page.waitForSelector('#tabbar .tab');
  ok(true, 'приложение стартовало по file://');

  for (const v of VIEWS) {
    await page.evaluate((hash) => { location.hash = hash; }, '#/' + v);
    await page.waitForTimeout(60);
    const len = await page.evaluate(() => document.getElementById('views').innerHTML.length);
    ok(len > 100, 'экран ' + v + ' отрисован (' + len + ' байт)');
  }

  // XSS-проба: имя модели с внедрённым тегом.
  const payload = '<img src=x onerror="window.__xss=1">Проба';
  await page.evaluate(() => { location.hash = '#/fleet'; });
  await page.click('[data-act="add-model"]');
  await page.fill('dialog input[name="name"]', payload);
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('.head h1');
  await page.waitForTimeout(120);
  const xss = await page.evaluate(() => window.__xss);
  ok(!xss, 'внедрённый тег не исполнился');
  const title = await page.textContent('.head h1');
  ok(title.includes('Проба'), 'имя показано как текст');

  // Модальное окно закрывается.
  await page.evaluate(() => { location.hash = '#/more'; });
  await page.click('[data-act="whatsnew"]');
  ok(await page.isVisible('dialog'), 'окно «Что нового» открылось');
  await page.click('.dlg-close');
  ok(!(await page.isVisible('dialog')), 'окно закрылось');

  ok(errors.length === 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));
  await browser.close();
  finish('test:audit');
})().catch((e) => { console.error(e); process.exit(1); });
