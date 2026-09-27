// RC Planner · Мини-карта OSM и просмотр фото.
'use strict';

/* ---------- Мини-карта выбора точки (OSM, online) ----------
   Тайлы tile.openstreetmap.org, схема slippy z/x/y (Web Mercator).
   Математика проверена контрольными точками, живой тайл — curl 200
   image/png (2026-08-25). Атрибуция OSM обязательна — ссылка в блоке.
   Тап по карте вписывает координаты прямо в поле формы. */
const MAP_TILES = 'https://tile.openstreetmap.org';
const MAP_TILE = 256;
function mapLon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function mapLat2y(lat, z) {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
}
function mapX2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
function mapY2lat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/* ---------- Просмотр фото во весь экран ----------
   Object URL берётся из общего кэша PHOTO_URLS и при закрытии НЕ
   отзывается: та же ссылка держит миниатюру на экране под окном, и
   отозванную кэш продолжал бы отдавать. Отзыв остаётся ровно там, где
   был, — dropPhotoURL при замене и удалении записи и полная чистка
   в wipe-all-yes и doImport. */
const PV = { scale: 1, x: 0, y: 0 };
const PV_STEPS = [1, 2, 3, 5];
const PV_MAX = 8;

function openPhotoView(store, id, caption) {
  const rec = (store === 'maintenance' ? S.maintenance : S.aircraft).find((x) => x.id === id);
  const u = rec && photoURL(rec);
  if (!u) return; // запись или фото успели убрать — молча ничего
  PV.scale = 1; PV.x = 0; PV.y = 0;
  // Заголовок уходит в <h2> БЕЗ esc() (openModal) — только литерал;
  // название борта живёт в подписи под фото и экранируется.
  openModal('Фото', `<div class="pv">
      <div class="pv-view"><img class="pv-img" src="${u}" alt="${esc(caption || '')}" draggable="false"></div>
      ${caption ? `<p class="small muted pv-cap">${esc(caption)}</p>` : ''}
      <div class="pv-bar">
        <button class="btn btn-sm" data-act="photo-zoom" data-d="-1" aria-label="Уменьшить">${ICONS.minus}</button>
        <span class="pv-scale" aria-live="polite">100%</span>
        <button class="btn btn-sm" data-act="photo-zoom" data-d="1" aria-label="Увеличить">${ICONS.plus}</button>
      </div>
    </div>`);
  const d = $('#modal-root dialog');
  d.classList.add('photo');
  wirePhotoView($('.pv-view', d));
}

// Применение состояния. Панорама ограничена рамкой: увести снимок за
// край и «потерять» его нельзя. На 1× смещение всегда обнуляется.
function pvApply() {
  const img = $('#modal-root .pv-img');
  if (!img) return;
  const view = img.parentElement;
  const mx = Math.max(0, (img.clientWidth * PV.scale - view.clientWidth) / 2);
  const my = Math.max(0, (img.clientHeight * PV.scale - view.clientHeight) / 2);
  PV.x = Math.min(mx, Math.max(-mx, PV.x));
  PV.y = Math.min(my, Math.max(-my, PV.y));
  img.style.transform = `translate(${PV.x}px, ${PV.y}px) scale(${PV.scale})`;
  const s = $('#modal-root .pv-scale');
  if (s) s.textContent = Math.round(PV.scale * 100) + '%';
}

// Ступень вверх или вниз от ЛЮБОГО текущего масштаба: после щипка на
// 4.3× «+» даёт 5, а не откатывает к 2.
function pvZoom(dir, cx, cy) {
  const next = dir > 0
    ? (PV_STEPS.find((s) => s > PV.scale + 0.01) || PV_MAX)
    : (PV_STEPS.slice().reverse().find((s) => s < PV.scale - 0.01) || 1);
  pvSetScale(next, cx, cy);
}

// Точка (cx, cy) — от ЦЕНТРА рамки; она остаётся под пальцем.
function pvSetScale(next, cx, cy) {
  const k = next / PV.scale;
  PV.x = (cx || 0) - k * ((cx || 0) - PV.x);
  PV.y = (cy || 0) - k * ((cy || 0) - PV.y);
  PV.scale = next;
  if (next <= 1) { PV.scale = 1; PV.x = 0; PV.y = 0; }
  pvApply();
}

