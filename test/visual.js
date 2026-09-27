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

    // Панель вкладок (3.0): на телефоне и планшете — плавающий док у нижнего
    // края (отступ до 24 px, в пределах экрана, по центру), от 900 px —
    // рельса слева 88 px с полями 12 px, «Сегодня» — две колонки.
    const bar = await page.locator('#tabbar').boundingBox();
    await page.evaluate(() => { location.hash = '#/today'; });
    await page.waitForTimeout(60);
    const grid = await page.evaluate(() => {
      const v = document.getElementById('views');
      return { twoCol: v.classList.contains('two-col'), display: getComputedStyle(v).display,
        left: Math.round(v.getBoundingClientRect().left) };
    });
    if (viewport.width >= 900) {
      ok(bar && Math.round(bar.width) === 88 && bar.height >= viewport.height - 25 && bar.x <= 12,
        `${name}: вкладки — рельса 88px во всю высоту (${bar && Math.round(bar.width)}×${bar && Math.round(bar.height)})`);
      ok(grid.twoCol && grid.display === 'grid' && grid.left >= 88, `${name}: «Сегодня» — две колонки правее рельсы`);
    } else {
      const gapL = bar ? bar.x : -1, gapR = bar ? viewport.width - bar.x - bar.width : -1;
      ok(bar && gapL >= 0 && gapR >= 0 && Math.abs(gapL - gapR) <= 1 && bar.width >= Math.min(viewport.width - 24, 560) - 1 &&
        bar.y + bar.height >= viewport.height - 24 && bar.y + bar.height <= viewport.height,
        `${name}: вкладки — док у нижнего края по центру (${bar && Math.round(bar.x)},${bar && Math.round(bar.y)} ${bar && Math.round(bar.width)}×${bar && Math.round(bar.height)})`);
      ok(grid.twoCol && grid.display !== 'grid', `${name}: «Сегодня» — одна колонка`);
    }

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
    ok((await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content)) === '#eef2f7',
      'theme-color подстроен под светлую тему');
    await context.close();
  }

  // Режимы интерфейса (3.0): «В перчатках» — токены растут, панель и
  // строки крупнее; «Максимум» и возврат к «Стандарту»; старый ключ
  // rcp.gloves переводится на rcp.ui.
  {
    const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 } });
    await page.goto(srv.url);
    await page.waitForSelector('#tabbar .tab');
    const ui = () => page.evaluate(() => document.documentElement.dataset.ui);
    ok((await ui()) === 'standard', 'по умолчанию режим «Стандарт»');
    await page.evaluate(() => { location.hash = '#/more'; });
    await page.click('[data-act="ui-set"][data-ui="gloves"]');
    await page.waitForTimeout(60);
    ok((await ui()) === 'gloves', 'режим «В перчатках» включается');
    const tabG = await page.locator('#tabbar .tab').first().boundingBox();
    ok(tabG && tabG.height >= 64, `в перчатках вкладки не меньше 64px (${tabG && Math.round(tabG.height)}px)`);
    const rowG = await page.locator('#views .row').first().boundingBox();
    ok(rowG && rowG.height >= 68, `в перчатках строки не меньше 68px (${rowG && Math.round(rowG.height)}px)`);
    await page.reload();
    await page.waitForSelector('#tabbar .tab');
    ok((await ui()) === 'gloves', 'перчатки переживают перезагрузку');
    await page.screenshot({ path: path.join(SHOTS, 'phone-gloves.png') });
    await page.click('[data-act="ui-set"][data-ui="max"]');
    await page.waitForTimeout(60);
    ok((await ui()) === 'max', 'режим «Максимум» включается');
    await page.screenshot({ path: path.join(SHOTS, 'phone-max.png') });
    await page.click('[data-act="ui-set"][data-ui="standard"]');
    await page.waitForTimeout(60);
    ok((await ui()) === 'standard' && !(await page.evaluate(() => localStorage.getItem('rcp.ui'))), 'возврат к «Стандарту» снимает ключ');
    // Старый ключ режима «В перчатках» (до 3.0) — тот же режим после обновления
    await page.evaluate(() => localStorage.setItem('rcp.gloves', '1'));
    await page.reload();
    await page.waitForSelector('#tabbar .tab');
    ok((await ui()) === 'gloves', 'старый rcp.gloves=1 открывается в перчатках');
    ok(await page.evaluate(() => localStorage.getItem('rcp.ui') === 'gloves' && localStorage.getItem('rcp.gloves') === null), 'rcp.gloves переведён на rcp.ui');
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
