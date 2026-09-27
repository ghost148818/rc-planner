// RC Planner · «Ещё»: инструменты, локации, АКБ, шаблоны, данные, приватность.
'use strict';

/* ---------- Ещё ---------- */

function viewMore() {
  const ver = ($('meta[name="build"]') || {}).content || 'dev';
  let h = pageHead('Ещё');
  // «Окна для полётов» здесь нет (2.0): они всегда на «Сегодня» — героем или строкой.
  h += '<div class="card flat">';
  h += rowBtn('data-nav="#/packing"', `<span class="grow"><span class="t">Сборы</span><span class="d wrap">Что взять с собой: наборы и галочки</span></span>`, 'packing');
  h += rowBtn('data-nav="#/tools"', `<span class="grow"><span class="t">Инструменты</span><span class="d wrap">Конфигураторы, прошивки, калькуляторы</span></span>`, 'tools');
  h += rowBtn('data-nav="#/sites"', `<span class="grow"><span class="t">Локации</span><span class="d wrap">Запомненные места полётов</span></span>`, 'sites');
  h += rowBtn('data-nav="#/templates"', `<span class="grow"><span class="t">Шаблоны чек-листов</span><span class="d wrap">Свои предполётные проверки</span></span>`, 'templates');
  h += rowBtn('data-nav="#/backup"', `<span class="grow"><span class="t">Данные и резервная копия</span><span class="d wrap">Экспорт, импорт, восстановление</span></span>`, 'backup');
  h += '</div>';

  h += '<div class="h2">Настройки</div><div class="card">';
  const themeNow = themePref();
  h += field('Тема', `<div class="seg">
    ${[['system', 'Как в системе'], ['dark', 'Тёмная'], ['light', 'Светлая']].map(([v, l]) =>
      `<button data-act="theme-set" data-theme="${v}" aria-pressed="${themeNow === v}">${l}</button>`).join('')}
  </div>`);
  const gloves = lsGet('rcp.gloves') === '1';
  h += field('Размер элементов', `<div class="seg">
    <button data-act="gloves-set" data-gloves="0" aria-pressed="${!gloves}">Обычный</button>
    <button data-act="gloves-set" data-gloves="1" aria-pressed="${gloves}">В перчатках</button>
  </div>`, 'Крупнее кнопки и строки — для поля');
  h += `<form data-form="pilot">` + field('Имя пилота / позывной',
    `<input type="text" name="pilot" value="${esc(S.settings.pilot || '')}" placeholder="необязательно">`) +
    `<button class="btn btn-sm" type="submit">Сохранить</button></form>`;
  h += '</div>';

  h += '<div class="card flat">';
  if (UI.updateReady) {
    h += rowBtn('data-act="update-app"', `<span class="grow"><span class="t" style="color:var(--ok)">Обновить приложение</span><span class="d wrap">Новая версия готова</span></span>`, 'update');
  } else {
    h += rowBtn('data-act="check-updates"', `<span class="grow"><span class="t">Проверить обновления <span class="badge online">online</span></span><span class="d wrap">${UI.checkingUpdate ? 'Проверяю…' : 'Версия ' + esc((RC.CHANGELOG[0] || {}).v || '—')}</span></span>`, 'update');
  }
  h += rowBtn('data-act="whatsnew"', `<span class="grow"><span class="t">Что нового</span><span class="d wrap">История изменений</span></span>`, 'whatsnew');
  h += rowBtn('data-nav="#/help"', `<span class="grow"><span class="t">Инструкция</span><span class="d wrap">Как пользоваться: экраны, чек-лист, полёт, копия</span></span>`, 'help');
  h += rowBtn('data-act="restart-tour"', `<span class="grow"><span class="t">Пройти обучение заново</span><span class="d wrap">Приветствие и шаги «Начала работы» на «Сегодня»</span></span>`, 'templates');
  h += rowBtn('data-nav="#/privacy"', `<span class="grow"><span class="t">Приватность</span><span class="d wrap">Где живут ваши данные</span></span>`, 'privacy');
  h += '</div>';

  h += `<p class="small muted center" style="margin-top:16px">RC Planner · версия ${esc((RC.CHANGELOG[0] || {}).v || '—')} · сборка <span class="mono">${esc(ver)}</span><br>
    Ваши данные хранятся на этом устройстве.</p>`;
  return h;
}

