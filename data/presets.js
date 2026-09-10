// Готовые платформы: заводские ТТХ + типовая FPV-комплектация.
// Вес — СУХОЙ, без аккумулятора: АКБ выбирается отдельно, её вес
// прибавляется в расчёте окон (модель + АКБ + габариты).
// Всё редактируется в карточке модели после создания.
// Источники ТТХ: страницы производителей и магазинов (X-UAV/Banggood,
// SonicModell/RMRC, HEEWING). Проверено: 2026-08-24; Talon 1718 — 2026-09-10.
window.RC = window.RC || {};

RC.AIRCRAFT_PRESETS = [
  {
    id: 'freestyle-5',
    name: '5″ фристайл-квад',
    type: 'quad',
    manufacturer: 'самосбор (классика)',
    wingspan: 225,
    weight: 520,
    maxWind: 20,
    maxAlt: 60,
    desc: 'Классический 5-дюймовый фристайл · ~520 г без АКБ (~770 г с LiPo 6S 1450)',
    notes: 'Классическая фристайл-сборка: рама 5″ (диагональ ~225 мм), моторы 2207, LiPo 6S 1100–1300 мА·ч. Сухой вес ~520 г; с LiPo 6S ~770 г (без экшн-камеры). Комплектация типовая — замените на свою.',
    components: {
      motor: { name: '4 × 2207 1750–1950KV (типовые)', notes: 'замените на фактические' },
      esc: { name: '4-в-1 45–60 А (типовой)', notes: '' },
      prop: { name: '5.1×3 трёхлопастные', notes: '' },
      battery: { name: 'LiPo 6S 1100–1300 мА·ч', notes: 'вес НЕ входит в сухой — заведите АКБ отдельно' },
    },
  },
  {
    id: 'longrange-10',
    name: '10″ долголёт',
    type: 'quad',
    manufacturer: 'самосбор (классика)',
    wingspan: 400,
    weight: 900,
    maxWind: 16,
    maxAlt: 150,
    desc: 'Классический 10-дюймовый long-range · ~0.9 кг без АКБ (~2.2 кг с LiPo 6S 8000)',
    notes: 'Классический дальнолётный квад: рама 10″ (диагональ ~400 мм), моторы 2806.5–3115 низкий KV, Li-Ion 6S 3000–4000 мА·ч. Сухой вес ~0.9 кг; с большой LiPo/Li-Ion — 1.6–2.2 кг. Комплектация типовая — замените на свою.',
    components: {
      motor: { name: '4 × 2806.5 1300KV (типовые)', notes: 'или 3115 ~900KV' },
      esc: { name: '4-в-1 45–60 А (типовой)', notes: '' },
      prop: { name: '10×5 двухлопастные', notes: '' },
      battery: { name: 'Li-Ion 6S 3000–4000 мА·ч (18650/21700)', notes: 'вес НЕ входит в сухой — заведите АКБ отдельно' },
    },
  },
  {
    id: 'talon-1718',
    name: 'X-UAV Talon (1718)',
    type: 'plane',
    manufacturer: 'X-UAV',
    wingspan: 1718,
    weight: 1800,
    maxWind: 18,
    maxAlt: 150,
    desc: 'EPO V-tail 1718 мм · дальний FPV и аэрофото · взлётный 3–4 кг',
    notes: 'Заводские ТТХ: размах 1718 мм, длина 1100 мм, полётный вес 2500–3000 г, взлётный 3–4 кг, запуск с рук, посадка на брюхо. Комплектация — типовая сборка владельца парка; трубка Пито и ПАК на ней не стоят. Указан сухой вес сборки (без АКБ) — уточните по своей.',
    components: {
      motor: { name: 'MotorXV 720KV', notes: '' },
      esc: { name: 'ESC 120 А', notes: '' },
      prop: { name: '12×12E', notes: '' },
      servo: { name: '4 × MG (V-хвост + элероны)', notes: 'замените на фактические' },
      vtx: { name: 'Walksnail 4 Вт', notes: '' },
      camera: { name: 'Walksnail (дневная)', notes: '' },
      rx: { name: 'ELRS 915 МГц', notes: '' },
      pitot: { name: 'нет', notes: 'на этой сборке не стоит — впишите модель, если поставите' },
      pak: { name: 'нет', notes: 'на этой сборке не стоит — впишите модель, если поставите' },
      battery: { name: 'Li-Ion 6S3P 17500 мА·ч', notes: 'вес НЕ входит в сухой — заведите АКБ отдельно' },
    },
  },
  {
    id: 'skywalker-x8',
    name: 'Skywalker X8 (FPV)',
    type: 'wing',
    manufacturer: 'Skywalker / SonicModell',
    wingspan: 2122,
    weight: 2400,
    maxWind: 20,
    maxAlt: 150,
    desc: 'Крыло 2122 мм EPO · полётный вес 2.5–3.5 кг · до 2 кг нагрузки',
    notes: 'Заводские ТТХ: размах 2122 мм, площадь 80 дм², полётный вес 2500–3500 г, нагрузка до 2 кг, крейсер 65–70 км/ч, ЦТ 430–440 мм от носа, запуск с рук или с катапульты. Указан сухой вес типовой FPV-сборки (без АКБ).',
    components: {
      motor: { name: '3536–3542 ~900KV (типовой)', notes: 'замените на фактический' },
      esc: { name: '60–80 А (типовой)', notes: '' },
      prop: { name: '11×7 — 12×6', notes: '' },
      servo: { name: '2 × MG (элевоны)', notes: '' },
      battery: { name: 'Li-Ion 4S–6S 10000+ мА·ч', notes: 'вес НЕ входит в сухой — заведите АКБ отдельно' },
    },
  },
  {
    id: 'heewing-t2-cruza',
    name: 'HeeWing T2 Cruza',
    type: 'plane',
    manufacturer: 'HEEWING',
    wingspan: 1200,
    weight: 1300,
    maxWind: 18,
    maxAlt: 150,
    desc: 'EPP твин 1200 мм · модульный · моторы и сервы в комплекте (PNP)',
    notes: 'Заводские ТТХ: размах 1200 мм, длина 1110 мм, два мотора 3110, ESC 6S BLS, сервы M32 metal digital, пропеллеры 1060 стеклопластик, полностью модульная разборка. Указан сухой вес типовой сборки (без АКБ); у VTOL-версии взлётный 2–3.5 кг.',
    components: {
      motor: { name: '2 × HEEWING 3110 (штатные)', notes: '' },
      esc: { name: 'HEEWING 6S BLS (штатные)', notes: '' },
      prop: { name: '2 × 1060 стеклопластик (штатные)', notes: '' },
      servo: { name: 'HEEWING M32 metal digital (штатные)', notes: '' },
      battery: { name: 'Li-Ion 4S–6S (до ~10000 мА·ч)', notes: 'вес НЕ входит в сухой — заведите АКБ отдельно' },
    },
  },
];

// Готовые аккумуляторы (типовые сборки владельца парка).
// Вес — оценка реального пакета с проводами; правится вручную.
RC.BATTERY_PRESETS = [
  { id: 'liion-6s3p-17500', label: 'Li-Ion 6S3P 17500', chem: 'Li-Ion', cells: 6, p: 3, capacity: 17500, weight: 1400, desc: 'Дальнолёт: Talon и класс 3–4 кг' },
  { id: 'liion-6s2p-10000', label: 'Li-Ion 6S2P 10000', chem: 'Li-Ion', cells: 6, p: 2, capacity: 10000, weight: 950, desc: '21700 ×12 · T2 Cruza и середина' },
  { id: 'lipo-6s-8000', label: 'LiPo 6S 8000', chem: 'LiPo', cells: 6, p: 1, capacity: 8000, weight: 1250, desc: '10″ long-range мультиротор' },
  { id: 'lipo-6s-1450', label: 'LiPo 6S 1450', chem: 'LiPo', cells: 6, p: 1, capacity: 1450, weight: 250, desc: '5″ фристайл' },
];
