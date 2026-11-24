if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then(function (registration) {
        return registration.update().then(function () {
          return registration;
        });
      })
      .then(function (registration) {
        console.log('Service Worker registrado:', registration.scope);
      })
      .catch(function (error) {
        console.error('Error al registrar Service Worker:', error);
      });
  });
}