// Прошивки Walksnail: показываем ТОЛЬКО последнюю известную версию —
// вместе с датой сверки, потому что данные ручные (почему именно так —
// в шапке data/firmware.js). Файлы лежат у производителя, мы их не
// копируем: наружу ведут обычные ссылки, никаких запросов из приложения.
function firmwareHtml() {
  const fw = RC.FIRMWARE;
  if (!fw || !fw.items || !fw.items.length) return '';
  const link = (url, label, primary) =>
    `<a class="btn btn-sm${primary ? ' btn-primary' : ''}" href="${esc(url)}"
      target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  let h = `<details class="fold"><summary>Прошивки Walksnail (${fw.items.length})</summary><div class="fold-body">`;
  if (fw.warn) h += `<div class="banner warn">${esc(fw.warn)}</div>`;
  // Кнопки отдельной строкой под текстом: на телефоне название с номером
  // версии иначе ломается на три строки, зажатое кнопками справа.
  h += '<div class="card flat">' + fw.items.map((f) => `<div class="row" style="flex-direction:column;align-items:stretch;gap:6px">
      <span><span class="t">${esc(f.name)} · ${esc(f.version)}</span> <span class="badge online">online</span></span>
      ${f.note ? `<span class="d wrap">${esc(f.note)}</span>` : ''}
      <span class="d wrap muted">Последняя известная версия, проверено ${esc(fmtDate(fw.checked))}. Файлы на Google Диске.</span>
      <span class="btn-line">${link(f.url, 'Скачать', true)}${f.all ? link(f.all, 'Все версии') : ''}</span>
    </div>`).join('') + '</div>';
  // Источник — через гард: инварианты в test/checks.js его требуют, но
  // забытое поле не должно ронять весь экран «Инструменты» вместе с каталогом.
  const src = fw.source && fw.source.url && fw.source.name
    ? `<br>Источник: <a href="${esc(fw.source.url)}" target="_blank" rel="noopener noreferrer">${esc(fw.source.name)}</a>.`
    : '';
  h += `<p class="small muted">Версии сверяются вручную: Google Диск не позволяет
    приложению прочитать список файлов. Свежее списка может быть только сама папка —
    загляните в «Все версии», если дата проверки давняя.${src}</p>`;
  return h + '</div></details>';
}

function viewTools() {
  let h = pageHead('Инструменты', { back: '#/more', help: 'tools' });
  h += `<div class="banner">Инструменты открываются в браузере и требуют интернет.
    Само приложение работает офлайн.</div>`;
  const fav = S.settings.favTools || [];
  const favTools = RC.TOOLS.filter((t) => fav.includes(t.id));
  const toolRow = (t) => `<div class="row">
      <span class="grow"><span class="t">${esc(t.name)} <span class="badge online">online</span></span>
      <span class="d wrap">${esc(t.desc)}</span>
      <span class="d wrap muted">Источник: ${esc(t.src)}</span></span>
      <button class="ic-btn${fav.includes(t.id) ? ' on' : ''}" data-act="tool-fav" data-id="${t.id}"
        aria-label="${fav.includes(t.id) ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${fav.includes(t.id)}">${fav.includes(t.id) ? ICONS.star : ICONS.starOff}</button>
      <a class="btn btn-sm" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Открыть</a>
    </div>`;
  if (favTools.length) {
    h += '<div class="h2">Избранное</div><div class="card flat">' + favTools.map(toolRow).join('') + '</div>';
  }
  h += firmwareHtml();
  RC.TOOL_CATS.forEach((cat) => {
    const list = RC.TOOLS.filter((t) => t.cat === cat.id);
    h += `<details class="fold"><summary>${esc(cat.name)} (${list.length})</summary>
      <div class="fold-body"><div class="card flat">${list.map(toolRow).join('')}</div></div></details>`;
  });
  h += `<p class="small muted" style="margin-top:12px">Каталог — ссылки на официальные источники.
    Приложение не копирует сторонние сервисы и не распространяет чужие прошивки.</p>`;
  return h;
}

// Первая пара чисел из произвольного текста (поле, буфер, ссылка карт)
// с проверкой диапазонов — ЕДИНСТВЕННЫЙ разбор координат в приложении.
function parseCoords(text) {
  const nums = String(text || '').match(/-?\d+\.\d+|-?\d+/g) || [];
  const lat = parseFloat(nums[0]), lon = parseFloat(nums[1]);
  return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon } : null;
}

// Один формат ссылки на Яндекс.Карты для всех кнопок (порядок lon,lat!).
function yaMapUrl(lat, lon, z) {
  return `https://yandex.ru/maps/?pt=${lon},${lat}&z=${z || 15}&l=map`;
}

