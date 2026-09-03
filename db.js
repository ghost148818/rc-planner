// RC Planner — обёртка над IndexedDB. Без зависимостей.
// Все пользовательские данные живут здесь, на устройстве. Никакой сети.
(function () {
  'use strict';

  var DB_NAME = 'rcplanner';
  var DB_VERSION = 1;

  // store -> индексы. У всех store keyPath 'id'.
  var STORES = {
    aircraft: [],
    batteries: [],
    sites: [],
    sessions: ['aircraftId'],
    templates: [],
    runs: ['aircraftId'],
    packing: [],
    maintenance: ['aircraftId'],
    configs: ['aircraftId'],
    settings: [],
  };

  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = req.result;
        Object.keys(STORES).forEach(function (name) {
          var store;
          if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: 'id' });
          } else {
            store = req.transaction.objectStore(name);
          }
          STORES[name].forEach(function (idx) {
            if (!store.indexNames.contains(idx)) store.createIndex(idx, idx);
          });
        });
        // Миграции следующих версий добавлять здесь по e.oldVersion.
        void e;
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('База данных заблокирована другой вкладкой')); };
    });
    return dbPromise;
  }

  function reqp(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function withStore(name, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(name, mode);
        var out = fn(tx.objectStore(name));
        tx.oncomplete = function () { resolve(out && out.__value !== undefined ? out.__value : out); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Транзакция прервана')); };
      });
    });
  }

  var DB = {
    get: function (store, id) {
      return open().then(function (db) {
        return reqp(db.transaction(store).objectStore(store).get(id));
      });
    },
    all: function (store) {
      return open().then(function (db) {
        return reqp(db.transaction(store).objectStore(store).getAll());
      });
    },
    byIndex: function (store, index, value) {
      return open().then(function (db) {
        return reqp(db.transaction(store).objectStore(store).index(index).getAll(value));
      });
    },
    put: function (store, obj) {
      return withStore(store, 'readwrite', function (s) { s.put(obj); }).then(function () { return obj; });
    },
    // Пачка записей одной транзакцией — для закрепления нормализованной
    // копии после импорта (по одной put() на запись — сотни транзакций).
    putAll: function (store, list) {
      return withStore(store, 'readwrite', function (s) { list.forEach(function (obj) { s.put(obj); }); });
    },
    del: function (store, id) {
      return withStore(store, 'readwrite', function (s) { s.delete(id); });
    },
    clear: function (store) {
      return withStore(store, 'readwrite', function (s) { s.clear(); });
    },
    // Полный снимок всех store — для загрузки состояния и экспорта.
    snapshot: function () {
      var names = Object.keys(STORES);
      return Promise.all(names.map(function (n) { return DB.all(n); })).then(function (lists) {
        var out = {};
        names.forEach(function (n, i) { out[n] = lists[i]; });
        return out;
      });
    },
    // Импорт: replace — стереть и записать; merge — дописать поверх по id.
    restore: function (data, mode) {
      var names = Object.keys(STORES).filter(function (n) { return Array.isArray(data[n]); });
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(names, 'readwrite');
          names.forEach(function (n) {
            var s = tx.objectStore(n);
            if (mode === 'replace') s.clear();
            data[n].forEach(function (obj) {
              if (obj && obj.id !== undefined) s.put(obj);
            });
          });
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    },
    wipe: function () {
      var names = Object.keys(STORES);
      return Promise.all(names.map(function (n) { return DB.clear(n); }));
    },
    stores: Object.keys(STORES),
  };

  window.RCDB = DB;
})();
