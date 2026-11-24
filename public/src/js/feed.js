
// ================================================
// UTEQGram - FEED
// IndexedDB + Supabase + Offline
// ================================================

const STATIC_IMAGE = './src/images/main-image.jpg';
const MAX_IMAGE_DIMENSION = 1280;
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const AUTO_REFRESH_INTERVAL_MS = 5000;

let isSyncing = false;
let activeSyncPromise = null;
let pendingResync = false;
let activeRemoteLoadPromise = null;
let realtimeChannel = null;
let autoRefreshTimer = null;
let lastRenderedSignature = null;
let objectUrls = [];


// ================================================
// FUNCIÓN GLOBAL DE SINCRONIZACIÓN MANUAL
// ================================================

function closeDrawerIfOpen() {
  const layout = document.querySelector('.mdl-layout');
  const drawer = document.querySelector('.mdl-layout__drawer');

  if (
    layout &&
    layout.MaterialLayout &&
    drawer &&
    drawer.classList.contains('is-visible')
  ) {
    layout.MaterialLayout.toggleDrawer();
  }
}

window.manualSync = async function () {
  console.log('[UTEQGram] Sincronización manual iniciada');
  closeDrawerIfOpen();

  if (!navigator.onLine) {
    showToast('Sin conexión. Se sincronizará al reconectar.');
    return;
  }

  showToast('Sincronizando...');

  try {
    const syncResult = await syncPendingPosts();
    await loadRemotePosts();
    await loadLocalPosts();

    if (syncResult && syncResult.failedCount > 0) {
      const errorMsg = syncResult.lastError && syncResult.lastError.message
        ? syncResult.lastError.message
        : 'revisa tu conexión';
      showToast('No se pudo sincronizar: ' + errorMsg);
      return;
    }

    if (syncResult && syncResult.syncedCount > 0) {
      showToast('Sincronización completada (' + syncResult.syncedCount + ').');
    } else {
      showToast('Todo está sincronizado.');
    }
  } catch (error) {
    console.error('[UTEQGram] Error en sincronización manual:', error);
    showToast('Error al sincronizar: ' + error.message);
  }
};


// ================================================
// INICIALIZAR FEED
// ================================================