function mapLinks(s) {
  if (s.lat == null || s.lon == null) return '';
  const osm = `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=15/${s.lat}/${s.lon}`;
  return `<a class="btn btn-sm" href="${yaMapUrl(s.lat, s.lon)}" target="_blank" rel="noopener noreferrer">Я.Карты</a>
    <a class="btn btn-sm" href="${osm}" target="_blank" rel="noopener noreferrer">OSM</a>`;
}

function viewSites() {
  let h = pageHead('Локации', { back: '#/more', act: 'add-site', actLabel: 'Добавить', help: 'sites' });
  if (!S.sites.length) return h + emptyState('Запомните места, где летаете: поле, парк, склон.', 'add-site', 'Добавить локацию');
  h += '<div class="card flat">';
  h += S.sites.map((s) => `<div class="row">
    <button class="grow" data-act="edit-site" data-id="${s.id}" style="text-align:left;min-height:var(--seg)">
      <span class="t">${esc(s.name)}${s.isDefault ? ' <span class="badge">основная</span>' : ''}</span>
      ${s.place ? `<span class="d">${esc(s.place)}</span>` : ''}
      ${s.lat != null ? `<span class="d mono wrap">${s.lat}, ${s.lon}</span>` : '<span class="d">без координат</span>'}
    </button>
    ${mapLinks(s)}
  </div>`).join('');
  h += '</div>';
  h += `<p class="small muted" style="margin-top:10px">Координаты открывают локацию на внешней карте
    <span class="badge online">online</span> и включают окна погоды. Проще всего — кнопка
    «Определить по GPS» прямо на поле.</p>`;
  return h;
}

function battRow(b) {
  const o = battOwner(b.id);
  const charge = b.status === 'retired' ? '' : chargeChip(b);
  return `<div class="row">
    <button class="grow" data-act="edit-batt" data-id="${b.id}" style="text-align:left;min-height:var(--seg)">
      <span class="t">${esc(b.label)}</span>
      <span class="d">${esc(b.chem || '')} ${b.cells ? b.cells + 'S' : ''}${b.p > 1 ? b.p + 'P' : ''} ${b.capacity ? '· ' + b.capacity + ' мА·ч' : ''}${b.weight ? ' · ' + b.weight + ' г' : ''} · ${b.cycles || 0} циклов${o ? ` · ${battTag(b, 'в «' + o.name + '»')}` : ''}</span></button>
    ${charge}
    ${b.status === 'retired' ? '<span class="chip st-grounded">Списан</span>' : b.status === 'watch' ? '<span class="chip st-check">Следить</span>' : ''}
  </div>`;
}

