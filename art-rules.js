// Правила для картинок assets/art — общие для сборки (build.js падает на
// нарушении) и для проверки npm run art:check (test/art.js).
//
// SVG проверяется БЕЛЫМ списком, а не поиском «плохого»: в приложении
// SVG идёт маской (CSS mask-image) и скрипты там не исполняются, но тот же
// файл, открытый по прямому адресу /art/….svg, — полноценный документ на
// origin приложения, без CSP. Скрипт в нём прочитал бы IndexedDB. Чёрный
// список обходится префиксом пространства имён (<s:script>), сущностями
// (&#106;avascript:) и escape-последовательностями CSS — проверено ревью
// безопасности 3.0. Поэтому: только известные элементы и атрибуты,
// никаких сущностей, обратных слэшей, стилей, ссылок и анимаций.
'use strict';

const SLOT_FILE_RE = /^[a-z0-9][\w-]*\.(webp|svg)$/;

const SVG_ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line',
  'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask']);
const SVG_ATTRS = new Set(['xmlns', 'viewBox', 'version', 'width', 'height', 'preserveAspectRatio',
  'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
  'opacity', 'vector-effect', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'fx', 'fy', 'points', 'transform', 'id', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits',
  'gradientTransform', 'clip-path', 'mask', 'maskUnits', 'clipPathUnits']);

// Список нарушений SVG (пустой — файл чистый). slot — запись slots.json.
function svgProblems(src, slot) {
  const out = [];
  let s = String(src);
  s = s.replace(/^\uFEFF/, '').replace(/^\s*<\?xml[^?<>]*\?>/, '');
  s = s.replace(/<!--(?:(?!--)[\s\S])*-->/g, '');
  if (/<!|<\?/.test(s)) out.push('DOCTYPE, CDATA или инструкции обработки');
  if (/&/.test(s)) out.push('сущности (&…;)');
  if (/\\/.test(s)) out.push('обратный слэш');
  if (!/^\s*<svg[\s>]/.test(s)) out.push('файл не начинается с <svg>');
  const tagRe = /<\/?\s*([^\s/>]+)([^>]*)>/g;
  let m, last = 0, depth0 = 0;
  while ((m = tagRe.exec(s))) {
    const text = s.slice(last, m.index);
    if (text.trim()) out.push('текст вне тегов: «' + text.trim().slice(0, 20) + '»');
    last = tagRe.lastIndex;
    const name = m[1];
    if (!SVG_ELEMENTS.has(name)) { out.push('элемент <' + name + '>'); continue; }
    if (m[0].startsWith('</')) continue;
    let rest = m[2].replace(/\/\s*$/, '');
    const attrRe = /\s*([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a, consumed = '';
    while ((a = attrRe.exec(rest))) {
      consumed += a[0];
      const an = a[1], av = a[2] != null ? a[2] : a[3];
      if (!SVG_ATTRS.has(an)) { out.push('атрибут ' + an + ' у <' + name + '>'); continue; }
      if (an === 'xmlns') {
        if (av !== 'http://www.w3.org/2000/svg') out.push('xmlns не SVG');
        continue;
      }
      if (/url\(/i.test(av) && !/^url\(#[\w-]+\)$/.test(av.trim())) out.push('url() не на свой #id в ' + an);
      if (/:/.test(av)) out.push('двоеточие в значении ' + an);
    }
    if (rest.replace(/\s+/g, '') !== consumed.replace(/\s+/g, '')) out.push('атрибут без кавычек или мусор в <' + name + '>');
    if (name === 'svg') depth0++;
  }
  if (s.slice(last).trim()) out.push('текст после последнего тега');
  if (depth0 !== 1) out.push('корневой <svg> должен быть ровно один');
  if (slot && !new RegExp('viewBox\\s*=\\s*["\']0 0 ' + slot.w + ' ' + slot.h + '["\']').test(s)) {
    out.push('viewBox не «0 0 ' + slot.w + ' ' + slot.h + '»');
  }
  return [...new Set(out)];
}

module.exports = { SLOT_FILE_RE, svgProblems };
