// RC Planner · Состояние: снимок базы S, эфемерное UI, константы погоды.
'use strict';

/* ============================================================
   1. СОСТОЯНИЕ
   S — снимок базы в памяти (флот маленький, целиком в памяти
   дешевле и проще, чем точечные запросы). UI — эфемерное.
============================================================ */

const S = {
  aircraft: [],
  batteries: [],
  sites: [],
  sessions: [],
  templates: [],
  runs: [],
  packing: [],
  maintenance: [],
  configs: [],
  settings: { id: 'main', pilot: '', favTools: [] },
};

const UI = {
  view: 'today',
  arg: null,          // id из маршрута (#/model/<id> и т.п.)
  prep: null,         // { aircraftId, tplId, runId, siteId, items:[{t,hint,state}] }
  importData: null,   // разобранный файл импорта до подтверждения
  updateReady: false, // service worker ждёт активации
  wx: {               // экран «Окна для полётов»
    siteId: '', aircraftId: '', batteryId: '', day: 0,
    alt: null,        // высота полёта, выбранная на экране (null — по карточке борта)
    hour: null,       // выбранный час полоски (null — по умолчанию: сейчас / первое окно)
    loading: false, error: '', data: null, // data: {fetched, place, json}
  },
  navCount: 0,        // сколько маршрутов прошли — для кнопки «Назад»
  navDir: 'forward',  // направление перехода для View Transitions: forward|back|tab
  navStack: [],       // короткая история маршрутов — чтобы отличить «назад»
  navBackHint: false, // кнопка «Назад» ушла по запасному маршруту — всё равно back
  routeHash: '',      // последний обработанный адрес — popstate и hashchange приходят парой
  modalReturn: null,  // форма, к которой вернуться после вложенного диалога
  journalTab: 'log',  // экран «Журнал»: сегмент log|stats
  journalAircraft: '', // экран «Журнал»: фильтр по борту ('' — все)
  modelTab: 'overview', // карточка борта: сегмент overview|components|maint|history
  modelTabFor: null,  // id борта, для которого выбран сегмент — смена борта сбрасывает на «Обзор»
  wakeLock: null,     // WakeLockSentinel, пока экран полёта держит экран включённым
  wakeLockPending: false, // запрос замка в пути — второй не посылаем
};

const WX_DEFAULT_WIND = 16; // м/с, порог без выбранной модели
const WX_DEFAULT_ALT = { quad: 60, plane: 150, wing: 150, other: 100 }; // м, типичная высота полёта
// Коэффициенты вердикта и сложности — ЕДИНСТВЕННЫЙ источник и для
// расчёта (wxVerdict/wxDifficulty), и для таблиц в wxHelpHtml.
const WX_K = {
  night: 0.8, fog: 0.75, drizzle: 0.85, snow: 0.8, // сложность условий
  warn: 0.8, gustBad: 1.4, gustWarn: 1.15,          // пороги вердикта
};
const WX_API = 'https://api.open-meteo.com/v1/forecast';
const WX_DAYS = 7;
// Приземные уровни ветра: высота над землёй фиксирована, from — с какой
// высоты полёта уровень учитывается. Пороги 40/90/140 унаследованы от
// прежнего wxLevels, чтобы вердикты существующих бортов не поехали.
// Выше 200 м приземных уровней у Open-Meteo НЕТ: wind_speed_250m и выше
// API принимает, но отдаёт сплошные null (замер 2026-09-10).
const WX_SURF = [{ m: 80, from: 40 }, { m: 120, from: 90 }, { m: 180, from: 140 }, { m: 200, from: 190 }];
// Выше 200 м — только барические уровни. Их высота — НАД УРОВНЕМ МОРЯ
// и плавает во времени (975 гПа за неделю гулял между 125 и 229 м над
// землёй), поэтому высота считается по geopotential_height в каждом
// часе, а не по табличке. 1000 гПа не берём: он ниже 200 м, а в низине
// уходит под землю (замер: геопотенциал 111 м при elevation 152).
// 650 гПа нужен, чтобы потолок 3000 м был накрыт сверху — 700 гПа
// в равнине это только ≈2937 м над землёй.
const WX_PRESSURE = [975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 700, 650];
const WX_ALT_SURF = 200;   // докуда хватает приземных уровней
const WX_ALT_MAX = 3000;   // потолок высоты полёта: карточка борта и меню
const WX_ALT_STEP = 100;   // шаг меню выбора высоты
// Почасовые переменные запроса — ОДИН источник и для URL, и для теста.
// Порывы только у земли: wind_gusts_100m и wind_gusts_1000hPa API
// не отдаёт вовсе (ошибка «invalid String value», замер 2026-09-10).
const WX_HOURLY = ['temperature_2m', 'precipitation', 'precipitation_probability',
  'wind_speed_10m', 'wind_gusts_10m', 'weather_code']
  .concat(WX_SURF.map((l) => 'wind_speed_' + l.m + 'm'))
  .concat(WX_PRESSURE.map((p) => 'wind_speed_' + p + 'hPa'))
  .concat(WX_PRESSURE.map((p) => 'geopotential_height_' + p + 'hPa'));

let SWREG = null;
let TIMER = null;
