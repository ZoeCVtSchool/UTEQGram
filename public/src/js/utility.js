
const dbPromise = idb.open('post-store', 3, function (db) {
  if (!db.objectStoreNames.contains('posts')) {
    db.createObjectStore('posts', { keyPath: 'id' });
    console.log('[IndexedDB] Creado objectStore: posts');
  }

  if (!db.objectStoreNames.contains('sync-posts')) {
    db.createObjectStore('sync-posts', { keyPath: 'id' });
    console.log('[IndexedDB] Creado objectStore: sync-posts');
  }
});

function withTransaction(storeName, mode, callback) {
  return dbPromise.then(function (db) {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    const result = callback(store, tx);

    return tx.complete.then(function () {
      return result;
    });
  });
}

function writeData(storeName, data) {
  return withTransaction(storeName, 'readwrite', function (store) {
    return store.put(data);
  });
}

function readAllData(storeName) {
  return withTransaction(storeName, 'readonly', function (store) {
    return store.getAll();
  }).then(function (data) {
    return data || [];
  });
}

function clearAllData(storeName) {
  return withTransaction(storeName, 'readwrite', function (store) {
    store.clear();
  });
}

function deleteItemFromData(storeName, id) {
  return withTransaction(storeName, 'readwrite', function (store) {
    store.delete(id);
  });
}

function getData(storeName, id) {
  return withTransaction(storeName, 'readonly', function (store) {
    return store.get(id);
  });
}