function initializeFeed() {

  const shareImageButton = document.getElementById(
    'share-image-button'
  );

  const createPostArea = document.getElementById(
    'create-post'
  );

  const closeCreatePostModalButton = document.getElementById(
    'close-create-post-modal-btn'
  );

  const form = document.getElementById(
    'create-post-form'
  );

  const titleInput = document.getElementById('title');
  const locationInput = document.getElementById('location');
  const imageInput = document.getElementById('image');
  const postButton = document.getElementById('post-btn');


  // ==============================================
  // ABRIR FORMULARIO
  // ==============================================

  if (shareImageButton && createPostArea) {

    shareImageButton.addEventListener('click', function (event) {

      event.preventDefault();

      createPostArea.style.display = 'block';

      console.log(
        '[UTEQGram] Formulario de publicación abierto'
      );

      if (window.componentHandler) {
        componentHandler.upgradeDom();
      }

    });

  } else {

    console.error(
      '[UTEQGram] No se encontró el botón + o el formulario.'
    );

  }


  // ==============================================
  // CERRAR FORMULARIO
  // ==============================================

  if (closeCreatePostModalButton && createPostArea) {

    closeCreatePostModalButton.addEventListener('click', function (event) {

      event.preventDefault();

      createPostArea.style.display = 'none';

    });

  }


  // ==============================================
  // CREAR PUBLICACIÓN
  // ==============================================

  if (form) {

    form.addEventListener('submit', async function (event) {

      event.preventDefault();

      const title = titleInput.value.trim();
      const location = locationInput.value.trim();
      const imageFile = imageInput.files[0];

      if (!title || !location) {
        showToast('Completa el título y la ubicación.');
        return;
      }

      if (!imageFile) {
        showToast('Selecciona una imagen.');
        return;
      }

      if (!isSupportedImageFile(imageFile)) {
        showToast('Selecciona un archivo de imagen válido.');
        return;
      }

      if (postButton) {
        postButton.disabled = true;
      }

      try {

        // Convertir/comprimir la imagen a un Blob en memoria para evitar
        // fallos de IndexedDB en móviles y fotos mayores a 5 MB.
        const preparedBlob = await prepareImageBlob(imageFile);

        if (preparedBlob.size > MAX_UPLOAD_SIZE_BYTES) {
          showToast('La imagen supera los 5 MB incluso tras comprimir.');
          return;
        }

        // Guardar primero en IndexedDB.
        await saveLocalPost({
          title: title,
          location: location,
          imageBlob: preparedBlob
        });

        form.reset();

        createPostArea.style.display = 'none';

        showToast(
          navigator.onLine
            ? 'Publicación guardada. Sincronizando...'
            : 'Publicación guardada sin conexión.'
        );

        // Sincronizar si hay conexión.
        if (navigator.onLine) {
          const syncResult = await syncPendingPosts();
          if (syncResult && syncResult.failedCount > 0) {
            const msg = syncResult.lastError && syncResult.lastError.message
              ? syncResult.lastError.message
              : 'quedó pendiente para reintentar';
            showToast('Guardada localmente, pero falló la subida: ' + msg);
          } else if (syncResult && syncResult.syncedCount > 0) {
            showToast('Publicación sincronizada.');
          }
        }

      } catch (error) {

        console.error(
          '[UTEQGram] Error al crear publicación:',
          error
        );

        showToast('No se pudo guardar la publicación.');

      } finally {

        if (postButton) {
          postButton.disabled = false;
        }

      }

    });

  } else {

    console.error(
      '[UTEQGram] No se encontró el formulario create-post-form.'
    );

  }


  // ==============================================
  // RECUPERAR CONEXIÓN O VOLVER A LA APP EN MÓVIL
  // ==============================================

  async function triggerForegroundSync(reason) {
    if (!navigator.onLine) {
      return;
    }

    console.log('[UTEQGram] Sincronización disparada por:', reason);

    const syncResult = await syncPendingPosts();
    await loadRemotePosts();
    await loadLocalPosts();

    if (syncResult && syncResult.syncedCount > 0) {
      showToast('Publicaciones sincronizadas (' + syncResult.syncedCount + ').');
    }
  }

  window.addEventListener('online', function () {
    showToast('Conexión recuperada. Sincronizando...');
    triggerForegroundSync('online');
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      triggerForegroundSync('visibilitychange');
    }
  });


  // ==============================================
  // PÉRDIDA DE CONEXIÓN
  // ==============================================

  window.addEventListener('offline', function () {

    showToast('Sin conexión. Las publicaciones se guardarán localmente.');

    loadLocalPosts();

  });


  // ==============================================
  // INICIAR PUBLICACIONES
  // ==============================================

  initializePosts();

}


// ================================================
// NOTIFICACIONES
// ================================================

function showToast(message) {

  const toast = document.getElementById(
    'confirmation-toast'
  );

  if (!toast) {
    console.log(message);
    return;
  }

  if (toast.MaterialSnackbar) {

    toast.MaterialSnackbar.showSnackbar({
      message: message
    });

  } else {

    const text = toast.querySelector('.mdl-snackbar__text');

    if (text) {
      text.textContent = message;
    } else {
      toast.textContent = message;
    }

  }

}


// ================================================
// GENERAR ID
// ================================================

function createPostId() {

  if (
    window.crypto &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID();
  }

  if (
    window.crypto &&
    typeof window.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');

    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20)
    );
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

}


// ================================================
// PROCESAR IMAGEN MÓVIL PARA INDEXEDDB
// ================================================

function isSupportedImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) {
    return true;
  }
  return /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/i.test(file.name || '');
}

