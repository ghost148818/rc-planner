// Генератор артбордов дизайн-канваса RC Planner 2.0.
// Запуск: node docs/design/gen.mjs → docs/design/artboards/*.dc.html + canvas.json.
// Артборды — статичный HTML в формате Design Components (дизайн-канвас);
// токены взяты из styles.css (направление А их наследует), направления
// Б и В намеренно уходят от них по одной оси каждое.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'artboards');
mkdirSync(OUT, { recursive: true });

/* ---------- иконки: те же контуры, что в app.js (ICONS) ---------- */
const ic = (inner, sw) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.8}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const I = {
  today: ic('<path d="M3 11l9-8 9 8"></path><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"></path>'),
  fleet: ic('<g transform="translate(-1.2 3.2) scale(0.85)"><path d="M12 3.5v16"></path><path d="M12 8 3.5 10.8v1.7L12 11.6l8.5.9v-1.7L12 8Z"></path><path d="M9.3 19.5h5.4"></path></g><g transform="translate(13.4 0.6) scale(0.44)"><circle cx="5.2" cy="5.2" r="2.7"></circle><circle cx="18.8" cy="5.2" r="2.7"></circle><circle cx="5.2" cy="18.8" r="2.7"></circle><circle cx="18.8" cy="18.8" r="2.7"></circle><path d="m7.1 7.1 9.8 9.8M16.9 7.1 7.1 16.9"></path><circle cx="12" cy="12" r="2.6"></circle></g>'),
  flight: ic('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z"></path>', 1.6),
  packing: ic('<rect x="5" y="7" width="14" height="14.5" rx="3"></rect><path d="M9.5 7V5.5a2.5 2.5 0 0 1 5 0V7"></path><path d="M5 12.5h14"></path><path d="M8.5 21.5v-4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4.5"></path>'),
  journal: ic('<path d="M4 5h5.5a3 3 0 0 1 3 3v12.5a2.3 2.3 0 0 0-2.3-2.3H4Z"></path><path d="M20 5h-5.5a3 3 0 0 0-3 3v12.5a2.3 2.3 0 0 1 2.3-2.3H20Z"></path>'),
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="19" cy="12" r="1.9"></circle></svg>',
  chev: ic('<path d="m9 6 6 6-6 6"></path>', 2),
  down: ic('<path d="m6 9 6 6 6-6"></path>', 2),
  back: ic('<path d="M15 6 9 12l6 6"></path>', 2),
  quad: ic('<circle cx="5.2" cy="5.2" r="2.7"></circle><circle cx="18.8" cy="5.2" r="2.7"></circle><circle cx="5.2" cy="18.8" r="2.7"></circle><circle cx="18.8" cy="18.8" r="2.7"></circle><path d="m7.1 7.1 9.8 9.8M16.9 7.1 7.1 16.9"></path><circle cx="12" cy="12" r="2.6"></circle>'),
  plane: ic('<path d="M12 3.5v16"></path><path d="M12 8 3.5 10.8v1.7L12 11.6l8.5.9v-1.7L12 8Z"></path><path d="M9.3 19.5h5.4"></path>'),
  wing: ic('<path d="M12 4.5 19.8 18c-2.6-1.1-5.2-1.7-7.8-1.7S6.8 16.9 4.2 18L12 4.5Z"></path><circle cx="12" cy="13.4" r="1" fill="currentColor" stroke="none"></circle>'),
  weather: ic('<path d="M9.6 4.6A2 2 0 1 1 11 8H2.5M12.6 19.4A2 2 0 1 0 14 16H2.5M17.3 7.3a2.5 2.5 0 1 1 1.8 4.3H2.5"></path>'),
  sun: ic('<circle cx="12" cy="12" r="4"></circle><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3"></path>'),
  rain: ic('<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"></path><path d="M16 14v5M8 14v5M12 16.5v5"></path>'),
  moon: ic('<path d="M20 12.5A8 8 0 1 1 11.5 4a6.5 6.5 0 0 0 8.5 8.5Z"></path>'),
  tools: ic('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"></path>'),
  sites: ic('<path d="M20 10c0 6-8 11.5-8 11.5S4 16 4 10a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>'),
  batteries: ic('<rect x="2.5" y="7.5" width="17" height="9" rx="2"></rect><path d="M22 10.5v3M6.5 10.75v2.5M10.25 10.75v2.5M14 10.75v2.5"></path>'),
  templates: ic('<rect x="5" y="4" width="14" height="17.5" rx="2"></rect><path d="M9 4.5V3.4A1.4 1.4 0 0 1 10.4 2h3.2A1.4 1.4 0 0 1 15 3.4v1.1"></path><path d="m8.8 13.2 2.2 2.2 4.2-4.2"></path>'),
  backup: ic('<rect x="3" y="4.5" width="18" height="4.5" rx="1"></rect><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"></path><path d="M10 13h4"></path>'),
  privacy: ic('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z"></path>'),
  wrench: ic('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"></path>'),
  check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"></path>', 2.2),
  x: ic('<path d="M6 6l12 12M18 6 6 18"></path>', 2.2),
  minus: ic('<path d="M6 12h12"></path>', 2.2),
  plus: ic('<path d="M12 5v14M5 12h14"></path>', 2),
  bolt: ic('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z"></path>'),
  eye: ic('<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle>'),
  takeoff: ic('<path d="M4 20h16"></path><path d="M12 16V5"></path><path d="m7 10 5-5 5 5"></path>', 2),
  landing: ic('<path d="M4 20h16"></path><path d="M12 4v11"></path><path d="m7 11 5 5 5-5"></path>', 2),
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="12" cy="19" r="1.9"></circle></svg>',
  clock: ic('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>'),
  wind: ic('<path d="M9.6 4.6A2 2 0 1 1 11 8H2.5M12.6 19.4A2 2 0 1 0 14 16H2.5M17.3 7.3a2.5 2.5 0 1 1 1.8 4.3H2.5"></path>'),
  update: ic('<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"></path><path d="M21 3v5h-5"></path>'),
  monitor: ic('<rect x="3" y="4" width="18" height="12.5" rx="2"></rect><path d="M8 20.5h8M12 16.5v4"></path>'),
  print: ic('<path d="M6 9V3.5h12V9"></path><rect x="3" y="9" width="18" height="8" rx="2"></rect><path d="M6 14h12v6.5H6Z"></path>'),
};

