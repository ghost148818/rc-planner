// Каталог инструментов: web-конфигураторы, прошивки, калькуляторы, документация.
// Все ссылки — официальные источники, открываются в браузере (нужен интернет).
// Ничего стороннего внутрь приложения не встраивается.
//
// Правило: перед добавлением или правкой ссылки — сверить с актуальной
// документацией (Context7) и проверить САМУ СТРАНИЦУ, а не только код ответа:
// HTTP 200 + заголовок/содержимое соответствуют назначению + ресурс известен
// сообществу. HTTP 200 у припаркованного или вредоносного домена — не проверка.
// Последняя проверка всех ссылок: 2026-08-24.
window.RC = window.RC || {};

RC.TOOLS = [
  // Web-конфигураторы: работают прямо из браузера (WebSerial/WebUSB)
  {
    id: 'betaflight-app',
    cat: 'config',
    name: 'Betaflight Configurator (Web)',
    desc: 'Настройка полётных контроллеров Betaflight из браузера: PID, режимы, OSD, CLI.',
    url: 'https://app.betaflight.com/',
    src: 'betaflight.com — официальное web-приложение проекта',
  },
  {
    id: 'betaflight-blackbox',
    cat: 'config',
    name: 'Betaflight Blackbox Explorer',
    desc: 'Просмотр и анализ blackbox-логов полёта в браузере: PID, шум, prop wash.',
    url: 'https://blackbox.betaflight.com/',
    src: 'betaflight.com — официальный инструмент проекта',
  },
  {
    id: 'elrs-web-flasher',
    cat: 'config',
    name: 'ExpressLRS Web Flasher',
    desc: 'Прошивка приёмников и передатчиков ExpressLRS прямо из браузера.',
    url: 'https://expresslrs.github.io/web-flasher/',
    src: 'expresslrs.org — официальный способ прошивки',
  },
  {
    id: 'edgetx-buddy',
    cat: 'config',
    name: 'EdgeTX Buddy',
    desc: 'Прошивка аппаратуры EdgeTX и подготовка SD-карты из браузера.',
    url: 'https://buddy.edgetx.org/',
    src: 'edgetx.org — официальный web-инструмент проекта',
  },
  {
    id: 'esc-configurator',
    cat: 'config',
    name: 'ESC Configurator',
    desc: 'Настройка и прошивка регуляторов BLHeli_S / Bluejay / AM32 через WebSerial.',
    url: 'https://esc-configurator.com/',
    src: 'esc-configurator.com — открытый проект',
  },
  {
    id: 'kiss-ultra',
    cat: 'config',
    name: 'KISS Ultra',
    desc: 'Конфигуратор полётных контроллеров KISS / Ultra.',
    url: 'https://kiss-ultra.com/',
    src: 'kiss-ultra.com — официальный конфигуратор',
  },
  {
    id: 'vtx-tables',
    cat: 'config',
    name: 'VTX Tables',
    desc: 'Готовые VTX-таблицы для Betaflight: каналы и мощности вашего передатчика видео.',
    url: 'https://vtx-tables.vercel.app/',
    src: 'сборник таблиц сообщества Betaflight',
  },

  // Прошивки и десктоп-приложения: официальные релизы
  {
    id: 'fw-betaflight',
    cat: 'firmware',
    name: 'Betaflight Firmware',
    desc: 'Официальные сборки прошивки Betaflight для полётных контроллеров.',
    url: 'https://github.com/betaflight/betaflight/releases',
    src: 'GitHub betaflight — официальные релизы',
  },
  {
    id: 'fw-inav',
    cat: 'firmware',
    name: 'INAV Firmware',
    desc: 'Официальные сборки прошивки INAV для самолётов, крыльев и коптеров с GPS.',
    url: 'https://github.com/iNavFlight/inav/releases',
    src: 'GitHub iNavFlight — официальные релизы',
  },
  {
    id: 'inav-configurator',
    cat: 'firmware',
    name: 'INAV Configurator (десктоп)',
    desc: 'Настольное приложение для настройки и прошивки INAV — web-версии у проекта нет.',
    url: 'https://github.com/iNavFlight/inav-configurator/releases',
    src: 'GitHub iNavFlight — официальные релизы',
  },
  {
    id: 'elrs-configurator',
    cat: 'firmware',
    name: 'ExpressLRS Configurator (десктоп)',
    desc: 'Рекомендуемый документацией способ сборки и прошивки ExpressLRS.',
    url: 'https://github.com/ExpressLRS/ExpressLRS-Configurator/releases',
    src: 'GitHub ExpressLRS — официальные релизы',
  },
  {
    id: 'fw-edgetx',
    cat: 'firmware',
    name: 'EdgeTX Firmware',
    desc: 'Релизы прошивки EdgeTX для аппаратуры управления.',
    url: 'https://github.com/EdgeTX/edgetx/releases',
    src: 'GitHub EdgeTX — официальные релизы',
  },

  // Калькуляторы: бесплатные, без регистрации
  {
    id: 'calc-motor',
    cat: 'calc',
    name: 'Подбор мотора и тяги',
    desc: 'Тяговооружённость коптера: вес, тяга моторов, запас по мощности.',
    url: 'https://www.omnicalculator.com/other/drone-motor',
    src: 'omnicalculator.com — Drone Motor Calculator',
  },
  {
    id: 'calc-flight-time',
    cat: 'calc',
    name: 'Время полёта',
    desc: 'Оценка времени полёта по ёмкости батареи и среднему току.',
    url: 'https://www.omnicalculator.com/other/drone-flight-time',
    src: 'omnicalculator.com — Drone Flight Time Calculator',
  },
  {
    id: 'calc-cg',
    cat: 'calc',
    name: 'Центр тяжести (CG)',
    desc: 'Расчёт центровки крыла и самолёта по геометрии, включая стреловидность.',
    url: 'https://rcplanes.online/cg_calc.htm',
    src: 'rcplanes.online — открытый калькулятор ЦТ',
  },
  {
    id: 'calc-cg-wing',
    cat: 'calc',
    name: 'Центровка летающего крыла',
    desc: 'Flying Wing CG Calculator V3: CG, MAC и аэродинамический фокус по геометрии крыла.',
    url: 'https://fwcg.3dzone.dk/',
    src: 'fwcg.3dzone.dk — известный калькулятор сообщества (наследник fwcg.ru)',
  },
  {
    id: 'calc-wing-loading',
    cat: 'calc',
    name: 'Нагрузка на крыло',
    desc: 'Wing loading: вес к площади крыла — характер модели и посадочная скорость.',
    url: 'https://www.omnicalculator.com/physics/wing-loading',
    src: 'omnicalculator.com — Wing Loading Calculator',
  },
  {
    id: 'calc-watts-amps',
    cat: 'calc',
    name: 'Мощность и ток',
    desc: 'Пересчёт ватт в амперы по напряжению батареи: проверка ESC и проводки по току.',
    url: 'https://www.omnicalculator.com/physics/watts-to-amps',
    src: 'omnicalculator.com — Watts to Amps Calculator',
  },

  // Подбор компонентов и базы данных
  {
    id: 'db-mqtb',
    cat: 'db',
    name: 'Mini Quad Test Bench',
    desc: 'Измеренная на стенде тяга и токи реальных моторов и пропеллеров — данные, а не реклама.',
    url: 'https://www.miniquadtestbench.com/',
    src: 'miniquadtestbench.com — известный стенд сообщества',
  },
  {
    id: 'db-rotorbuilds',
    cat: 'db',
    name: 'RotorBuilds',
    desc: 'Каталог реальных сборок: списки комплектующих, фото и обсуждения — удобно подсмотреть проверенную связку.',
    url: 'https://rotorbuilds.com/',
    src: 'rotorbuilds.com — крупнейшая база сборок FPV',
  },
  {
    id: 'db-fpvbuilder',
    cat: 'db',
    name: 'FPVBuilder',
    desc: 'Онлайн-подбор комплектующих дрона с проверкой совместимости: крепёж, питание, UART, аналог/цифра.',
    url: 'https://fpvbuilder.io/en',
    src: 'fpvbuilder.io — бесплатный конструктор сборок',
  },
  {
    id: 'db-fpvknowitall',
    cat: 'db',
    name: 'FPV Know-It-All',
    desc: 'Проверенные списки комплектующих и гайды Джошуа Бардвелла (англ.).',
    url: 'https://www.fpvknowitall.com/',
    src: 'fpvknowitall.com — Joshua Bardwell',
  },

  // Погода
  {
    id: 'weather-windy',
    cat: 'weather',
    name: 'Windy',
    desc: 'Карта ветра и прогноз по высотам: ветер, порывы, осадки, облачность в точке полётов.',
    url: 'https://www.windy.com/',
    src: 'windy.com — известный метеосервис',
  },
  {
    id: 'weather-uavforecast',
    cat: 'weather',
    name: 'UAV Forecast',
    desc: 'Прогноз специально для полётов дронов: ветер по высотам, Kp-индекс, видимость, «можно ли лететь».',
    url: 'https://www.uavforecast.com/',
    src: 'uavforecast.com — сервис для пилотов БПЛА',
  },

  // Документация
  {
    id: 'doc-betaflight',
    cat: 'docs',
    name: 'Betaflight Docs',
    desc: 'Официальная документация Betaflight: настройка, CLI, тюнинг, blackbox.',
    url: 'https://betaflight.com/docs/wiki',
    src: 'betaflight.com',
  },
  {
    id: 'doc-inav',
    cat: 'docs',
    name: 'INAV Docs',
    desc: 'Документация INAV: настройка самолётов и крыльев, GPS-режимы, автономные миссии.',
    url: 'https://github.com/iNavFlight/inav/wiki',
    src: 'GitHub iNavFlight wiki',
  },
  {
    id: 'doc-elrs',
    cat: 'docs',
    name: 'ExpressLRS Docs',
    desc: 'Документация ExpressLRS: биндинг, Wi-Fi обновление, настройки пакетов.',
    url: 'https://www.expresslrs.org/',
    src: 'expresslrs.org',
  },
  {
    id: 'doc-edgetx',
    cat: 'docs',
    name: 'EdgeTX Manual',
    desc: 'Руководство пользователя EdgeTX: модели, микширование, логические переключатели.',
    url: 'https://manual.edgetx.org/',
    src: 'manual.edgetx.org',
  },
  {
    id: 'doc-uchet-bvs',
    cat: 'docs',
    name: 'Госуслуги: учёт БВС',
    desc: 'Официальный портал учёта беспилотных воздушных судов (обязателен для БВС от 150 г до 30 кг).',
    url: 'https://uchetbvs.gosuslugi.ru/',
    src: 'gosuslugi.ru — государственный портал (проверено владельцем)',
  },
  {
    id: 'doc-favt',
    cat: 'docs',
    name: 'Росавиация: учёт БВС и СВС',
    desc: 'Правила государственного учёта беспилотных и сверхлёгких воздушных судов.',
    url: 'https://favt.gov.ru/dejatelnost-ucet-bespilotnyh-grajdanskih-vozdyshnih-sudov-i-sverkhlyogkih-grazhdanskih-vozdushnih-sudov/',
    src: 'favt.gov.ru — Федеральное агентство воздушного транспорта (проверено владельцем)',
  },
  {
    id: 'doc-oscarliang',
    cat: 'docs',
    name: 'Oscar Liang — FPV guides',
    desc: 'Практические руководства по сборке и настройке FPV, батареям и моторам (англ.).',
    url: 'https://oscarliang.com/',
    src: 'oscarliang.com — известный блог сообщества',
  },
];

RC.TOOL_CATS = [
  { id: 'config', name: 'Web-конфигураторы' },
  { id: 'firmware', name: 'Прошивки и десктоп-приложения' },
  { id: 'calc', name: 'Калькуляторы' },
  { id: 'db', name: 'Подбор и базы данных' },
  { id: 'weather', name: 'Погода' },
  { id: 'docs', name: 'Документация' },
];
