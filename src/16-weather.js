// RC Planner · Окна для полётов: расчёт по прогнозу и экран.
'use strict';

/* ---------- Окна для полётов (погода, online) ---------- */

// Оценка допустимого ветра (м/с), если пилот не задал свой порог.
// Считается от ПОЛНОГО веса (сухая модель + выбранная АКБ) и габаритов:
// лёгкие парусят, тяжёлые пробивают ветер; большой long-range квад
// (диагональ > 300 мм) инертнее и тяговооружён слабее фристайла.
// Шкала рассчитана на опытных пилотов (решение владельца, 2026-08-24).
// Калибровка по парку владельца (2026-08-25): Talon + 6S3P ≈ 18,
// X8 ≈ 20, T2 + 6S2P ≈ 18, 5″ + 6S 1450 ≈ 20, 10″ + 6S 8000 ≈ 18.
function wxEstimate(a, battWeight) {
  let w = { quad: 20, plane: 16, wing: 18, other: 16 }[a.type] || WX_DEFAULT_WIND;
  const total = (a.weight || 0) + (battWeight || 0);
  if (total) {
    if (total < 250) w -= 6;
    else if (total < 600) w -= 2;
    else if (total > 2000) w += 2;
  }
  if (a.type === 'quad' && a.wingspan > 300) w -= 4;
  return Math.max(6, w);
}

// Порог ветра и высота полёта текущей выбранной модели (+ АКБ).
// Высота, выбранная на экране «Окна»: только сотни в пределах 100…3000.
function wxAltPick() {
  const v = +UI.wx.alt;
  return isFinite(v) && v >= WX_ALT_STEP && v <= WX_ALT_MAX
    ? Math.round(v / WX_ALT_STEP) * WX_ALT_STEP : null;
}

function wxLimits() {
  const a = S.aircraft.find((x) => x.id === UI.wx.aircraftId);
  const pick = wxAltPick();
  if (!a) return { maxW: WX_DEFAULT_WIND, alt: pick || 100, altOwn: 100, pick: !!pick, est: false, name: '', battName: '' };
  const b = S.batteries.find((x) => x.id === UI.wx.batteryId);
  const own = wxOwnWind(a);
  return {
    maxW: own || wxEstimate(a, b && b.weight),
    alt: pick || wxOwnAlt(a),
    altOwn: wxOwnAlt(a),
    pick: !!pick,
    est: !own,
    name: a.name,
    battName: b ? b.label : '',
  };
}

// Подпись высоты за день: одно число, если уровень не гулял, иначе
// диапазон — высота барического уровня меняется от часа к часу.
function wxTopText(day) {
  if (!day || !day.top) return '';
  return day.top.min === day.top.max ? day.top.min + ' м' : day.top.min + '–' + day.top.max + ' м';
}

// Все уровни ветра часа i, снизу вверх: [{ m: высота над землёй, v: м/с }].
// elev — elevation ответа (высота земли в точке модели); null — барические
// уровни не разбираем вовсе (высота полёта в пределах приземных уровней,
// старый кэш или прогноз без elevation). null в скорости или в высоте —
// уровня просто нет; НУЛЁМ он не становится: пропуск не штиль.
function wxHourLevels(H, i, elev) {
  const at = (key) => numOrNull((H[key] || [])[i]);
  const out = [];
  const w10 = at('wind_speed_10m');
  if (w10 != null) out.push({ m: 10, v: w10, from: 0 });
  for (const L of WX_SURF) {
    const v = at('wind_speed_' + L.m + 'm');
    if (v != null) out.push({ m: L.m, v, from: L.from });
  }
  if (elev != null) {
    for (const p of WX_PRESSURE) {
      const v = at('wind_speed_' + p + 'hPa');
      const g = at('geopotential_height_' + p + 'hPa'); // метры НАД УРОВНЕМ МОРЯ
      if (v == null || g == null) continue;             // у модели нет барических уровней
      const m = Math.round(g - elev);
      if (m <= WX_ALT_SURF) continue; // ниже 200 м приземные точнее, а 1000 гПа бывает и под землёй
      out.push({ m, v, hpa: p });
    }
  }
  return out.sort((a, b) => a.m - b.m);
}

// Уровни в пределах высоты полёта. У приземных порог свой (from),
// у барических — середина промежутка до предыдущего уровня: они редкие
// (шаг ~250 м), иначе ветер над самой головой не попал бы в расчёт.
function wxPickLevels(levels, alt) {
  const pick = [];
  for (let k = 0; k < levels.length; k++) {
    const L = levels[k];
    const from = L.from != null ? L.from : ((levels[k - 1] ? levels[k - 1].m : 0) + L.m) / 2;
    if (alt > from) pick.push(L); else break;
  }
  return pick;
}

// Есть ли в прогнозе ветер выше 200 м.
// 'no-keys' — снят старой версией (нет ключей или elevation): поможет
//            кнопка «Показать прогноз»;
// 'no-data' — ключи есть, но модель барические уровни не считает
//            (замер: 68.97 N / 33.08 E — все часы null), обновление не поможет;
// 'ok'      — данные есть хотя бы в одном часе.
function wxAloftState(json) {
  const H = json && json.hourly;
  if (!H || numOrNull(json.elevation) == null) return 'no-keys';
  const p0 = WX_PRESSURE[0];
  if (!(('wind_speed_' + p0 + 'hPa') in H) || !(('geopotential_height_' + p0 + 'hPa') in H)) return 'no-keys';
  const has = WX_PRESSURE.some((p) => (H['wind_speed_' + p + 'hPa'] || []).some((v) => v != null)
    && (H['geopotential_height_' + p + 'hPa'] || []).some((v) => v != null));
  return has ? 'ok' : 'no-data';
}

// Иконка часа. Код WMO (weather_code) точнее всего различает туман и снег;
// если его нет (старый сохранённый прогноз) — обходимся осадками и облачностью.
// 45/48 — туман, 71-77 и 85/86 — снег, 51-67 и 80-82 — дождь, 95+ — гроза.
function wxIcon(hr) {
  const c = hr.code;
  let name;
  if (c === 45 || c === 48) name = 'wxFog';
  else if ((c >= 71 && c <= 77) || c === 85 || c === 86) name = 'wxSnow';
  else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) name = 'wxRain';
  else if (c === 3) name = 'wxCloud';
  else if (c === 1 || c === 2) name = 'wxPartly';
  else name = 'wxSun';
  // Ночью ясное и малооблачное небо — луна.
  if (!hr.light && (name === 'wxSun' || name === 'wxPartly')) name = 'wxMoon';
  return name;
}

