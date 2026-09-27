// RC Planner · Сборы.
'use strict';

/* ---------- Сборы ---------- */

function viewPacking() {
  // Своей вкладки у сборов нет (2.0): «Назад» ведёт на «Сегодня» — и из «Ещё» тоже.
  let h = pageHead('Сборы', { back: '#/today', act: 'add-pack', actLabel: 'Новый набор', help: 'packing' });
  if (!S.packing.length) return h + emptyState('Создайте набор «что взять с собой».', 'add-pack', 'Новый набор', 'packing');
  h += '<div class="card flat">';
  // По алфавиту: порядок записей в базе случаен для пилота
  h += S.packing.slice().sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), 'ru')).map((p) => {
    const done = p.items.filter((i) => i.done).length;
    return rowBtn(`data-nav="#/pack/${p.id}"`,
      `<span class="grow"><span class="t">${esc(p.name)}</span>
       <span class="d">${done} из ${p.items.length} собрано</span></span>`);
  }).join('');
  h += '</div>';
  return h;
}

function viewPack() {
  const p = S.packing.find((x) => x.id === UI.arg);
  if (!p) return pageHead('Набор не найден', { back: '#/packing' });
  const done = p.items.filter((i) => i.done).length;
  let h = pageHead(esc(p.name), { back: '#/packing', act: 'pack-reset', actLabel: 'Сбросить' });
  h += `<div class="progress"><i style="width:${p.items.length ? Math.round(done / p.items.length * 100) : 0}%"></i></div>
    <div class="small muted" style="margin-bottom:8px">${done} из ${p.items.length}</div>`;
  h += '<div class="card flat">';
  // Удаление пункта — слева, подальше от клетки: большой палец привык
  // к клетке у правого края (как в чек-листе), а удаляет пункт сразу.
  h += p.items.map((it, i) => `<div class="ck" data-ck="${i}" data-state="${it.done ? 'ok' : ''}">
      <button class="ic-btn" data-act="pack-del-item" data-i="${i}" aria-label="Удалить пункт">${ICONS.x}</button>
      <button class="ck-main" data-act="pack-toggle" data-i="${i}">
        <span class="grow"><span class="t">${esc(it.t)}</span></span></button>
      <button class="st" data-act="pack-toggle" data-i="${i}"${UI.packLastIdx === i ? ` style="view-transition-name: ck-${i}"` : ''} aria-label="${it.done ? 'Собрано' : 'Не собрано'}">${it.done ? ICONS.check : ''}</button>
    </div>`).join('');
  h += '</div>';
  h += `<form data-form="pack-item" class="btn-line" style="margin-bottom:8px">
      <input type="text" name="t" placeholder="Свой пункт…" required style="flex:1">
      <button class="btn btn-sm" type="submit" style="min-height:var(--btn)">Добавить</button>
    </form>
    <button class="btn btn-danger" data-act="del-pack" data-id="${p.id}">Удалить набор</button>`;
  return h;
}
