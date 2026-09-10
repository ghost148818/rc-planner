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
  ok(true, 'борт создан, открыта карточка');

  // 2. Без АКБ лететь нельзя: на чек-листе нет кнопок полёта
  await page.click('[data-act="start-prep"]');
  await page.waitForSelector('.ck');
  const items = await page.locator('.ck').count();
  ok(items >= 5, 'чек-лист крыла показан (' + items + ' пунктов)');
  ok((await page.locator('[data-act="start-flight"]').count()) === 0,
    'без аккумулятора кнопки «Начать полёт» нет');
  await page.click('.ck >> nth=0');
  // render(true) с анимациями перерисовывает внутри View Transition — ждём состояние.
  const stOk = await page.waitForFunction(() => {
    const c = document.querySelector('.ck');
    return c && c.dataset.state === 'ok';
  }, null, { timeout: 3000 }).then(() => true, () => false);
  ok(stOk, 'касание отмечает пункт как «ок»');
  // Меню клетки: три состояния; «Проблема» попадает в баннер липкой панели
  await page.click('.st[data-act="ck-menu"][data-i="1"]');
  await page.waitForSelector('.ck-menu [data-act="ck-set"][data-state="fail"]');
  await page.click('.ck-menu [data-act="ck-set"][data-state="fail"]');
  const stFail = await page.waitForFunction(() => {
    const c = document.querySelectorAll('.ck')[1];
    return c && c.dataset.state === 'fail' && !document.querySelector('.ck-menu');
  }, null, { timeout: 3000 }).then(() => true, () => false);
  ok(stFail, 'меню клетки ставит «проблема» и закрывается');
  ok((await page.textContent('.act-bar')).includes('Отмечена 1 проблема'), 'липкая панель показывает число проблем');
  // Тап по строке с проблемой не стирает отметку — открывает меню
  await page.click('.ck-main[data-i="1"]');
  await page.waitForSelector('.ck-menu [data-act="ck-set"][data-state="ok"]');
  ok(await page.evaluate(() => document.querySelectorAll('.ck')[1].dataset.state === 'fail'), 'тап по строке с проблемой открывает меню, отметка на месте');
  await page.click('.ck-menu [data-act="ck-set"][data-state="ok"]');
  await page.waitForTimeout(150);

  // 2б. Ставим АКБ прямо с чек-листа через «+ Добавить аккумулятор…»:
  // сначала окно выбора (пустой или готовая сборка), потом форма.
  await page.selectOption('select[name="prepBatt"]', '__new');
  await page.waitForSelector('dialog [data-act="batt-pick"][data-i="0"]');
  await page.click('dialog [data-act="batt-pick"][data-i="0"]');
  await page.waitForSelector('dialog input[name="label"]');
  const presetCap = await page.evaluate(() => String(RC.BATTERY_PRESETS[0].capacity));
  ok((await page.inputValue('dialog input[name="capacity"]')) === presetCap, 'готовая сборка заполнила форму');
  // Химия из BATT_CHEM: LiHV выбирается (сообщение из эксплуатации 10 сен)
  const chems = await page.$$eval('dialog select[name="chem"] option', (o) => o.map((x) => x.value));
  ok(chems.join(',') === 'LiPo,LiHV,Li-Ion,LiFe,NiMH', 'в списке химии пять вариантов, включая LiHV (' + chems.join(', ') + ')');
  await page.selectOption('dialog select[name="chem"]', 'LiHV');
  ok((await page.inputValue('dialog select[name="chem"]')) === 'LiHV', 'LiHV выбирается в форме');
  await page.selectOption('dialog select[name="chem"]', 'Li-Ion');
  await page.fill('dialog input[name="label"]', 'Test 6S');
  await page.click('dialog button[type="submit"]');
  // У новой АКБ состояния заряда нет (форма его не спрашивает): «Начать
  // полёт» не показывается, пока не отмечен заряд — тап по чипу «заряд?»
  // рядом с пилюлей АКБ (решение владельца 2026-09-07).
  await page.waitForSelector('.prep-batt button.chip.st-unknown[data-act="batt-charge"]');
  ok((await page.locator('[data-act="start-flight"]').count()) === 0,
    'АКБ без отметки заряда: кнопки «Начать полёт» нет');
  ok((await page.locator('.act-bar .banner.nocharge').count()) === 1,
    'липкая панель просит отметить состояние аккумулятора');
  ok((await page.locator('[data-act="prep-done"]').count()) === 1,
    '«Отметить готовым» доступна и без отметки заряда');
  ok((await page.textContent('.prep-batt button.chip')).trim() === 'заряд?', 'чип на чек-листе — «заряд?»');
  await page.click('.prep-batt button.chip[data-act="batt-charge"]');
  await page.waitForSelector('[data-act="start-flight"]');
  ok((await page.textContent('.prep-batt button.chip')).trim() === 'заряжен',
    'тап по чипу — «заряжен», кнопка «Начать полёт» появилась');

  // 3. «Начать полёт». Полсекунды после тапа по чипу касание не считается:
  // кнопка встаёт на место чипа, и промашка двойным касанием иначе начала
  // бы полёт мимо гарда (chargeJustTapped, ревью 2.0.3).
  await page.waitForTimeout(600);
  await page.click('[data-act="start-flight"]');
  await page.waitForSelector('#timer');
  ok(true, 'полёт начался, таймер идёт');

  // 4. «Посадка» останавливает таймер, форму не открывает; итог — отдельно
  await page.click('[data-act="land-flight"]');
  await page.waitForSelector('.timer.landed');
  ok((await page.locator('dialog').count()) === 0, '«Посадка» зафиксирована, форма итога сама не открылась');
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

  // 4б. Карточка борта: сегменты и версия прошивки компонента
  await page.click('[data-act="model-tab"][data-tab="components"]');
  await page.waitForSelector('[data-act="edit-comp"][data-key="fc"]');
  ok((await page.locator('[data-act="edit-comp"]').count()) === 11,
    'сегмент «Компоненты» крыла: все строки, АКБ — информационная');
  ok((await page.locator('[data-act="edit-comp"][data-key="pitot"]').count()) === 1 &&
     (await page.locator('[data-act="edit-comp"][data-key="pak"]').count()) === 1,
    'у крыла есть слоты «Трубка Пито» и «ПАК»');
  ok((await page.locator('[data-act="edit-comp"][data-key="tx"]').count()) === 0,
    'убранного слота «Передатчик» на чистом борте нет');
  await page.click('[data-act="edit-comp"][data-key="fc"]');
  await page.fill('dialog input[name="name"]', 'Matek F405');
  await page.fill('dialog input[name="fw"]', 'INAV 7.1');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.click('[data-act="model-tab"][data-tab="overview"]');
  await page.waitForSelector('[data-act="model-tab"][data-tab="overview"][aria-pressed="true"]');
  ok((await page.textContent('#views')).includes('INAV 7.1'), 'версия прошивки компонента видна в «Обзоре»');
  await page.click('[data-act="model-tab"][data-tab="history"]');
  await page.waitForSelector('[data-act="session-info"]');
  ok(true, 'сегмент «История» показывает полёт борта');

  // 4в. Копия борта: те же ТТХ и комплектация, без АКБ, фото и истории
  await page.click('[data-act="model-tab"][data-tab="overview"]');
  await page.waitForSelector('[data-act="clone-model"]');
  await page.click('[data-act="clone-model"]');
  await page.waitForSelector('dialog form[data-form="model"][data-clone]');
  ok((await page.inputValue('dialog input[name="name"]')) === 'Test Wing (2)',
    'имя копии — «Test Wing (2)»');
  ok((await page.inputValue('dialog select[name="batteryId"]')) === '',
    'в форме копии аккумулятор не выбран');
  await page.click('dialog button[type="submit"]');
  await page.waitForFunction(() => {
    const h = document.querySelector('.head h1');
    return h && h.textContent === 'Test Wing (2)';
  });
  const cl = await page.evaluate(() => {
    const src = S.aircraft.find((a) => a.name === 'Test Wing');
    const c = S.aircraft.find((a) => a.name === 'Test Wing (2)');
    return {
      sep: c.id !== src.id, type: c.type === src.type, span: c.wingspan === src.wingspan,
      fc: (c.components.fc || {}).name, fw: (c.components.fc || {}).fw,
      batt: c.batteryId || null, photo: !!c.photo, prepared: !!c.prepared,
      notes: c.notes || '', svc: c.svcEvery || null,
      hist: S.sessions.filter((s) => s.aircraftId === c.id).length
          + S.maintenance.filter((m) => m.aircraftId === c.id).length
          + S.runs.filter((r) => r.aircraftId === c.id).length,
      srcHist: S.sessions.filter((s) => s.aircraftId === src.id).length,
      srcBatt: src.batteryId || null,
    };
  });
  ok(cl.sep && cl.type && cl.span, 'копия — отдельная запись с теми же ТТХ');
  ok(cl.fc === 'Matek F405' && cl.fw === 'INAV 7.1', 'комплектация с версией прошивки скопирована');
  ok(cl.batt === null && !!cl.srcBatt, 'аккумулятор не копируется, у образца остался');
  ok(!cl.photo && !cl.prepared && !cl.notes, 'фото, пометка «подготовлен» и заметки не копируются');
  ok(cl.hist === 0 && cl.srcHist === 1, 'история копии пуста, у образца цела');

  // Копия глубокая: правка компонента копии не трогает образец
  await page.click('[data-act="model-tab"][data-tab="components"]');
  await page.waitForSelector('[data-act="edit-comp"][data-key="fc"]');
  await page.click('[data-act="edit-comp"][data-key="fc"]');
  await page.fill('dialog input[name="name"]', 'Speedybee F405');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  ok(await page.evaluate(() => S.aircraft.find((a) => a.name === 'Test Wing').components.fc.name === 'Matek F405'),
    'правка компонента копии не тронула образец');

  // Копия копии — «(3)», а не «Test Wing (2) (2)»
  await page.click('[data-act="model-tab"][data-tab="overview"]');
  await page.waitForSelector('[data-act="clone-model"]');
  await page.click('[data-act="clone-model"]');
  await page.waitForSelector('dialog form[data-form="model"][data-clone]');
  ok((await page.inputValue('dialog input[name="name"]')) === 'Test Wing (3)',
    'копия копии — «Test Wing (3)»');

  // Образец не теряется, если по дороге завели новую АКБ
  await page.selectOption('dialog select[name="batteryId"]', '__new');
  await page.waitForSelector('dialog [data-act="batt-empty"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog form[data-form="model"]');
  ok((await page.locator('dialog form[data-form="model"][data-clone]').count()) === 1,
    'после захода в форму АКБ копия помнит образец');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });

  // 5. Перезагрузка — данные на месте (IndexedDB)
  await page.reload();
  await page.waitForSelector('#tabbar .tab');
  await page.evaluate(() => { location.hash = '#/fleet'; });
  await page.waitForTimeout(80);
  ok((await page.textContent('#views')).includes('Test Wing'), 'после перезагрузки модель на месте');
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForTimeout(80);
  ok((await page.textContent('#views')).includes('#001'), 'полёт #001 в журнале');
  await page.click('[data-act="journal-tab"][data-tab="stats"]');
  await page.waitForSelector('.stat-line.four');
  ok(true, 'сегмент «Статистика» в журнале открывается');
  // Старые адреса журнала остаются рабочими (закладки, changelog) —
  // и сегмент на них живой: псевдоним разрешается в onRoute один раз,
  // а не при каждой перерисовке (финальное ревью 2.0).
  await page.evaluate(() => { location.hash = '#/log'; });
  await page.waitForTimeout(80);
  ok((await page.textContent('#views')).includes('#001'), '#/log открывает журнал на полётах');
  await page.click('[data-act="journal-tab"][data-tab="stats"]');
  const statsOnLog = await page.waitForSelector('.stat-line.four', { timeout: 3000 }).then(() => true, () => false);
  ok(statsOnLog, 'на #/log сегмент «Статистика» переключается');
  await page.evaluate(() => { location.hash = '#/stats'; });
  await page.waitForTimeout(80);
  ok((await page.locator('.stat-line.four').count()) === 1, '#/stats открывает журнал на статистике');
  await page.click('[data-act="journal-tab"][data-tab="log"]');
  const logOnStats = await page.waitForFunction(() => document.body.textContent.includes('#001') && !document.querySelector('.stat-line.four'), null, { timeout: 3000 }).then(() => true, () => false);
  ok(logOnStats, 'на #/stats сегмент «Полёты» переключается');

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
  ok(backup.data.aircraft.length === 2 && backup.data.sessions.length === 1, 'в экспорте борт, его копия и полёт');

  // 7. Стирание
  await page.click('[data-act="wipe-all"]');
  await page.click('[data-act="wipe-all-yes"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => { location.hash = '#/fleet'; });
  await page.waitForTimeout(80);
  ok((await page.textContent('#views')).includes('Пока нет ни одного борта'), 'данные стёрты');

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