// Окно «Как считается»: коэффициенты берутся из WX_K — таблица и расчёт
// разойтись не могут. Прозаические числа (0,2 мм, ветер > 8) — литералы.
function wxHelpHtml() {
  const lim = wxLimits();
  const w = lim.maxW;
  const n = (x) => (Math.round(x * 10) / 10);
  const row = (what, bad, warn) => `<tr><td>${what}</td><td class="wx-bad">${bad}</td><td class="wx-warn">${warn}</td></tr>`;
  return `<p class="small muted">Порядок такой: <b>борт → место → дата</b>. Ограничения берутся
    из карточки борта, а не из общей константы.</p>
    <p class="small">Сейчас считаем для: <b>${lim.name ? esc(lim.name) : 'без борта'}</b>${lim.battName ? ' + <b>' + esc(lim.battName) + '</b>' : ''} —
    порог ${lim.est && lim.name ? 'примерно ' : ''}<b>${w} м/с</b>, высота полёта <b>${lim.alt} м</b>${lim.pick ? ' (выбрана на экране)' : ''}.
    ${lim.est && lim.name ? 'Порог оценён по полному весу (сухой борт + АКБ) и габаритам: задайте «Макс. ветер» в карточке, чтобы считать по-своему.' : ''}</p>

    <div class="h2">Вердикт часа</div>
    <p class="small muted">Достаточно одного сработавшего условия — берётся худшее.
    Пороги ниже — для простых условий (день, ясно).</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Что смотрим</th><th>Не стоит</th><th>На пределе</th></tr></thead>
      <tbody>
        ${row('Ветер у земли', `> ${w} м/с`, `> ${n(w * WX_K.warn)} м/с`)}
        ${row('Ветер на высоте полёта', `> ${w} м/с`, `> ${n(w * WX_K.warn)} м/с`)}
        ${row('Порывы', `> ${n(w * WX_K.gustBad)} м/с`, `> ${n(w * WX_K.gustWarn)} м/с`)}
        ${row('Вероятность осадков', 'от 60 %', 'от 40 %')}
      </tbody>
    </table></div>

    <div class="h2">Сложные условия — порог ниже</div>
    <p class="small">Ночь не запрещает полёт, но управлять сложнее. В непростых условиях
    порог ветра умножается на коэффициент (условия перемножаются: ночь + морось = 0.8 × 0.85 ≈ 0.7):</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Условие</th><th></th><th>Порог для «${lim.name ? esc(lim.name) : 'борта'}»</th></tr></thead>
      <tbody>
        ${[['Темнота (ночь)', WX_K.night], ['Туман днём', WX_K.fog],
           ['Морось, слабый дождь', WX_K.drizzle], ['Слабый снег', WX_K.snow]]
          .map(([t, k]) => `<tr><td>${t}</td><td>× ${k}</td><td>${n(w * k)} м/с</td></tr>`).join('')}
      </tbody>
    </table></div>

    <div class="h2">Точно не стоит — при любом ветре</div>
    <p class="small">Явный дождь (от 0,2 мм/ч или коды умеренного и сильного дождя),
    снегопад, <b>метель</b> (снег при ветре сильнее 8 м/с), гроза и <b>туман ночью</b> —
    час всегда «не стоит».</p>

    <div class="h2">Ветер на высоте</div>
    <p class="small">До ${WX_ALT_SURF} м прогноз даёт ветер на 10, 80, 120, 180 и 200 м — это высоты
    над землёй. Выше таких уровней у прогноза нет: ветер берётся с барических уровней
    (${WX_PRESSURE[0]}…${WX_PRESSURE[WX_PRESSURE.length - 1]} гПа), а их высота над землёй
    пересчитывается по геопотенциалу в КАЖДОМ часе — уровень «плавает» на десятки метров,
    поэтому подпись «на 850 м» от часа к часу меняется. Берём только уровни в пределах высоты
    полёта и худший из них: низколетящий квад не бракуется ветром на 180 метрах. Барические
    уровни есть не у каждой точки — если их нет, экран пишет, до какой высоты прогноз есть,
    и считает окна по ней. Порывы прогноз даёт только у земли.</p>

    <div class="h2">Как складывается окно</div>
    <p class="small">Окно — это подряд идущие часы без вердикта «не стоит», ночные тоже.
    Часы «на пределе» в окно входят: решение за вами. Полоска у часа показывает худшее из
    ветра у земли, ветра на высоте и порывов (порывы делятся на 1,4) в долях от порога
    С УЧЁТОМ сложности условий этого часа.</p>

    <p class="small muted">Данные: Open-Meteo. Прогноз — ориентир, решение о вылете всегда за пилотом.</p>
    <button class="btn btn-primary" data-act="close-modal">Понятно</button>`;
}

// Ночью летают. Но в темноте, тумане и осадках управлять сложнее —
// вместо запрета порог ветра умножается на коэффициент сложности k.
// Возвращает {k, why}: множитель и человекочитаемые причины.
function wxDifficulty(hr) {
  let k = 1;
  const why = [];
  const c = hr.code;
  if (!hr.light) { k *= WX_K.night; why.push('ночь'); }
  if (c === 45 || c === 48) { k *= WX_K.fog; why.push('туман'); }
  if ((c >= 51 && c <= 61) || c === 80) { k *= WX_K.drizzle; why.push('морось'); }
  else if (c === 71 || c === 85) { k *= WX_K.snow; why.push('снег'); }
  return { k, why };
}

// Жёсткие запреты: час «не стоит» независимо от ветра и порогов.
// Коды WMO сверены с Open-Meteo (Context7 + живой запрос, 2026-08-25).
function wxHardStop(hr) {
  const c = hr.code;
  if (hr.prec >= 0.2 || hr.pp >= 60) return 'осадки';
  if (c >= 95) return 'гроза';
  if (c === 63 || c === 65 || c === 66 || c === 67 || c === 81 || c === 82) return 'дождь';
  if (c === 73 || c === 75 || c === 77 || c === 86) return 'снегопад';
  if ((c === 71 || c === 85) && hr.w10 > 8) return 'метель';
  if ((c === 45 || c === 48) && !hr.light) return 'туман ночью';
  return '';
}

