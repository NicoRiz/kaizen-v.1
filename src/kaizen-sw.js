const CACHE_PREFIX = "kaizen-app-shell-";
const CACHE_NAME = `${CACHE_PREFIX}__KAIZEN_CACHE_VERSION__`;
const PRECACHE_PATHS = __KAIZEN_PRECACHE_MANIFEST__;
const scopeUrl = new URL(self.registration.scope);
const indexUrl = new URL("./index.html", scopeUrl).toString();

function scopedUrl(path) {
  return new URL(path === "." ? "./" : `./${path}`, scopeUrl).toString();
}

function isCacheableStaticRequest(request, url) {
  if (url.origin !== scopeUrl.origin || url.pathname.startsWith("/api/")) {
    return false;
  }

  return ["font", "image", "manifest", "script", "style"].includes(
    request.destination,
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          PRECACHE_PATHS.map(
            (path) => new Request(scopedUrl(path), { cache: "reload" }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith(CACHE_PREFIX) || key.startsWith("kaizen-shell-")) &&
                key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  // Supabase and every other cross-origin/API request stay network-only.
  if (requestUrl.origin !== scopeUrl.origin || requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
          const response = await fetch(request);

          if (response.ok) {
            await cache.put(indexUrl, response.clone());
          }

          return response;
        } catch {
          const fallback =
            (await cache.match(indexUrl, { ignoreSearch: true })) ||
            (await cache.match(scopedUrl("."), { ignoreSearch: true }));

          if (fallback) {
            return fallback;
          }

          return new Response("Kaizen non disponibile offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  if (!isCacheableStaticRequest(request, requestUrl)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request, { ignoreSearch: true });

      if (cachedResponse) {
        return cachedResponse;
      }

      const response = await fetch(request);

      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;
    })(),
  );
});