/* ---------- общий CSS направления А (токены styles.css + новое) ---------- */
const CSS_A = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .app {
    --bg: #101318; --bg-el: #171b21; --card: #1c2129; --card-2: #232935; --line: #2b323d;
    --text: #e9ecf1; --mut: #9aa3af; --dim: #6b7480; --link: #79b8ff;
    --ok: #39c26d; --warn: #e2b53e; --maint: #e07b39; --bad: #e5484d; --unk: #8a919b; --info: #6aa8ff;
    --ok-bg: rgba(57,194,109,.14); --warn-bg: rgba(226,181,62,.14); --maint-bg: rgba(224,123,57,.16);
    --bad-bg: rgba(229,72,77,.14); --unk-bg: rgba(138,145,155,.16); --info-bg: rgba(106,168,255,.14);
    --on-primary: #08130c; --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    --radius: 12px; --tap: 48px;
    background: var(--bg); color: var(--text);
    font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    position: relative; overflow: hidden;
  }
  .app.light {
    --bg: #f2f3f5; --bg-el: #ffffff; --card: #ffffff; --card-2: #f6f7f9; --line: #dcdfe4;
    --text: #191d23; --mut: #565f6a; --dim: #8a929c; --link: #0b62c4;
    --ok: #178a4c; --warn: #9a7414; --maint: #b55a1a; --bad: #cf3237; --unk: #6b7480; --info: #0b62c4;
    --ok-bg: rgba(23,138,76,.1); --warn-bg: rgba(154,116,20,.1); --maint-bg: rgba(181,90,26,.12);
    --bad-bg: rgba(207,50,55,.1); --unk-bg: rgba(107,116,128,.12); --info-bg: rgba(11,98,196,.1);
    --on-primary: #ffffff;
  }
  a { color: var(--link); text-decoration: none; } a:hover { color: var(--text); }
  svg { display: block; }
  .phone { width: 390px; height: 844px; }
  .views { padding: 12px 16px 96px; height: 100%; overflow: hidden; }
  .tabbar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; background: var(--bg-el); border-top: 1px solid var(--line); padding-bottom: 14px; }
  .tab { flex: 1 1 0; max-width: 128px; min-height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: var(--dim); font-size: 11px; line-height: 1; position: relative; }
  .tab svg { width: 24px; height: 24px; }
  .tab.on { color: var(--text); } .tab.on svg { color: var(--ok); }
  .tab .live { position: absolute; top: 10px; right: calc(50% - 18px); width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 2px var(--bg-el); }
  .head { display: flex; align-items: center; gap: 8px; margin: 6px 0 14px; min-height: 40px; }
  .head h1 { font-size: 21px; line-height: 1.2; font-weight: 700; flex: 1; }
  .head .sub { color: var(--mut); font-size: 13px; margin-top: 2px; font-weight: 400; }
  .back, .iconbtn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; color: var(--mut); border-radius: 50%; flex: none; }
  .back { margin-left: -8px; } .back svg, .iconbtn svg { width: 22px; height: 22px; }
  .h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--mut); margin: 18px 0 8px; display: flex; align-items: center; gap: 8px; }
  .h2 .cnt { color: var(--dim); font-weight: 500; letter-spacing: 0; text-transform: none; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; margin-bottom: 10px; }
  .card.flat { padding: 0; overflow: hidden; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--line); background: var(--card); color: var(--text); }
  .row:last-child { border-bottom: 0; }
  .grow { flex: 1; min-width: 0; }
  .t { display: block; font-size: 16px; } .d { display: block; color: var(--mut); font-size: 13px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chev { color: var(--dim); flex: none; } .chev svg { width: 18px; height: 18px; }
  .row-ic { color: var(--mut); flex: none; display: flex; } .row-ic svg { width: 22px; height: 22px; }
  .thumb { width: 52px; height: 52px; border-radius: 10px; background: var(--card-2); display: flex; align-items: center; justify-content: center; color: var(--dim); flex: none; }
  .thumb svg { width: 26px; height: 26px; } .thumb.lg { width: 72px; height: 72px; border-radius: 14px; } .thumb.lg svg { width: 34px; height: 34px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; letter-spacing: .03em; white-space: nowrap; flex: none; }
  .chip.dot::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .st-ready { color: var(--ok); background: var(--ok-bg); } .st-check { color: var(--warn); background: var(--warn-bg); }
  .st-maint { color: var(--maint); background: var(--maint-bg); } .st-bad { color: var(--bad); background: var(--bad-bg); }
  .st-unk { color: var(--unk); background: var(--unk-bg); } .st-info { color: var(--info); background: var(--info-bg); }
  .pill { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--card-2); font-size: 14px; color: var(--text); white-space: nowrap; }
  .pill svg { width: 16px; height: 16px; color: var(--dim); } .pill.sel { border-color: var(--text); }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--mut); font-size: 11px; vertical-align: 2px; font-weight: 500; }
  .badge.online { color: var(--info); border-color: var(--info); }
  .ico14 { display: inline-flex; } .ico14 svg { width: 14px; height: 14px; }
  .btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: var(--tap); padding: 10px 18px; border-radius: var(--radius); background: var(--card-2); border: 1px solid var(--line); font-size: 16px; font-weight: 600; color: var(--text); }
  .btn svg { width: 20px; height: 20px; }
  .btn-primary { background: var(--ok); border-color: var(--ok); color: var(--on-primary); min-height: 56px; font-size: 17px; }
  .btn-danger { color: var(--bad); border-color: var(--bad); background: var(--bad-bg); }
  .btn-sm { width: auto; min-height: 40px; padding: 6px 14px; font-size: 14px; font-weight: 500; display: inline-flex; }
  .btn-ghost { background: transparent; border-style: dashed; color: var(--mut); font-weight: 500; }
  .btn-line { display: flex; gap: 8px; }
  .seg { display: flex; background: var(--bg-el); border: 1px solid var(--line); border-radius: 10px; padding: 3px; gap: 3px; }
  .seg > div { flex: 1; min-height: 40px; border-radius: 8px; color: var(--mut); font-size: 14px; display: flex; align-items: center; justify-content: center; }
  .seg > div.on { background: var(--card-2); color: var(--text); font-weight: 600; }
  .seg.four > div { font-size: 13px; }
  .ck { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--line); min-height: 56px; background: var(--card); position: relative; }
  .ck:last-child { border-bottom: 0; }
  .ck .t { font-size: 16px; } .ck .d { font-size: 12.5px; white-space: normal; }
  .ck .st { flex: none; width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--dim); background: var(--bg-el); }
  .ck .st svg { width: 22px; height: 22px; }
  .ck.ok .st { color: var(--ok); border-color: var(--ok); background: var(--ok-bg); } .ck.ok .t { color: var(--mut); }
  .ck.fail .st { color: var(--bad); border-color: var(--bad); background: var(--bad-bg); }
  .ck.skip .st { color: var(--unk); background: var(--unk-bg); } .ck.skip .t { color: var(--dim); text-decoration: line-through; }
  .progress { height: 6px; border-radius: 3px; background: var(--card-2); overflow: hidden; }
  .progress i { display: block; height: 100%; background: var(--ok); border-radius: 3px; }
  .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .stat-line { display: flex; gap: 8px; }
  .stat { flex: 1 1 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; min-width: 0; }
  .stat .v { font-family: var(--mono); font-size: 20px; font-weight: 600; white-space: nowrap; } .stat .k { color: var(--mut); font-size: 12px; margin-top: 2px; }
  .banner { display: flex; gap: 10px; align-items: center; border-radius: var(--radius); padding: 10px 14px; margin-bottom: 10px; font-size: 14px; border: 1px solid var(--line); background: var(--card); color: var(--mut); }
  .banner svg { width: 20px; height: 20px; flex: none; }
  .banner.ok { border-color: var(--ok); color: var(--ok); background: var(--ok-bg); } .banner.warn { border-color: var(--warn); color: var(--warn); background: var(--warn-bg); }
  .muted { color: var(--mut); } .dim { color: var(--dim); } .small { font-size: 13px; } .xs { font-size: 12px; }
  .ok { color: var(--ok); } .warn { color: var(--warn); } .bad { color: var(--bad); } .maint { color: var(--maint); } .info { color: var(--info); }
  .strip { display: flex; gap: 2px; height: 14px; border-radius: 4px; overflow: hidden; }
  .strip i { flex: 1 1 0; display: block; background: var(--card-2); }
  .strip .g { background: var(--ok); } .strip .y { background: var(--warn); } .strip .r { background: var(--bad); }
  .strip .n { opacity: .55; } .strip .now { outline: 2px solid var(--text); outline-offset: -2px; border-radius: 3px; }
  .ticks { display: flex; justify-content: space-between; color: var(--dim); font-size: 11px; font-family: var(--mono); margin-top: 4px; }
  .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
  .kv div { display: flex; flex-direction: column; } .kv .k { color: var(--mut); font-size: 12px; } .kv .v { font-size: 15px; }
  .sheet { position: absolute; left: 0; right: 0; bottom: 0; background: var(--bg-el); border-radius: 16px 16px 0 0; padding: 14px 16px 24px; box-shadow: 0 -8px 30px rgba(0,0,0,.4); }
  .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.55); }
  .popover { position: absolute; background: var(--bg-el); border: 1px solid var(--line); border-radius: 12px; padding: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 2px; min-width: 190px; z-index: 5; }
  .popover div { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border-radius: 8px; font-size: 15px; }
  .popover div svg { width: 20px; height: 20px; } .popover div.on { background: var(--card-2); }
  .timer { font-family: var(--mono); font-size: 64px; font-weight: 600; text-align: center; letter-spacing: .02em; font-variant-numeric: tabular-nums; line-height: 1; }
  .ring { width: 220px; height: 220px; margin: 14px auto 8px; position: relative; display: flex; align-items: center; justify-content: center; }
  .ring svg.r { position: absolute; inset: 0; width: 220px; height: 220px; transform: rotate(-90deg); }
  .bar-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
  .bar-row .n { flex: 0 0 88px; color: var(--mut); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { flex: 1 1 auto; height: 8px; border-radius: 4px; background: var(--card-2); overflow: hidden; } .bar-track i { display: block; height: 100%; background: var(--info); border-radius: 4px; }
  .bar-row .v { flex: 0 0 auto; min-width: 70px; text-align: right; font-family: var(--mono); font-size: 13px; }
`;

/* ---------- примитивы направления А ---------- */
const TABS = [['today', 'Сегодня'], ['fleet', 'Флот'], ['flight', 'Полёт'], ['journal', 'Журнал'], ['more', 'Ещё']];
const tabbar = (active, live) => `<div class="tabbar">${TABS.map(([id, l]) =>
  `<div class="tab${id === active ? ' on' : ''}">${I[id]}<span>${l}</span>${live && id === 'flight' ? '<i class="live"></i>' : ''}</div>`).join('')}</div>`;
const head = (title, sub, { back, right } = {}) => `<div class="head">
  ${back ? `<div class="back">${I.back}</div>` : ''}
  <div class="grow"><h1>${title}${sub ? `<span class="sub" style="display: block;">${sub}</span>` : ''}</h1></div>
  ${right || ''}
</div>`;
const chev = `<span class="chev">${I.chev}</span>`;
const row = (main, { icon, thumb, right = chev, style = '' } = {}) => `<div class="row"${style ? ` style="${style}"` : ''}>${thumb ? `<span class="thumb">${I[thumb]}</span>` : ''}${icon ? `<span class="row-ic">${I[icon]}</span>` : ''}<span class="grow">${main}</span>${right}</div>`;
const td = (t, d) => `<span class="t">${t}</span>${d ? `<span class="d">${d}</span>` : ''}`;
const chip = (cls, text) => `<span class="chip dot ${cls}">${text}</span>`;
const strip = (pattern, nowIdx) => `<div class="strip">${pattern.split('').map((c, i) => {
  const cls = c === 'g' ? 'g' : c === 'y' ? 'y' : c === 'r' ? 'r' : c === 'G' ? 'g n' : c === 'R' ? 'r n' : '';
  return `<i class="${cls}${i === nowIdx ? ' now' : ''}"></i>`;
}).join('')}</div><div class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>`;

/* Обёртка артборда: статичный документ, для направления А — переключатель темы. */
const doc = (body, { css = CSS_A, w = 390, h = 844, theme = true, fonts = '' } = {}) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${fonts}
  <style>${css}</style>
</helmet>
${theme
    ? `<div class="app {{theme}}" style="width: ${w}px; height: ${h}px;">${body}</div>`
    : `<div class="app" style="width: ${w}px; height: ${h}px;">${body}</div>`}
</x-dc>
${theme ? `<script data-dc-script data-props='{"theme":{"editor":"enum","options":["dark","light"],"default":"dark","section":"Тема"},"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic {
  renderVals() { return { theme: this.props.theme ?? 'dark' }; }
}
</script>` : ''}
</body>
</html>
`;