// Оценка часа: ok / warn / bad. Ветер сравнивается с эффективным
// порогом maxW × k (k — сложность условий: темнота, туман, осадки).
// alt — максимальный ветер на уровнях в пределах высоты полёта.
function wxVerdict(hr, maxW) {
  const stop = hr.stop !== undefined ? hr.stop : wxHardStop(hr);
  if (stop) return 'bad';
  const wEff = maxW * (hr.diff || wxDifficulty(hr)).k;
  if (hr.w10 > wEff || hr.alt > wEff || hr.gust > wEff * WX_K.gustBad) return 'bad';
  if (hr.w10 > wEff * WX_K.warn || hr.alt > wEff * WX_K.warn || hr.gust > wEff * WX_K.gustWarn || hr.pp >= 40) return 'warn';
  return 'ok';
}

function wxDay(json, dayIdx, maxW, altM) {
  const H = json.hourly;
  const date = (json.daily.time || [])[dayIdx];
  if (!date) return null;
  // Барические уровни разбираем ТОЛЬКО когда высота полёта выше 200 м:
  // для обычного борта путь ровно прежний и лишней работы на семь чипов
  // дней (7 × 24 часа) нет.
  const aloft = altM > WX_ALT_SURF ? numOrNull(json.elevation) : null;
  const sunrise = json.daily.sunrise[dayIdx];
  const sunset = json.daily.sunset[dayIdx];
  const riseH = parseInt(sunrise.slice(11, 13), 10);
  const setH = parseInt(sunset.slice(11, 13), 10);
  const hours = [];
  // Open-Meteo отдаёт null для недостающих часов, а кэш приезжает и из
  // копии: каждое значение — число или null, чтобы .toFixed() в
  // шаблонах не ронял «Сегодня» (запасной экран) и «Окна».
  const num = (v) => (v == null || v === '' || !isFinite(+v) ? null : +v);
  for (let i = 0; i < H.time.length; i++) {
    if (!H.time[i].startsWith(date)) continue;
    const hh = parseInt(H.time[i].slice(11, 13), 10);
    const at = (key) => num((H[key] || [])[i]);
    const all = wxHourLevels(H, i, aloft);
    const above = wxPickLevels(all, altM).filter((l) => l.m > 10);
    const hr = {
      hh,
      light: hh >= riseH && hh <= setH,
      temp: at('temperature_2m'),
      w10: at('wind_speed_10m'),
      gust: at('wind_gusts_10m'),
      alt: above.length ? Math.max(...above.map((l) => l.v)) : at('wind_speed_10m'),
      top: above.length ? above[above.length - 1].m : 0, // докуда СЧИТАЛИ в этом часе
      cap: all.length ? all[all.length - 1].m : 0,       // докуда вообще ЕСТЬ прогноз
      prec: at('precipitation'),
      pp: at('precipitation_probability') || 0,
      code: at('weather_code'),
    };
    // Запрет и сложность считаются один раз здесь; вердикт, иконка и
    // строка часа читают готовое — ничего не расходится и не считается дважды.
    hr.stop = wxHardStop(hr);
    hr.diff = wxDifficulty(hr);
    hr.verdict = wxVerdict(hr, maxW);
    hours.push(hr);
  }
  // Окна: подряд идущие часы без вердикта bad. Ночь не запрещает
  // полёт — она уже учтена коэффициентом сложности в вердикте.
  const windows = [];
  let run = null;
  hours.forEach((hr) => {
    if (hr.verdict !== 'bad') {
      if (!run) run = { from: hr.hh, to: hr.hh };
      else run.to = hr.hh;
    } else if (run) { windows.push(run); run = null; }
  });
  if (run) windows.push(run);
  // Высота барического уровня меняется от часа к часу, поэтому на день
  // отдаём диапазон, а не одно число: подпись «на 850 м» честная только
  // в пределах часа.
  const tops = hours.map((x) => x.top).filter(Boolean);
  const caps = hours.map((x) => x.cap).filter(Boolean);
  return {
    date, hours, windows,
    asked: altM,
    top: tops.length ? { min: Math.min(...tops), max: Math.max(...tops) } : null,
    cap: caps.length ? { min: Math.min(...caps), max: Math.max(...caps) } : null,
    thin: hours.filter((x) => x.cap && x.cap < altM).length, // часы, где прогноз не достаёт
    sunrise: sunrise.slice(11, 16), sunset: sunset.slice(11, 16),
  };
}

// Адрес запроса погоды — отдельной чистой функцией: её проверяет тест
// без похода в сеть (какие переменные уходят и что координаты огрублены).
// ПРИВАТНОСТЬ: наружу уходят координаты, огрублённые до ~1 км (2 знака).
// Сетка прогнозных моделей всё равно крупнее — на точность окон это
// не влияет, а точное место (дом, точка взлёта) не уходит.
function wxUrl(lat, lon) {
  lat = +(+lat).toFixed(2);
  lon = +(+lon).toFixed(2);
  return WX_API + '?latitude=' + lat + '&longitude=' + lon +
    '&hourly=' + WX_HOURLY.join(',') +
    '&daily=sunrise,sunset&wind_speed_unit=ms&timezone=' + encodeURIComponent(WX_TZ) +
    '&forecast_days=' + WX_DAYS;
}

async function wxLoad() {
  const wx = UI.wx;
  let lat, lon, place;
  if (wx.siteId === 'gps') {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000, maximumAge: 60000 }));
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
      place = 'Моё местоположение';
    } catch (e) {
      wx.error = 'Не удалось получить местоположение. Разрешите доступ к геопозиции или выберите локацию.';
      wx.loading = false;
      render();
      return;
    }
  } else {
    const s = S.sites.find((x) => x.id === wx.siteId);
    if (!s || s.lat == null) {
      wx.error = 'Выберите локацию с координатами или «Моё местоположение».';
      wx.loading = false;
      render();
      return;
    }
    lat = s.lat; lon = s.lon; place = s.name;
  }
  const url = wxUrl(lat, lon);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json.hourly || !json.daily) throw new Error('неожиданный ответ');
    wx.data = { fetched: Date.now(), place, json };
    wx.error = '';
    S.settings.weatherCache = wx.data;
    await saveSettings();
  } catch (e) {
    // TypeError у fetch — нет сети; navigator.onLine ненадёжен, на него не смотрим.
    wx.error = (e instanceof TypeError)
      ? 'Погода недоступна офлайн: нет связи с сервисом погоды. Приложение работает дальше.'
      : 'Не удалось загрузить прогноз: ' + (e && e.message);
  }
  wx.loading = false;
  render();
}

