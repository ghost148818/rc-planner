// Прошивки Walksnail (Avatar / Ascent) — последние известные версии.
//
// ПОЧЕМУ СПИСОК РУЧНОЙ, А НЕ ЖИВОЙ ЗАПРОС. Эти прошивки раздаются только
// через Google Диск, а он не отдаёт заголовок `access-control-allow-origin`
// (проверено запросом 2026-08-30) — браузер не даст приложению прочитать
// список файлов, значит узнать свежую версию само оно не может. У GitHub
// такой заголовок есть, но репозиторий CaddxFPV-Tech отстаёт от Диска
// (V17.5.15 против V18.21.10) и не подтверждён с сайта производителя.
// Поэтому версии сверяются руками, а дата сверки (`checked`) честно
// показывается в интерфейсе: пользователь видит, насколько свежие данные.
// Обновление — по команде владельца «обнови прошивки».
//
// ИСТОЧНИК. Папки перечислены на walksnail.wiki — справочнике сообщества
// Walksnail (владелец подтвердил происхождение 2026-08-30). Ссылки на
// конкретные версии взяты не с вики, а из самих каталогов папок: на вики
// ссылка «18.21.10 (Latest)» ведёт в папку с файлами 17.5.8.
// Файлы не копируем и не перезаливаем — только ссылки.
window.RC = window.RC || {};

RC.FIRMWARE = {
  checked: '2026-08-30',
  source: { name: 'Walksnail Wiki — справочник сообщества', url: 'https://walksnail.wiki/en/firmware' },
  // Предупреждение с вики: откат прошивки на новых партиях убивает очки.
  warn: 'Goggles X из партий с января 2025 года: НЕ откатывайте прошивку ниже 38.44.13 — там другая память, очки выйдут из строя навсегда.',
  items: [
    {
      id: 'avatar',
      name: 'Walksnail Avatar',
      version: '39.44.18',
      note: 'Очки и воздушный блок. Ретранслятор — 39.44.4, Moonlight — 15.1.18.',
      url: 'https://drive.google.com/drive/folders/19qvqcC8YJ9qdyQfLYCRn-hgFejiZX2QR',
      all: 'https://drive.google.com/drive/folders/15jQGO-RAdLNjiruw4Ov3sVqez_Pg0EXr',
    },
    {
      id: 'ascent',
      name: 'Walksnail Ascent',
      version: '18.21.10',
      note: 'Наземный и воздушный блок. Для GT Pro — 18.21.7.',
      url: 'https://drive.google.com/drive/folders/1zMkmTWlU3D63jHhbtmmT1JwEG9Djj9BF',
      all: 'https://drive.google.com/drive/folders/1Et_FOc5DiV0n4H1N7oCrYpH44ZNGt-P_',
    },
    {
      id: 'ascent-industry',
      name: 'Ascent Industry',
      version: '19.2.4',
      note: 'Промышленная линейка Ascent.',
      url: 'https://drive.google.com/drive/folders/1CTYWRlzKDmKselpZRbZ7iYa_AHCkx9ml',
      all: 'https://drive.google.com/drive/folders/1NmvjseLBbwIC5xPzStFSn4lQmdpD59hA',
    },
    {
      id: 'caddx-pc-tool',
      name: 'Caddx PC Tool',
      version: '2.2.9',
      note: 'Настройка и прошивка с компьютера, Windows. Для macOS — 1.1.6 в общей папке.',
      url: 'https://drive.google.com/file/d/1hJeSSInM2P_RXejDpVVCp6ZY4oX_krD1/view',
      all: 'https://drive.google.com/drive/folders/1NDH11WJHklI0Bv_6CixpqVIA4ZKjo84z',
    },
    {
      id: 'headtracker',
      name: 'Головной трекер и гимбалы GM',
      version: 'трекер 2.4',
      note: 'Гимбалы GM V1 — 3.8, GM V2 — 2.2.59. В папке же руководство GM Series.',
      url: 'https://drive.google.com/drive/folders/1NQulVRybDyPwaLPXSo1dasMoY5FFLtNd',
    },
  ],
};
