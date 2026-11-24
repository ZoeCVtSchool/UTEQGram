
// ================================================
// UTEQGram - FEED
// IndexedDB + Supabase + Offline
// ================================================

const STATIC_IMAGE = './src/images/main-image.jpg';

let isSyncing = false;
let objectUrls = [];


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

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif'
      ];

      if (!allowedTypes.includes(imageFile.type)) {
        showToast('Selecciona una imagen JPG, PNG, WEBP o GIF.');
        return;
      }

      if (imageFile.size > 5 * 1024 * 1024) {
        showToast('La imagen no debe superar los 5 MB.');
        return;
      }

      if (postButton) {
        postButton.disabled = true;
      }

      try {

        // Guardar primero en IndexedDB.
        await saveLocalPost({
          title: title,
          location: location,
          imageBlob: imageFile
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
          await syncPendingPosts();
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
  // RECUPERAR CONEXIÓN
  // ==============================================

  window.addEventListener('online', async function () {

    console.log('[UTEQGram] Evento online detectado. Iniciando sincronización...');

    showToast('Conexión recuperada. Sincronizando...');

    await syncPendingPosts();

    await loadRemotePosts();

    await loadLocalPosts();

    console.log('[UTEQGram] Sincronización completada.');

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

  return 'post-' +
    Date.now() +
    '-' +
    Math.random().toString(16).slice(2);

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

  // Siempre mostrar publicaciones pendientes de sincronización
  if (syncPosts && Array.isArray(syncPosts)) {
    syncPosts.forEach(function (post) {
      postsMap.set(post.id, post);
    });
  }

  // Con internet: mostrar también publicaciones ya sincronizadas
  if (navigator.onLine && posts && Array.isArray(posts)) {
    posts.forEach(function (post) {
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

function renderPosts(posts) {

  const sharedMoments = document.getElementById(
    'shared-moments'
  );

  if (!sharedMoments) return;

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

  if (!navigator.onLine || isSyncing) {
    return;
  }

  if (typeof supabaseClient === 'undefined') {

    console.error(
      '[UTEQGram] No se encontró supabaseClient.'
    );

    return;

  }

  isSyncing = true;

  try {

    const syncPosts = await readAllData('sync-posts');

    if (!syncPosts || !Array.isArray(syncPosts)) {
      console.log('[UTEQGram] No hay publicaciones para sincronizar.');
      return;
    }

    console.log('[UTEQGram] Publicaciones pendientes de sincronización:', syncPosts.length);


    for (const post of syncPosts) {

      if (!navigator.onLine) {
        break;
      }

      try {

        await uploadPostToSupabase(post);

      } catch (error) {

        console.error(
          '[UTEQGram] Error sincronizando:',
          post.id,
          error
        );

      }

    }

    await loadLocalPosts();

  } catch (error) {

    console.error(
      '[UTEQGram] Error en sincronización:',
      error
    );

  } finally {

    isSyncing = false;

  }

}


// ================================================
// EXTENSIÓN DE IMAGEN
// ================================================

function getImageExtension(mimeType) {

  const extensions = {

    'image/jpeg': 'jpg',

    'image/png': 'png',

    'image/webp': 'webp',

    'image/gif': 'gif'

  };

  return extensions[mimeType] || 'jpg';

}


// ================================================
// SUBIR PUBLICACIÓN A SUPABASE
// ================================================

async function uploadPostToSupabase(post) {

  let imageUrl = post.image_url;


  // SUBIR IMAGEN A SUPABASE STORAGE

  if (!imageUrl) {

    if (!(post.imageBlob instanceof Blob)) {

      throw new Error('No se encontró la imagen.');

    }

    const extension = getImageExtension(
      post.imageBlob.type
    );

    const imagePath = post.imagePath ||
      'posts/' + post.id + '.' + extension;

    // Reintentar hasta 3 veces con delay de 2 segundos
    let uploadError = null;
    for (let i = 0; i < 3; i++) {
      try {
        const result = await supabaseClient.storage
          .from('post-images')
          .upload(
            imagePath,
            post.imageBlob,
            {
              contentType: post.imageBlob.type,
              upsert: true
            }
          );

        if (result.error) {
          uploadError = result.error;
          console.log(`[UTEQGram] Intento ${i + 1} fallido. Reintentando en 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          uploadError = null;
          break;
        }
      } catch (error) {
        uploadError = error;
        console.log(`[UTEQGram] Intento ${i + 1} fallido. Reintentando en 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (uploadError) {
      throw uploadError;
    }


    const { data: publicUrlData } =
      supabaseClient.storage
        .from('post-images')
        .getPublicUrl(imagePath);


    imageUrl = publicUrlData.publicUrl;

    post.imagePath = imagePath;

    post.image_url = imageUrl;

    await writeData('posts', post);

  }


  // GUARDAR EN TABLA POSTS DE SUPABASE

  const postToSave = {

    id: post.id,

    title: post.title,

    location: post.location,

    image_url: imageUrl,

    created_at: post.created_at

  };


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
    throw databaseError;
  }


  // MARCAR COMO PUBLICADO Y MOVER DE SYNC-POSTS A POSTS

  post.status = 'sent';

  await writeData('posts', post);

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


    for (const remotePost of data) {

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

    }


    await loadLocalPosts();

  } catch (error) {

    console.error(
      '[UTEQGram] Error descargando publicaciones:',
      error
    );

  }

}


// ================================================
// INICIAR PUBLICACIONES
// ================================================

async function initializePosts() {

  try {

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
