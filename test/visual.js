// Набор 5: вёрстка — три разрешения, светлая тема, отсутствие
// горизонтальной прокрутки, touch-размеры. Скриншоты — в test/shots/.
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ok, finish, serve, newPage } = require('./helpers');

const PUB = path.join(__dirname, '..', 'public');
const SHOTS = path.join(__dirname, 'shots');

const VIEWPORTS = [
  ['phone', { width: 390, height: 844 }],
  ['tablet', { width: 820, height: 1180 }],
  ['desktop', { width: 1280, height: 800 }],
];
const SCREENS = ['today', 'fleet', 'flight', 'packing', 'more', 'tools'];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(PUB);
  const browser = await chromium.launch();

  for (const [name, viewport] of VIEWPORTS) {
    const { context, page, errors } = await newPage(browser, { viewport });
    await page.goto(srv.url);
    await page.waitForSelector('#tabbar .tab');

    for (const screen of SCREENS) {
      await page.evaluate((h) => { location.hash = h; }, '#/' + screen);
      await page.waitForTimeout(60);
      const hscroll = await page.evaluate(() =>
        document.scrollingElement.scrollWidth - window.innerWidth);
      ok(hscroll <= 1, `${name}/${screen}: без горизонтальной прокрутки`);
    }

    // Touch-размеры нижней панели
    const tab = await page.locator('#tabbar .tab').first().boundingBox();
    ok(tab && tab.height >= 48, `${name}: вкладки не меньше 48px (${tab && Math.round(tab.height)}px)`);

    await page.evaluate(() => { location.hash = '#/today'; });
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(SHOTS, name + '-dark.png') });

    ok(errors.length === 0, `${name}: ошибок консоли нет`);
    await context.close();
  }

  // Светлая тема
  const { context, page } = await newPage(browser, { viewport: { width: 390, height: 844 } });
  await page.goto(srv.url);
  await page.waitForSelector('#tabbar .tab');
  await page.evaluate(() => { location.hash = '#/more'; });
  await page.click('[data-act="theme-set"][data-theme="light"]');
  await page.waitForTimeout(60);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  ok(theme === 'light', 'светлая тема включается');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg !== 'rgb(16, 19, 24)', 'фон в светлой теме перекрашен (' + bg + ')');
  await page.reload();
  await page.waitForSelector('#tabbar .tab');
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light',
    'выбор темы переживает перезагрузку');
  await page.screenshot({ path: path.join(SHOTS, 'phone-light.png') });
  await context.close();

  await browser.close();
  await srv.close();
  finish('test:visual');
})().catch((e) => { console.error(e); process.exit(1); });
