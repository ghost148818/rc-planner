// Скриншоты приложения с ПОСЕЯННЫМИ данными (аудит гоняет пустую базу,
// на ней большинство экранов — пустые состояния). Запуск из корня:
// node docs/design/shots.js → test/shots/seeded/*.png.
// Наружу ничего не ходит: прогноз — поддельный кэш в settings.
// Ничего наружу не ходит: прогноз — поддельный кэш в settings.
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require(path.join(__dirname, '..', '..', 'test', 'helpers'));
const PUB = path.join(__dirname, '..', '..', 'public');
const OUT = path.join(__dirname, '..', '..', 'test', 'shots', 'seeded');

function fakeForecast() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const d = new Date(today);
  const days = [];
  for (let i = 0; i < 7; i++) { const x = new Date(d); x.setDate(d.getDate() + i); days.push(x.toISOString().slice(0, 10)); }
  const H = { time: [], temperature_2m: [], wind_speed_10m: [], wind_gusts_10m: [], wind_speed_80m: [], wind_speed_120m: [], wind_speed_180m: [], precipitation: [], precipitation_probability: [], weather_code: [] };
  days.forEach((day, di) => {
    for (let h = 0; h < 24; h++) {
      const w = 3 + 6 * Math.abs(Math.sin((h + di * 3) / 5));
      H.time.push(day + 'T' + String(h).padStart(2, '0') + ':00');
      H.temperature_2m.push(Math.round(12 + 8 * Math.sin((h - 6) / 24 * Math.PI * 2)));
      H.wind_speed_10m.push(+w.toFixed(1));
      H.wind_gusts_10m.push(+(w * 1.5).toFixed(1));
      H.wind_speed_80m.push(+(w * 1.3).toFixed(1));
      H.wind_speed_120m.push(+(w * 1.45).toFixed(1));
      H.wind_speed_180m.push(+(w * 1.6).toFixed(1));
      H.precipitation.push(h >= 16 && h <= 18 && di === 0 ? 0.4 : 0);
      H.precipitation_probability.push(h >= 15 && h <= 19 && di === 0 ? 60 : 5);
      H.weather_code.push(h >= 16 && h <= 18 && di === 0 ? 61 : h < 8 ? 2 : 1);
    }
  });
  return { fetched: Date.now() - 20 * 60000, place: 'Поле у реки', json: {
    latitude: 55.6, longitude: 37.9, hourly: H,
    daily: { time: days, sunrise: days.map((x) => x + 'T05:41'), sunset: days.map((x) => x + 'T19:22') },
  } };
}

