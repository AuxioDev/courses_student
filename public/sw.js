// Student Diary service worker.
// - Offline: the last version of Today, Diary, Schedule and the Homework list is
//   kept per language and shown read-only when the network is down. The login
//   page deletes this cache, so nothing stays behind for the next person.
// - Homework files, API calls and every other page are never cached.
// - Push: shows notifications sent by the server and opens the right page.

const PAGES = "diary-pages-v1";
const STATIC = "diary-static-v1";
const OFFLINE_URL = "/offline.html";
// Saved at install so the offline page can show them without a network.
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/badge-96.png"];
const CACHED_PAGES = /^\/(az|en|ru)(\/(diary|schedule|homework))?\/?$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = [PAGES, STATIC];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (PRECACHE.includes(url.pathname) && request.mode !== "navigate") {
    event.respondWith(caches.match(url.pathname).then((hit) => hit || fetch(request)));
    return;
  }

  // Built JS/CSS never change once published, so cache-first is safe.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode !== "navigate") return;

  // Pages: always try the network first.
  event.respondWith(
    fetch(request)
      .then((res) => {
        // Only full, successful page loads of the allowed pages are kept
        // (not redirects to login, not error pages).
        if (res.ok && !res.redirected && CACHED_PAGES.test(url.pathname) && !url.search) {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(url.pathname, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(url.pathname, { cacheName: PAGES });
        return cached || (await caches.match(OFFLINE_URL)) || Response.error();
      }),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Student Diary", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  // Only ever open pages of this site.
  const url = target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