function battSortCmp() {
  const mode = S.settings.battSort || 'name';
  const chOrder = { ready: 0, flown: 1 };
  return (x, y) => {
    if (mode === 'charge') {
      const d = (chOrder[x.charge] != null ? chOrder[x.charge] : 2) - (chOrder[y.charge] != null ? chOrder[y.charge] : 2);
      if (d) return d;
    } else if (mode === 'chem') {
      const d = String(x.chem || '').localeCompare(String(y.chem || ''), 'ru');
      if (d) return d;
    } else if (mode === 'cycles') {
      const d = (y.cycles || 0) - (x.cycles || 0); // изношенные сверху
      if (d) return d;
    }
    return (x.label || '').localeCompare(y.label || '', 'ru');
  };
}

function viewBatteries() {
  let h = pageHead('Флот', { act: 'add-batt', actLabel: 'Добавить' }) + fleetSeg('batteries');
  if (!S.batteries.length) return h + emptyState('Заведите парк батарей — циклы будут считаться по полётам.', 'add-batt', 'Добавить АКБ');
  const groups = fleetGroups();
  h += `<div class="fleet-bar">
    ${selectHtml('battSort', [['name', 'По названию'], ['charge', 'По заряду'], ['chem', 'По химии'], ['cycles', 'По циклам']],
      S.settings.battSort || 'name', 'data-change="batt-sort" style="flex:1;min-height:var(--seg)"')}
  </div>`;
  const cmp = battSortCmp();
  // АКБ живёт там же, где её борт: группа борта-владельца. Свободные
  // и АКБ бортов без группы — в «Без группы».
  const battGid = (b) => {
    const o = battOwner(b.id);
    return (o && o.groupId) || '';
  };
  const inGroup = (gid) => S.batteries.filter((b) => battGid(b) === gid).sort(cmp);
  const block = (g, sub) => {
    const list = inGroup(g.id);
    if (!list.length) return '';
    return `<div class="grp-head${sub ? ' grp-sub' : ''}">
      <span class="grow">${esc(g.name)} <span class="muted small">(${list.length})</span></span></div>
      <div class="card flat${sub ? ' grp-sub' : ''}">${list.map(battRow).join('')}</div>`;
  };
  const loose = inGroup('');
  const grouped = S.batteries.length - loose.length;
  if (loose.length) {
    if (grouped) h += `<div class="grp-head"><span class="grow muted">Без группы</span></div>`;
    h += `<div class="card flat">${loose.map(battRow).join('')}</div>`;
  }
  for (const g of groups.filter((x) => !x.parentId)) {
    h += block(g, false);
    for (const sg of groups.filter((x) => x.parentId === g.id)) h += block(sg, true);
  }
  return h;
}

function viewTemplates() {
  let h = pageHead('Шаблоны чек-листов', { back: '#/more', act: 'add-template', actLabel: 'Создать' });
  h += '<div class="h2">Встроенные</div><div class="card flat">';
  h += RC.CHECKLISTS.map((t) => `<div class="row"><span class="grow">
    <span class="t">${esc(t.name)}</span><span class="d">${t.items.length} пунктов · ${TYPES[t.type] || ''}</span></span></div>`).join('');
  h += '</div>';
  if (S.templates.length) {
    h += '<div class="h2">Свои</div><div class="card flat">';
    h += S.templates.map((t) => rowBtn(`data-act="edit-template" data-id="${t.id}"`,
      `<span class="grow"><span class="t">${esc(t.name)}</span>
       <span class="d">${t.items.length} пунктов · ${t.type === 'any' ? 'любой тип' : TYPES[t.type] || ''}</span></span>`)).join('');
    h += '</div>';
  } else {
    h += '<p class="small muted" style="margin-top:10px">Свой шаблон появится в списке при подготовке к полёту подходящего борта.</p>';
  }
  return h;
}

