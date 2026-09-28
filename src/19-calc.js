// RC Planner · «Калькулятор АКБ»: напряжения, энергия, токи, время полёта, перелёт.
'use strict';

/* ---------- Калькулятор АКБ (3.0) ----------
   Всё считается на месте из введённых цифр или из своей АКБ (подставляет
   химию, банки и ёмкость); в сеть ничего не уходит. Результат
   пересчитывается на каждый ввод без перерисовки экрана (calcUpdate из
   события input в 31-events.js) — фокус и курсор в поле не прыгают.
   Ёмкость — ёмкость ПАКЕТА, как в карточке АКБ (у 6S2P 7000 — 7000). */

// Напряжение на банку, В: полный заряд, номинал, хранение, минимум
// в покое. Значения — общепринятые для хобби; у Li-Ion нижний порог
// зависит от элемента (по даташиту бывает до 2,5 В) — берём осторожный.
const CALC_CHEM = {
  LiPo: { full: 4.2, nom: 3.7, store: 3.8, min: 3.5 },
  LiHV: { full: 4.35, nom: 3.8, store: 3.85, min: 3.5 },
  'Li-Ion': { full: 4.2, nom: 3.6, store: 3.7, min: 3.0 },
  LiFe: { full: 3.6, nom: 3.3, store: 3.3, min: 2.8 },
  NiMH: { full: 1.4, nom: 1.2, store: null, min: 1.0 },
};
const CALC_USABLE = 0.8; // расходуем до 80 % ёмкости — запас на посадку и ресурс АКБ
// Перевозка запасных литиевых АКБ в самолёте (IATA, руководство 2026):
// до 100 Вт·ч — в ручной клади; 100–160 — с согласия авиакомпании,
// не больше двух запасных; больше 160 — пассажирам нельзя.
const CALC_AIR = [[100, 'ok'], [160, 'warn'], [Infinity, 'bad']];

// Число из поля в пределах [lo, hi], иначе null.
function calcNum(v, lo, hi) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) && n >= lo && n <= hi ? n : null;
}
const calcFmt = (n, d) => (n == null ? '—' : n.toFixed(d).replace('.', ','));

// Химия — ключ словаря CALC_CHEM: у АКБ из копии поле chem произвольное
// (NORM его не приводит), поэтому только через keyOrNull — ключ прототипа
// вроде 'constructor' иначе прошёл бы проверку «есть в словаре».
const calcChem = (v) => keyOrNull(CALC_CHEM, v) || 'LiPo';

// Сырой ввод формы (строки как набраны) — его и хранит UI.calc: число
// «30» по дороге к «3000» вне диапазона, но стирать его перерисовкой нельзя.
function calcRaw(form) {
  const fd = new FormData(form);
  const g = (k) => String(fd.get(k) == null ? '' : fd.get(k));
  return { battId: g('battId'), chem: g('chem'), s: g('s'), mah: g('mah'), c: g('c'), amps: g('amps') };
}
// Разобранные значения для расчёта: вне диапазона — null («—» в итоге).
function calcParse(r) {
  const s = calcNum(r.s, 1, 24);
  return {
    battId: String(r.battId || ''),
    chem: calcChem(r.chem),
    s: s != null && Number.isInteger(s) ? s : null,
    mah: calcNum(r.mah, 50, 100000),
    c: calcNum(r.c, 1, 300),
    amps: calcNum(r.amps, 0.1, 500),
  };
}

