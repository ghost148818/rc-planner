// Общие мелочи для тестов: assert, статический сервер, запуск браузера.
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

let failures = 0;

function ok(cond, msg) {
  if (cond) {
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.error('  ✗ ' + msg);
  }
}

function finish(name) {
  if (failures) {
    console.error(name + ': ПРОВАЛЕНО (' + failures + ')');
    process.exit(1);
  }
  console.log(name + ': все проверки зелёные');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Статический сервер каталога. Возвращает { url, close }.
function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(dir, p);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: 'http://127.0.0.1:' + server.address().port + '/',
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// Страница с копилкой ошибок консоли.
async function newPage(browser, opts) {
  const context = await browser.newContext(opts || {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  return { context, page, errors };
}

module.exports = { ok, finish, serve, newPage };