const files = {};

/* ============================================================
   A · Main — «Сегодня» на поле (ведущее направление «Пульт»)
============================================================ */
files['Main.dc.html'] = doc(`
<div class="views">
  ${head('Сегодня', 'вторник, 1 сентября · <span class="ok">на поле</span>')}
  <div class="card" style="padding: 16px;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span class="thumb lg">${I.quad}</span>
      <span class="grow">
        <span class="t" style="font-size: 20px; font-weight: 700;">Apex 5″</span>
        <span class="d">FPV квад · <span class="ok">LiPo 6S 1300 #1</span> · заряжен</span>
        <span class="d" style="margin-top: 4px; display: flex; align-items: center; gap: 5px;"><span class="ok ico14">${I.check}</span>Чек-лист пройден в 13:19</span>
      </span>
    </div>
    <div class="btn btn-primary" style="margin-top: 14px;">${I.takeoff}Взлёт</div>
  </div>

  <div class="card" style="padding: 12px 14px;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <span class="row-ic">${I.wind}</span>
      <span class="grow"><span class="t" style="font-size: 15px;">Можно лететь до 15:00 <span class="badge online">online</span></span>
      <span class="d">5 м/с у земли · 7 на 80 м · порывы до 8</span></span>
      ${chev}
    </div>
    ${strip('GGGGGGgggyyygggrrrrrGGGG', 14)}
  </div>

  <div class="h2">Остальные борта <span class="cnt">2</span></div>
  <div class="card flat">
    ${row(td('Mini Talon', 'Самолёт · Li-Ion 6S2P 7000 · заряжен'), { thumb: 'plane', right: `<span class="btn btn-sm">Чек-лист</span>` })}
    ${row(td('<span class="muted">AR Wing Pro</span>', 'открыта работа: замена луча №2'), { thumb: 'wing', right: chip('st-maint', 'Обслуживание') })}
  </div>

  <div class="h2">Обслуживание <span class="cnt">2</span></div>
  <div class="card flat">
    ${row(td('<span class="maint">Пора осмотреть: Apex 5″</span>', '10 из 10 полётов по регламенту'), { icon: 'wrench', right: `<span class="btn btn-sm">Осмотр</span>` })}
    ${row(td('Замена луча №2', 'AR Wing Pro · 17 авг · далее: заказать луч'), { icon: 'wrench' })}
  </div>
</div>
${tabbar('today')}
`);

/* ============================================================
   A · Сегодня «дома» — утро перед выездом
============================================================ */
files['TodayHome.dc.html'] = doc(`
<div class="views">
  ${head('Сегодня', 'вторник, 1 сентября')}
  <div class="card" style="padding: 14px 14px 12px;">
    <div style="display: flex; align-items: baseline; gap: 8px;">
      <span class="t" style="font-size: 18px; font-weight: 700;">Можно лететь 06:00–15:00</span>
    </div>
    <div class="d" style="margin: 2px 0 10px; white-space: normal;">Поле у реки · Apex 5″ держит до 20 м/с · обновлено 20 мин назад <span class="badge online">online</span></div>
    ${strip('GGGGGGgggyyygggrrrrrGGGG', 8)}
    <div style="display: flex; gap: 8px; margin-top: 12px;">
      <span class="pill">${I.quad}Apex 5″ ${I.down}</span>
      <span class="pill">${I.sites}Поле у реки ${I.down}</span>
      <span class="pill" style="margin-left: auto;">${I.update}</span>
    </div>
  </div>

  <div class="h2">Перед выездом</div>
  <div class="card flat">
    ${row(td('Выезд на поле', '9 из 15 собрано'), { icon: 'packing', right: `<span class="btn btn-sm">Продолжить</span>` })}
    ${row(td('Зарядить: LiPo 6S 1300 #2', 'после полёта · 38 циклов'), { icon: 'bolt', right: chip('st-info', 'после полёта') })}
    ${row(td('<span class="maint">Пора осмотреть: Apex 5″</span>', '10 из 10 полётов по регламенту'), { icon: 'wrench', right: `<span class="btn btn-sm">Осмотр</span>` })}
  </div>

  <div class="h2">К вылету <span class="cnt">2 из 3</span></div>
  <div class="card flat">
    ${row(td('Apex 5″', 'FPV квад · LiPo 6S 1300 #1 · заряжен'), { thumb: 'quad', right: chip('st-ready', 'Готов') })}
    ${row(td('Mini Talon', 'Самолёт · Li-Ion 6S2P 7000 · заряжен'), { thumb: 'plane', right: chip('st-ready', 'Готов') })}
  </div>

  <div class="banner">${I.backup}<span class="grow">Резервная копия — 19 дней назад</span><span class="btn btn-sm">Сохранить</span></div>
</div>
${tabbar('today')}
`);

/* ============================================================
   A · Сегодня «разбор» — после полётов
============================================================ */
files['TodayAfter.dc.html'] = doc(`
<div class="views">
  ${head('Сегодня', 'вторник, 1 сентября · <span class="muted">разбор дня</span>')}
  <div class="stat-line">
    <div class="stat"><div class="v">3</div><div class="k">полёта сегодня</div></div>
    <div class="stat"><div class="v">34 мин</div><div class="k">налёт</div></div>
    <div class="stat"><div class="v warn">1</div><div class="k">с проблемой</div></div>
  </div>

  <div class="h2">Разобраться</div>
  <div class="card flat">
    ${row(td('<span class="warn">Полёт #015 · Mini Talon</span>', 'проблема: «просадка по газу на 3-й минуте»'), { icon: 'wrench', right: `<span class="btn btn-sm">Осмотр</span>` })}
    ${row(td('Зарядить 2 аккумулятора', 'LiPo 6S 1300 #1 · Li-Ion 6S2P 7000'), { icon: 'bolt', right: chip('st-info', 'после полёта') })}
    ${row(td('Сохранить резервную копию', '6 полётов с последней копии · 19 дней'), { icon: 'backup', right: `<span class="btn btn-sm">Сохранить</span>` })}
  </div>

  <div class="h2">Полёты сегодня <span class="cnt">3</span></div>
  <div class="card flat">
    ${row(td('<span class="mono">#016</span> Apex 5″', '6 мин · <span class="ok">нормальный</span> · LiPo 6S 1300 #1'), {})}
    ${row(td('<span class="mono">#015</span> Mini Talon', '22 мин · <span class="warn">с проблемой</span> · Li-Ion 6S2P'), {})}
    ${row(td('<span class="mono">#014</span> Apex 5″', '6 мин · <span class="ok">нормальный</span> · LiPo 6S 1300 #1'), {})}
  </div>

  <div class="btn" style="margin-top: 6px;">${I.flight}Ещё один полёт</div>
</div>
${tabbar('today')}
`);

/* ============================================================
   A · Карточка борта с сегментами
============================================================ */
files['Bort.dc.html'] = doc(`
<div class="views">
  ${head('Apex 5″', 'FPV квад · ImpulseRC', { back: true, right: `<div class="iconbtn">${I.dots}</div>` })}
  <div class="card" style="padding: 14px;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span class="thumb lg">${I.quad}</span>
      <span class="grow" style="display: flex; flex-direction: column; gap: 6px;">
        <span style="display: flex; gap: 8px; align-items: center;">${chip('st-ready', 'Готов')}<span class="xs dim">авто · изменить</span></span>
        <span class="pill" style="align-self: flex-start;">${I.batteries}LiPo 6S 1300 #1 · <span class="ok">заряжен</span></span>
      </span>
    </div>
    <div class="stat-line" style="margin-top: 12px;">
      <div class="stat" style="padding: 8px 10px;"><div class="v">10</div><div class="k">полётов</div></div>
      <div class="stat" style="padding: 8px 10px;"><div class="v">1 ч</div><div class="k">налёт</div></div>
      <div class="stat" style="padding: 8px 10px;"><div class="v">сегодня</div><div class="k">последний</div></div>
    </div>
    <div style="display: flex; align-items: center; gap: 10px; margin-top: 12px;">
      <span class="small maint" style="white-space: nowrap;">Пора осмотреть</span>
      <span class="progress" style="flex: 1; display: block;"><i style="width: 100%; background: var(--maint);"></i></span>
      <span class="xs dim mono">10/10</span>
    </div>
    <div class="btn btn-primary" style="margin-top: 12px; min-height: 48px; font-size: 16px;">${I.templates}Чек-лист и полёт</div>
  </div>

  <div class="seg four" style="margin: 4px 0 12px;">
    <div class="on">Обзор</div><div>Компоненты</div><div>Обслуживание</div><div>История</div>
  </div>

  <div class="card">
    <div class="kv">
      <div><span class="k">Вес сухой / взлётный</span><span class="v">520 г / 740 г</span></div>
      <div><span class="k">Ветер · высота</span><span class="v">до 20 м/с · до 60 м</span></div>
    </div>
  </div>

  <div class="h2">Компоненты <span class="cnt">5</span></div>
  <div class="card flat">
    ${row(td('Полётный контроллер', 'Speedybee F405 V4 · <span class="info">Betaflight 4.5.1</span>'), {})}
    ${row(td('VTX', 'Walksnail Avatar V2 · <span class="info">39.44.18</span> · <span class="warn">есть новее</span>'), {})}
    ${row('<span class="t muted">+ Добавить компонент</span>', { right: '' })}
  </div>
</div>
${tabbar('fleet')}
`);

