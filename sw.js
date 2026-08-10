self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && event.request.mode === 'navigate') {
    const pathname = url.pathname;
    const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);

    if (pathname !== '/' && !lastSegment.includes('.')) {
      const cleanPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

      // Every page now lives at the site root, so the hardcoded /services/ and
      // /countries/ slug lists this used to carry are gone: /about-us, /air-ambulance
      // and /air-ambulance-india all resolve the same way.
      const targetUrl = cleanPath + '.html' + url.search;

      event.respondWith(
        fetch(targetUrl).catch(() => fetch(event.request))
      );
    }
  }
});
