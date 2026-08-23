// Каталог инструментов: конфигураторы, калькуляторы, документация.
// Все ссылки — на официальные источники, открываются в браузере (нужен интернет).
// Ничего стороннего внутрь приложения не встраивается.
window.RC = window.RC || {};

RC.TOOLS = [
  // Конфигураторы
  {
    id: 'betaflight',
    cat: 'config',
    name: 'Betaflight Configurator',
    desc: 'Настройка полётных контроллеров Betaflight: PID, режимы, OSD, blackbox.',
    url: 'https://app.betaflight.com/',
    src: 'betaflight.com — официальный сайт проекта',
  },
  {
    id: 'inav',
    cat: 'config',
    name: 'INAV Configurator',
    desc: 'Настройка INAV для самолётов, крыльев и коптеров с GPS-миссиями.',
    url: 'https://github.com/iNavFlight/inav-configurator/releases',
    src: 'GitHub iNavFlight — официальные релизы',
  },
  {
    id: 'elrs',
    cat: 'config',
    name: 'ExpressLRS Configurator',
    desc: 'Прошивка и настройка приёмников и передатчиков ExpressLRS.',
    url: 'https://github.com/ExpressLRS/ExpressLRS-Configurator/releases',
    src: 'GitHub ExpressLRS — официальные релизы',
  },
  {
    id: 'edgetx',
    cat: 'config',
    name: 'EdgeTX Companion / Buddy',
    desc: 'Прошивка аппаратуры EdgeTX, редактирование моделей и настроек.',
    url: 'https://edgetx.org/',
    src: 'edgetx.org — официальный сайт проекта',
  },
  {
    id: 'blheli',
    cat: 'config',
    name: 'ESC Configurator (BLHeli_S / AM32)',
    desc: 'Настройка и прошивка регуляторов из браузера (WebSerial).',
    url: 'https://esc-configurator.com/',
    src: 'esc-configurator.com — открытый проект',
  },

  // Прошивки
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
    desc: 'Официальные сборки прошивки INAV.',
    url: 'https://github.com/iNavFlight/inav/releases',
    src: 'GitHub iNavFlight — официальные релизы',
  },
  {
    id: 'fw-elrs',
    cat: 'firmware',
    name: 'ExpressLRS Firmware',
    desc: 'Релизы прошивки ExpressLRS с примечаниями к версиям.',
    url: 'https://github.com/ExpressLRS/ExpressLRS/releases',
    src: 'GitHub ExpressLRS — официальные релизы',
  },
  {
    id: 'fw-edgetx',
    cat: 'firmware',
    name: 'EdgeTX Firmware',
    desc: 'Релизы прошивки EdgeTX для аппаратуры.',
    url: 'https://github.com/EdgeTX/edgetx/releases',
    src: 'GitHub EdgeTX — официальные релизы',
  },

  // Калькуляторы
  {
    id: 'calc-ecalc',
    cat: 'calc',
    name: 'eCalc (демо)',
    desc: 'Расчёт связки мотор/пропеллер/аккумулятор: тяга, ток, время полёта. Полная версия платная, демо доступно.',
    url: 'https://www.ecalc.ch/',
    src: 'ecalc.ch',
  },
  {
    id: 'calc-cg',
    cat: 'calc',
    name: 'CG Calculator',
    desc: 'Расчёт центра тяжести крыла и самолёта по геометрии.',
    url: 'https://fwcg.ru/',
    src: 'fwcg.ru — открытый калькулятор ЦТ',
  },
  {
    id: 'calc-lipo',
    cat: 'calc',
    name: 'Battery / C-rating',
    desc: 'Ток отдачи аккумулятора: ёмкость × C-рейтинг, проверка запаса по току.',
    url: 'https://www.rcdronegood.com/lipo-battery-c-rating-calculator/',
    src: 'справочный калькулятор; формула: I = C × ёмкость',
  },

  // Документация
  {
    id: 'doc-betaflight',
    cat: 'docs',
    name: 'Betaflight Docs',
    desc: 'Официальная документация Betaflight: настройка, CLI, тюнинг.',
    url: 'https://betaflight.com/docs/wiki',
    src: 'betaflight.com',
  },
  {
    id: 'doc-inav',
    cat: 'docs',
    name: 'INAV Docs',
    desc: 'Документация INAV: настройка самолётов и крыльев, GPS-режимы.',
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
    desc: 'Руководство пользователя EdgeTX.',
    url: 'https://manual.edgetx.org/',
    src: 'manual.edgetx.org',
  },
  {
    id: 'doc-oscarliang',
    cat: 'docs',
    name: 'Oscar Liang — FPV guides',
    desc: 'Практические руководства по сборке и настройке FPV (англ.).',
    url: 'https://oscarliang.com/',
    src: 'oscarliang.com — известный блог сообщества',
  },
];

RC.TOOL_CATS = [
  { id: 'config', name: 'Конфигураторы' },
  { id: 'firmware', name: 'Прошивки' },
  { id: 'calc', name: 'Калькуляторы' },
  { id: 'docs', name: 'Документация' },
];