/* ============================================================
   A · Чек-лист
============================================================ */
files['Checklist.dc.html'] = doc(`
<div class="views" style="padding-bottom: 0;">
  ${head('Чек-лист', 'Mini Talon · Самолёт', { back: true, right: `<div class="iconbtn">${I.dots}</div>` })}
  <div style="display: flex; gap: 8px; margin-bottom: 12px; overflow: hidden;">
    <span class="pill">${I.sites}Поле у реки ${I.down}</span>
    <span class="pill">${I.batteries}Li-Ion 6S2P 7000 ${I.down}</span>
  </div>
  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
    <span class="progress" style="flex: 1; display: block;"><i style="width: 30%;"></i></span>
    <span class="small muted mono">3 / 10</span>
  </div>
  <div class="card flat" style="position: relative;">
    <div class="ck ok"><span class="grow"><span class="t">Центровка (CG)</span><span class="d">Центр тяжести в рекомендованном диапазоне</span></span><span class="st">${I.check}</span></div>
    <div class="ck ok"><span class="grow"><span class="t">Рулевые поверхности</span><span class="d">Ходы в правильные стороны, без люфта</span></span><span class="st">${I.check}</span></div>
    <div class="ck fail"><span class="grow"><span class="t">Сервоприводы</span><span class="d">Работают плавно, тяги и качалки закреплены</span></span><span class="st">${I.x}</span></div>
    <div class="ck"><span class="grow"><span class="t">Пропеллер</span><span class="d">Целый, затянут, без биения</span></span><span class="st"></span></div>
    <div class="ck"><span class="grow"><span class="t">Мотор и тяга</span><span class="d">Короткий тест тяги, звук ровный</span></span><span class="st"></span></div>
    <div class="ck"><span class="grow"><span class="t">Аккумулятор</span><span class="d">Заряжен, закреплён, не смещается в полёте</span></span><span class="st"></span></div>
    <div class="ck"><span class="grow"><span class="t">RX и дальность</span><span class="d">Бинд есть, тест дальности по инструкции</span></span><span class="st"></span></div>
    <div class="popover" style="right: 64px; top: 128px;">
      <div>${I.check}<span class="ok">Ок</span></div>
      <div class="on">${I.x}<span class="bad">Проблема</span></div>
      <div>${I.minus}<span class="muted">Пропустить</span></div>
    </div>
  </div>
</div>
<div style="position: absolute; left: 0; right: 0; bottom: 74px; padding: 26px 16px 12px; background: linear-gradient(to top, var(--bg) 86%, transparent);">
  <div class="banner warn" style="margin-bottom: 8px; padding: 8px 12px; font-size: 13px;">${I.x}<span class="grow">Отмечена 1 проблема: сервоприводы</span></div>
  <div class="btn btn-primary">${I.takeoff}Начать полёт</div>
  <div class="btn" style="margin-top: 8px;">Отметить готовым — взлёт позже</div>
</div>
${tabbar('flight')}
`);

/* ============================================================
   A · Полёт: таймер
============================================================ */
files['FlightTimer.dc.html'] = doc(`
<div class="views">
  ${head('В полёте', 'Apex 5″ · полёт <span class="mono">#016</span>', { back: true, right: `<span class="xs muted" style="display: inline-flex; align-items: center; gap: 5px;"><span class="ico14">${I.eye}</span>экран не гаснет</span>` })}
  <div class="ring">
    <svg class="r" viewBox="0 0 220 220"><circle cx="110" cy="110" r="102" fill="none" stroke="var(--card-2)" stroke-width="8"></circle><circle cx="110" cy="110" r="102" fill="none" stroke="var(--ok)" stroke-width="8" stroke-linecap="round" stroke-dasharray="641" stroke-dashoffset="372"></circle></svg>
    <div style="text-align: center;">
      <div class="timer">02:34</div>
      <div class="small muted" style="margin-top: 8px;">обычно <span class="mono">06:10</span></div>
    </div>
  </div>
  <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin: 6px 0 18px;">
    <span class="pill">${I.batteries}LiPo 6S 1300 #1</span>
    <span class="pill">${I.sites}Поле у реки</span>
    <span class="pill">${I.wind}4 м/с</span>
  </div>
  <div class="btn btn-primary" style="min-height: 64px; font-size: 19px;">${I.landing}Посадка</div>
  <div class="btn" style="margin-top: 8px;">Отменить — полёта не было</div>
  <p class="small muted" style="text-align: center; margin-top: 14px;">После посадки таймер остановится, а итог — результат, заметки, проблемы — можно записать позже.</p>

  <div class="h2">Сегодня <span class="cnt">2 полёта · 28 мин</span></div>
  <div class="card flat">
    ${row(td('<span class="mono">#015</span> Mini Talon', '22 мин · <span class="warn">с проблемой</span>'), {})}
    ${row(td('<span class="mono">#014</span> Apex 5″', '6 мин · <span class="ok">нормальный</span>'), {})}
  </div>
</div>
${tabbar('flight', true)}
`);

/* ============================================================
   A · Окна для полётов
============================================================ */
files['Windows.dc.html'] = doc(`
<div class="views">
  ${head('Окна для полётов', '<span class="badge online">online</span> Open-Meteo · 20 мин назад', { back: true, right: `<div class="iconbtn">${I.update}</div>` })}
  <div style="display: flex; gap: 8px; margin-bottom: 10px; overflow: hidden;">
    <span class="pill">${I.quad}Apex 5″ · 20 м/с ${I.down}</span>
    <span class="pill">${I.sites}Поле у реки ${I.down}</span>
  </div>
  <div style="display: flex; gap: 6px; margin-bottom: 12px; overflow: hidden;">
    ${[['Сегодня', 'g', true], ['Ср 2', 'g'], ['Чт 3', 'y'], ['Пт 4', 'r'], ['Сб 5', 'g'], ['Вс 6', 'g'], ['Пн 7', 'y']].map(([l, c, on]) =>
      `<span class="pill${on ? ' sel' : ''}" style="padding: 5px 8px; font-size: 12px; gap: 5px; min-height: 40px;"><i style="width: 7px; height: 7px; border-radius: 50%; background: var(--${c === 'g' ? 'ok' : c === 'y' ? 'warn' : 'bad'});"></i>${l}</span>`).join('')}
  </div>
  <div class="banner ok" style="font-size: 16px;">${I.sun}<span>Можно лететь: <strong>06:00–15:00</strong> и <strong>20:00–24:00</strong></span></div>
  <div class="card" style="padding: 12px 14px;">
    ${strip('GGGGGGgggyyygggrrrrrGGGG', 14)}
    <div class="xs dim" style="margin-top: 6px;">восход 05:41 · закат 19:22 · ночь не запрещает, но снижает порог</div>
  </div>

  <div class="h2">14:00 <span class="cnt">выбранный час</span></div>
  <div class="card">
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
      <span class="row-ic">${I.sun}</span>
      ${chip('st-ready', 'можно')}
      <span class="grow small muted">ясно · 19°</span>
      <span class="small mono">5 м/с</span>
    </div>
    <div class="kv">
      <div><span class="k">У земли</span><span class="v">5 м/с</span></div>
      <div><span class="k">На 80 м</span><span class="v">7 м/с</span></div>
      <div><span class="k">Порывы</span><span class="v">до 8 м/с</span></div>
      <div><span class="k">Осадки</span><span class="v">5 %</span></div>
    </div>
    <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
      <span class="xs muted" style="white-space: nowrap;">от порога</span>
      <span class="progress" style="flex: 1; display: block; height: 8px;"><i style="width: 40%;"></i></span>
      <span class="xs mono">40 %</span>
    </div>
  </div>

  <div class="h2">Обратить внимание</div>
  <div class="card flat">
    ${row(td('15:00–19:00 · дождь', 'осадки 0,4 мм · вероятность 60 %'), { icon: 'rain', right: chip('st-bad', 'не стоит') })}
  </div>
  <div class="btn btn-sm" style="margin-top: 4px;">Windy: карта ветра <span class="badge online">online</span></div>
</div>
${tabbar('today')}
`);

/* ============================================================
   A · Журнал (новая вкладка: полёты + статистика)
============================================================ */
files['Journal.dc.html'] = doc(`
<div class="views">
  ${head('Журнал', '16 полётов · 2 ч 46 мин', { right: `<div class="iconbtn">${I.dots}</div>` })}
  <div class="seg" style="margin-bottom: 10px;"><div class="on">Полёты</div><div>Статистика</div></div>
  <div style="display: flex; gap: 8px; margin-bottom: 4px;">
    <span class="pill sel">Все борта ${I.down}</span>
    <span class="pill">Всё время ${I.down}</span>
  </div>

  <div class="h2" style="margin-top: 12px;">Сегодня <span class="cnt">3 полёта · 34 мин</span></div>
  <div class="card flat">
    ${row(td('<span class="mono">#016</span> Apex 5″', '6 мин · LiPo 6S 1300 #1 · Поле у реки'), { right: chip('st-ready', 'норм') })}
    ${row(td('<span class="mono">#015</span> Mini Talon', '22 мин · Li-Ion 6S2P · Поле у реки'), { right: chip('st-check', 'проблема') })}
    ${row(td('<span class="mono">#014</span> Apex 5″', '6 мин · LiPo 6S 1300 #1 · Поле у реки'), { right: chip('st-ready', 'норм') })}
  </div>
  <div class="h2">31 авг <span class="cnt">1 полёт · 6 мин</span></div>
  <div class="card flat">
    ${row(td('<span class="mono">#013</span> Apex 5″', '6 мин · LiPo 6S 1300 #1 · Склон'), { right: chip('st-ready', 'норм') })}
  </div>
  <div class="h2">29 авг <span class="cnt">2 полёта · 28 мин</span></div>
  <div class="card flat">
    ${row(td('<span class="mono">#012</span> Mini Talon', '22 мин · Li-Ion 6S2P · Поле у реки'), { right: chip('st-ready', 'норм') })}
    ${row(td('<span class="mono">#011</span> AR Wing Pro', '6 мин · LiPo 4S 1500 · Склон'), { right: chip('st-bad', 'краш') })}
  </div>
  <div class="popover" style="right: 16px; top: 56px;">
    <div>${I.print}Печать журнала</div>
    <div>${I.backup}Журнал в CSV</div>
    <div>${I.backup}Статистика в CSV</div>
  </div>
</div>
${tabbar('journal')}
`);

