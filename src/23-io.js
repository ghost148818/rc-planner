// RC Planner · Экспорт и импорт резервной копии.
'use strict';

/* ============================================================
   Экспорт / импорт
============================================================ */

async function exportData(data, filename, scope) {
  const out = { format: 'rcplanner', version: 1, scope, exported: new Date().toISOString(), data: {} };
  for (const store of Object.keys(data)) {
    out.data[store] = [];
    for (const rec of data[store]) {
      const copy = Object.assign({}, rec);
      for (const key of ['photo', 'file']) {
        if (copy[key] instanceof Blob) {
          copy[key] = { __blob: await blobToDataURL(copy[key]), type: copy[key].type };
        }
      }
      out.data[store].push(copy);
    }
  }
  return saveFile(filename, new Blob([JSON.stringify(out)], { type: 'application/json' }));
}

function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return 'Файл не похож на резервную копию RC Planner.';
  if (obj.format !== 'rcplanner') return 'Это не файл RC Planner (нет отметки формата).';
  if (obj.version !== 1) return 'Файл создан другой версией приложения (' + obj.version + ').';
  if (!obj.data || typeof obj.data !== 'object') return 'В файле нет данных.';
  for (const store of Object.keys(obj.data)) {
    if (!RCDB.stores.includes(store)) return 'Неизвестный раздел данных: ' + store;
    if (!Array.isArray(obj.data[store])) return 'Повреждён раздел: ' + store;
    for (const rec of obj.data[store]) {
      if (!rec || typeof rec.id !== 'string') return 'Запись без id в разделе ' + store;
      // id уходят в data-атрибуты разметки — только безопасные символы
      if (!/^[\w.-]{1,64}$/.test(rec.id)) return 'Повреждённый id записи в разделе ' + store;
    }
  }
  return null;
}

function reviveBlobs(data) {
  for (const store of Object.keys(data)) {
    for (const rec of data[store]) {
      for (const key of ['photo', 'file']) {
        if (rec[key] && rec[key].__blob) {
          try { rec[key] = dataURLtoBlob(rec[key].__blob); }
          catch (e) { rec[key] = null; }
        }
      }
    }
  }
}

async function doImport(mode) {
  const parsed = UI.importData;
  if (!parsed) return;
  reviveBlobs(parsed.data);
  await RCDB.restore(parsed.data, mode);
  PHOTO_URLS.forEach((u) => URL.revokeObjectURL(u));
  PHOTO_URLS.clear();
  await loadAll();
  // Закрепляем нормализованные записи в самой базе: сырые строки из
  // копии не должны жить в IndexedDB и всплывать при любой перечитке.
  for (const store of Object.keys(NORM)) {
    if (Array.isArray(parsed.data[store]) && S[store].length) await RCDB.putAll(store, S[store]);
  }
  UI.importData = null;
  closeModal();
  openModal('Готово', '<p>Данные восстановлены.</p><div class="spacer"></div><button class="btn btn-primary" data-act="close-modal">Ок</button>');
  render();
}

const IMPORT_MAX_MB = 300;
function handleImportFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  // Фильтра по типу нет (см. viewBackup) — случайно выбранное видео
  // не читаем целиком в память
  if (f.size > IMPORT_MAX_MB * 1048576) {
    input.value = '';
    openModal('Импорт не удался', `<p>Файл больше ${IMPORT_MAX_MB}&nbsp;МБ — это не резервная копия RC Planner.</p>
      <div class="spacer"></div><button class="btn" data-act="close-modal">Понятно</button>`);
    return;
  }
  const r = new FileReader();
  r.onload = () => {
    let parsed = null;
    let err = null;
    try { parsed = JSON.parse(r.result); } catch (e) { err = 'Файл не читается как JSON.'; }
    if (!err) err = validateBackup(parsed);
    if (err) {
      openModal('Импорт не удался', `<p>${esc(err)}</p><div class="spacer"></div>
        <button class="btn" data-act="close-modal">Понятно</button>`);
      return;
    }
    UI.importData = parsed;
    const n = Object.values(parsed.data).reduce((s, arr) => s + arr.length, 0);
    openModal('Импорт данных', `<p>В файле ${n} ${plural(n, 'запись', 'записи', 'записей')}
      (${parsed.scope === 'aircraft' ? 'экспорт одного борта' : 'полная копия'} от ${esc((parsed.exported || '').slice(0, 10))}).</p>
      <div class="spacer"></div>
      ${parsed.scope === 'aircraft'
        ? '<button class="btn btn-primary" data-act="import-merge">Добавить к моим данным</button>'
        : `<button class="btn btn-primary" data-act="import-merge">Объединить с моими данными</button>
           <button class="btn btn-danger" data-act="import-replace">Заменить всё содержимым файла</button>`}
      <button class="btn" data-act="close-modal">Отмена</button>`);
  };
  r.readAsText(f);
  input.value = '';
}