// Число из часа прогноза в подпись: «12», а без данных — «—»
// (Open-Meteo отдаёт null, выдумывать «0 м/с» нельзя).
function wxNum(v) {
  return Number.isFinite(v) ? v.toFixed(0) : '—';
}

// Осадки в мм: один знак после запятой, десятичная ЗАПЯТАЯ — как
// fmtDurShort и остальная русская типографика приложения.
function wxMm(v) {
  return Number.isFinite(v) ? String(Math.round(v * 10) / 10).replace('.', ',') : '—';
}

// «получен 20 мин назад» — одна формулировка на экран окон и герой «Сегодня».
function wxAgoText(fetched) {
  const age = Date.now() - fetched;
  return age < 90000 ? 'только что'
    : age < 3600000 ? Math.round(age / 60000) + ' мин назад'
    : Math.round(age / 3600000) + ' ч назад';
}

// Текущий час по МСК (0–23) — отметка «сейчас» на полоске дня.
function wxNowHour() {
  return +new Date().toLocaleString('en-GB', { timeZone: WX_TZ, hour: 'numeric', hourCycle: 'h23' }) || 0;
}

// Полоска 24 часов: сегмент на час, цвет — вердикт (g/y/r), ночь
// приглушена (.n), выбранный час обведён (.now). Под полоской — деления.
// tap — сегменты становятся кнопками (data-act="weather-hour"): так
// только на экране «Окна»; в герое «Сегодня» полоска лежит внутри
// кнопки-карточки, и вложенные кнопки там недопустимы.
const WX_WORDS = { ok: 'можно', warn: 'на пределе', bad: 'не стоит' };
function wxStripHtml(day, hour, tap) {
  const cls = (hr) => (hr.verdict === 'ok' ? 'g' : hr.verdict === 'warn' ? 'y' : 'r') +
    (hr.light ? '' : ' n') + (hr.hh === hour ? ' now' : '');
  const label = (hr) => String(hr.hh).padStart(2, '0') + ':00 — ' + WX_WORDS[hr.verdict];
  const segs = tap
    ? day.hours.map((hr) => `<button type="button" class="${cls(hr)}" data-act="weather-hour" data-h="${hr.hh}"
        aria-label="${label(hr)}" aria-pressed="${hr.hh === hour}"></button>`).join('')
    : day.hours.map((hr) => `<i class="${cls(hr)}"></i>`).join('');
  const strip = tap
    ? `<span class="strip tap" role="group" aria-label="Выбор часа">${segs}</span>`
    : `<span class="strip" role="img" aria-label="Час за часом: ${day.hours.map(label).join(', ')}">${segs}</span>`;
  return strip + `<span class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></span>`;
}

// Погода словами по коду WMO — подпись карточки выбранного часа.
// Коды те же, что в wxIcon/wxHardStop (сверены с Open-Meteo).
function wxDesc(hr) {
  const c = hr.code;
  if (c == null) return '';
  if (c === 0) return hr.light ? 'ясно' : 'ясно, ночь';
  if (c === 1) return 'малооблачно';
  if (c === 2) return 'переменная облачность';
  if (c === 3) return 'пасмурно';
  if (c === 45 || c === 48) return 'туман';
  if (c >= 51 && c <= 57) return 'морось';
  if (c === 61 || c === 80) return 'слабый дождь';
  if (c >= 62 && c <= 67) return 'дождь';
  if (c === 81 || c === 82) return 'ливень';
  if (c === 71 || c === 85) return 'слабый снег';
  if (c >= 72 && c <= 77) return 'снег';
  if (c === 86) return 'снегопад';
  if (c >= 95) return 'гроза';
  return '';
}

// Доля от порога для часа: худшее из ветра у земли, ветра на высоте и
// порывов (порывы — в долях от их порога) относительно эффективного
// порога С УЧЁТОМ сложности условий. Одна формула для полоски в
// списке часов, карточки выбранного часа и «Обратить внимание».
function wxHourLoad(hr, maxW) {
  const wEff = maxW * hr.diff.k;
  const worst = Math.max(hr.w10 || 0, hr.alt || 0, (hr.gust || 0) / WX_K.gustBad);
  return Math.min(1.15, worst / wEff);
}

// Час полоски по умолчанию: сегодня — текущий час МСК, в другие дни —
// первый час первого окна (нет окон — первый час дня). Выбранный
// пользователем час берётся, если он есть в этом дне.
function wxSelectedHour(day) {
  const wx = UI.wx;
  if (wx.hour != null && day.hours.some((h) => h.hh === wx.hour)) return wx.hour;
  if (wx.day === 0) return wxNowHour();
  return day.windows.length ? day.windows[0].from : day.hours[0].hh;
}

