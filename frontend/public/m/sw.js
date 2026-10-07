/*
 * The member card's service worker (M4 Slice 12, FR-CRD-05..06, D14).
 *
 * Served at /m/sw.js and registered with scope /m/, so it can never see the staff
 * application. It keeps only what the card needs to open in flight mode: the card
 * document, its hashed assets and the card answer (which holds the SVG QR), each
 * keyed by its URL. A copy of the card answer carries the time it was stored, so
 * the page can say "Last updated". When the server answers that the card was
 * replaced or does not exist, the stored copies of that card are deleted, so a
 * replaced home-screen card stops working at the next online open (FR-CRD-10).
 */
var CACHE = 'wellness-card-v1';
var CARD_API = /\/public\/cards\/[A-Za-z0-9_-]{43}$/;

var isCardAnswer = function (url) {
  return CARD_API.test(url.pathname);
};
var isCardDocument = function (request, url) {
  return request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.indexOf('/m/') === 0 && url.pathname !== '/m/sw.js';
};
var isAsset = function (url) {
  return url.origin === self.location.origin && (url.pathname.indexOf('/assets/') === 0 || url.pathname.indexOf('/icons/') === 0);
};

/** The stored card answer, stamped with when it was stored. */
var stamped = function (response) {
  return response.text().then(function (body) {
    var headers = new Headers(response.headers);
    headers.set('X-Cached-At', new Date().toISOString());
    return new Response(body, { status: response.status, headers: headers });
  });
};

var fromCache = function (request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request.url);
  });
};

/** A copy marked as coming from storage, so the page shows the time of the last update. */
var asStored = function (response) {
  var headers = new Headers(response.headers);
  headers.set('X-From-Cache', '1');
  return response.text().then(function (body) {
    return new Response(body, { status: response.status, headers: headers });
  });
};

var forget = function (token) {
  return caches.open(CACHE).then(function (cache) {
    return cache.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key.url.indexOf(token) !== -1;
          })
          .map(function (key) {
            return cache.delete(key);
          })
      );
    });
  });
};

var tokenOf = function (url) {
  var parts = url.pathname.split('/');
  return parts[parts.length - 1];
};

var cardAnswer = function (event, url) {
  var request = event.request;
  return fetch(request).then(
    function (response) {
      if (response.status === 404 || response.status === 410) {
        return forget(tokenOf(url)).then(function () {
          return response;
        });
      }
      if (!response.ok) return fromCache(request).then(function (stored) { return stored ? asStored(stored) : response; });
      var copy = response.clone();
      event.waitUntil(
        stamped(copy).then(function (withTime) {
          return caches.open(CACHE).then(function (cache) {
            return cache.put(request.url, withTime);
          });
        })
      );
      return response;
    },
    function () {
      return fromCache(request).then(function (stored) {
        if (!stored) return Response.error();
        return asStored(stored);
      });
    }
  );
};

var cardDocument = function (event) {
  var request = event.request;
  return fetch(request).then(
    function (response) {
      if (response.ok) {
        var copy = response.clone();
        event.waitUntil(
          caches.open(CACHE).then(function (cache) {
            return cache.put(request.url, copy);
          })
        );
      }
      return response;
    },
    function () {
      return fromCache(request).then(function (stored) {
        return stored || Response.error();
      });
    }
  );
};

var asset = function (event) {
  var request = event.request;
  return fromCache(request).then(function (stored) {
    if (stored) return stored;
    return fetch(request).then(function (response) {
      if (response.ok) {
        var copy = response.clone();
        event.waitUntil(
          caches.open(CACHE).then(function (cache) {
            return cache.put(request.url, copy);
          })
        );
      }
      return response;
    });
  });
};

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) {
              return name !== CACHE;
            })
            .map(function (name) {
              return caches.delete(name);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (isCardAnswer(url)) return event.respondWith(cardAnswer(event, url));
  if (isCardDocument(request, url)) return event.respondWith(cardDocument(event));
  if (isAsset(url)) return event.respondWith(asset(event));
});

/*
 * The first open of a card is not controlled by the worker (it installs during that
 * visit), so the page sends the address of its document and of the assets it loaded
 * and the worker stores them. Only what the worker would cache anyway is accepted.
 */
self.addEventListener('message', function (event) {
  var data = event.data;
  if (!data || data.type !== 'store' || !Array.isArray(data.urls)) return;
  var wanted = data.urls
    .map(function (value) {
      try {
        return new URL(value, self.location.origin);
      } catch {
        return null;
      }
    })
    .filter(function (url) {
      if (!url) return false;
      if (isCardAnswer(url)) return true;
      if (url.origin !== self.location.origin) return false;
      return isAsset(url) || (url.pathname.indexOf('/m/') === 0 && url.pathname !== '/m/sw.js');
    });
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(
        wanted.map(function (url) {
          return cache.match(url.href).then(function (hit) {
            if (isCardAnswer(url)) {
              return fetch(url.href, { credentials: 'omit', cache: 'no-store' }).then(function (response) {
                return response.ok ? stamped(response).then(function (copy) { return cache.put(url.href, copy); }) : undefined;
              });
            }
            if (hit) return undefined;
            return fetch(url.href).then(function (response) {
              if (response.ok) return cache.put(url.href, response);
              return undefined;
            });
          });
        })
      ).catch(function () {});
    })
  );
});
