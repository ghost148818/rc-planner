// RC Planner · Инструкция и приветствие.
'use strict';

/* ---------- Инструкция и приветствие ----------
   Контент — data/help.js (RC.HELP): разделы инструкции и три шага
   приветствия. Тот же файл собирает docs/user-guide.md (npm run guide). */

// Блок раздела → разметка. Тексты справочные, но идут через esc():
// разметки внутри них нет, а дисциплина одна на всё приложение.
// helpTypo — после esc(): тире и стрелка не начинают строку (неразрывный
// пробел перед ними); data/help.js и docs/user-guide.md остаются чистыми.
const helpTypo = (s) => esc(s).replace(/ ([—→])/g, '&nbsp;$1');
function helpBlockHtml(b) {
  if (typeof b === 'string') return `<p>${helpTypo(b)}</p>`;
  if (b.h) return `<div class="h3">${esc(b.h)}</div>`;
  if (b.list) return `<ul>${b.list.map((t) => `<li>${helpTypo(t)}</li>`).join('')}</ul>`;
  if (b.tip) return `<div class="banner">${ICONS.help}<span class="grow">${helpTypo(b.tip)}</span></div>`;
  if (b.go) return `<div class="card flat">${rowBtn(`data-nav="${esc(b.go)}"`, `<span class="grow"><span class="t">${esc(b.text)}</span></span>`)}</div>`;
  return '';
}

// #/help — все разделы свёрнуты, открыт первый; #/help/<id> — открыт
// раздел id, страница прокручена к нему (scrollIntoView в paint).
function helpSectionId(id) {
  return RC.HELP.sections.some((s) => s.id === id) ? id : '';
}
function viewHelp() {
  const secs = RC.HELP.sections;
  const openId = helpSectionId(UI.arg) || secs[0].id;
  let h = pageHead('Инструкция', { back: '#/more', sub: 'Как пользоваться RC Planner' });
  h += `<p class="small muted help-intro">Приложение живёт на вашем устройстве и подсказывает следующий шаг
    на «Сегодня». Ниже — по разделу на каждый экран; кнопка «?» в шапке экрана открывает его раздел.</p>`;
  h += '<div class="card flat">' + rowBtn('data-act="welcome-open"',
    `<span class="grow"><span class="t">Приветствие заново</span><span class="d wrap">Три шага первого запуска</span></span>`, 'whatsnew') + '</div>';
  h += '<div class="help">' + secs.map((s) => `<details class="fold" id="help-${esc(s.id)}"${s.id === openId ? ' open' : ''}>
    <summary>${esc(s.title)}</summary><div class="fold-body">${s.blocks.map(helpBlockHtml).join('')}</div></details>`).join('') + '</div>';
  return h;
}

// Приветствие первого запуска: три шага RC.HELP.welcome одним окном,
// точки-индикатор, «Дальше»/«Начать». Шаги меняются внутри окна (тело
// перерисовывается, лист не въезжает заново). Закрытие крестиком, Esc
// или тапом мимо тоже засчитывается — dismissModal видит dialog.welcome
// и ставит rcp.hi. Повтор — «Пройти обучение заново» в «Ещё» и строка
// «Приветствие заново» на экране «Инструкция».
function welcomeBodyHtml(i) {
  const steps = RC.HELP.welcome;
  const s = steps[i];
  const last = i === steps.length - 1;
  return `<div class="welcome">
    <span class="welcome-art" data-art="welcome-${i + 1}" aria-hidden="true"></span>
    <span class="welcome-ic">${ICONS[s.key] || ICONS.help}</span>
    <h3>${esc(s.title)}</h3>
    <p>${esc(s.text)}</p>
    <div class="dots" role="img" aria-label="Шаг ${i + 1} из ${steps.length}">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
    <button class="btn btn-primary" data-act="${last ? 'welcome-done' : 'welcome-next'}" data-step="${i + 1}">${last ? 'Начать' : 'Дальше'}</button>
  </div>`;
}
function openWelcome(step) {
  const steps = RC.HELP.welcome;
  if (!steps || !steps.length) return;
  const i = Math.max(0, Math.min(steps.length - 1, +step || 0));
  const body = $('#modal-root dialog.welcome .dlg-body');
  if (body) { body.innerHTML = welcomeBodyHtml(i); return; }
  openModal('Добро пожаловать', welcomeBodyHtml(i));
  $('#modal-root dialog').classList.add('welcome');
}
