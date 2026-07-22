const CACHE_NAME = "dku-med26-app-v51";
const APP_SHELL = [
  "./",
  "./index.html",
  "./about.html",
  "./notices.html",
  "./calendar.html",
  "./gallery.html",
  "./members.html",
  "./minigame.html",
  "./notify.html",
  "./settings.html",
  "./login.html",
  "./manifest.webmanifest",
  "./assets/css/style.css",
  "./assets/css/resource-room.css",
  "./assets/img/logo-26.png",
  "./assets/img/icon-180.png",
  "./assets/img/icon-192.png",
  "./assets/img/icon-512.png",
  "./assets/img/icon-maskable-512.png",
  "./assets/js/main.js",
  "./assets/js/session-hint.js",
  "./assets/js/password-visibility.js",
  "./assets/js/firebase-init.js",
  "./assets/js/attachments.js",
  "./assets/js/teams.js",
  "./assets/js/game-member-picker.js",
  "./assets/js/home-polls.js",
  "./assets/js/home-submissions.js",
  "./assets/js/admin-backup.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
