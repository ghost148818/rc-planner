// Каталог инструментов: web-конфигураторы, прошивки, калькуляторы, документация.
// Все ссылки — официальные источники, открываются в браузере (нужен интернет).
// Ничего стороннего внутрь приложения не встраивается.
//
// Правило: перед добавлением или правкой ссылки — сверить с актуальной
// документацией (Context7) и проверить САМУ СТРАНИЦУ, а не только код ответа:
// HTTP 200 + заголовок/содержимое соответствуют назначению + ресурс известен
// сообществу. HTTP 200 у припаркованного или вредоносного домена — не проверка.
// Последняя проверка всех ссылок: 2026-09-28 — сверено поиском и по
// репозиториям проектов, ЖИВОЙ проверки страниц нет (сеть облачной сессии
// не пускала на сами сайты). Перед выпуском владелец проверяет curl'ом две
// новые ссылки: kiss-ultra.com/gui/ и betaflight.com/…/VTX; неподтверждённое
// (госпортал учёта, fpvmap, VDT, магазины под вопросом) вынесено владельцу.
// Прошивки Walksnail (Avatar / Ascent) живут отдельно — в data/firmware.js,
// потому что там показывается номер последней версии, а не просто ссылка.
window.RC = window.RC || {};

RC.TOOLS = [
  // Web-конфигураторы: работают прямо из браузера (WebSerial/WebUSB)
  {
    id: 'betaflight-app',
    cat: 'config',
    name: 'Betaflight App',
    desc: 'Настройка полётных контроллеров Betaflight из браузера (Chrome/Edge): PID, режимы, OSD, CLI и просмотр blackbox-логов.',
    url: 'https://app.betaflight.com/',
    src: 'betaflight.com — официальное web-приложение проекта',
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
    desc: 'Веб-конфигуратор полётных контроллеров KISS Ultra (FCFC) в Chrome и Edge. Старые платы KISS FC им не поддерживаются.',
    url: 'https://kiss-ultra.com/gui/',
    src: 'kiss-ultra.com — официальный конфигуратор',
  },
  {
    id: 'vtx-tables',
    cat: 'config',
    name: 'VTX-таблицы (Betaflight)',
    desc: 'Официальная инструкция Betaflight по VTX-таблицам: готовые файлы для SmartAudio, Tramp и RTC6705, загрузка в конфигуратор.',
    url: 'https://betaflight.com/docs/wiki/guides/current/VTX',
    src: 'betaflight.com — официальная документация проекта',
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
    desc: 'Настольное приложение для настройки и прошивки INAV. Официальной web-версии пока нет — её готовят к INAV 10.',
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
    desc: 'Требуемая тяга на мотор по весу коптера (рама, АКБ, оборудование), желаемой тяговооружённости и числу моторов.',
    url: 'https://www.omnicalculator.com/other/drone-motor',
    src: 'omnicalculator.com — Drone Motor Calculator',
  },
  {
    id: 'calc-flight-time',
    cat: 'calc',
    name: 'Время полёта',
    desc: 'Оценка времени полёта по ёмкости и напряжению АКБ, допустимому разряду и полётному весу; средний ток можно задать вручную.',
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
    desc: 'Центровка летающего крыла по размаху, хордам и стреловидности: CG, САХ и площадь крыла; на сайте есть расширенная версия V3.',
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
    desc: 'Архив стендовых замеров тяги и тока моторов и пропеллеров (тесты до 2021 года): данные, а не реклама.',
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
    desc: 'Карта ветра и прогноз в точке полётов: ветер по высотам, порывы у земли, осадки, облачность.',
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

  // --- Добавлено 2026-08-30 из закладок владельца; каждая ссылка открыта
  // и сверена по содержимому страницы, а не по коду ответа. Битые и
  // недоступные из текущей сети в каталог не попали (список — в отчёте).
  {
    id: 'db-technobee',
    cat: 'db',
    name: 'Technobee — рабочие конспекты',
    desc: 'Русскоязычные конспекты и обзоры: прошивка ESC, ELRS, стеки, аппаратура, разборы новинок.',
    url: 'https://technobee.ru/index.php',
    src: 'technobee.ru — «Рабочие конспекты. БПЛА и роботы»',
  },
  {
    id: 'db-propwash',
    cat: 'db',
    name: 'Справочник по FPV хобби',
    desc: 'Русскоязычный справочник новичка: термины, выбор железа, первые шаги.',
    url: 'https://propwashservice.com/ru/',
    src: 'propwashservice.com — справочник сообщества',
  },
  {
    id: 'db-aos',
    cat: 'db',
    name: 'AOS RC — сборка 5″ фристайл',
    desc: 'Рекомендованные комплектующие под фристайл-сборку 5 дюймов от автора рам AOS.',
    url: 'https://www.aos-rc.com/recommended-parts/5in-freestyle',
    src: 'aos-rc.com — официальный сайт разработчика рам',
  },
  {
    id: 'db-twgo',
    cat: 'db',
    name: 'Tiny Whoop GO — симулятор',
    desc: 'Официальный симулятор Tiny Whoop: карьера, онлайн-гонки и клубные заезды, свои трассы (Windows/macOS, англ.).',
    url: 'https://www.tinywhoopclubnetwork.com/twgo',
    src: 'tinywhoopclubnetwork.com — клуб Tiny Whoop',
  },
  {
    id: 'db-fpvmap',
    cat: 'db',
    name: 'FPV map',
    desc: 'Карта площадок и споттов, отмеченных пилотами.',
    url: 'https://fpvmap.m1p.me/',
    src: 'fpvmap.m1p.me — карта сообщества',
  },
  {
    id: 'db-cellmapper',
    cat: 'db',
    name: 'CellMapper — карта вышек',
    desc: 'Расположение базовых станций и покрытие: пригодится, когда связь идёт через LTE.',
    url: 'https://www.cellmapper.net/map',
    src: 'cellmapper.net — краудсорсинговая карта сети',
  },
  {
    id: 'calc-ecalc',
    cat: 'calc',
    name: 'eCalc — расчёт силовой установки',
    desc: 'propCalc: мотор, винт и АКБ для самолёта или крыла — тяга, ток, время полёта. Для коптеров у eCalc — xcopterCalc. Бесплатно — урезанная версия.',
    url: 'https://www.ecalc.ch/motorcalc.php',
    src: 'ecalc.ch — известный отраслевой калькулятор',
  },
  {
    id: 'calc-pidcalc',
    cat: 'calc',
    name: 'PID Calc — UAV Tech',
    desc: 'Подстройка ПИД Betaflight: общий множитель и соотношения P/D, I/P, D/FF без потери баланса между членами (англ.).',
    url: 'https://theuavtech.com/pidcalc/',
    src: 'theuavtech.com — UAV Tech, автор методик тюнинга',
  },
  {
    id: 'calc-fresnel',
    cat: 'calc',
    name: 'Зона Френеля для радиоканала',
    desc: 'Строит 3D-зону Френеля между двумя точками в KML для Google Earth: видно, где рельеф перекрывает радиоканал (англ.).',
    url: 'https://www.radiofresnel.com/',
    src: 'radiofresnel.com — расчёт радиотрассы',
  },
  {
    id: 'fw-blheli',
    cat: 'firmware',
    name: 'BLHeliSuite (регуляторы)',
    desc: 'Десктоп-программа (Windows) для регуляторов BLHeli и BLHeli_S. Прошивка не развивается с 2022 года; обычно хватает ESC Configurator.',
    url: 'https://github.com/4712/BLHeliSuite/releases',
    src: 'GitHub 4712 — официальный репозиторий BLHeliSuite',
  },
  {
    id: 'fw-zadig',
    cat: 'firmware',
    name: 'Zadig (драйверы USB)',
    desc: 'Установка драйвера WinUSB в Windows для прошивки полётника или аппаратуры в режиме DFU (STM32 BOOTLOADER).',
    url: 'https://zadig.akeo.ie/',
    src: 'zadig.akeo.ie — официальный сайт проекта',
  },
  // Постановление Правительства РФ от 21.06.2023 (закладка владельца)
  // в каталог НЕ добавлено: publication.pravo.gov.ru из нашей сети
  // отвечает только по http, а каталог держит правило «только https»
  // (см. проверку в test/checks.js). Нужна проверенная https-ссылка
  // от владельца — тогда добавим.
  {
    id: 'doc-skyarc',
    cat: 'docs',
    name: 'Небосвод — приложение пилота',
    desc: 'Подача заявок на полёты и разрешительные процедуры в России.',
    url: 'https://skyarc.ru/',
    src: 'skyarc.ru — сервис подачи планов полёта',
  },
  {
    id: 'doc-pid-habr',
    cat: 'docs',
    name: 'ПИД-регулятор — это весело (Хабр)',
    desc: 'Интерактивный разбор P, I и D на бытовых примерах с симулятором — база, чтобы тюнинг перестал быть шаманством.',
    url: 'https://habr.com/ru/articles/1016090/',
    src: 'habr.com — разбор с примерами',
  },
  {
    id: 'doc-bambu-wiki',
    cat: 'docs',
    name: 'Bambu Lab Wiki (3D-печать)',
    desc: 'Печать деталей и креплений: материалы, настройки, обслуживание принтера.',
    url: 'https://wiki.bambulab.com/en/home',
    src: 'wiki.bambulab.com — официальная база знаний производителя',
  },

  // Магазины и подбор комплектующих
  {
    id: 'shop-rcsearch',
    cat: 'shop',
    name: 'RCSearch',
    desc: 'Поиск RC-товаров сразу по российским магазинам со сравнением цен.',
    url: 'https://rcsearch.ru/',
    src: 'rcsearch.ru — агрегатор магазинов',
  },
  {
    id: 'shop-flydepo',
    cat: 'shop',
    name: 'Fly Depo',
    desc: 'Готовые дроны, комплектующие и аксессуары.',
    url: 'https://flydepo.ru/',
    src: 'flydepo.ru — интернет-магазин',
  },
  {
    id: 'shop-mydrone',
    cat: 'shop',
    name: 'MyDrone',
    desc: 'Дроны, квадрокоптеры и запчасти.',
    url: 'https://mydrone.ru/',
    src: 'mydrone.ru — интернет-магазин',
  },
  {
    id: 'shop-idrone',
    cat: 'shop',
    name: 'iDrone',
    desc: 'Готовые FPV-дроны и комплектующие, в том числе iFlight.',
    url: 'https://idrone.ru/',
    src: 'idrone.ru — интернет-магазин',
  },
  {
    id: 'shop-warpfly',
    cat: 'shop',
    name: 'WARP',
    desc: 'Карбоновые рамы для FPV-дронов и магазин сообщества пилотов.',
    url: 'https://warpfly.ru/',
    src: 'warpfly.ru — магазин и сообщество',
  },
  {
    id: 'shop-beastfpv',
    cat: 'shop',
    name: 'BeastFPV',
    desc: 'Видеопередатчики, антенны и комплектующие FPV, в том числе нестандартных диапазонов — выбирайте разрешённые частоты и мощность.',
    url: 'https://beastfpv.ru/',
    src: 'beastfpv.ru — интернет-магазин',
  },
  {
    id: 'shop-fixfly',
    cat: 'shop',
    name: 'FixFly',
    desc: 'Радиоуправляемые модели и запчасти к ним.',
    url: 'https://fixfly.ru/',
    src: 'fixfly.ru — интернет-магазин',
  },
  {
    id: 'shop-skyindustry',
    cat: 'shop',
    name: 'SkyIndustry',
    desc: 'Продажа квадрокоптеров и обучение операторов БПЛА.',
    url: 'https://skyindustry.ru/',
    src: 'skyindustry.ru — магазин и учебный центр',
  },
  {
    id: 'shop-squidstick',
    cat: 'shop',
    name: 'Squid Stick (ELRS-донгл для симулятора)',
    desc: 'Донгл ExpressLRS, чтобы летать в симуляторе со своей аппаратуры (магазин в США, англ.).',
    url: 'https://elrsquidstick.com/products/elrs-simulator-dongle-squid-stick',
    src: 'elrsquidstick.com — сайт производителя донгла',
  },

  // Гонки и сообщество
  {
    id: 'race-fgdr',
    cat: 'race',
    name: 'Федерация гонок дронов России',
    desc: 'Официальная федерация: соревнования, регламенты, новости дрон-рейсинга.',
    url: 'https://fgdr.ru/',
    src: 'fgdr.ru — Федерация гонок дронов России',
  },
  {
    id: 'race-rdr',
    cat: 'race',
    name: 'Календарь соревнований RDR',
    desc: 'Единый календарь стартов по гонкам дронов и дрон-рейсингу.',
    url: 'https://rdr.aero/calendar',
    src: 'rdr.aero — календарь соревнований',
  },
  {
    id: 'race-rdmfpv',
    cat: 'race',
    name: 'Random FPV',
    desc: 'Дрон-рейсинг: хронометраж RotorHazard и NuclearHazard, гоночные рамы Belka, отчёты о гонках.',
    url: 'https://rdmfpv.ru/',
    src: 'rdmfpv.ru — сообщество дрон-рейсинга',
  },
  {
    id: 'race-vdt',
    cat: 'race',
    name: 'VDT — виртуальные гонки',
    desc: 'Справка и сервисы виртуальных гонок дронов.',
    url: 'https://vdt.tg/',
    src: 'vdt.tg — платформа виртуальных гонок',
  },
  {
    id: 'race-flytribe',
    cat: 'race',
    name: 'Fly Tribe Magazine',
    desc: 'Печатный журнал о FPV из США: фристайл-пилоты, трюки, сборки, свои конкурсы; выпуски платные (англ.).',
    url: 'https://www.flytribemagazine.com/',
    src: 'flytribemagazine.com — журнал сообщества',
  },
];

RC.TOOL_CATS = [
  { id: 'config', name: 'Web-конфигураторы' },
  { id: 'firmware', name: 'Прошивки и десктоп-приложения' },
  { id: 'calc', name: 'Калькуляторы' },
  { id: 'db', name: 'Подбор и базы данных' },
  { id: 'shop', name: 'Магазины и комплектующие' },
  { id: 'race', name: 'Гонки и сообщество' },
  { id: 'weather', name: 'Погода' },
  { id: 'docs', name: 'Документация' },
];