// Чипы дней: семь кнопок с точкой цвета лучшего вердикта дня из кэша
// (день без данных — без точки). Активный день — рамка --text.
function wxDayChipsHtml(lim) {
  const wx = UI.wx;
  const json = wx.data && wx.data.json;
  const baseIdx = json ? (json.daily.time || []).indexOf(wxTodayISO()) : -1;
  const names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; // с заглавной — как «Сегодня», «Завтра»
  let h = '<div class="day-chips" role="group" aria-label="День прогноза">';
  for (let i = 0; i < WX_DAYS; i++) {
    const d = new Date(wxTodayISO() + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const label = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : names[d.getDay()] + ' ' + d.getDate();
    let dot = '';
    if (baseIdx >= 0) {
      let day = null;
      try { day = wxDay(json, baseIdx + i, lim.maxW, lim.alt); } catch (e) { day = null; }
      if (day && day.hours.length) {
        const best = day.hours.some((x) => x.verdict === 'ok') ? 'g'
          : day.hours.some((x) => x.verdict === 'warn') ? 'y' : 'r';
        dot = `<i class="${best}" aria-hidden="true"></i>`;
      }
    }
    h += `<button type="button" class="pill day-chip${wx.day === i ? ' sel' : ''}" data-act="weather-day" data-day="${i}"
      aria-pressed="${wx.day === i}">${dot}${label}</button>`;
  }
  return h + '</div>';
}

// Карточка выбранного часа: иконка, чип вердикта, погода словами и
// температура, сетка «у земли / на высоте / порывы / осадки», полоска
// «от порога». Причины (запрет или сложность) — строкой под сеткой.
function wxHourCardHtml(day, hr, lim) {
  const load = wxHourLoad(hr, lim.maxW);
  const col = hr.verdict === 'ok' ? 'var(--ok)' : hr.verdict === 'warn' ? 'var(--warn)' : 'var(--bad)';
  const chipCls = hr.verdict === 'ok' ? 'st-ready' : hr.verdict === 'warn' ? 'st-check' : 'st-grounded';
  const desc = [wxDesc(hr), hr.temp != null ? wxNum(hr.temp) + '°' : ''].filter(Boolean).join(' · ');
  const marks = (hr.stop ? [hr.stop] : hr.diff.why).join(' · ');
  // Час ±1 кнопками — видны только в перчатках (.wx-step): там клетка
  // полоски ~13 px, другого способа выбрать час нет.
  const step = (h, label, ic, off) => `<button type="button" class="ic-btn" data-act="weather-hour" data-h="${h}" aria-label="${label}"${off ? ' disabled' : ''}>${ICONS[ic]}</button>`;
  return `<div class="h2">${String(hr.hh).padStart(2, '0')}:00 <span class="cnt">выбранный час</span>
    <span class="wx-step">${step(hr.hh - 1, 'Предыдущий час', 'back', hr.hh === 0)}${step(hr.hh + 1, 'Следующий час', 'chev', hr.hh === 23)}</span></div>
    <div class="card wx-hour">
      <div class="wx-hour-top">
        <span class="wx-ic">${ICONS[wxIcon(hr)]}</span>
        <span class="chip ${chipCls}">${WX_WORDS[hr.verdict]}</span>
        <span class="grow small muted">${desc || '—'}</span>
        <span class="small mono nowrap">${wxNum(hr.w10)} м/с</span>
      </div>
      <div class="kv">
        <div><span class="k">У земли</span><span class="v">${wxNum(hr.w10)} м/с</span></div>
        <div><span class="k">${hr.top ? `На ${hr.top} м` : 'На высоте'}</span><span class="v">${hr.top ? wxNum(hr.alt) + ' м/с' : 'как у земли'}${
          hr.cap && hr.cap < day.asked ? ` <span style="color:var(--warn)">выше ${hr.cap} м нет данных</span>` : ''}</span></div>
        <div><span class="k">Порывы</span><span class="v">до ${wxNum(hr.gust)} м/с</span></div>
        <div><span class="k">Осадки</span><span class="v">${hr.pp} %${hr.prec > 0 ? ` · ${wxMm(hr.prec)} мм` : ''}</span></div>
      </div>
      <div class="load-line">
        <span class="xs muted nowrap">от порога</span>
        <span class="gauge"><i style="width:${Math.round(load * 100 / 1.15)}%;background:${col}"></i></span>
        <span class="xs mono">${Math.round(load * 100)} %</span>
      </div>
      ${marks ? `<div class="xs muted" style="margin-top:6px">${hr.stop ? 'запрет: ' : 'сложнее: '}${marks}${hr.stop ? '' : ` · порог ${Math.round(lim.maxW * hr.diff.k * 10) / 10} м/с`}</div>` : ''}
    </div>`;
}

// «Обратить внимание»: часы «не стоит» и «на пределе», слитые в отрезки
// по одной причине. Причина «не стоит» — запрет (hr.stop) или ветер/порывы
// выше порога; «на пределе» — что именно на пределе. Не больше пяти строк;
// тап по строке выбирает первый час отрезка.
function wxAttentionHtml(day, lim) {
  const reason = (hr) => {
    const wEff = lim.maxW * hr.diff.k;
    if (hr.verdict === 'bad') {
      if (hr.stop) return { key: 'bad:' + hr.stop, text: hr.stop, icon: hr.stop === 'гроза' || hr.stop === 'дождь' || hr.stop === 'осадки' ? 'wxRain' : hr.stop.startsWith('снег') || hr.stop === 'метель' ? 'wxSnow' : hr.stop.startsWith('туман') ? 'wxFog' : 'weather' };
      const wind = hr.w10 > wEff || hr.alt > wEff;
      return { key: wind ? 'bad:wind' : 'bad:gust', text: wind ? 'ветер выше порога' : 'порывы выше порога', icon: 'weather' };
    }
    if (hr.verdict === 'warn') {
      const wind = hr.w10 > wEff * WX_K.warn || hr.alt > wEff * WX_K.warn;
      const gust = hr.gust > wEff * WX_K.gustWarn;
      const t = wind ? 'ветер на пределе' : gust ? 'порывы на пределе' : 'возможны осадки';
      return { key: 'warn:' + t, text: t, icon: wind || gust ? 'weather' : 'wxRain' };
    }
    return null;
  };
  const spans = [];
  let cur = null;
  day.hours.forEach((hr) => {
    const r = reason(hr);
    if (!r) { cur = null; return; }
    if (cur && cur.key === r.key && cur.to === hr.hh - 1) {
      cur.to = hr.hh;
      cur.w = Math.max(cur.w, hr.w10 || 0, hr.alt || 0);
      cur.g = Math.max(cur.g, hr.gust || 0);
      cur.pp = Math.max(cur.pp, hr.pp || 0);
      cur.prec = Math.max(cur.prec, hr.prec || 0);
    } else {
      cur = { key: r.key, text: r.text, icon: r.icon, verdict: hr.verdict, from: hr.hh, to: hr.hh,
        w: Math.max(hr.w10 || 0, hr.alt || 0), g: hr.gust || 0, pp: hr.pp || 0, prec: hr.prec || 0 };
      spans.push(cur);
    }
  });
  if (!spans.length) return '';
  const rows = spans.slice(0, 5).map((s) => {
    const time = `${String(s.from).padStart(2, '0')}:00–${String(s.to + 1).padStart(2, '0')}:00`;
    const sub = s.key.startsWith('warn:возможны') || s.key === 'bad:осадки' || s.key === 'bad:дождь'
      ? `вероятность&nbsp;${s.pp}&nbsp;%${s.prec > 0 ? ` · до&nbsp;${wxMm(s.prec)}&nbsp;мм` : ''}`
      : `ветер до&nbsp;${wxNum(s.w)}&nbsp;м/с · порывы до&nbsp;${wxNum(s.g)}`;
    const chipCls = s.verdict === 'bad' ? 'st-grounded' : 'st-check';
    return `<button class="row" data-act="weather-hour" data-h="${s.from}">
      <span class="row-ic">${ICONS[s.icon]}</span>
      <span class="grow"><span class="t">${s.text.charAt(0).toUpperCase() + s.text.slice(1)}</span><span class="d wrap"><span class="mono nowrap">${time}</span> · ${sub}</span></span>
      <span class="chip ${chipCls}">${WX_WORDS[s.verdict]}</span>
    </button>`;
  }).join('');
  return `<div class="h2">Обратить внимание${spans.length > 5 ? ` <span class="cnt">первые 5 из ${spans.length}</span>` : ''}</div>
    <div class="card flat">${rows}</div>`;
}

// Порог ветра и высота борта для окон — как wxLimits, но для любого
// борта (герой на «Сегодня» считает по первому собранному).
function wxLimitsOf(a) {
  if (!a) return { maxW: WX_DEFAULT_WIND, alt: 100, est: false };
  const own = wxOwnWind(a);
  return {
    maxW: own || wxEstimate(a, (armedBattery(a) || {}).weight),
    alt: wxOwnAlt(a),
    est: !own,
  };
}

// Собственные пороги борта — только как положительные числа: loadAll
// уже нормализует поля, но порог идёт в разметку без esc(), поэтому
// защита стоит и здесь (иначе строка из копии — прямо в HTML).
function wxOwnWind(a) {
  const w = +a.maxWind;
  return isFinite(w) && w > 0 ? w : 0;
}
function wxOwnAlt(a) {
  const h = +a.maxAlt;
  return isFinite(h) && h > 0 ? h : (WX_DEFAULT_ALT[a.type] || 100);
}

// Свежий кэш прогноза для основной локации: не старше 6 часов и снят
// именно для неё (по имени места). Никаких запросов — только кэш;
// иначе «Сегодня» показывает обычную строку «Окна для полётов».
const WX_FRESH_MS = 6 * 3600 * 1000;
// После трёх часов прогноз помечается «устарел» — одинаково в герое
// «Сегодня» и на экране «Окна», чтобы оценка свежести не расходилась.
const WX_STALE_MS = 3 * 3600 * 1000;
function wxCacheFresh() {
  const c = S.settings.weatherCache;
  const home = S.sites.find((s) => s.isDefault);
  if (!c || !c.json || !c.json.daily || !home || c.place !== home.name) return null;
  if (Date.now() - (+c.fetched || 0) > WX_FRESH_MS) return null;
  return c;
}

// Ветер у земли сейчас — пилюля на экране полёта. Только из кэша
// прогноза (никаких запросов), если он не старше 6 часов и снят для
// локации полёта. Нет свежего кэша или локации — пустая строка, пилюли нет.
function wxWindNowText(site, a) {
  try {
    const c = S.settings.weatherCache;
    if (!site || !c || !c.json || !c.json.daily || c.place !== site.name) return '';
    if (Date.now() - (+c.fetched || 0) > WX_FRESH_MS) return '';
    const idx = (c.json.daily.time || []).indexOf(wxTodayISO());
    if (idx < 0) return '';
    const lim = wxLimitsOf(a);
    const day = wxDay(c.json, idx, lim.maxW, lim.alt);
    const hr = day && day.hours.find((x) => x.hh === wxNowHour());
    return hr && hr.w10 != null ? `${wxNum(hr.w10)} м/с` : '';
  } catch (e) {
    return '';
  }
}

// Вердикт дня из кэша для борта a (или порога по умолчанию): заголовок
// с окнами, полоска 24 часов и подпись. Тап по карточке ведёт в окна.
// compact — вариант для «на поле»/«в полёте»: короче подпись.
function wxHeroHtml(a, compact) {
  const c = wxCacheFresh();
  if (!c) return '';
  const idx = (c.json.daily.time || []).indexOf(wxTodayISO());
  const lim = wxLimitsOf(a);
  const day = idx < 0 ? null : wxDay(c.json, idx, lim.maxW, lim.alt);
  if (!day || !day.hours.length) return '';
  const now = wxNowHour();
  // Диапазон неразрывный: иначе браузер переносит строку после «–»
  const span = (w) => `<span class="nowrap">${String(w.from).padStart(2, '0')}:00–${String(w.to + 1).padStart(2, '0')}:00</span>`;
  // Заголовок — про ближайшее: текущее окно или следующее сегодня.
  const cur = day.windows.find((w) => w.from <= now && now <= w.to);
  const next = day.windows.find((w) => w.from > now);
  let title, cls;
  if (cur) { title = cur.to >= 23 ? 'Можно лететь до конца дня' : `Можно лететь до ${String(cur.to + 1).padStart(2, '0')}:00`; cls = 'ok'; }
  else if (next) { title = `Можно лететь ${span(next)}`; cls = 'ok'; }
  else if (day.windows.length) { title = 'Окна на сегодня прошли'; cls = 'muted'; }
  else { title = 'Сегодня лучше не лететь'; cls = 'warn'; }
  const hr = day.hours.find((x) => x.hh === now) || day.hours[0];
  const windNow = `<span class="nowrap">${wxNum(hr.w10)} м/с</span> у земли${hr.top ? ` · <span class="nowrap">${wxNum(hr.alt)} на ${hr.top} м</span>` : ''} · <span class="nowrap">порывы до ${wxNum(hr.gust)}</span>`;
  const stale = Date.now() - (+c.fetched || 0) > WX_STALE_MS
    ? ' · <span style="color:var(--warn)">устарел</span>' : '';
  const sub = compact ? windNow + stale
    : `${esc(c.place)} · ${a ? `${esc(a.name)} держит <span class="nowrap">${lim.est ? '≈' : 'до '}${lim.maxW} м/с</span>` : `порог <span class="nowrap">${lim.maxW} м/с</span>`} · обновлено ${wxAgoText(c.fetched)}${stale}`;
  // Без aria-label на кнопке: он заменил бы всё доступное имя, а
  // заголовок-вердикт и ветер и есть смысл карточки. Внутри — только
  // фразовый контент (span), как требует модель содержимого <button>.
  return `<button class="card wx-hero" data-nav="#/weather">
    <span class="wx-hero-top"><span class="row-ic">${ICONS.weather}</span>
      <span class="grow"><span class="t ${cls}">${title}</span>
      <span class="d">${sub} <span class="badge online">online</span></span></span>
      <span class="chev">${ICONS.chev}</span></span>
    ${wxStripHtml(day, now)}
  </button>`;
}

// Герой или строка «Окна для полётов». Стартовый экран не должен
// зависеть от содержимого кэша (он приезжает и из копии): любая ошибка
// в разборе прогноза — обычная строка, а не пустой экран.
function wxHeroOrRow(a, compact) {
  try {
    return wxHeroHtml(a, compact) || wxRowHtml();
  } catch (e) {
    console.warn('герой погоды: кэш прогноза не разобран', e);
    return wxRowHtml();
  }
}

// Строка «Окна для полётов» — когда свежего кэша нет.
function wxRowHtml() {
  return `<div class="card flat">` +
    rowBtn('data-nav="#/weather"', `<span class="grow"><span class="t">Окна для полётов
      <span class="badge online">online</span></span>
      <span class="d wrap">Ветер у земли и на высоте, осадки по вашей локации</span></span>`, 'weather') + '</div>';
}

function viewWeather() {
  const wx = UI.wx;
  if (!wx.data && S.settings.weatherCache) wx.data = S.settings.weatherCache;
  // Сначала сбрасываем выбор разобранной модели, ПОТОМ считаем пороги —
  // иначе вердикт этого рендера использует модель, которой нет в списке.
  const wxArmed = S.aircraft.filter((a) => armedBattery(a));
  if (wx.aircraftId && !wxArmed.some((a) => a.id === wx.aircraftId)) { wx.aircraftId = ''; wx.batteryId = ''; }
  const lim = wxLimits();
  const sitesWithCoords = S.sites.filter((s) => s.lat != null);

  // В шапке только «?» (раздел инструкции про экран целиком). Пояснение
  // расчёта (таблицы порогов для выбранного борта) — кнопкой «Как считается
  // окно» под «Показать прогноз»: текстовое действие в шапке рядом с «?»
  // ломало заголовок и подпись на 2–3 строки на телефоне (ревью снимков 2.0).
  // Пилюля online без «·» перед ней — иначе на переносе точка висела одна.
  let h = pageHead('Окна для полётов', {
    back: '#/today', sub: 'Борт · место · дата <span class="badge online">online</span>',
    help: 'weather',
  });

  if (!navigator.onLine && !wx.data) {
    h += `<div class="banner warn">Погода недоступна офлайн. Приложение продолжает работать —
      прогноз появится при подключении к сети.</div>`;
  }

  h += `<div class="card">`;
  // Только собранные модели (с установленным АКБ): окна считаются
  // для того, что реально готово лететь. wxArmed вычислен в начале view.
  const wxSel = wxArmed.find((a) => a.id === wx.aircraftId);
  h += field('Борт', selectHtml('wxmodel',
    [['', `Без борта (порог ${WX_DEFAULT_WIND} м/с, высота 100 м)`]]
      .concat(wxArmed.map((a) => {
        // для выбранной модели действует переопределение АКБ с экрана
        const b = a === wxSel && wx.batteryId
          ? S.batteries.find((x) => x.id === wx.batteryId) : armedBattery(a);
        const w = a.maxWind || wxEstimate(a, (b || {}).weight);
        const alt = a.maxAlt || WX_DEFAULT_ALT[a.type] || 100;
        return [a.id, `${a.name} · ${a.maxWind ? '' : '≈'}${w} м/с · до ${alt} м`];
      })),
    wx.aircraftId, 'data-change="weather-model"'),
    wxArmed.length
      ? 'Здесь только собранные борта («К вылету»); «≈» — оценка по весу с АКБ и габаритам'
      : 'Соберите борт — установите АКБ в его карточке, и он появится здесь');
  if (wxSel && !wxSel.maxWind) {
    h += field('Аккумулятор', selectHtml('wxbatt',
      battOptions({ emptyLabel: '— без АКБ (сухой вес) —' }),
      wx.batteryId, 'data-change="weather-batt"'),
      'Вес АКБ прибавляется к сухому весу борта в оценке порога');
  }
  h += field('Место', selectHtml('wxsite', siteOptions(sitesWithCoords, {
      emptyLabel: '— выберите —', pre: [['gps', 'Моё местоположение (GPS)']],
    }), wx.siteId, 'data-change="weather-site"'),
    sitesWithCoords.length ? '' : 'У локаций пока нет координат — выберите «+ Добавить локацию…»');
  // Высота полёта: временное переопределение экрана — как выбор АКБ
  // выше. Меню, а не select: тридцать значений в нативном списке
  // на телефоне прокручиваются вслепую, а «По карточке борта» надо
  // показать первым и целиком.
  const altPick = wxAltPick();
  h += field('Высота полёта', `<button type="button" class="pill wx-alt" data-act="wx-alt-menu"
      data-alt="${altPick || ''}" aria-haspopup="menu" aria-expanded="false">
      <span>${altPick ? 'до ' + altPick + ' м' : 'По карточке борта · ' + lim.altOwn + ' м'}</span>${ICONS.chev}</button>
    <div class="menu menu-grid" popover="manual" id="wx-alt-menu" role="menu" aria-label="Высота полёта" hidden>
      <button class="menu-head" role="menuitemradio" data-act="wx-alt-set" data-alt=""
        aria-checked="${!altPick}">По карточке борта · ${lim.altOwn} м</button>
      <div class="menu-cap xs muted" style="grid-column:1/-1;padding:4px 12px 0">Высота над землёй, м</div>
      ${Array.from({ length: WX_ALT_MAX / WX_ALT_STEP }, (_, i) => (i + 1) * WX_ALT_STEP)
        .map((m) => `<button role="menuitemradio" data-act="wx-alt-set" data-alt="${m}"
          aria-checked="${altPick === m}">${m}</button>`).join('')}
    </div>`,
    'Действует только на этом экране. Выше 200&nbsp;м ветер берётся с барических уровней&nbsp;— они есть не&nbsp;у&nbsp;каждой точки');
  // День — чипами (2.0): точка на чипе — лучший вердикт дня из кэша,
  // без данных чипы просто выбирают дату для запроса.
  h += field('Дата', wxDayChipsHtml(lim));
  h += `<button class="btn btn-primary" data-act="weather-load" ${wx.loading ? 'disabled' : ''}>
    ${wx.loading ? 'Запрашиваю прогноз…' : 'Показать прогноз'}</button>`;
  h += `<button class="link-btn" data-act="wx-help">Как считается окно</button>`;
  h += '</div>';

  if (wx.error) h += `<div class="banner warn">${esc(wx.error)}</div>`;

  if (wx.data) {
    // Индекс дня привязан к датам прогноза: вчерашний кэш не сдвигает дни.
    const baseIdx = (wx.data.json.daily.time || []).indexOf(wxTodayISO());
    const day = baseIdx < 0 ? null : wxDay(wx.data.json, baseIdx + wx.day, lim.maxW, lim.alt);
    const age = Date.now() - wx.data.fetched;
    h += `<p class="small muted">${esc(wx.data.place)} · прогноз получен ${wxAgoText(wx.data.fetched)}
      ${age > WX_STALE_MS ? ' — <span style="color:var(--warn)">устарел, обновите</span>' : ''}</p>`;
    if (!day || !day.hours.length) {
      h += `<div class="banner warn">Сохранённый прогноз устарел или не покрывает эту дату — нажмите «Показать прогноз».</div>`;
    } else {
      if (day.windows.length) {
        // Диапазон часов и «м/с» — неразрывно: браузер переносил строку
        // после «–» и «/» («20:00–\n24:00», «20 м/\nс»).
        h += `<div class="banner ok" style="font-size:16px"><span>Можно лететь:
          <strong class="nowrap">${day.windows.map((w) =>
            `${String(w.from).padStart(2, '0')}:00–${String(w.to + 1).padStart(2, '0')}:00`).join('</strong> и <strong class="nowrap">')}</strong></span></div>`;
      } else {
        h += `<div class="banner warn" style="font-size:16px">${wx.day === 0 ? 'Сегодня' : 'В этот день'} лучше не лететь${lim.name ? ' на «' + esc(lim.name) + '»' : ''}:
          весь день ветер выше <span class="nowrap">${lim.maxW} м/с</span> или осадки.</div>`;
      }

      // Честность о высоте: выше 200 м прогноз есть не всегда, и пропуск
      // НЕ считается штилём — экран говорит, докуда данные есть.
      if (lim.alt > WX_ALT_SURF) {
        const aloft = wxAloftState(wx.data.json);
        if (aloft === 'no-keys') {
          h += `<div class="banner warn">Сохранённый прогноз снят без данных выше ${WX_ALT_SURF} м.
            Нажмите «Показать прогноз» — окна пересчитаются на выбранную высоту.</div>`;
        } else if (aloft === 'no-data') {
          h += `<div class="banner warn">Для этой точки прогноз есть только до ${WX_ALT_SURF} м:
            у модели нет барических уровней. Окна посчитаны по ветру до ${WX_ALT_SURF} м, выше может быть сильнее.</div>`;
        } else if (day.thin && day.cap) {
          h += `<div class="banner warn">Выше ${day.cap.min} м прогноза для этой точки нет.
            Окна посчитаны по ветру до ${day.cap.min} м${day.thin < day.hours.length ? ` · в ${day.thin} ч из ${day.hours.length} данных нет выше` : ''}.</div>`;
        }
      }

      // Полоска дня с выбором часа; под ней — восход/закат и порог.
      const hour = wxSelectedHour(day);
      h += `<div class="card wx-strip-card">
        ${wxStripHtml(day, hour, true)}
        <div class="xs dim wx-strip-sub">восход ${day.sunrise} · закат ${day.sunset} ·
          ${lim.name ? '«' + esc(lim.name) + '» держит' : 'порог'} <span class="nowrap">${lim.est && lim.name ? '≈' : 'до '}${lim.maxW} м/с</span> ·
          <span class="nowrap">до ${lim.alt} м${lim.pick ? ' (выбрано)' : ''}</span>${
            day.cap && day.cap.min < day.asked ? ` · <span class="nowrap">прогноз до ${day.cap.min} м</span>` : ''} · ночь не запрещает, но снижает порог</div>
      </div>`;

      const hr = day.hours.find((x) => x.hh === hour) || day.hours[0];
      h += wxHourCardHtml(day, hr, lim);
      h += wxAttentionHtml(day, lim);

      // Полный список часов — свёрнут: полоска и карточка часа отвечают
      // на главный вопрос, список нужен для сверки.
      h += `<details class="fold wx-fold"><summary>Все часы</summary><div class="fold-body">
        <p class="small muted" style="margin:0 0 8px">Полоска — сколько «съедено» от допустимого ветра
        борта: берём худшее из ветра у земли${day.top ? `, ветра на высоте (${wxTopText(day)})` : ''}
        и порывов. Короткая зелёная — спокойно; полная красная — за пределом.</p>`;
      h += '<div class="card flat">';
      h += day.hours.map((hr) => {
        const load = wxHourLoad(hr, lim.maxW);
        const col = hr.verdict === 'ok' ? 'var(--ok)' : hr.verdict === 'warn' ? 'var(--warn)' : 'var(--bad)';
        const chipCls = hr.verdict === 'ok' ? 'st-ready' : hr.verdict === 'warn' ? 'st-check' : 'st-grounded';
        const rain = !hr.stop && (hr.pp >= 15 || hr.prec > 0.1) ? ` · дождь ${hr.pp}%` : '';
        const marks = (hr.stop ? [hr.stop] : hr.diff.why).map((t) => ' · ' + t).join('');
        return `<div class="wxr${hr.light ? '' : ' night'}${hr.hh === hour ? ' sel' : ''}">
          <div class="wxr-top">
            <span class="mono nowrap">${String(hr.hh).padStart(2, '0')}:00</span>
            <span class="wx-ic">${ICONS[wxIcon(hr)]}</span>
            <div class="gauge"><i style="width:${Math.round(load * 100 / 1.15)}%;background:${col}"></i></div>
            <span class="chip ${chipCls}">${WX_WORDS[hr.verdict]}</span>
          </div>
          <div class="wxr-sub">ветер у земли ${wxNum(hr.w10)} м/с${hr.top
            ? ` · на высоте ${wxNum(hr.alt)}${day.top && day.top.min !== day.top.max ? ` (${hr.top} м)` : ''}` : ''} · порывы до ${wxNum(hr.gust)} · ${wxNum(hr.temp)}°${rain}${marks}</div>
        </div>`;
      }).join('');
      h += '</div></div></details>';
      // Координаты — только через numVal (правило проекта): кэш нормализует
      // loadAll, но wx.data может держать объект из прошлого прогона.
      const wlat = numVal(wx.data.json.latitude), wlon = numVal(wx.data.json.longitude);
      if (wlat !== '' && wlon !== '') {
        h += `<button class="btn" style="margin-top:8px" data-act="wx-windy" data-lat="${wlat}" data-lon="${wlon}">
          Windy: карта ветра <span class="badge online">online</span></button>
          <div class="windy-box" hidden></div>`;
      }
      h += `<p class="small muted" style="margin-top:8px">Данные: Open-Meteo (бесплатно, без регистрации).
        Прогноз — ориентир, решение о вылете всегда за пилотом.</p>`;
    }
  }
  return h;
}