// Панорама одним пальцем и щипок двумя — одной моделью: середина между
// касаниями остаётся под пальцами, k — во сколько раз развели пальцы
// (для одного пальца k = 1, получается чистый сдвиг). Координаты — от
// центра рамки; прямоугольник берётся на pointerdown и не пересчитывается.
// Схема та же, что у перетаскивания мини-карты (порог тапа 6 px).
function wirePhotoView(view) {
  if (!view) return;
  const pts = new Map();
  let st = null, lastTap = 0;
  const mid = (r) => {
    const a = [...pts.values()];
    const p = (q) => ({ x: q.x - r.left - r.width / 2, y: q.y - r.top - r.height / 2 });
    if (!a.length) return { x: 0, y: 0, d: 0 };
    if (a.length < 2) return Object.assign(p(a[0]), { d: 0 });
    const u = p(a[0]), v = p(a[1]);
    return { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2, d: Math.hypot(u.x - v.x, u.y - v.y) };
  };
  const grab = (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Синтетический pointerId (тесты) захвату не поддаётся — ронять
    // страницу из-за этого нельзя: набор ловит любую ошибку консоли.
    try { view.setPointerCapture(e.pointerId); } catch (err) {}
    const r = view.getBoundingClientRect();
    const m = mid(r);
    st = { r, x: m.x, y: m.y, d: m.d, px: PV.x, py: PV.y, s: PV.scale, moved: false };
  };
  view.addEventListener('pointerdown', grab);
  view.addEventListener('pointermove', (e) => {
    if (!st || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const m = mid(st.r);
    if (Math.abs(m.x - st.x) + Math.abs(m.y - st.y) > 6) st.moved = true;
    const pinch = pts.size > 1 && st.d > 10;
    const k = pinch ? Math.min(PV_MAX, Math.max(1, st.s * (m.d / st.d))) / st.s : 1;
    PV.scale = st.s * k;
    PV.x = m.x - k * (st.x - st.px);
    PV.y = m.y - k * (st.y - st.py);
    pvApply();
  });
  const end = (e) => {
    if (!st) return;
    const solo = pts.size === 1;
    const p = { x: st.x, y: st.y };
    pts.delete(e.pointerId);
    if (solo && !st.moved) {
      // Двойной тап: 1× ⇄ 2× вокруг точки касания.
      const now = Date.now();
      if (now - lastTap < 300) { pvSetScale(PV.scale > 1 ? 1 : 2, p.x, p.y); lastTap = 0; }
      else lastTap = now;
    }
    if (!pts.size) { st = null; return; }
    const r = view.getBoundingClientRect();
    const m = mid(r);
    st = { r, x: m.x, y: m.y, d: m.d, px: PV.x, py: PV.y, s: PV.scale, moved: true };
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
}

function openMapPicker(box, form) {
  const c = parseCoords(new FormData(form).get('coords'));
  // Меркатор не рисует |широту| > 85° — такие координаты валидны для
  // сохранения, но карту центрируем на Москве.
  const has = c && Math.abs(c.lat) <= 85;
  const st = {
    lat: has ? c.lat : 55.7558, lon: has ? c.lon : 37.6176, z: has ? 15 : 11,
    mLat: has ? c.lat : null, mLon: has ? c.lon : null,
  };
  box.innerHTML = `<div class="mp">
    <div class="mp-search">
      <input type="text" class="mp-q" placeholder="Найти место (город, деревня…)" enterkeyhint="search">
      <button type="button" class="mp-go">Найти</button>
    </div>
    <div class="mp-found small muted" hidden></div>
    <div class="mp-view"><div class="mp-layer"></div><div class="mp-pin" hidden>${ICONS.sites}</div>
      <div class="mp-zoom">
        <button type="button" class="mp-zi" aria-label="Ближе">+</button>
        <button type="button" class="mp-zo" aria-label="Дальше">−</button>
      </div></div>
    <div class="mp-bar">
      <span class="small muted mp-hint">Тап — поставить точку</span>
      <a class="small mp-ya" href="#" target="_blank" rel="noopener noreferrer">Я.Карты</a>
      <a class="small" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OSM</a>
    </div></div>`;
  const view = $('.mp-view', box);
  const layer = $('.mp-layer', box);
  const pin = $('.mp-pin', box);
  const ya = $('.mp-ya', box);

  // Кэш тайлов на время жизни карты: при панораме/зуме докладываются
  // только недостающие картинки, уже декодированные не пересоздаются
  // (без этого каждый жест мигал перерисовкой всей сетки).
  const tiles = new Map(); // 'z/x/y' → img
  function draw() {
    const w = view.clientWidth, h = view.clientHeight;
    const cx = mapLon2x(st.lon, st.z), cy = mapLat2y(st.lat, st.z);
    const max = Math.pow(2, st.z);
    layer.style.transform = '';
    const x0 = Math.floor(cx - w / 2 / MAP_TILE), x1 = Math.floor(cx + w / 2 / MAP_TILE);
    const y0 = Math.floor(cy - h / 2 / MAP_TILE), y1 = Math.floor(cy + h / 2 / MAP_TILE);
    const need = new Set();
    for (let x = x0; x <= x1; x++) {
      for (let y = Math.max(0, y0); y <= Math.min(max - 1, y1); y++) {
        const wx = ((x % max) + max) % max; // долгота заворачивается
        const key = st.z + '/' + wx + '/' + y + '@' + x;
        need.add(key);
        let img = tiles.get(key);
        if (!img) {
          img = document.createElement('img');
          img.src = MAP_TILES + '/' + st.z + '/' + wx + '/' + y + '.png';
          img.width = MAP_TILE; img.height = MAP_TILE;
          img.draggable = false; img.alt = '';
          img.style.position = 'absolute';
          tiles.set(key, img);
          layer.appendChild(img);
        }
        img.style.left = Math.round((x - cx) * MAP_TILE + w / 2) + 'px';
        img.style.top = Math.round((y - cy) * MAP_TILE + h / 2) + 'px';
      }
    }
    for (const [key, img] of tiles) {
      if (!need.has(key)) { img.remove(); tiles.delete(key); }
    }
    if (st.mLat != null) {
      pin.hidden = false;
      pin.style.left = ((mapLon2x(st.mLon, st.z) - cx) * MAP_TILE + w / 2) + 'px';
      pin.style.top = ((mapLat2y(st.mLat, st.z) - cy) * MAP_TILE + h / 2) + 'px';
    } else pin.hidden = true;
    // Открыть точку (или центр) в Яндекс.Картах: на телефоне ссылка
    // сама поднимает установленное приложение, на десктопе — сайт.
    const yLat = st.mLat != null ? st.mLat : st.lat;
    const yLon = st.mLon != null ? st.mLon : st.lon;
    ya.href = yaMapUrl(yLat.toFixed(5), yLon.toFixed(5), st.z);
  }

  // Поиск места — Nominatim (OSM), только по кнопке/Enter: политика
  // сервиса запрещает автодополнение и чаще 1 запроса в секунду.
  const qInput = $('.mp-q', box);
  const found = $('.mp-found', box);
  let searching = false;
  async function search() {
    const q = qInput.value.trim();
    if (!q || searching) return;
    searching = true;
    found.hidden = false;
    found.textContent = 'Ищу…';
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=' + encodeURIComponent(q));
      const list = await res.json();
      if (list.length) {
        st.lat = parseFloat(list[0].lat);
        st.lon = parseFloat(list[0].lon);
        st.z = Math.max(st.z, 12);
        found.textContent = list[0].display_name;
        draw();
      } else {
        found.textContent = 'Не нашлось — уточните запрос.';
      }
    } catch (e) {
      found.textContent = 'Поиск недоступен офлайн.';
    }
    searching = false;
  }
  $('.mp-go', box).addEventListener('click', search);
  qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  // Перетаскивание: слой едет transform'ом, центр фиксируется на отпускании.
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mp-zoom')) return; // кнопки зума — не перетаскивание
    drag = { x: e.clientX, y: e.clientY, moved: false };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) layer.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  });
  view.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.moved) {
      st.lon = mapX2lon(mapLon2x(st.lon, st.z) - dx / MAP_TILE, st.z);
      st.lat = mapY2lat(mapLat2y(st.lat, st.z) - dy / MAP_TILE, st.z);
      draw();
    } else {
      // тап: точка под пальцем — в поле координат
      const r = view.getBoundingClientRect();
      const lon = mapX2lon(mapLon2x(st.lon, st.z) + (e.clientX - r.left - r.width / 2) / MAP_TILE, st.z);
      const lat = mapY2lat(mapLat2y(st.lat, st.z) + (e.clientY - r.top - r.height / 2) / MAP_TILE, st.z);
      st.mLat = lat; st.mLon = lon;
      const input = form.querySelector('input[name="coords"]');
      if (input) input.value = lat.toFixed(5) + ', ' + lon.toFixed(5);
      draw();
    }
    drag = null;
  });
  view.addEventListener('pointercancel', () => { drag = null; layer.style.transform = ''; });
  $('.mp-zi', box).addEventListener('click', () => { if (st.z < 18) { st.z++; draw(); } });
  $('.mp-zo', box).addEventListener('click', () => { if (st.z > 3) { st.z--; draw(); } });
  draw();
}