async function seed(page) {
  await page.evaluate(async (wx) => {
    const now = Date.now(), day = 86400000;
    const iso = (t) => new Date(t).toLocaleDateString('en-CA');
    const put = (s, o) => window.RCDB.put(s, o);
    await put('sites', { id: 'site-1', name: 'Поле у реки', place: 'Подмосковье', lat: 55.6, lon: 37.9, isDefault: true });
    await put('sites', { id: 'site-2', name: 'Склон', place: 'Крылатское', lat: 55.76, lon: 37.43 });
    await put('batteries', { id: 'b1', label: 'LiPo 6S 1300 #1', chem: 'LiPo', cells: 6, p: 1, capacity: 1300, weight: 220, cycles: 41, charge: 'ready', status: 'ok' });
    await put('batteries', { id: 'b2', label: 'LiPo 6S 1300 #2', chem: 'LiPo', cells: 6, p: 1, capacity: 1300, weight: 220, cycles: 38, charge: 'flown', status: 'ok' });
    await put('batteries', { id: 'b3', label: 'Li-Ion 6S2P 7000', chem: 'Li-Ion', cells: 6, p: 2, capacity: 7000, weight: 610, cycles: 12, charge: 'ready', status: 'ok' });
    await put('batteries', { id: 'b4', label: 'LiPo 4S 1500', chem: 'LiPo', cells: 4, p: 1, capacity: 1500, weight: 180, cycles: 97, charge: '', status: 'watch' });
    await put('aircraft', { id: 'a1', name: 'Apex 5″', type: 'quad', manufacturer: 'ImpulseRC', weight: 520, wingspan: 225, maxWind: 20, maxAlt: 60, batteryId: 'b1', components: { motor: { name: 'T-Motor F60 Pro V 2550KV' }, esc: { name: 'Hobbywing 60A 4in1' }, fc: { name: 'Speedybee F405 V4' }, rx: { name: 'ELRS EP1' }, vtx: { name: 'Walksnail Avatar V2' } }, svcEvery: 10, createdAt: now - 60 * day, prepared: { runId: 'r1', at: now - 20 * 60000, siteId: 'site-1' } });
    await put('aircraft', { id: 'a2', name: 'Mini Talon', type: 'plane', manufacturer: 'X-UAV', weight: 1100, wingspan: 1300, maxAlt: 150, batteryId: 'b3', components: { motor: { name: 'SunnySky 2216 1250KV' }, fc: { name: 'Matek F405-WTE, INAV 7' }, gps: { name: 'M10' } }, svcEveryMin: 180, createdAt: now - 90 * day });
    await put('aircraft', { id: 'a3', name: 'Крыло AR Wing Pro', type: 'wing', manufacturer: 'SonicModell', weight: 700, wingspan: 900, batteryId: null, components: {}, createdAt: now - 30 * day });
    let no = 0;
    const flights = [];
    for (let i = 0; i < 14; i++) {
      const t = now - (i * 2 + 1) * day - 3600000 * (i % 4);
      const aid = ['a1', 'a1', 'a2', 'a3'][i % 4];
      flights.push({ id: 'f' + i, aircraftId: aid, date: iso(t), start: t, end: t + 6 * 60000, durationMin: aid === 'a2' ? 22 : 6, flightNo: ++no, batteryId: aid === 'a2' ? 'b3' : 'b1', siteId: i % 3 ? 'site-1' : 'site-2', weather: 'ветер 4 м/с, +17°', result: i === 7 ? 'crash' : 'normal', notes: i === 0 ? 'Отлично летала, новые PID' : '', problems: i === 7 ? 'Порвал луч о ветку' : '' });
    }
    for (const f of flights) await put('sessions', f);
    await put('maintenance', { id: 'm1', aircraftId: 'a3', title: 'Замена луча №2', kind: 'repair', date: iso(now - 15 * day), reason: 'краш об ветку', next: 'заказать луч', done: false, createdAt: now - 15 * day });
    await put('maintenance', { id: 'm2', aircraftId: 'a1', title: 'Осмотр после сезона', kind: 'inspection', date: iso(now - 40 * day), done: true, createdAt: now - 40 * day, doneAt: now - 40 * day });
    await put('runs', { id: 'r1', aircraftId: 'a1', date: iso(now), templateName: 'FPV квадрокоптер', items: [{ t: 'Пропеллеры', state: 'ok' }, { t: 'Моторы', state: 'ok' }] });
    const st = (await window.RCDB.get('settings', 'main')) || { id: 'main', pilot: '', favTools: [] };
    st.pilot = 'Пилот'; st.weatherCache = wx; st.favTools = ['betaflight-app', 'elrs-web-flasher'];
    await put('settings', st);
    localStorage.setItem('rcp.hi', '1');
    await window.loadAll();
  }, fakeForecast());
}

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const srv = await serve(PUB);
  const browser = await chromium.launch();
  const shoot = async (theme, viewport, list, tag) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(srv.url);
    await page.waitForSelector('#tabbar .tab');
    await seed(page);
    await page.evaluate((t) => { localStorage.setItem('rcp.theme', t); document.documentElement.dataset.theme = t; }, theme);
    for (const [name, hash, pre] of list) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForTimeout(120);
      if (pre) { await pre(page); await page.waitForTimeout(150); }
      await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), fullPage: name !== 'today-top' });
    }
    await ctx.close();
  };
  const phone = { width: 390, height: 844 };
  const screens = [
    ['today', '#/today'], ['today-top', '#/today'], ['fleet', '#/fleet'], ['model', '#/model/a1'], ['model-plane', '#/model/a2'],
    ['flight', '#/flight'], ['prep', '#/prep'],
    ['checklist', '#/prep', async (p) => { await p.click('[data-act="prep-model"][data-id="a2"]'); await p.waitForTimeout(100); await p.click('.ck[data-i="0"]'); await p.click('.ck[data-i="1"]'); await p.click('.ck[data-i="2"]'); await p.click('.ck[data-i="2"]'); }],
    ['session', '#/prep', async (p) => { await p.evaluate(async () => { await window.RCDB.put('sessions', { id: 'live', aircraftId: 'a1', date: new Date().toLocaleDateString('en-CA'), start: Date.now() - 154000, end: null, durationMin: null, flightNo: 15, batteryId: 'b1', siteId: 'site-1', weather: '', result: '', notes: '', problems: '', checklistRunId: 'r1' }); await window.loadAll(); location.hash = '#/session/live'; }); }],
    ['finish', '#/session/live', async (p) => { await p.click('[data-act="finish-flight"]'); }],
    ['log', '#/log'], ['stats', '#/stats'], ['weather', '#/weather', async (p) => { await p.selectOption('select[name="wxmodel"]', 'a1'); await p.waitForTimeout(80); await p.selectOption('select[name="wxsite"]', 'site-1'); }],
    ['packing', '#/packing'], ['more', '#/more'], ['tools', '#/tools'], ['batteries', '#/batteries'], ['sites', '#/sites'], ['backup', '#/backup'],
    ['form-model', '#/model/a1', async (p) => { await p.click('[data-act="edit-model"]'); }],
    ['add-model', '#/fleet', async (p) => { await p.click('[data-act="add-model"]'); }],
  ];
  await shoot('dark', phone, screens, 'dark');
  await shoot('light', phone, [['today', '#/today'], ['model', '#/model/a1'], ['checklist', '#/prep', async (p) => { await p.click('[data-act="prep-model"][data-id="a2"]'); }]], 'light');
  await shoot('dark', { width: 1280, height: 800 }, [['today', '#/today'], ['model', '#/model/a1']], 'desktop');
  await browser.close();
  await srv.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
