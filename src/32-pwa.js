// RC Planner · PWA: service worker, «Что нового».
'use strict';

/* ============================================================
   11. PWA И ОБНОВЛЕНИЯ
============================================================ */

function setupSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return; // file:// — офлайн-файл без PWA
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    SWREG = reg;
    if (reg.waiting && navigator.serviceWorker.controller) { UI.updateReady = true; render(); }
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          UI.updateReady = true;
          render();
        }
      });
    });
  }).catch(() => {});
  // При первой установке controllerchange тоже приходит — не перезагружаем.
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) location.reload();
    had = true;
  });
}

function showWhatsNew(manual) {
  const log = RC.CHANGELOG;
  if (!log.length) return;
  const latest = log[0];
  const entry = (c) => `<div style="margin-bottom:14px">
    <div style="display:flex;gap:8px;align-items:baseline">
      <strong>Версия ${esc(c.v)}</strong><span class="small muted">${fmtDate(c.date)}</span></div>
    <div class="small muted" style="margin-bottom:4px">${esc(c.title)}</div>
    <ul style="padding-left:18px">${c.items.map((i) => `<li class="small">${esc(i)}</li>`).join('')}</ul></div>`;
  let h = entry(latest);
  const past = log.slice(1, 6);
  if (past.length) {
    h += `<details class="fold"><summary>Что было раньше</summary><div class="fold-body">${past.map(entry).join('')}</div></details>`;
  }
  h += '<button class="btn btn-primary" data-act="close-modal">Понятно</button>';
  openModal('Что нового', h);
  if (!manual) lsSet('rcp.seen', String(latest.v));
}

// Версии — строки; никакой арифметики: ищем просмотренную по положению
// в списке. Не нашли (старый формат, копия из будущего) — показываем раз.
function maybeWhatsNew() {
  const latest = RC.CHANGELOG[0];
  if (!latest) return;
  const seen = lsGet('rcp.seen') || '';
  if (!seen) { lsSet('rcp.seen', String(latest.v)); return; } // первый запуск — без окна
  const i = RC.CHANGELOG.findIndex((c) => String(c.v) === seen);
  if (i !== 0) { showWhatsNew(false); lsSet('rcp.seen', String(latest.v)); }
}
