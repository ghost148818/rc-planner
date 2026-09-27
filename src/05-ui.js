// RC Planner · Примитивы разметки: иконки, шапка, меню, строки, поля, окна.
'use strict';

/* ============================================================
   5. ПРИМИТИВЫ РАЗМЕТКИ
============================================================ */

// Контурные иконки 24×24, штрих ~1.8 (Lucide-подобный стиль; композиция
// погодных и служебных сюжетов сверялась с наборами Lucide (ISC) и
// dqev/reicon (MIT)). Вставлять ТОЛЬКО как ICONS[key] — никогда не
// интерполировать в SVG пользовательские строки.
const ic = (inner, sw) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.8}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICONS = {
  today: ic('<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
  // самолёт главный (на них летают больше), мультиротор рядом
  fleet: ic('<g transform="translate(-1.2 3.2) scale(0.85)"><path d="M12 3.5v16"/><path d="M12 8 3.5 10.8v1.7L12 11.6l8.5.9v-1.7L12 8Z"/><path d="M9.3 19.5h5.4"/></g><g transform="translate(13.4 0.6) scale(0.44)"><circle cx="5.2" cy="5.2" r="2.7"/><circle cx="18.8" cy="5.2" r="2.7"/><circle cx="5.2" cy="18.8" r="2.7"/><circle cx="18.8" cy="18.8" r="2.7"/><path d="m7.1 7.1 9.8 9.8M16.9 7.1 7.1 16.9"/><circle cx="12" cy="12" r="2.6"/></g>'),
  // летящий самолёт
  flight: ic('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z"/>', 1.6),
  // рюкзак: ручка, клапан, передний карман
  packing: ic('<rect x="5" y="7" width="14" height="14.5" rx="3"/><path d="M9.5 7V5.5a2.5 2.5 0 0 1 5 0V7"/><path d="M5 12.5h14"/><path d="M8.5 21.5v-4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4.5"/>'),
  // раскрытая книга — вкладка «Журнал»
  journal: ic('<path d="M4 5h5.5a3 3 0 0 1 3 3v12.5a2.3 2.3 0 0 0-2.3-2.3H4Z"/><path d="M20 5h-5.5a3 3 0 0 0-3 3v12.5a2.3 2.3 0 0 1 2.3-2.3H20Z"/>'),
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  // треугольник с восклицательным знаком — предупреждение, не кнопка «закрыть»
  alert: ic('<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.5"/><path d="M12 17.2v.1"/>'),
  print: ic('<path d="M6 9V3.5h12V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v6.5H6Z"/>'),
  chev: ic('<path d="m9 6 6 6-6 6"/>', 2),
  back: ic('<path d="M15 6 9 12l6 6"/>', 2),
  // классы моделей
  quad: ic('<circle cx="5.2" cy="5.2" r="2.7"/><circle cx="18.8" cy="5.2" r="2.7"/><circle cx="5.2" cy="18.8" r="2.7"/><circle cx="18.8" cy="18.8" r="2.7"/><path d="m7.1 7.1 9.8 9.8M16.9 7.1 7.1 16.9"/><circle cx="12" cy="12" r="2.6"/>'),
  plane: ic('<path d="M12 3.5v16"/><path d="M12 8 3.5 10.8v1.7L12 11.6l8.5.9v-1.7L12 8Z"/><path d="M9.3 19.5h5.4"/>'),
  wing: ic('<path d="M12 4.5 19.8 18c-2.6-1.1-5.2-1.7-7.8-1.7S6.8 16.9 4.2 18L12 4.5Z"/><circle cx="12" cy="13.4" r="1" fill="currentColor" stroke="none"/>'),
  other: ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17" stroke-dasharray="2.4 3.4"/>'),
  // погодные условия
  wxSun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3"/>'),
  wxPartly: ic('<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
  wxCloud: ic('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
  wxRain: ic('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 14v5M8 14v5M12 16.5v5"/>'),
  wxSnow: ic('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01" stroke-width="2.6"/>'),
  wxFog: ic('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16.5 17.5H7M15 21H9.5"/>'),
  wxMoon: ic('<path d="M20 12.5A8 8 0 1 1 11.5 4a6.5 6.5 0 0 0 8.5 8.5Z"/>'),
  // «Ещё» и разное
  weather: ic('<path d="M9.6 4.6A2 2 0 1 1 11 8H2.5M12.6 19.4A2 2 0 1 0 14 16H2.5M17.3 7.3a2.5 2.5 0 1 1 1.8 4.3H2.5"/>'),
  tools: ic('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>'),
  sites: ic('<path d="M20 10c0 6-8 11.5-8 11.5S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  batteries: ic('<rect x="2.5" y="7.5" width="17" height="9" rx="2"/><path d="M22 10.5v3M6.5 10.75v2.5M10.25 10.75v2.5M14 10.75v2.5"/>'),
  templates: ic('<rect x="5" y="4" width="14" height="17.5" rx="2"/><path d="M9 4.5V3.4A1.4 1.4 0 0 1 10.4 2h3.2A1.4 1.4 0 0 1 15 3.4v1.1"/><path d="m8.8 13.2 2.2 2.2 4.2-4.2"/>'),
  backup: ic('<rect x="3" y="4.5" width="18" height="4.5" rx="1"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 13h4"/>'),
  privacy: ic('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"/>'),
  whatsnew: ic('<path d="M10 3.6 11.3 8a1.6 1.6 0 0 0 1.1 1.1l4.4 1.3-4.4 1.3a1.6 1.6 0 0 0-1.1 1.1L10 17.2l-1.3-4.4a1.6 1.6 0 0 0-1.1-1.1L3.2 10.4l4.4-1.3A1.6 1.6 0 0 0 8.7 8L10 3.6Z"/><path d="M18 13.5l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Z"/>'),
  update: ic('<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>'),
  move: ic('<path d="M5 9l-3 3 3 3M19 9l3 3-3 3M3.5 12h17"/>'),
  edit: ic('<path d="M13.5 6.5 17.5 10.5"/><path d="M4 20l1-4.5L15.8 4.7a2 2 0 0 1 2.9 0l.6.6a2 2 0 0 1 0 2.9L8.5 19Z"/>'),
  paste: ic('<rect x="5" y="4" width="14" height="17.5" rx="2"/><path d="M9 4.5V3.4A1.4 1.4 0 0 1 10.4 2h3.2A1.4 1.4 0 0 1 15 3.4v1.1"/><path d="M12 9.5v7M8.8 13.3 12 16.5l3.2-3.2"/>'),
  // знаки состояний и служебные: вместо текстовых ✓ ✕ — ★ ☆ × +
  check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.2),
  x: ic('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 2.2),
  minus: ic('<path d="M6 12h12"/>', 2.2),
  close: ic('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 2),
  plus: ic('<path d="M12 5.5v13M5.5 12h13"/>', 2),
  star: ic('<path fill="currentColor" d="M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17.1 6.6 20l1.1-6.1-4.5-4.3 6.1-.8Z"/>'),
  starOff: ic('<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17.1 6.6 20l1.1-6.1-4.5-4.3 6.1-.8Z"/>'),
  // «Сегодня»: зарядка АКБ, взлёт и посадка (стрелки над полосой)
  bolt: ic('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z"/>'),
  takeoff: ic('<path d="M4 20h16"/><path d="M12 16V5"/><path d="m7 10 5-5 5 5"/>', 2),
  landing: ic('<path d="M4 20h16"/><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/>', 2),
  // колокольчик — сигнал таймера полёта
  bell: ic('<path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15 6 8.5Z"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>'),
  // глаз — индикатор «экран не гаснет» на экране полёта
  eye: ic('<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  // круг с вопросом — «Инструкция» и кнопка «?» в шапке экрана
  help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.2 1-1.2 1.8v.3"/><path d="M12 17.2h.01" stroke-width="2.4"/>'),
};
// Знак клетки чек-листа по состоянию пункта (ok/fail/skip/пусто).
const CK_MARK = { ok: 'check', fail: 'x', skip: 'minus' };
function ckMark(state) {
  return CK_MARK[state] ? ICONS[CK_MARK[state]] : '';
}

const TABS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'fleet', label: 'Флот' },
  { id: 'flight', label: 'Полёт' },
  { id: 'journal', label: 'Журнал' },
  { id: 'more', label: 'Ещё' },
];

// Какая вкладка активна для каждого экрана. «Сборы» вкладки не имеют
// (решение владельца, 2.0): экраны сборов живут под «Сегодня», вход —
// карточка «Перед выездом» и строка в «Ещё».
const TAB_OF = {
  today: 'today', weather: 'today', packing: 'today', pack: 'today',
  fleet: 'fleet', model: 'fleet', batteries: 'fleet',
  flight: 'flight', prep: 'flight', session: 'flight',
  journal: 'journal', log: 'journal', stats: 'journal',
  more: 'more', tools: 'more', sites: 'more',
  backup: 'more', privacy: 'more', templates: 'more', help: 'more',
};

// actIcon — КЛЮЧ из ICONS: кнопка справа становится квадратной с иконкой,
// actLabel уходит в aria-label (меню «⋯» журнала). right — готовая
// разметка справа вместо кнопки (индикатор «экран не гаснет»).
// help — id раздела инструкции (RC.HELP.sections): круглая кнопка «?»
// в шапке ведёт на #/help/<id>; стоит правее действия, чтобы действие
// («Добавить», «⋯») оставалось на привычном месте у края.
// Иконка кнопки действия в шапке: в режиме «В перчатках» остаётся только
// она (круглая кнопка), подпись уходит в aria-label — иначе длинная
// подпись («Новый набор») налезала на крупный заголовок.
const HEAD_ACT_ICON = { 'edit-model': 'edit', 'pack-reset': 'update' };
function pageHead(title, opts) {
  opts = opts || {};
  const act = !opts.act ? (opts.right || '')
    : opts.actIcon && ICONS[opts.actIcon]
      ? `<button class="head-act head-ic" data-act="${opts.act}" aria-label="${esc(opts.actLabel || '')}" aria-haspopup="menu">${ICONS[opts.actIcon]}</button>`
      : `<button class="head-act" data-act="${opts.act}" aria-label="${esc(opts.actLabel || '')}"><span class="head-act-ic">${
          ICONS[HEAD_ACT_ICON[opts.act] || 'plus']}</span><span class="head-act-t">${opts.actLabel}</span></button>`;
  const help = opts.help
    ? `<button class="head-ic head-help" data-nav="#/help/${esc(opts.help)}" aria-label="Инструкция">${ICONS.help}</button>` : '';
  return `<div class="head">
    ${opts.back ? `<button class="back" data-act="nav-back" data-fallback="${opts.back}" aria-label="Назад">${ICONS.back}</button>` : ''}
    <div class="grow"><h1>${title}</h1>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div>
    ${act}${help}
  </div>`;
}

// Меню действий (popover="manual"). Нативный popover живёт в верхнем
// слое (поверх dialog и панели), позицию под кнопкой считаем от её
// прямоугольника — anchor positioning есть не везде. Режим manual, а не
// auto, осознанно: auto гасит меню по тапу мимо ДО события click, и
// повторный тап по «⋯» открывал его заново (подтверждено пробой).
// Закрытие по тапу мимо и Esc — своё, в разделе 10, одно на оба режима.
// Кнопка идёт через data-act, а не popovertarget (отступление от §2.2
// спецификации, зафиксировано там же): без поддержки popover
// (Safari < 17) нативный инвокер мёртв, а меню — обычный блок; свой
// переключатель даёт один путь на оба случая, запасной режим —
// атрибут hidden. Прогрессивное улучшение по правилу §0.
function menuOpen(m) {
  return typeof m.togglePopover === 'function' ? m.matches(':popover-open') : !m.hidden;
}
function toggleMenu(btn, id) {
  const m = document.getElementById(id);
  if (!m) return;
  if (menuOpen(m)) { closeMenus(); return; }
  const r = btn.getBoundingClientRect();
  m.style.top = Math.round(r.bottom + 6) + 'px';
  if (typeof m.showPopover === 'function') m.showPopover(); else m.hidden = false;
  // Край меню — у кнопки: кнопка в левой половине экрана — левый край
  // (меню высоты не висит над пустым полем у рельсы), в правой — правый.
  // Меню не выходит за экран: на узком телефоне при min-width 200px
  // иначе обрезался бы край.
  const W = window.innerWidth, mw = m.offsetWidth;
  if (r.left + r.width / 2 < W / 2) {
    m.style.left = Math.round(Math.max(8, Math.min(r.left, W - 8 - mw))) + 'px';
    m.style.right = 'auto';
  } else {
    m.style.left = 'auto';
    m.style.right = Math.round(Math.max(8, Math.min(W - r.right, W - 8 - mw))) + 'px';
  }
  // Вертикально так же, как горизонтально: не влезло под кнопкой —
  // ставим над ней, не влезло и там — прижимаем к верху окна, остаток
  // прокручивается внутри меню (max-height в CSS). Меню высоты — первое
  // высокое: три пункта журнала помещались всегда.
  // Низ — над плавающей панелью вкладок (на телефоне), а не под ней.
  // Меню никогда не закрывает свою кнопку: влезает под ней — под ней,
  // иначе над ней; не влезает нигде — на ту сторону, где места больше,
  // с прокруткой внутри (max-height).
  const tb = document.getElementById('tabbar');
  const tbr = tb && tb.getBoundingClientRect();
  const bottom = (tbr && tbr.width < W / 2 ? window.innerHeight : Math.min(window.innerHeight, tbr ? tbr.top : window.innerHeight)) - 8;
  m.style.maxHeight = '';
  const mh = m.offsetHeight;
  const below = bottom - (r.bottom + 6), above = r.top - 6 - 8;
  let top;
  if (mh <= below) top = r.bottom + 6;
  else if (mh <= above) top = r.top - 6 - mh;
  else if (below >= above) { m.style.maxHeight = Math.max(120, below) + 'px'; top = r.bottom + 6; }
  else { m.style.maxHeight = Math.max(120, above) + 'px'; top = 8; }
  m.style.top = Math.round(top) + 'px';
  btn.setAttribute('aria-expanded', 'true');
}
function closeMenus() {
  document.querySelectorAll('.menu').forEach((m) => {
    if (!menuOpen(m)) return;
    if (typeof m.hidePopover === 'function') { try { m.hidePopover(); } catch (e) {} }
    else m.hidden = true;
  });
  document.querySelectorAll('[aria-haspopup="menu"][aria-expanded="true"]')
    .forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

// icon — только КЛЮЧ из ICONS (не сырой SVG): пользовательские данные
// в этот слот попадать не должны.
function rowBtn(attrs, inner, icon) {
  const i = icon && ICONS[icon] ? `<span class="row-ic">${ICONS[icon]}</span>` : '';
  return `<button class="row" ${attrs}>${i}${inner}<span class="chev">${ICONS.chev}</span></button>`;
}

// Пустое состояние. art — ключ слота картинки (assets/art/empty-<art>.svg):
// есть файл — вместо иконки неоновый рисунок, нет — иконка самолёта.
function emptyState(text, btnAct, btnLabel, art) {
  const key = ['fleet', 'journal', 'batteries', 'sites', 'packing'].includes(art) ? art : 'generic';
  return `<div class="empty"><span class="empty-art" data-art="empty-${key}" aria-hidden="true">${ICONS.plane}</span><p>${text}</p>
    ${btnAct ? `<button class="btn btn-sm" data-act="${btnAct}">${btnLabel}</button>` : ''}</div>`;
}

function field(label, control, hint) {
  return `<div class="field"><label>${label}</label>${control}
    ${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

function selectHtml(name, options, current, extra) {
  return `<select name="${name}" ${extra || ''}>` +
    options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(current) ? 'selected' : ''}>${esc(t)}</option>`).join('') +
    '</select>';
}
// Селект-пилюля по ширине ВЫБРАННОГО пункта. Нативный select с width:auto
// растёт по самому длинному <option> («+ Добавить аккумулятор…»,
// «вручную: Обслуживание») и на телефоне уезжал за край экрана. Обёртка
// .sel-fit кладёт в ту же grid-клетку невидимую копию подписи (::after из
// data-v) — она задаёт ширину, селект растянут поверх. small — компактный
// вариант (.sel-sm), у него другие отступы и кегль.
function pillSelect(name, options, current, extra, small) {
  const hit = options.find(([v]) => String(v) === String(current)) || options[0] || ['', ''];
  return `<span class="sel-fit${small ? ' sm' : ''}" data-v="${esc(hit[1])}">${selectHtml(name, options, current, extra)}</span>`;
}

function openModal(title, body) {
  closeModal(true); // мгновенно: двум окнам не жить, даже пока прежнее уезжает
  const root = $('#modal-root');
  root.innerHTML = `<dialog aria-label="${esc(title)}">
    <div class="dlg-head"><h2>${title}</h2>
      <button class="dlg-close" data-act="close-modal" aria-label="Закрыть">${ICONS.close}</button></div>
    <div class="dlg-body">${body}</div>
  </dialog>`;
  const d = $('dialog', root);
  // Фокус — на самом окне, а не на крестике: showModal ставит его на
  // первую кнопку, и кольцо фокуса на «×» выглядело подсказкой «жми сюда».
  d.tabIndex = -1;
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
  try { d.focus({ preventScroll: true }); } catch (e) { /* старый браузер — фокус где был */ }
  document.body.classList.add('locked');
  d.addEventListener('cancel', (ev) => { ev.preventDefault(); dismissModal(); });
  d.addEventListener('click', (ev) => { if (ev.target === d) dismissModal(); });
}

// Закрытие: с анимацией лист уезжает вниз (класс closing, 160 мс) и узел
// убирается по transitionend либо по таймеру 200 мс — если transitionend
// не пришёл. immediate — снять сразу (перед открытием следующего окна).
// body.locked снимается сразу, чтобы страница не оставалась запертой.
function closeModal(immediate) {
  const d = $('#modal-root dialog');
  document.body.classList.remove('locked');
  if (!d) return;
  const drop = () => { try { d.close(); } catch (e) {} d.remove(); };
  if (immediate || reducedMotion()) { drop(); return; }
  if (d.classList.contains('closing')) return; // уже уезжает
  d.classList.add('closing');
  let done = false;
  const fin = (ev) => {
    if (done || (ev && ev.target !== d)) return;
    done = true;
    drop();
  };
  d.addEventListener('transitionend', fin);
  setTimeout(fin, 200);
}

// Закрытие по кнопке/Esc/фону: если под диалогом ждёт незаконченная форма
// (открыли «+ Добавить локацию» из итога полёта) — возвращаемся к ней.
// ВНИМАНИЕ: внутри openModal остаётся именно closeModal, иначе рекурсия.
function dismissModal() {
  const r = UI.modalReturn;
  if (r && r.reopen) {
    UI.modalReturn = null;
    r.reopen();
    return;
  }
  // Приветствие закрыли, не дойдя до «Начать», — всё равно засчитано:
  // второй раз при запуске оно не нужно (повтор есть в «Ещё»).
  if ($('#modal-root dialog.welcome')) lsSet('rcp.hi', '1');
  closeModal();
}

// Раскрывающийся online-блок (карта, Windy): повторное нажатие прячет
// и ОЧИЩАЕТ содержимое — тайлы/iframe не живут в скрытом блоке.
function toggleBox(box, fill) {
  if (!box) return;
  if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '';
  fill(box);
}

function confirmModal(text, act, dataAttrs, btnLabel) {
  openModal('Подтверждение', `<p>${text}</p><div class="spacer"></div>
    <div class="btn-line">
      <button class="btn" data-act="close-modal">Отмена</button>
      <button class="btn btn-danger" data-act="${act}" ${dataAttrs || ''}>${btnLabel || 'Удалить'}</button>
    </div>`);
}

// Снимок борта. lg — крупное превью 72 px (герои «Сегодня» и карточки).
// Тап по снимку разворачивает фото на весь экран, тап по остальной
// строке ведёт как прежде. Крупное превью стоит в свободном месте — там
// это настоящая кнопка, и фото достижимо с клавиатуры. Мелкое в четырёх
// местах из пяти лежит ВНУТРИ кнопки строки и кнопкой быть не может
// (вложенных кнопок в HTML нет): его тап ловит перехватчик в делегате.
// Новое место вызова с lg внутри кнопки заводить нельзя.
function aircraftThumb(a, lg) {
  const u = photoURL(a);
  const cls = lg ? 'thumb lg' : 'thumb';
  // Без фото — заглушка по типу: картинка assets/art/type-<тип>.webp,
  // если она есть в сборке, иначе иконка типа. Тип нормализован в NORM.
  const type = TYPES[a.type] ? a.type : 'other';
  if (!u) return `<span class="${cls} ph" data-art="type-${type}">${ICONS[type] || ICONS.plane}</span>`;
  const img = `<img class="${cls}" src="${u}" alt="Фото борта: ${esc(a.name)}">`;
  return lg
    ? `<button class="thumb-btn" data-photo="aircraft" data-id="${esc(a.id)}" data-cap="${esc(a.name)}"
        aria-label="Показать фото борта во весь экран">${img}</button>`
    : `<img class="${cls} tap" src="${u}" alt="Фото борта: ${esc(a.name)}" title="Показать фото"
        data-photo="aircraft" data-id="${esc(a.id)}" data-cap="${esc(a.name)}">`;
}

// Фото повреждения к записи обслуживания. Кэш object URL общий с фото
// бортов — id записей уникальны на всё хранилище. btn — превью стоит
// в свободном месте (открытые работы) и может быть кнопкой; в истории
// работ оно внутри rowBtn, там работает только перехватчик.
function maintThumb(m, btn) {
  const u = photoURL(m);
  if (!u) return '';
  const alt = `Фото повреждения: ${esc(m.title)}`;
  return btn
    ? `<button class="thumb-btn" data-photo="maintenance" data-id="${esc(m.id)}" data-cap="${esc(m.title)}"
        aria-label="Показать фото повреждения во весь экран"><img class="thumb" src="${u}" alt="${alt}"></button>`
    : `<img class="thumb tap" src="${u}" alt="${alt}" title="Показать фото"
        data-photo="maintenance" data-id="${esc(m.id)}" data-cap="${esc(m.title)}">`;
}
