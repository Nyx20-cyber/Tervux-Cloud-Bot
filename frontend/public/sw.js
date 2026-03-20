const CACHE_NAME = "tervux-cache-v5";
const APP_SHELL_CACHE = [
  "/",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png"
];

function shouldBypassCache(request, url) {
  const accept = request.headers.get("accept") || "";
  const isApiRequest = url.origin === self.location.origin && url.pathname.startsWith("/api/");
  const isSocketRequest = url.origin === self.location.origin && url.pathname.startsWith("/socket.io/");
  const isRscRequest = url.searchParams.has("_rsc") || accept.includes("text/x-component");
  const isJsonRequest = accept.includes("application/json");
  return isApiRequest || isSocketRequest || isRscRequest || isJsonRequest;
}

function shouldCacheStaticAsset(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (url.pathname === "/manifest.json") return true;
  return ["style", "script", "worker", "image", "font", "audio", "video"].includes(request.destination);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_CACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((cacheName) => {
        if (cacheName !== CACHE_NAME) {
          return caches.delete(cacheName);
        }
        return undefined;
      })
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (shouldBypassCache(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Always prefer fresh HTML/app routes so installed PWA doesn't stay stuck on old builds.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch {
        const cachedResponse = await caches.match(request);
        return cachedResponse || caches.match("/");
      }
    })());
    return;
  }

  // Cache-first only for true static assets, with background refresh.
  if (shouldCacheStaticAsset(request, url)) {
    event.respondWith((async () => {
      const cachedResponse = await caches.match(request);
      const fetchPromise = fetch(request)
        .then(async (networkResponse) => {
          if (!networkResponse || !networkResponse.ok) {
            return networkResponse;
          }
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })());
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const title = payload.title || "Tervux Cloud Bot";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/icon-192x192.png",
    tag: payload.tag || "tervux-notification",
    renotify: Boolean(payload.renotify),
    requireInteraction: Boolean(payload.requireInteraction),
    data: {
      url: payload.url || "/dashboard/deployments",
      ...(payload.data || {})
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/dashboard/deployments";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    })
  );
});
