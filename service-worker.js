importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyAHyZBoqjbBYF6x1KC9oDYhXPLNU7CjspM",
  authDomain: "dankook-re.firebaseapp.com",
  projectId: "dankook-re",
  storageBucket: "dankook-re.firebasestorage.app",
  messagingSenderId: "761179895525",
  appId: "1:761179895525:web:731134fe5ac0fa1724460c",
});

const messaging = firebase.messaging();
const CACHE_NAME = "dku-med26-app-v6";
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
  "./assets/img/logo.png",
  "./assets/js/main.js",
  "./assets/js/session-hint.js",
  "./assets/js/firebase-init.js",
  "./assets/js/attachments.js",
  "./assets/js/teams.js"
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
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
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

messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || "의과대학 26학번";
  const options = {
    body: payload.data?.body || "새 알림이 도착했습니다.",
    icon: new URL("assets/img/logo.png", self.registration.scope).href,
    badge: new URL("assets/img/logo.png", self.registration.scope).href,
    data: { url: payload.data?.url || "index.html" },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "index.html", self.registration.scope).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url === target);
    return existing ? existing.focus() : clients.openWindow(target);
  }));
});
