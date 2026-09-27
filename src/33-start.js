// RC Planner · Старт приложения.
'use strict';

/* ============================================================
   12. СТАРТ
============================================================ */

(async function start() {
  try {
    await loadAll();
    await seedIfNeeded();
    await migrateIfNeeded();
  } catch (e) {
    $('#views').innerHTML = `<div class="empty"><p>Не удалось открыть локальную базу данных.<br>
      <span class="small muted">${esc(e && e.message)}</span></p>
      <p class="small muted">Проверьте, что браузер не в приватном режиме.</p></div>`;
    return;
  }
  applyTheme();
  // Тема «как в системе» следует за системой на лету; явный выбор — нет.
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (themePref() === 'system') applyTheme();
    });
  }
  onRoute();
  setupSW();
  // Первый запуск (нет rcp.hi) — приветствие в три шага; «Что нового»
  // в этот запуск не лезет: rcp.seen не трогаем, окно придёт в следующий
  // (на самом первом запуске maybeWhatsNew и так ничего не показывает).
  if (!lsGet('rcp.hi')) openWelcome(0); else maybeWhatsNew();
})();
