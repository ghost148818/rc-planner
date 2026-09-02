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
const VIEWS = ['today', 'fleet', 'flight', 'prep', 'log', 'stats', 'packing', 'weather',
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
  await page.click('[data-act="model-empty"]');
  await page.fill('dialog input[name="name"]', payload);
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('.head h1');
  await page.waitForTimeout(120);
  const xss = await page.evaluate(() => window.__xss);
  ok(!xss, 'внедрённый тег не исполнился');
  const title = await page.textContent('.head h1');
  ok(title.includes('Проба'), 'имя показано как текст');

  // XSS-проба вторая: числовые поля форм. Значения приходят из
  // резервной копии, где validateBackup проверяет только id, и попадают
  // прямо в атрибут value= — строка вида `" onfocus="…` из атрибута
  // вырывалась и исполнялась (найдено ревью 1.4, закрыто numVal).
  const attrPayload = '" onfocus="window.__xss2=1" autofocus x="';
  await page.evaluate(async (payload) => {
    await window.RCDB.put('aircraft', {
      id: 'attr-probe', name: 'Проба атрибута', type: 'plane', components: {},
      weight: payload, wingspan: payload, maxWind: payload, maxAlt: payload,
      svcEvery: payload, svcEveryMin: payload,
    });
    await window.RCDB.put('batteries', {
      id: 'attr-batt', label: 'Проба АКБ', chem: 'lipo',
      cells: payload, p: payload, capacity: payload, weight: payload, cycles: payload,
    });
    await window.loadAll();
    location.hash = '#/model/attr-probe';
  }, attrPayload);
  // Проверяем по DOM, а не регуляркой по innerHTML: экранированная
  // кавычка в тексте <option> при сериализации возвращается сырой,
  // и поиск «onfocus=» в разметке даёт ложную тревогу на безобидный текст.
  // Вырвавшийся атрибут виден только как настоящий атрибут элемента.
  const injected = async () => page.evaluate(() => {
    const dlg = document.querySelector('dialog');
    if (!dlg) return 'окно не открылось';
    const bad = dlg.querySelectorAll('[onfocus], [autofocus], [x]');
    // Заодно проводим фокус по всем полям: подложенный обработчик сработал бы.
    dlg.querySelectorAll('input, select, textarea').forEach((el) => el.focus());
    return bad.length;
  });

  await page.waitForTimeout(150);
  await page.click('[data-act="edit-model"]');
  await page.waitForTimeout(200);
  ok((await injected()) === 0, 'форма борта: мусор из копии не вырвался из value=');
  await page.click('.dlg-close');

  await page.evaluate(() => {
    openBattForm(S.batteries.find((b) => b.id === 'attr-batt'));
  });
  await page.waitForTimeout(200);
  ok((await injected()) === 0, 'форма АКБ: мусор из копии не вырвался из value=');
  await page.click('.dlg-close');
  ok(!(await page.evaluate(() => window.__xss2)), 'подложенный обработчик не исполнился');

  // Модальное окно закрывается.
  await page.evaluate(() => { location.hash = '#/more'; });
  await page.click('[data-act="whatsnew"]');
  ok(await page.isVisible('dialog'), 'окно «Что нового» открылось');
  await page.click('.dlg-close');
  // С анимациями окно уезжает до 200 мс и только потом удаляется — ждём узел.
  const closed = await page.waitForSelector('dialog', { state: 'detached', timeout: 3000 }).then(() => true, () => false);
  ok(closed, 'окно закрылось');

  ok(errors.length === 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));
  await browser.close();
  finish('test:audit');
})().catch((e) => { console.error(e); process.exit(1); });