function viewBackup() {
  const counts = `${S.aircraft.length} ${plural(S.aircraft.length, 'борт', 'борта', 'бортов')}, ` +
    `${S.sessions.filter((s) => s.end).length} ${plural(S.sessions.length, 'полёт', 'полёта', 'полётов')}, ` +
    `${S.configs.length} ${plural(S.configs.length, 'конфигурация', 'конфигурации', 'конфигураций')}`;
  let h = pageHead('Данные', { back: '#/more', sub: counts, help: 'data' });
  h += `<div class="banner">Все данные RC Planner живут в этом браузере на этом устройстве.
    Резервная копия — обычный файл, вы сами решаете, где его хранить.</div>`;
  h += `<button class="btn btn-primary" data-act="export-all">Сохранить резервную копию</button>`;
  const lb = +S.settings.lastBackupAt || 0;
  h += `<p class="small muted" style="margin:6px 2px 0">Последняя копия: ${lb
    ? `${fmtDate(new Date(lb).toLocaleDateString('en-CA'))}, ${fmtTime(lb)}${backupDue() ? ' — <span style="color:var(--warn)">пора обновить</span>' : ''}`
    : 'ещё не было'}. На телефоне файл предлагается через системный лист «Поделиться».</p>`;
  h += `<div class="card" style="margin-top:8px">` +
    field('Восстановить из файла', `<input type="file" accept=".rcpilot,.json,application/json" data-change="import-file">`,
      'Файл .rcpilot или .json, созданный RC Planner') + '</div>';
  h += `<hr class="sep"><button class="btn btn-danger" data-act="wipe-all">Стереть все данные</button>
    <p class="small muted" style="margin-top:8px">Удаляет всё с этого устройства. Копий нигде нет —
    восстановить можно будет только из вашего файла резервной копии.</p>`;
  return h;
}

function viewPrivacy() {
  let h = pageHead('Приватность', { back: '#/more' });
  h += `<div class="card">
    <p><strong>Ваши данные хранятся на этом устройстве.</strong></p>
    <p style="margin-top:8px">RC Planner работает без сервера, аккаунтов и регистрации. Борта, полёты,
    чек-листы, конфигурации и фотографии лежат в локальной базе браузера (IndexedDB) и не отправляются
    в интернет — в приложении просто нет кода, который бы это делал.</p>
    <p style="margin-top:8px">Нет аналитики, счётчиков и рекламы. В фоне приложение обращается
    в сеть только за обновлением самой страницы.</p>
    <p style="margin-top:8px"><strong>Online-функции — только по вашему нажатию</strong>
    (помечены <span class="badge online">online</span>). Что уходит наружу:</p>
    <ul class="small" style="padding-left:18px;margin-top:4px">
      <li><b>Прогноз</b> (Open-Meteo): координаты места, огрублённые до ~1 км. Без ключей и аккаунтов.</li>
      <li><b>Мини-карта</b> (OpenStreetMap): номера тайлов просматриваемого района.</li>
      <li><b>Поиск места</b> (Nominatim/OSM): введённый вами текст запроса.</li>
      <li><b>Карта ветра</b> (Windy): координаты выбранного места — при раскрытии карты.</li>
      <li><b>Ссылки</b> (Я.Карты, OSM, инструменты): открываются в браузере по своим правилам.</li>
    </ul>
    <p style="margin-top:8px"><strong>Геолокация</strong> запрашивается у браузера только по кнопкам
    «GPS» и «Моё местоположение». Точные координаты остаются на устройстве (в вашей локации);
    в интернет они не отправляются — прогноз получает точку с точностью ~1 км. Внешним сайтам
    приложение передаёт только своё доменное имя, без каких-либо ваших данных.</p>
    <p style="margin-top:8px">Статистика, печать журнала и экспорт в CSV считаются и собираются прямо
    в браузере: файл сохраняется на устройство, никуда не отправляется.</p>
    <p style="margin-top:8px">Резервная копия и CSV на телефоне предлагаются через системный лист
    «Поделиться»: куда положить файл, решаете вы; приложение само никуда его не отправляет.</p>
    <p style="margin-top:8px">Удаление данных в настройках стирает их безвозвратно: копий нигде нет.
    Резервная копия — файл, который вы сохраняете сами.</p>
  </div>`;
  return h;
}