// Результат — только числа и подписи из констант: пользовательского
// текста в нём нет, кроме средней длительности из своего журнала (число).
function calcOutHtml(v) {
  const k = CALC_CHEM[v.chem];
  const ah = v.mah ? v.mah / 1000 : null;
  const volt = (x) => (v.s && x != null ? calcFmt(x * v.s, 2) + '&nbsp;В' : '—');
  const wh = v.s && ah ? k.nom * v.s * ah : null;
  const rows = [
    ['Полный заряд', volt(k.full)], ['Номинал', volt(k.nom)],
    ['Хранение', k.store == null ? 'не нужно' : volt(k.store)], ['Минимум в покое', volt(k.min)],
    ['Энергия', wh ? calcFmt(wh, 1) + '&nbsp;Вт·ч' : '—'],
    ['Заряд 1C', ah ? calcFmt(ah, 1) + '&nbsp;А' : '—'],
    ['Ток по маркировке', ah && v.c ? calcFmt(ah * v.c, 0) + '&nbsp;А' : 'укажите C'],
    ['Время полёта', ah && v.amps ? calcFmt(ah * CALC_USABLE / v.amps * 60, 1) + '&nbsp;мин' : 'укажите средний ток'],
  ];
  let h = `<div class="kv calc-kv">${rows.map(([key, val]) => `<div><span class="k">${key}</span><span class="v">${val}</span></div>`).join('')}</div>`;
  if (v.s) {
    const per = [`полный ${calcFmt(k.full, 2)}`, `номинал ${calcFmt(k.nom, 2)}`, k.store == null ? '' : `хранение ${calcFmt(k.store, 2)}`, `минимум ${calcFmt(k.min, 2)}`];
    h += `<p class="hint">На банку: ${per.filter(Boolean).join(', ')}&nbsp;В.
      Время — до ${Math.round(CALC_USABLE * 100)}&nbsp;% ёмкости, чтобы оставался запас на посадку.</p>`;
  }
  // Средний полёт на этой АКБ по своему журналу
  if (v.battId) {
    const fl = S.sessions.filter((s) => s.end && s.batteryId === v.battId && isFinite(+s.durationMin) && +s.durationMin > 0);
    if (fl.length) {
      const avg = fl.reduce((n, s) => n + +s.durationMin, 0) / fl.length;
      h += `<p class="hint">По журналу: средний полёт на этой АКБ — ${calcFmt(avg, 1)}&nbsp;мин (${fl.length}&nbsp;${plural(fl.length, 'полёт', 'полёта', 'полётов')}).</p>`;
    }
  }
  if (wh && v.chem === 'NiMH') {
    h += `<div class="banner ok calc-air">${ICONS.flight}<span class="grow"><b>В самолёте:</b> ограничения IATA по Вт·ч — для литиевых АКБ,
      на NiMH они не распространяются. Уточните у перевозчика; клеммы — заизолировать.</span></div>`;
  } else if (wh) {
    // Порог — по показанному (округлённому) числу: 100,04 Вт·ч на экране
    // «100,0» и не должны попадать в «100–160»
    const whR = Math.round(wh * 10) / 10;
    const cls = CALC_AIR.find(([lim]) => whR <= lim)[1];
    const text = cls === 'ok' ? 'до 100 Вт·ч — в ручной клади, в сдаваемый багаж нельзя'
      : cls === 'warn' ? '100–160 Вт·ч — только с согласия авиакомпании, не больше двух запасных, в ручной клади'
      : 'больше 160 Вт·ч — пассажирам перевозить нельзя';
    h += `<div class="banner ${cls === 'ok' ? 'ok' : 'warn'} calc-air">${ICONS.flight}<span class="grow"><b>В самолёте:</b> ${text}.
      Правила IATA; перед поездкой уточните у перевозчика. Клеммы — заизолировать.</span></div>`;
  }
  return h;
}

// Ввод запоминается в UI.calc как набран: перерисовка (выбор своей АКБ,
// смена темы) не должна стирать набранное.
function calcUpdate(form) {
  UI.calc = calcRaw(form);
  const out = document.getElementById('calc-out');
  if (out) out.innerHTML = calcOutHtml(calcParse(UI.calc));
}

function viewBattCalc() {
  const c = UI.calc || (UI.calc = { battId: '', chem: 'LiPo', s: '6', mah: '1300', c: '', amps: '' });
  let h = pageHead('Калькулятор АКБ', { back: '#/more', help: 'battcalc' });
  const own = S.batteries.filter((b) => b.status !== 'retired');
  const opts = [['', 'Свои цифры']].concat(own.map((b) => [b.id, b.label || 'АКБ']));
  h += `<form data-calc class="card" autocomplete="off">
    ${own.length ? field('Аккумулятор', selectHtml('battId', opts, c.battId, 'data-change="calc-batt"'), 'подставит химию, банки и ёмкость из карточки') : ''}
    ${field('Химия', selectHtml('chem', Object.keys(CALC_CHEM).map((x) => [x, x]), calcChem(c.chem)))}
    <div class="grid2">
      ${field('Банок, S', `<input type="number" name="s" min="1" max="24" step="1" inputmode="numeric" value="${numVal(c.s)}">`)}
      ${field('Ёмкость, мА·ч', `<input type="number" name="mah" min="50" max="100000" step="10" inputmode="numeric" value="${numVal(c.mah)}">`)}
    </div>
    <div class="grid2">
      ${field('Токоотдача, C', `<input type="number" name="c" min="1" max="300" step="1" inputmode="numeric" value="${numVal(c.c)}" placeholder="напр. 100">`)}
      ${field('Средний ток, А', `<input type="number" name="amps" min="0.1" max="500" step="0.1" inputmode="decimal" value="${numVal(c.amps)}" placeholder="напр. 25">`)}
    </div>
  </form>`;
  // Без aria-live: он уже у #views — на каждый ввод весь итог зачитывался бы заново
  h += `<div id="calc-out">${calcOutHtml(calcParse(c))}</div>`;
  h += `<p class="small muted" style="margin-top:12px">Средний ток — из телеметрии или OSD (mAh за полёт / время). Токоотдача C по маркировке
    обычно завышена: реальный длительный ток ниже.</p>`;
  return h;
}

// Выбор своей АКБ: химия, банки и ёмкость из карточки (числа
// нормализованы в NORM.batteries; химия — через keyOrNull). Поля, которых
// у АКБ нет, очищаются — цифры прежней АКБ не должны остаться.
function calcPickBattery(id) {
  const c = UI.calc || (UI.calc = {});
  const b = S.batteries.find((x) => x.id === id);
  c.battId = b ? b.id : '';
  if (b) {
    c.chem = keyOrNull(CALC_CHEM, b.chem) || c.chem;
    c.s = b.cells ? String(b.cells) : '';
    c.mah = b.capacity ? String(b.capacity) : '';
  }
  render(true);
}
