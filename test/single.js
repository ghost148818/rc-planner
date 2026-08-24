// Набор 3: офлайн-файл в изолированной папке — полный сценарий:
// модель → чек-лист → полёт → итог → журнал → перезагрузка →
// экспорт → стирание → импорт.
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ok, finish, newPage } = require('./helpers');

const TMP = path.join(__dirname, 'tmp', 'single-' + Date.now());

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'dist', 'rc-planner.html'), path.join(TMP, 'app.html'));
  const url = 'file://' + path.join(TMP, 'app.html');

  const browser = await chromium.launch();
  const { page, errors } = await newPage(browser, { acceptDownloads: true });
  await page.goto(url);
  await page.waitForSelector('#tabbar .tab');

  // 1. Модель
  await page.click('[data-act="add-model"]');
  await page.click('[data-act="model-empty"]');
  await page.fill('dialog input[name="name"]', 'Test Wing');
  await page.click('dialog [data-act="type-pick"][data-type="wing"]');
  await page.click('dialog button[type="submit"]');
  await page.waitForFunction(() => {
    const h = document.querySelector('.head h1');
    return h && h.textContent === 'Test Wing';
  });
  ok(true, 'модель создана, открыта карточка');

  // 2. Подготовка: чек-лист крыла
  await page.click('[data-act="start-prep"]');
  await page.waitForSelector('.ck');
  const items = await page.locator('.ck').count();
  ok(items >= 5, 'чек-лист крыла показан (' + items + ' пунктов)');
  await page.click('.ck >> nth=0');
  const st = await page.getAttribute('.ck >> nth=0', 'data-state');
  ok(st === 'ok', 'касание отмечает пункт как «ок»');

  // 3. START FLIGHT
  await page.click('[data-act="start-flight"]');
  await page.waitForSelector('#timer');
  ok(true, 'полёт начался, таймер идёт');

  // 4. Итог: по дороге заводим локацию прямо из формы
  await page.click('[data-act="finish-flight"]');
  await page.fill('dialog input[name="durationMin"]', '5');
  await page.fill('dialog input[name="weather"]', 'ветер 3 м/с');
  await page.selectOption('dialog select[name="siteId"]', '__new');
  await page.waitForSelector('dialog input[name="name"]');
  await page.fill('dialog input[name="name"]', 'Поле у реки');
  await page.fill('dialog input[name="place"]', 'за деревней');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog form[data-form="finish"]');
  ok((await page.inputValue('dialog input[name="durationMin"]')) === '5',
    'после добавления локации форма итога вернулась с введёнными данными');
  ok((await page.inputValue('dialog select[name="siteId"]')) !== '__new',
    'новая локация подставлена в поле');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('.stat .v');
  ok((await page.textContent('.stat .v')) === '1', 'в карточке 1 полёт');

  // 5. Перезагрузка — данные на месте (IndexedDB)
  await page.reload();
  await page.waitForSelector('#tabbar .tab');
  await page.evaluate(() => { location.hash = '#/fleet'; });
  await page.waitForTimeout(80);
  ok((await page.textContent('#views')).includes('Test Wing'), 'после перезагрузки модель на месте');
  await page.evaluate(() => { location.hash = '#/log'; });
  await page.waitForTimeout(80);
  ok((await page.textContent('#views')).includes('#001'), 'полёт #001 в журнале');

  // 6. Экспорт
  await page.evaluate(() => { location.hash = '#/backup'; });
  await page.waitForTimeout(80);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-act="export-all"]'),
  ]);
  const backupFile = path.join(TMP, 'backup.rcpilot');
  await download.saveAs(backupFile);
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  ok(backup.format === 'rcplanner' && backup.version === 1, 'файл экспорта в формате rcplanner v1');
  ok(backup.data.aircraft.length === 1 && backup.data.sessions.length === 1, 'в экспорте модель и полёт');

  // 7. Стирание
  await page.click('[data-act="wipe-all"]');
  await page.click('[data-act="wipe-all-yes"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => { location.hash = '#/fleet'; });
  await page.waitForTimeout(80);
  ok((await page.textContent('#views')).includes('Пока нет ни одной модели'), 'данные стёрты');

  // 8. Импорт обратно
  await page.evaluate(() => { location.hash = '#/backup'; });
  await page.waitForTimeout(80);
  await page.setInputFiles('input[data-change="import-file"]', backupFile);
  await page.waitForSelector('dialog [data-act="import-merge"]');
  await page.click('dialog [data-act="import-merge"]');
  await page.waitForSelector('dialog [data-act="close-modal"]');
  await page.click('dialog [data-act="close-modal"]');
  await page.evaluate(() => { location.hash = '#/fleet'; });
  await page.waitForTimeout(80);
  ok((await page.textContent('#views')).includes('Test Wing'), 'импорт вернул данные');

  ok(errors.length === 0, 'ошибок консоли нет' + (errors.length ? ': ' + errors.join('; ') : ''));
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  finish('test:single');
})().catch((e) => { console.error(e); process.exit(1); });