function loadImageFromFile(file) {
  return new Promise(function (resolve, reject) {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = function () {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = function (err) {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(function (resolve) {
    canvas.toBlob(function (blob) {
      resolve(blob);
    }, type, quality);
  });
}

async function prepareImageBlob(file) {
  if (file.type === 'image/gif' && file.size <= MAX_UPLOAD_SIZE_BYTES) {
    const buffer = await file.arrayBuffer();
    return new Blob([buffer], { type: 'image/gif' });
  }

  try {
    const img = await loadImageFromFile(file);
    const maxSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const scale = maxSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxSide : 1;

    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      let compressedBlob = await canvasToBlob(canvas, 'image/jpeg', 0.82);

      if (compressedBlob && compressedBlob.size > MAX_UPLOAD_SIZE_BYTES) {
        compressedBlob = await canvasToBlob(canvas, 'image/jpeg', 0.65);
      }

      if (compressedBlob && compressedBlob.size > 0) {
        return compressedBlob;
      }
    }
  } catch (error) {
    console.warn('[UTEQGram] No se pudo recomprimir imagen, usando bytes originales:', error);
  }

  const fallbackBuffer = await file.arrayBuffer();
  return new Blob([fallbackBuffer], { type: file.type || 'image/jpeg' });
}


// ================================================
// GUARDAR PUBLICACIÓN LOCALMENTE
// ================================================

async function saveLocalPost(postData) {

  const newPost = {

    id: createPostId(),

    title: postData.title,

    location: postData.location,

    imageBlob: postData.imageBlob,

    imagePath: null,

    image_url: null,

    created_at: new Date().toISOString(),

    status: 'pending'

  };

  console.log('[UTEQGram] Guardando publicación en sync-posts:', newPost);

  await writeData('sync-posts', newPost);

  console.log('[UTEQGram] Publicación guardada en sync-posts');

  await loadLocalPosts();

  return newPost;

}


// ================================================
// CARGAR PUBLICACIONES LOCALES
// ================================================

async function loadLocalPosts() {

  const sharedMoments = document.getElementById(
    'shared-moments'
  );

  if (!sharedMoments) return;

  const posts = await readAllData('posts');

  const syncPosts = await readAllData('sync-posts');

  console.log('[UTEQGram] Posts locales (sincronizados):', posts);
  console.log('[UTEQGram] Sync posts (pendientes):', syncPosts);
  console.log('[UTEQGram] Estado de conexión:', navigator.onLine);

  const postsMap = new Map();

  // Mostrar publicaciones cacheadas localmente
  if (posts && Array.isArray(posts)) {
    posts.forEach(function (post) {
      postsMap.set(post.id, post);
    });
  }

  // Las publicaciones pendientes tienen prioridad sobre la caché sincronizada
  if (syncPosts && Array.isArray(syncPosts)) {
    syncPosts.forEach(function (post) {
      postsMap.set(post.id, post);
    });
  }

  const allPosts = Array.from(postsMap.values());

  console.log('[UTEQGram] Total posts a renderizar:', allPosts.length);

  allPosts.sort(function (a, b) {

    return new Date(b.created_at || b.createdAt || 0) -
      new Date(a.created_at || a.createdAt || 0);

  });

  renderPosts(allPosts);

}


// ================================================
// MOSTRAR PUBLICACIONES
// ================================================

function buildPostsSignature(posts) {
  return posts.map(function (post) {
    return [
      post.id,
      post.status || '',
      post.title || '',
      post.location || '',
      post.image_url || '',
      post.imageBlob instanceof Blob ? 'blob' : 'noblob'
    ].join('|');
  }).join(';;');
}

function renderPosts(posts) {

  const sharedMoments = document.getElementById(
    'shared-moments'
  );

  if (!sharedMoments) return;

  const signature = buildPostsSignature(posts);
  if (signature === lastRenderedSignature) {
    return;
  }
  lastRenderedSignature = signature;

  console.log('[UTEQGram] Renderizando', posts.length, 'publicaciones');

  objectUrls.forEach(function (url) {
    URL.revokeObjectURL(url);
  });

  objectUrls = [];

  sharedMoments.innerHTML = '';

  posts.forEach(function (post) {

    const card = createPostCard(post);

    sharedMoments.appendChild(card);

  });

  if (window.componentHandler) {
    componentHandler.upgradeDom();
  }

}


// ================================================
// CREAR TARJETA
// ================================================

function createPostCard(post) {

  const card = document.createElement('div');

  card.className =
    'shared-moment-card mdl-card mdl-shadow--2dp';


  const cardTitle = document.createElement('div');

  cardTitle.className = 'mdl-card__title';


  let imageUrl =
    post.image_url ||
    post.image ||
    STATIC_IMAGE;


  if (post.imageBlob instanceof Blob) {

    imageUrl = URL.createObjectURL(post.imageBlob);

    objectUrls.push(imageUrl);

  }


  cardTitle.style.backgroundImage =
    'url("' + imageUrl + '")';

  cardTitle.style.backgroundSize = 'cover';

  cardTitle.style.backgroundPosition = 'center';


  const title = document.createElement('h2');

  title.className = 'mdl-card__title-text';

  title.textContent = post.title || 'Sin título';

  cardTitle.appendChild(title);


  const supportingText = document.createElement('div');

  supportingText.className =
    'mdl-card__supporting-text';


  const location = document.createElement('p');

  location.textContent =
    post.location || 'Sin ubicación';


  const status = document.createElement('p');

  status.textContent =
    post.status === 'pending'
      ? '⏳ Pendiente de sincronizar'
      : '✓ Publicado';


  supportingText.appendChild(location);

  supportingText.appendChild(status);


  card.appendChild(cardTitle);

  card.appendChild(supportingText);

  return card;

}


// ================================================
// SINCRONIZAR PUBLICACIONES
// ================================================

async function syncPendingPosts() {

  if (!navigator.onLine) {
    console.log('[UTEQGram] No se puede sincronizar sin conexión.');
    return { syncedCount: 0, failedCount: 0, lastError: null };
  }

  if (typeof supabaseClient === 'undefined') {

    console.error(
      '[UTEQGram] No se encontró supabaseClient.'
    );

    return {
      syncedCount: 0,
      failedCount: 1,
      lastError: new Error('Cliente de Supabase no disponible.')
    };

  }

  if (isSyncing && activeSyncPromise) {
    pendingResync = true;
    return activeSyncPromise;
  }

  isSyncing = true;

  activeSyncPromise = (async function () {
    let syncedCount = 0;
    let failedCount = 0;
    let lastError = null;

    try {

      do {
        pendingResync = false;

        const syncPosts = await readAllData('sync-posts');

        if (!syncPosts || !Array.isArray(syncPosts) || syncPosts.length === 0) {
          console.log('[UTEQGram] No hay publicaciones para sincronizar.');
          break;
        }

        console.log('[UTEQGram] Publicaciones pendientes de sincronización:', syncPosts.length);

        for (const post of syncPosts) {

          if (!navigator.onLine) {
            console.log('[UTEQGram] Conexión perdida durante sincronización.');
            break;
          }

          try {

            console.log('[UTEQGram] Sincronizando publicación:', post.id);
            await uploadPostToSupabase(post);
            syncedCount += 1;
            console.log('[UTEQGram] Publicación sincronizada exitosamente:', post.id);

          } catch (error) {

            failedCount += 1;
            lastError = error;
            console.error(
              '[UTEQGram] Error sincronizando:',
              post.id,
              error
            );

          }

        }

      } while (pendingResync && navigator.onLine);

      await loadLocalPosts();

    } catch (error) {

      failedCount += 1;
      lastError = error;
      console.error(
        '[UTEQGram] Error en sincronización:',
        error
      );

    } finally {

      isSyncing = false;
      activeSyncPromise = null;

    }

    return {
      syncedCount: syncedCount,
      failedCount: failedCount,
      lastError: lastError
    };
  })();

  return activeSyncPromise;

}


// ================================================
// EXTENSIÓN DE IMAGEN
// ================================================

function getImageExtension(mimeType) {

  const extensions = {

    'image/jpeg': 'jpg',

    'image/png': 'png',

    'image/webp': 'webp',

    'image/gif': 'gif',

    'image/heic': 'heic',

    'image/heif': 'heif'

  };

  return extensions[mimeType] || 'jpg';

}


// ================================================
// SUBIR PUBLICACIÓN A SUPABASE
// ================================================

async function uploadPostToSupabase(post) {

  console.log('[UTEQGram] uploadPostToSupabase iniciado para:', post.id);

  let imageUrl = post.image_url;


  // SUBIR IMAGEN A SUPABASE STORAGE

  if (!imageUrl) {

    console.log('[UTEQGram] Subiendo imagen a Supabase Storage...');

    if (!(post.imageBlob instanceof Blob) || post.imageBlob.size === 0) {

      throw new Error('No se encontró una imagen válida para subir.');

    }

    const contentType = post.imageBlob.type || 'image/jpeg';

    const extension = getImageExtension(contentType);

    const imagePath = post.imagePath ||
      'posts/' + post.id + '.' + extension;

    console.log('[UTEQGram] Ruta de imagen:', imagePath);

    // Reintentar hasta 3 veces con delay de 2 segundos
    let uploadError = null;
    for (let i = 0; i < 3; i++) {
      if (!navigator.onLine) {
        uploadError = new Error('Sin conexión durante la subida.');
        break;
      }

      try {
        const result = await supabaseClient.storage
          .from('post-images')
          .upload(
            imagePath,
            post.imageBlob,
            {
              contentType: contentType,
              upsert: true
            }
          );

        if (result.error) {
          uploadError = result.error;
          console.log('[UTEQGram] Intento ' + (i + 1) + ' fallido. Error:', result.error);
          await new Promise(function (resolve) { setTimeout(resolve, 2000); });
        } else {
          uploadError = null;
          console.log('[UTEQGram] Imagen subida exitosamente');
          break;
        }
      } catch (error) {
        uploadError = error;
        console.log('[UTEQGram] Intento ' + (i + 1) + ' fallido. Error:', error);
        await new Promise(function (resolve) { setTimeout(resolve, 2000); });
      }
    }

    if (uploadError) {
      console.error('[UTEQGram] Error al subir imagen:', uploadError);
      throw uploadError;
    }


    const { data: publicUrlData } =
      supabaseClient.storage
        .from('post-images')
        .getPublicUrl(imagePath);


    imageUrl = publicUrlData.publicUrl;

    post.imagePath = imagePath;

    post.image_url = imageUrl;

    // Guardar image_url en sync-posts para evitar re-subir la imagen si falla la BD
    await writeData('sync-posts', post);

  }


  // GUARDAR EN TABLA POSTS DE SUPABASE

  console.log('[UTEQGram] Guardando en tabla posts de Supabase...');

  const postToSave = {

    id: post.id,

    title: post.title,

    location: post.location,

    image_url: imageUrl,

    created_at: post.created_at

  };

  console.log('[UTEQGram] Datos a guardar:', postToSave);


  const { error: databaseError } =
    await supabaseClient
      .from('posts')
      .upsert(
        postToSave,
        {
          onConflict: 'id'
        }
      );


  if (databaseError) {
    console.error('[UTEQGram] Error en base de datos:', databaseError);
    throw databaseError;
  }

  console.log('[UTEQGram] Guardado en Supabase exitosamente');


  // MARCAR COMO PUBLICADO Y MOVER DE SYNC-POSTS A POSTS

  await writeData('posts', {
    id: post.id,
    title: post.title,
    location: post.location,
    image_url: imageUrl,
    imagePath: post.imagePath || null,
    imageBlob: null,
    created_at: post.created_at,
    status: 'sent'
  });

  await deleteItemFromData('sync-posts', post.id);

  console.log(
    '[UTEQGram] Publicación sincronizada y movida a posts:',
    post.id
  );

}


// ================================================
// DESCARGAR PUBLICACIONES DE SUPABASE
// ================================================

async function loadRemotePosts() {

  if (!navigator.onLine) {
    return;
  }

  if (typeof supabaseClient === 'undefined') {
    return;
  }

  if (activeRemoteLoadPromise) {
    return activeRemoteLoadPromise;
  }

  activeRemoteLoadPromise = (async function () {
    try {

      const { data, error } =
        await supabaseClient
          .from('posts')
          .select('*')
          .order('created_at', {
            ascending: false
          })
          .limit(50);


      if (error) {
        throw error;
      }

      let hasChanges = false;

      for (const remotePost of data) {

        const pendingPost = await getData(
          'sync-posts',
          remotePost.id
        );

        if (pendingPost) {
          continue;
        }

        const localPost = await getData(
          'posts',
          remotePost.id
        );

        if (
          localPost &&
          localPost.status === 'pending'
        ) {
          continue;
        }

        const isSameAsLocal =
          localPost &&
          localPost.title === remotePost.title &&
          localPost.location === remotePost.location &&
          localPost.image_url === remotePost.image_url &&
          localPost.created_at === remotePost.created_at &&
          localPost.status === 'sent';

        if (isSameAsLocal) {
          continue;
        }

        await writeData('posts', {

          id: remotePost.id,

          title: remotePost.title,

          location: remotePost.location,

          image_url: remotePost.image_url,

          imagePath: null,

          imageBlob: null,

          created_at: remotePost.created_at,

          status: 'sent'

        });

        hasChanges = true;

      }

      if (hasChanges || lastRenderedSignature === null) {
        await loadLocalPosts();
      }

    } catch (error) {

      console.error(
        '[UTEQGram] Error descargando publicaciones:',
        error
      );

    } finally {

      activeRemoteLoadPromise = null;

    }
  })();

  return activeRemoteLoadPromise;

}


// ================================================
// ACTUALIZACIÓN EN VIVO (REALTIME + POLLING)
// ================================================

function subscribeToRemotePosts() {

  if (
    typeof supabaseClient === 'undefined' ||
    typeof supabaseClient.channel !== 'function' ||
    realtimeChannel
  ) {
    return;
  }

  realtimeChannel = supabaseClient
    .channel('posts-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'posts'
      },
      function (payload) {
        console.log('[UTEQGram] Cambio en tiempo real detectado:', payload.eventType);
        loadRemotePosts();
      }
    )
    .subscribe(function (status) {
      console.log('[UTEQGram] Estado de Realtime:', status);
    });

}

function startAutoRefresh() {

  if (autoRefreshTimer) {
    return;
  }

  autoRefreshTimer = setInterval(function () {
    if (navigator.onLine && document.visibilityState === 'visible') {
      loadRemotePosts();
    }
  }, AUTO_REFRESH_INTERVAL_MS);

}


// ================================================
// INICIAR PUBLICACIONES
// ================================================

async function initializePosts() {

  try {

    subscribeToRemotePosts();

    startAutoRefresh();

    await loadLocalPosts();

    if (navigator.onLine) {

      await syncPendingPosts();

      await loadRemotePosts();

    }

  } catch (error) {

    console.error(
      '[UTEQGram] Error inicializando publicaciones:',
      error
    );

  }

}


// ================================================
// INICIAR FEED CUANDO EL DOM ESTÉ LISTO
// ================================================

if (document.readyState === 'loading') {

  document.addEventListener(
    'DOMContentLoaded',
    initializeFeed
  );

} else {

  initializeFeed();

}
