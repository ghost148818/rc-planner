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
const SCREENS = ['today', 'fleet', 'flight', 'journal', 'more', 'tools'];

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

  // «Как в системе» снимает ключ, тема берётся у системы
  await page.click('[data-act="theme-set"][data-theme="system"]');
  await page.waitForTimeout(60);
  ok((await page.evaluate(() => localStorage.getItem('rcp.theme'))) === null,
    '«Как в системе» удаляет rcp.theme');
  await context.close();

  // Тема по системе: светлая система без сохранённого выбора — светлый интерфейс
  {
    const { context, page } = await newPage(browser, { viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    await page.goto(srv.url);
    await page.waitForSelector('#tabbar .tab');
    ok((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light',
      'без выбора тема следует за системой (светлая)');
    ok((await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content)) === '#f2f3f5',
      'theme-color подстроен под светлую тему');
    await context.close();
  }

  // Режим «В перчатках»: токены растут, панель и строки крупнее
  {
    const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 } });
    await page.goto(srv.url);
    await page.waitForSelector('#tabbar .tab');
    await page.evaluate(() => { location.hash = '#/more'; });
    await page.click('[data-act="gloves-set"][data-gloves="1"]');
    await page.waitForTimeout(60);
    ok(await page.evaluate(() => document.documentElement.hasAttribute('data-gloves')), 'режим «В перчатках» включается');
    const tabG = await page.locator('#tabbar .tab').first().boundingBox();
    ok(tabG && tabG.height >= 68, `в перчатках вкладки не меньше 68px (${tabG && Math.round(tabG.height)}px)`);
    const rowG = await page.locator('#views .row').first().boundingBox();
    ok(rowG && rowG.height >= 64, `в перчатках строки не меньше 64px (${rowG && Math.round(rowG.height)}px)`);
    await page.reload();
    await page.waitForSelector('#tabbar .tab');
    ok(await page.evaluate(() => document.documentElement.hasAttribute('data-gloves')), 'перчатки переживают перезагрузку');
    await page.screenshot({ path: path.join(SHOTS, 'phone-gloves.png') });
    await page.click('[data-act="gloves-set"][data-gloves="0"]');
    await page.waitForTimeout(60);
    ok(!(await page.evaluate(() => document.documentElement.hasAttribute('data-gloves'))), 'режим выключается');
    ok(errors.length === 0, 'перчатки: ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));
    await context.close();
  }

  // Движение: с анимациями экран и окно всё равно доходят до конца
  {
    const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    await page.goto(srv.url);
    await page.waitForSelector('#tabbar .tab');
    const hasVT = await page.evaluate(() => !!document.startViewTransition);
    // Тап по текущей вкладке при пустом hash (старт PWA) обязан перерисовать
    // экран: go() сравнивает нормализованный адрес, а не сырой location.hash.
    await page.evaluate(() => { window.__first = document.querySelector('#views').firstElementChild; });
    await page.click('#tabbar .tab[data-nav="#/today"]');
    const repainted = await page.waitForFunction(() => document.querySelector('#views').firstElementChild !== window.__first, null, { timeout: 2000 })
      .then(() => true, () => false);
    ok(repainted, 'тап по текущей вкладке при пустом hash перерисовывает экран');
    await page.click('#tabbar .tab[data-nav="#/fleet"]');
    await page.waitForSelector('.head h1:has-text("Флот")', { timeout: 2000 });
    ok(true, 'переход по вкладке с View Transitions дорисовывается');
    if (hasVT) {
      ok((await page.evaluate(() => document.documentElement.dataset.vt)) === 'tab', 'переход между вкладками помечен как tab');
    }
    await page.evaluate(() => { location.hash = '#/tools'; });
    await page.waitForSelector('.head .back');
    if (hasVT) {
      ok((await page.evaluate(() => document.documentElement.dataset.vt)) === 'forward', 'переход вглубь помечен как forward');
    }
    await page.click('.head .back');
    await page.waitForSelector('.head h1:has-text("Флот")', { timeout: 2000 });
    if (hasVT) {
      ok((await page.evaluate(() => document.documentElement.dataset.vt)) === 'back', 'кнопка «Назад» помечена как back');
    }
    // Возврат на предыдущую вкладку по панели — тоже tab, а не back.
    await page.click('#tabbar .tab[data-nav="#/today"]');
    await page.waitForSelector('#tabbar .tab[data-nav="#/today"][aria-current="page"]', { timeout: 2000 });
    if (hasVT) {
      ok((await page.evaluate(() => document.documentElement.dataset.vt)) === 'tab', 'возврат на предыдущую вкладку помечен как tab');
    }
    await page.evaluate(() => { location.hash = '#/more'; });
    await page.waitForSelector('[data-act="whatsnew"]');
    await page.click('[data-act="whatsnew"]');
    await page.waitForSelector('dialog[open]');
    await page.click('.dlg-close');
    await page.waitForSelector('dialog', { state: 'detached', timeout: 1000 });
    ok(true, 'окно с анимацией уезжает и убирается из DOM');
    ok(!(await page.evaluate(() => document.body.classList.contains('locked'))), 'body.locked снят после закрытия');
    ok(errors.length === 0, 'движение: ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));
    await context.close();
  }

  await browser.close();
  await srv.close();
  finish('test:visual');
})().catch((e) => { console.error(e); process.exit(1); });