/* ============================================================
   A · Десктоп: рельса + две колонки (container queries)
============================================================ */
files['Desktop.dc.html'] = doc(`
<div style="display: flex; height: 100%;">
  <div style="width: 88px; border-right: 1px solid var(--line); background: var(--bg-el); display: flex; flex-direction: column; align-items: center; padding-top: 14px; gap: 4px;">
    ${TABS.map(([id, l]) => `<div class="tab${id === 'today' ? ' on' : ''}" style="width: 72px; min-height: 64px; border-radius: 12px;${id === 'today' ? ' background: var(--card);' : ''}">${I[id]}<span>${l}</span></div>`).join('')}
  </div>
  <div style="flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 24px; padding: 20px 28px; overflow: hidden;">
    <div style="min-width: 0; max-width: 720px;">
      ${head('Сегодня', 'вторник, 1 сентября · <span class="ok">на поле</span>')}
      <div class="card" style="padding: 16px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <span class="thumb lg">${I.quad}</span>
          <span class="grow">
            <span class="t" style="font-size: 20px; font-weight: 700;">Apex 5″</span>
            <span class="d">FPV квад · <span class="ok">LiPo 6S 1300 #1</span> · заряжен · чек-лист пройден в 13:19</span>
          </span>
          <div class="btn btn-primary" style="width: 200px;">${I.takeoff}Взлёт</div>
        </div>
      </div>
      <div class="h2">Остальные борта <span class="cnt">2</span></div>
      <div class="card flat">
        ${row(td('Mini Talon', 'Самолёт · Li-Ion 6S2P 7000 · заряжен'), { thumb: 'plane', right: `<span class="btn btn-sm">Чек-лист</span>` })}
        ${row(td('<span class="muted">AR Wing Pro</span>', 'открыта работа: замена луча №2'), { thumb: 'wing', right: chip('st-maint', 'Обслуживание') })}
      </div>
      <div class="h2">Обслуживание <span class="cnt">2</span></div>
      <div class="card flat">
        ${row(td('<span class="maint">Пора осмотреть: Apex 5″</span>', '10 из 10 полётов по регламенту'), { icon: 'wrench', right: `<span class="btn btn-sm">Осмотр</span>` })}
        ${row(td('Замена луча №2', 'AR Wing Pro · 17 авг'), { icon: 'wrench' })}
      </div>
    </div>
    <div style="min-width: 0;">
      <div class="h2" style="margin-top: 10px;">Условия <span class="badge online">online</span></div>
      <div class="card">
        <div class="t" style="font-size: 17px; font-weight: 700;">Можно лететь до 15:00</div>
        <div class="d" style="margin-bottom: 10px;">Поле у реки · Apex 5″ до 20 м/с</div>
        ${strip('GGGGGGgggyyygggrrrrrGGGG', 14)}
        <div class="kv" style="margin-top: 12px;">
          <div><span class="k">У земли</span><span class="v">5 м/с</span></div>
          <div><span class="k">На 80 м</span><span class="v">7 м/с</span></div>
          <div><span class="k">Порывы</span><span class="v">до 8</span></div>
          <div><span class="k">Дождь</span><span class="v">с 15:00</span></div>
        </div>
      </div>
      <div class="h2">Сегодня <span class="cnt">2 полёта · 28 мин</span></div>
      <div class="card flat">
        ${row(td('<span class="mono">#015</span> Mini Talon', '22 мин · <span class="warn">с проблемой</span>'), {})}
        ${row(td('<span class="mono">#014</span> Apex 5″', '6 мин · нормальный'), {})}
      </div>
      <div class="banner">${I.backup}<span class="grow">Копия — 19 дней назад</span><span class="btn btn-sm">Сохранить</span></div>
    </div>
  </div>
</div>
`, { w: 1280, h: 800 });

/* ============================================================
   Б · «Бортжурнал» — светлая бумага, Plex, ритм журнала
============================================================ */
const CSS_B = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .app { --bg: #f3f0e8; --card: #fffdf7; --ink: #1f1d18; --mut: #6d685d; --dim: #a09a8c; --line: #e2ddd0;
    --accent: oklch(50% 0.12 250); --ok: oklch(55% 0.13 150); --warn: oklch(62% 0.13 80); --bad: oklch(56% 0.18 25); --maint: oklch(60% 0.14 55);
    background: var(--bg); color: var(--ink); font: 16px/1.45 "IBM Plex Sans", system-ui, sans-serif; position: relative; overflow: hidden; }
  a { color: var(--accent); } a:hover { color: var(--ink); } svg { display: block; }
  .views { padding: 14px 20px 96px; height: 100%; overflow: hidden; }
  .date { font-family: "IBM Plex Serif", Georgia, serif; font-size: 30px; line-height: 1.1; font-weight: 500; letter-spacing: -.01em; }
  .sub { color: var(--mut); font-size: 14px; margin-top: 4px; }
  .rule { border-top: 1px solid var(--line); margin: 16px 0 6px; display: flex; justify-content: space-between; padding-top: 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--mut); font-weight: 500; }
  .card { background: var(--card); border-radius: 8px; box-shadow: 0 1px 0 var(--line), 0 6px 18px rgba(60,50,20,.06); padding: 16px; margin-bottom: 12px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px dashed var(--line); min-height: 56px; }
  .row:last-child { border-bottom: 0; }
  .grow { flex: 1; min-width: 0; } .t { display: block; font-size: 16px; } .d { display: block; color: var(--mut); font-size: 13px; }
  .mono { font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; }
  .num { font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; font-size: 12px; color: var(--dim); width: 44px; flex: none; }
  .btn { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 10px 18px; border-radius: 8px; background: var(--ink); color: #fff; font-weight: 600; font-size: 16px; }
  .btn svg { width: 20px; height: 20px; } .btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--ink); }
  .btn.sm { min-height: 44px; padding: 6px 12px; font-size: 13px; width: auto; display: inline-flex; border-radius: 6px; }
  .tag { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .tag::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .ok { color: var(--ok); } .warn { color: var(--warn); } .bad { color: var(--bad); } .maint { color: var(--maint); } .muted { color: var(--mut); } .accent { color: var(--accent); }
  .strip { display: flex; gap: 2px; height: 10px; } .strip i { flex: 1; background: var(--line); border-radius: 1px; }
  .strip .g { background: var(--ok); } .strip .y { background: var(--warn); } .strip .r { background: var(--bad); } .strip .n { opacity: .45; }
  .ticks { display: flex; justify-content: space-between; color: var(--dim); font-size: 11px; font-family: "IBM Plex Mono", monospace; margin-top: 4px; }
  .thumb { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--mut); flex: none; }
  .thumb svg { width: 22px; height: 22px; }
  .tabbar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; background: var(--card); border-top: 1px solid var(--line); padding-bottom: 14px; }
  .tab { flex: 1; min-height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: var(--dim); font-size: 11px; }
  .tab svg { width: 24px; height: 24px; } .tab.on { color: var(--ink); } .tab.on svg { color: var(--accent); }
`;
const FONTS_B = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@500&family=IBM+Plex+Mono:wght@400;500&display=swap">`;
files['DirectionB.dc.html'] = doc(`
<div class="views">
  <div class="date">Вторник,<br>1 сентября</div>
  <div class="sub">Поле у реки · 4 м/с · ясно до 15:00 <span class="accent">· online</span></div>
  <div class="strip" style="margin-top: 10px;">${'GGGGGGgggyyygggrrrrrGGGG'.split('').map((c) => `<i class="${c === 'g' ? 'g' : c === 'y' ? 'y' : c === 'r' ? 'r' : c === 'G' ? 'g n' : 'r n'}"></i>`).join('')}</div>
  <div class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>

  <div class="rule"><span>К вылету</span><span>2 из 3</span></div>
  <div class="card" style="padding: 12px 16px;">
    <div class="row">
      <span class="thumb">${I.quad}</span>
      <span class="grow"><span class="t" style="font-weight: 600;">Apex 5″</span><span class="d">LiPo 6S 1300 #1 · чек-лист пройден в 13:19</span></span>
      <span class="btn sm">${I.takeoff}Взлёт</span>
    </div>
    <div class="row">
      <span class="thumb">${I.plane}</span>
      <span class="grow"><span class="t">Mini Talon</span><span class="d">Li-Ion 6S2P 7000 · заряжен</span></span>
      <span class="tag ok">готов</span>
    </div>
    <div class="row">
      <span class="thumb">${I.wing}</span>
      <span class="grow"><span class="t muted">AR Wing Pro</span><span class="d">замена луча №2 — не закрыта</span></span>
      <span class="tag maint">ремонт</span>
    </div>
  </div>

  <div class="rule"><span>Журнал</span><span>сегодня · 2 полёта · 28 мин</span></div>
  <div class="card" style="padding: 4px 16px;">
    <div class="row"><span class="num">#015</span><span class="grow"><span class="t">Mini Talon</span><span class="d">22 мин · Li-Ion 6S2P 7000</span></span><span class="tag warn">проблема</span></div>
    <div class="row"><span class="num">#014</span><span class="grow"><span class="t">Apex 5″</span><span class="d">6 мин · LiPo 6S 1300 #1</span></span><span class="tag ok">норм</span></div>
    <div class="row"><span class="num">31 авг</span><span class="grow"><span class="t">Apex 5″</span><span class="d">6 мин · Склон</span></span><span class="tag ok">норм</span></div>
  </div>

  <div class="rule"><span>Обслуживание</span><span>2</span></div>
  <div class="card" style="padding: 4px 16px;">
    <div class="row"><span class="grow"><span class="t maint">Пора осмотреть Apex 5″</span><span class="d">10 из 10 полётов по регламенту</span></span><span class="btn sm ghost">Осмотр</span></div>
  </div>
</div>
<div class="tabbar">${TABS.map(([id, l]) => `<div class="tab${id === 'today' ? ' on' : ''}">${I[id]}<span>${l}</span></div>`).join('')}</div>
`, { css: CSS_B, theme: false, fonts: FONTS_B });

/* ============================================================
   В · «Панель» — крупно, для солнца и перчаток, 4 вкладки + Полёт
============================================================ */
const CSS_C = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .app { --bg: #0b0d11; --card: #171b22; --card-2: #212731; --line: #2c333d; --text: #f2f4f7; --mut: #a3acb8; --dim: #6d7684;
    --acc: oklch(86% 0.21 128); --on-acc: #0f1a05; --ok: #4fd37f; --warn: #f0c04a; --bad: #ff5a5f; --maint: #ff8c42; --info: #79b8ff;
    background: var(--bg); color: var(--text); font: 18px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; position: relative; overflow: hidden; }
  a { color: var(--info); } a:hover { color: var(--text); } svg { display: block; }
  .views { padding: 14px 16px 110px; height: 100%; overflow: hidden; }
  h1 { font-size: 26px; font-weight: 800; letter-spacing: -.01em; } .sub { color: var(--mut); font-size: 15px; margin-top: 2px; }
  .hero { background: var(--card); border-radius: 20px; padding: 18px; margin-top: 14px; border: 1px solid var(--line); }
  .big { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 72px; border-radius: 16px; background: var(--acc); color: var(--on-acc); font-size: 24px; font-weight: 800; letter-spacing: .02em; margin-top: 14px; }
  .big svg { width: 28px; height: 28px; }
  .row { display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--card); }
  .row:last-child { border-bottom: 0; }
  .list { border-radius: 16px; overflow: hidden; border: 1px solid var(--line); margin-top: 10px; }
  .grow { flex: 1; min-width: 0; } .t { display: block; font-size: 18px; font-weight: 600; } .d { display: block; color: var(--mut); font-size: 14px; margin-top: 2px; }
  .h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--mut); margin: 20px 0 0; }
  .thumb { width: 56px; height: 56px; border-radius: 14px; background: var(--card-2); display: flex; align-items: center; justify-content: center; color: var(--mut); flex: none; }
  .thumb svg { width: 30px; height: 30px; } .thumb.xl { width: 72px; height: 72px; border-radius: 18px; } .thumb.xl svg { width: 38px; height: 38px; }
  .chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; font-size: 14px; font-weight: 700; white-space: nowrap; }
  .chip::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
  .ok { color: var(--ok); } .warn { color: var(--warn); } .maint { color: var(--maint); } .mut { color: var(--mut); }
  .chip.ok { background: rgba(79,211,127,.16); } .chip.maint { background: rgba(255,140,66,.16); } .chip.warn { background: rgba(240,192,74,.16); }
  .strip { display: flex; gap: 3px; height: 18px; border-radius: 6px; overflow: hidden; margin-top: 12px; } .strip i { flex: 1; background: var(--card-2); }
  .strip .g { background: var(--ok); } .strip .y { background: var(--warn); } .strip .r { background: var(--bad); } .strip .n { opacity: .5; }
  .tabbar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: flex-end; background: var(--card); border-top: 1px solid var(--line); padding: 0 8px 14px; }
  .tab { flex: 1; min-height: 72px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--dim); font-size: 12px; font-weight: 600; }
  .tab svg { width: 28px; height: 28px; } .tab.on { color: var(--text); } .tab.on svg { color: var(--acc); }
  .fab { flex: 1.2; display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--mut); font-size: 12px; font-weight: 600; margin-bottom: 8px; }
  .fab .b { width: 66px; height: 66px; border-radius: 50%; background: var(--acc); color: var(--on-acc); display: flex; align-items: center; justify-content: center; margin-top: -30px; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
  .fab .b svg { width: 32px; height: 32px; }
`;
files['DirectionC.dc.html'] = doc(`
<div class="views">
  <h1>Сегодня</h1>
  <div class="sub">1 сентября · Поле у реки · <span class="ok">4 м/с, можно до 15:00</span></div>
  <div class="hero">
    <div style="display: flex; align-items: center; gap: 14px;">
      <span class="thumb xl">${I.quad}</span>
      <span class="grow"><span class="t" style="font-size: 22px; font-weight: 800;">Apex 5″</span><span class="d">LiPo 6S 1300 #1 · заряжен</span><span class="d ok">Чек-лист пройден · 13:19</span></span>
    </div>
    <div class="big">${I.takeoff}ВЗЛЁТ</div>
    <div class="strip">${'GGGGGGgggyyygggrrrrrGGGG'.split('').map((c) => `<i class="${c === 'g' ? 'g' : c === 'y' ? 'y' : c === 'r' ? 'r' : c === 'G' ? 'g n' : 'r n'}"></i>`).join('')}</div>
  </div>
  <div class="h2">Ещё к вылету</div>
  <div class="list">
    <div class="row"><span class="thumb">${I.plane}</span><span class="grow"><span class="t">Mini Talon</span><span class="d">Li-Ion 6S2P 7000 · заряжен</span></span><span class="chip ok">Готов</span></div>
    <div class="row"><span class="thumb">${I.wing}</span><span class="grow"><span class="t mut">AR Wing Pro</span><span class="d">замена луча №2</span></span><span class="chip maint">Ремонт</span></div>
  </div>
  <div class="h2">Обслуживание</div>
  <div class="list">
    <div class="row"><span class="grow"><span class="t maint">Пора осмотреть Apex 5″</span><span class="d">10 из 10 полётов по регламенту</span></span></div>
  </div>
</div>
<div class="tabbar">
  <div class="tab on">${I.today}<span>Сегодня</span></div>
  <div class="tab">${I.fleet}<span>Флот</span></div>
  <div class="fab"><span class="b">${I.flight}</span><span>Полёт</span></div>
  <div class="tab">${I.journal}<span>Журнал</span></div>
  <div class="tab">${I.more}<span>Ещё</span></div>
</div>
`, { css: CSS_C, theme: false });

/* ============================================================
   Сейчас — скриншоты текущей версии 1.5 с пометками аудита
============================================================ */
const CSS_CUR = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .app { background: #101318; color: #e9ecf1; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; position: relative; }
  a { color: #79b8ff; } a:hover { color: #fff; }
  .shots { display: flex; gap: 32px; align-items: flex-start; }
  .shot { width: 390px; flex: none; position: relative; }
  .shot img { width: 390px; height: 844px; display: block; border-radius: 18px; border: 1px solid #2b323d; }
  .cap { color: #9aa3af; font-size: 13px; margin: 10px 0 0; }
  .cap b { color: #e9ecf1; }
  .mark { position: absolute; width: 26px; height: 26px; border-radius: 50%; background: #e5484d; color: #fff; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 3px rgba(229,72,77,.35); }
  h1 { font-size: 22px; margin-bottom: 4px; } .lead { color: #9aa3af; margin-bottom: 18px; }
  .notes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 32px; margin-top: 18px; }
  .notes div { font-size: 13px; color: #9aa3af; } .notes b { color: #e9ecf1; display: block; margin-bottom: 4px; }
`;
files['Current.dc.html'] = doc(`
<h1>Сейчас: версия 1.5</h1>
<div class="lead">Скриншоты текущего приложения с тестовыми данными. Красные метки — находки аудита, к которым отвечают экраны направления А.</div>
<div class="shots">
  <div class="shot"><img src="cur-today.png" alt="Сегодня, версия 1.5">
    <span class="mark" style="left: 350px; top: 84px;">1</span><span class="mark" style="left: 292px; top: 292px;">2</span>
    <div class="cap"><b>Сегодня</b> · кнопка «Начать полёт» и «Взлёт» готового борта конкурируют; «Окна» повторяются в «Ещё»</div></div>
  <div class="shot"><img src="cur-model.png" alt="Борт, версия 1.5">
    <span class="mark" style="left: 350px; top: 60px;">3</span><span class="mark" style="left: 350px; top: 706px;">4</span>
    <div class="cap"><b>Борт</b> · статус и АКБ выглядят как поля формы; подсказка показывается всегда; 11 строк компонентов, из них 6 «не указано»</div></div>
  <div class="shot"><img src="cur-checklist.png" alt="Чек-лист, версия 1.5">
    <span class="mark" style="left: 350px; top: 160px;">5</span><span class="mark" style="left: 350px; top: 336px;">6</span>
    <div class="cap"><b>Чек-лист</b> · три состояния по кругу — не видно, что есть «пропуск»; подпись АКБ обрезана; «START FLIGHT» — единственная английская надпись</div></div>
  <div class="shot"><img src="cur-weather.png" alt="Окна для полётов, версия 1.5">
    <span class="mark" style="left: 350px; top: 500px;">7</span>
    <div class="cap"><b>Окна</b> · 24 часа по две строки — пять экранов прокрутки, картина дня не видна целиком</div></div>
</div>
<div class="notes">
  <div><b>1 · Два входа в одно действие</b>Зелёная кнопка ведёт к выбору борта, хотя один уже подготовлен. В А подготовленный борт — герой экрана.</div>
  <div><b>2 · Три разных аффорданса в строке</b>Чип, шеврон и кнопка в одной строке. В А строка отвечает за одно действие.</div>
  <div><b>3 · Карточка на 6 экранов</b>Всё в одной ленте. В А — сегменты «Обзор · Компоненты · Обслуживание · История».</div>
  <div><b>4 · Шум пустых компонентов</b>Показываем только заполненные, пустые — за «+ Добавить».</div>
  <div><b>5 · Цикл из трёх состояний</b>Тап крутит ок → проблема → пропуск, «пропуск» не виден заранее. В А тап по строке — «ок», тап по клетке — выбор из трёх.</div>
  <div><b>6 · Обрезанные подписи</b>Два селекта в ряд режут название АКБ. В А — пилюли на всю ширину строки, длинные списки остаются селектом.</div>
  <div><b>7 · Пять экранов прогноза</b>24 часа по две строки. В А — полоска дня, чипы дней и карточка выбранного часа; список — только для того, на что обратить внимание.</div>
</div>
`, { css: CSS_CUR, w: 1740, h: 1300, theme: false });

/* ============================================================
   Система: токены, компоненты, движение, технологии
============================================================ */
const CSS_SYS = CSS_A + `
  .app { padding: 28px 32px; overflow: visible; }
  h1 { font-size: 24px; margin-bottom: 4px; } .lead { color: var(--mut); margin-bottom: 22px; max-width: 760px; }
  .sec { margin-top: 26px; } .sec > h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--mut); margin-bottom: 12px; }
  .sw { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 10px; }
  .sw div { border-radius: 10px; border: 1px solid var(--line); padding: 8px; font-size: 11px; color: var(--mut); }
  .sw i { display: block; height: 40px; border-radius: 6px; margin-bottom: 6px; } .sw b { display: block; color: var(--text); font-weight: 600; font-size: 12px; }
  .cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 13px; } .tbl th, .tbl td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .tbl th { color: var(--mut); font-weight: 600; font-size: 12px; }
  .demo { background: var(--bg-el); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; align-items: center; justify-content: center; min-height: 120px; position: relative; overflow: hidden; }
  @keyframes tick { 0%, 20% { transform: scale(1); background: var(--bg-el); border-color: var(--line); color: transparent; } 30% { transform: scale(.9); } 40%, 80% { transform: scale(1); background: var(--ok-bg); border-color: var(--ok); color: var(--ok); } 100% { transform: scale(1); background: var(--bg-el); border-color: var(--line); color: transparent; } }
  .d-tick .st { animation: tick 2.6s cubic-bezier(.2,.8,.2,1) infinite; }
  @keyframes sheet { 0%, 15% { transform: translateY(100%); opacity: 0; } 30%, 75% { transform: translateY(0); opacity: 1; } 88%, 100% { transform: translateY(100%); opacity: 0; } }
  .d-sheet .sh { position: absolute; left: 12px; right: 12px; bottom: 0; height: 70px; background: var(--card-2); border: 1px solid var(--line); border-bottom: 0; border-radius: 14px 14px 0 0; animation: sheet 3.2s cubic-bezier(.2,.8,.2,1) infinite; }
  @keyframes page { 0%, 10% { transform: translateX(0); opacity: 1; } 25%, 60% { transform: translateX(-24px); opacity: 0; } 61% { transform: translateX(24px); } 75%, 100% { transform: translateX(0); opacity: 1; } }
  .d-page .pg { width: 140px; height: 80px; border-radius: 10px; background: var(--card-2); border: 1px solid var(--line); animation: page 3s cubic-bezier(.2,.8,.2,1) infinite; }
  @keyframes fill { 0%, 10% { width: 20%; } 45%, 70% { width: 78%; } 100% { width: 20%; } }
  .d-prog .progress { width: 200px; } .d-prog i { animation: fill 3s cubic-bezier(.2,.8,.2,1) infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  .d-timer .colon { animation: pulse 1s ease-in-out infinite; }
`;
files['System.dc.html'] = doc(`
<h1>Система RC Planner 2.0 · направление А «Пульт»</h1>
<div class="lead">Наследует токены styles.css 1.5 без изменений цвета и размеров касания; добавляет полоску условий, пилюли-селекторы, сегменты, поповер, кольцо таймера и спецификацию движения. Переключатель темы наверху артборда показывает светлую палитру.</div>

<div class="sec"><h3>Палитра (переключите тему — значения слева меняются)</h3>
  <div class="sw">
    ${[['bg', 'Фон'], ['bg-el', 'Панель'], ['card', 'Карточка'], ['card-2', 'Карточка 2'], ['line', 'Линия'], ['text', 'Текст'], ['mut', 'Приглушённый'], ['dim', 'Тусклый'], ['ok', 'Готов / ок'], ['warn', 'Проверить'], ['maint', 'Обслуживание'], ['bad', 'Запрет / краш'], ['info', 'Инфо / online'], ['unk', 'Нет данных'], ['link', 'Ссылка']].map(([k, n]) =>
      `<div><i style="background: var(--${k});"></i><b>${n}</b>--${k}</div>`).join('')}
  </div>
</div>

<div class="sec cols">
  <div><h3>Статусы и метки</h3>
    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">${chip('st-ready', 'Готов')}${chip('st-check', 'Проверить')}${chip('st-maint', 'Обслуживание')}${chip('st-bad', 'Полёты запрещены')}${chip('st-unk', 'Нет данных')}${chip('st-info', 'после полёта')}</div>
    <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;"><span class="badge online">online</span><span class="badge">основная</span><span class="pill">${I.sites}Поле у реки ${I.down}</span><span class="pill sel">${I.quad}Apex 5″ ${I.down}</span></div>
    <p class="small muted" style="margin-top: 10px;">«online» — синий (информация), не жёлтый: жёлтый оставлен состоянию «Проверить». Пилюля — выбор одного из немногих; селект остаётся для длинных списков.</p>
  </div>
  <div><h3>Типографика · system-ui</h3>
    <table class="tbl">
      <tr><th>Роль</th><th>Кегль / вес</th><th>Где</th></tr>
      <tr><td>Заголовок экрана</td><td>21 / 700</td><td>.head h1</td></tr>
      <tr><td>Имя героя</td><td>20 / 700</td><td>карточка «К вылету»</td></tr>
      <tr><td>Текст строки</td><td>16 / 400</td><td>.row .t, .ck .t</td></tr>
      <tr><td>Вторичный</td><td>13 / 400 · --mut</td><td>.row .d</td></tr>
      <tr><td>Раздел</td><td>13 / 600 · caps .06em</td><td>.h2</td></tr>
      <tr><td>Число</td><td>20 / 600 · mono tabular</td><td>.stat .v</td></tr>
      <tr><td>Таймер</td><td>64 / 600 · mono</td><td>.timer</td></tr>
      <tr><td>Вкладка</td><td>11 / 400</td><td>.tab</td></tr>
    </table>
  </div>
  <div><h3>Размеры</h3>
    <table class="tbl">
      <tr><th>Токен</th><th>Значение</th></tr>
      <tr><td>Касание</td><td>48 px; строка 56; кнопка героя 56–64</td></tr>
      <tr><td>Радиусы</td><td>12 карточка · 10 поле · 14 крупная плитка · 999 чип</td></tr>
      <tr><td>Отступы</td><td>4 · 8 · 10 · 12 · 14 · 16</td></tr>
      <tr><td>Колонка</td><td>390–640 телефон · рельса 88 + 720 + 360 от 900 px (container query)</td></tr>
      <tr><td>Иконки</td><td>24 вкладка · 22 строка · 20 кнопка · 18 шеврон · штрих 1.8</td></tr>
    </table>
  </div>
</div>

<div class="sec"><h3>Движение · все переходы гаснут при prefers-reduced-motion</h3>
  <div class="cols" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
    <div class="demo d-page"><div class="pg"></div><div class="xs dim" style="position: absolute; bottom: 8px;">экран: 180 мс, сдвиг 24 px + прозрачность</div></div>
    <div class="demo d-sheet"><div class="sh"></div><div class="xs dim" style="position: absolute; top: 8px;">лист: 220 мс снизу, закрытие 160 мс</div></div>
    <div class="demo d-tick"><div class="ck" style="border: 0; background: transparent;"><span class="grow"><span class="t">Пропеллеры</span></span><span class="st">${I.check}</span></div><div class="xs dim" style="position: absolute; bottom: 8px;">отметка: 200 мс, масштаб .9 → 1</div></div>
    <div class="demo d-prog" style="flex-direction: column; gap: 14px;"><div class="progress"><i style="width: 20%;"></i></div><div class="timer d-timer" style="font-size: 32px;">02<span class="colon">:</span>34</div><div class="xs dim">прогресс 240 мс · таймер: мигает только двоеточие</div></div>
  </div>
  <table class="tbl" style="margin-top: 14px;">
    <tr><th>Что</th><th>Как</th><th>Механизм</th><th>Без поддержки</th></tr>
    <tr><td>Переход между экранами</td><td>вперёд — въезд на 24 px и появление 180 мс; назад — обратное; вкладки — только прозрачность 140 мс</td><td>View Transitions API: <span class="mono">document.startViewTransition(render)</span>, старый/новый снимок — сам браузер; работает с полной пересборкой innerHTML</td><td>мгновенно, как сейчас</td></tr>
    <tr><td>Точечное обновление (render(true))</td><td>меняется только затронутая строка: перекрашивание 140 мс</td><td><span class="mono">view-transition-name</span> на строках по id; остальное не анимируется</td><td>мгновенно</td></tr>
    <tr><td>Модальный лист</td><td>снизу вверх 220 мс, фон затемняется; закрытие 160 мс</td><td><span class="mono">@starting-style</span> + <span class="mono">transition-behavior: allow-discrete</span> на dialog и ::backdrop</td><td>появляется сразу</td></tr>
    <tr><td>Отметка чек-листа</td><td>клетка сжимается до .9 и возвращается, галочка прорисовывается 180 мс</td><td>CSS transition на transform/background; путь — stroke-dashoffset</td><td>цвет меняется сразу</td></tr>
    <tr><td>Прогресс и полоска условий</td><td>ширина 240 мс</td><td>transition: width</td><td>—</td></tr>
    <tr><td>Кнопка</td><td>нажатие: масштаб .98, 80 мс</td><td>:active + transition</td><td>—</td></tr>
    <tr><td>Таймер</td><td>мигает двоеточие 1 с; после посадки число гаснет в --mut</td><td>keyframes на одном span</td><td>—</td></tr>
    <tr><td>Сворачиваемый блок</td><td>раскрытие по высоте 200 мс</td><td><span class="mono">interpolate-size: allow-keywords</span> для details</td><td>раскрывается сразу</td></tr>
  </table>
  <p class="small muted" style="margin-top: 8px;">Кривая везде одна: cubic-bezier(.2, .8, .2, 1). Ничего не крутится и не подпрыгивает: движение подсказывает направление и подтверждает касание, не развлекает.</p>
</div>

<div class="sec"><h3>Технологии без зависимостей · всё прогрессивное улучшение</h3>
  <table class="tbl">
    <tr><th>Что</th><th>Зачем</th><th>Поддержка</th></tr>
    <tr><td>View Transitions (same-document)</td><td>анимация экранов при полной пересборке разметки</td><td>Chrome 111+, Safari 18+, Firefox 144+ (сверить перед кодом)</td></tr>
    <tr><td>@starting-style, transition-behavior</td><td>вход и выход dialog/popover без JS</td><td>Chrome 117+, Safari 17.5+, Firefox 129+</td></tr>
    <tr><td>popover</td><td>меню действий, выбор состояния пункта — без модалки</td><td>Chrome 114+, Safari 17+, Firefox 125+</td></tr>
    <tr><td>Container queries</td><td>рельса и две колонки на планшете и десктопе</td><td>все современные</td></tr>
    <tr><td>CSS nesting, :has(), color-mix(), oklch()</td><td>короче стили, тона статусов из одного цвета</td><td>все современные</td></tr>
    <tr><td>Wake Lock API</td><td>экран не гаснет, пока идёт полёт</td><td>Chrome 84+, Safari 16.4+; Firefox — нет (индикатор прячется)</td></tr>
    <tr><td>Web Share API (files)</td><td>резервная копия через системный лист «Поделиться» на iPhone (Файлы, AirDrop)</td><td>Safari, Chrome Android; иначе — обычная загрузка</td></tr>
    <tr><td>content-visibility: auto</td><td>длинные списки (каталог, журнал) рисуются лениво</td><td>Chrome, Safari 18, Firefox 125</td></tr>
    <tr><td>field-sizing: content</td><td>textarea растёт по тексту</td><td>Chrome 123+; иначе фиксированная высота</td></tr>
  </table>
</div>
`, { css: CSS_SYS, w: 1240, h: 2060 });

/* ---------- запись ---------- */
for (const [name, html] of Object.entries(files)) writeFileSync(join(OUT, name), html);

const G = 90;
const canvas = {
  pages: [
    { id: 'page-1', name: 'Направления' },
    { id: 'page-2', name: 'Экраны А' },
    { id: 'page-3', name: 'Система' },
  ],
  artboards: [
    { file: 'Main.dc.html', title: 'А · Пульт — Сегодня на поле', x: 0, y: 0, w: 390, h: 844, page: 'page-1' },
    { file: 'DirectionB.dc.html', title: 'Б · Бортжурнал', x: 390 + G, y: 0, w: 390, h: 844, page: 'page-1' },
    { file: 'DirectionC.dc.html', title: 'В · Панель', x: 2 * (390 + G), y: 0, w: 390, h: 844, page: 'page-1' },
    { file: 'Current.dc.html', title: 'Сейчас · 1.5 с пометками аудита', x: 0, y: 844 + 160, w: 1740, h: 1300, page: 'page-1' },

    { file: 'TodayHome.dc.html', title: 'Сегодня · дома, утром', x: 0, y: 0, w: 390, h: 844, page: 'page-2' },
    { file: 'TodayAfter.dc.html', title: 'Сегодня · разбор после полётов', x: 390 + G, y: 0, w: 390, h: 844, page: 'page-2' },
    { file: 'Windows.dc.html', title: 'Окна для полётов', x: 2 * (390 + G), y: 0, w: 390, h: 844, page: 'page-2' },
    { file: 'Journal.dc.html', title: 'Журнал (новая вкладка)', x: 3 * (390 + G), y: 0, w: 390, h: 844, page: 'page-2' },
    { file: 'Bort.dc.html', title: 'Борт с сегментами', x: 0, y: 844 + 140, w: 390, h: 844, page: 'page-2' },
    { file: 'Checklist.dc.html', title: 'Чек-лист', x: 390 + G, y: 844 + 140, w: 390, h: 844, page: 'page-2' },
    { file: 'FlightTimer.dc.html', title: 'В полёте', x: 2 * (390 + G), y: 844 + 140, w: 390, h: 844, page: 'page-2' },
    { file: 'Desktop.dc.html', title: 'Десктоп ≥ 900 px', x: 0, y: 2 * (844 + 140), w: 1280, h: 800, page: 'page-2' },

    { file: 'System.dc.html', title: 'Токены · компоненты · движение · технологии', x: 0, y: 0, w: 1240, h: 2060, page: 'page-3' },
  ],
  annotations: [
    { id: 'brief', x: 0, y: -230, w: 390, page: 'page-1', text: 'А · «Пульт» — ведущее направление.\nЭволюция нынешнего тёмного графита: те же токены, но экран «Сегодня» знает, где вы (дома / на поле / после полётов), подготовленный борт — герой, погода — полоска дня, «Журнал» — вкладка вместо «Сборов».\nЦена: «Сборы» уходят с панели (карточка на «Сегодня» и пункт в «Ещё»).' },
    { id: 'dir-b', x: 390 + G, y: -230, w: 390, page: 'page-1', text: 'Б · «Бортжурнал» — спокойная бумага.\nСветлая тема по умолчанию, шрифт IBM Plex (Sans + Serif + Mono), ритм линованного журнала, один акцент вместо зелёной кнопки.\nЦена: шрифт придётся встраивать в сборку (~120 КБ) или мириться с системным; в сумерках на поле светлый экран слепит.' },
    { id: 'dir-c', x: 2 * (390 + G), y: -230, w: 390, page: 'page-1', text: 'В · «Панель» — для солнца и перчаток.\nБаза 18 px, касание 64, четыре вкладки и круглая кнопка «Полёт» в панели, лаймовый акцент с максимальным контрастом.\nЦена: меньше информации на экран, каталог инструментов и длинные списки станут вдвое длиннее.' },
    { id: 'how', x: 3 * (390 + G), y: 0, w: 330, page: 'page-1', text: 'Как читать канвас\n1 · Страница «Направления» — выбрать одно из трёх (или смешать: например, А с крупной кнопкой из В).\n2 · Страница «Экраны А» — как ведущее направление проходит по всем состояниям дня.\n3 · Страница «Система» — токены, движение и технологии для реализации.\nПереключатель темы над артбордами А показывает светлую палитру.' },
    { id: 'states', x: 3 * (390 + G), y: 844 + 140, w: 390, page: 'page-2', text: 'Состояния «Сегодня»\nдома → на поле → в полёте → разбор.\nЭкран не спрашивает, он показывает следующее действие: собраться и зарядить; взлететь; посадка; осмотр, зарядка, копия.\nПравило: одна главная кнопка на экран, остальное — строки.' },
    { id: 'future', x: 3 * (390 + G), y: 844 + 140 + 340, w: 390, page: 'page-2', text: 'Заложено под ROADMAP\n· версия прошивки у компонента и метка «есть новее» (firmware-журнал);\n· пункт «Помощник · online» в «Ещё» с тем же паттерном согласия, что у погоды;\n· строка «Резервная копия N дней назад» — место для будущей синхронизации через файл;\n· рельса и правая колонка на десктопе — под работу на верстаке.' },
  ],
  launch: { view: 'canvas', page: 'page-1' },
};
writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2) + '\n');
console.log('artboards:', Object.keys(files).length, '→', OUT);
