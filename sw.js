importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCbSh-0aUT-GAsM_B0OLYWwk1UJTa0ttpQ",
  authDomain: "amal-tracker-c11d9.firebaseapp.com",
  projectId: "amal-tracker-c11d9",
  storageBucket: "amal-tracker-c11d9.firebasestorage.app",
  messagingSenderId: "471793472033",
  appId: "1:471793472033:web:5cdf9ddd2fba95828bc960"
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title   = payload.notification.title;
  var options = {
    body: payload.notification.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: title,
    data: { url: './' }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(cls) {
      if (cls.length > 0) { cls[0].focus(); return; }
      return clients.openWindow('./');
    })
  );
});

// ===== CUSTOM SCHEDULE (dari app) =====
// Format: [jam, menit, title, body]
var customSchedule = [];

self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'CUSTOM_SCHEDULE') {
    customSchedule = e.data.schedule || [];
    // Simpan ke cache agar persistent
    caches.open('amal-notif-sched').then(function(c) {
      c.put('/notif-schedule', new Response(JSON.stringify(customSchedule)));
    });
  }
});

// ===== ALARM via periodicsync / setInterval trick =====
// Pakai self.registration.showNotification langsung dari SW (Android-safe)
var schedTimers = [];

function cancelAllSWTimers() {
  schedTimers.forEach(function(id) { clearTimeout(id); });
  schedTimers = [];
}

function scheduleSWNotifs(sched) {
  cancelAllSWTimers();
  var now = Date.now();
  var wibOffset = 7 * 60 * 60 * 1000;
  var wibNow = new Date(now + wibOffset);
  var todayBase = new Date(wibNow);
  todayBase.setUTCHours(0, 0, 0, 0);

  sched.forEach(function(n) {
    var targetWib = new Date(todayBase.getTime());
    targetWib.setUTCHours(n[0], n[1], 0, 0);
    var targetLocal = new Date(targetWib.getTime() - wibOffset);
    var delay = targetLocal.getTime() - now;
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      var id = setTimeout(function(title, body) {
        return function() {
          self.registration.showNotification(title, {
            body: body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            vibrate: [200, 100, 200],
            tag: title,
            renotify: true
          });
        };
      }(n[2], n[3]), delay);
      schedTimers.push(id);
    }
  });
}

// Load saved schedule on SW activate
self.addEventListener('activate', function(e) {
  e.waitUntil(
    Promise.all([
      caches.keys().then(function(keys) {
        return Promise.all(
          keys.filter(function(k) { return k !== 'amal-v9' && k !== 'amal-notif-sched'; })
              .map(function(k) { return caches.delete(k); })
        );
      }),
      caches.open('amal-notif-sched').then(function(c) {
        return c.match('/notif-schedule').then(function(r) {
          if (r) return r.json().then(function(sched) {
            customSchedule = sched;
            scheduleSWNotifs(sched);
          });
        });
      })
    ])
  );
  self.clients.claim();
});

// Saat menerima CUSTOM_SCHEDULE, langsung reschedule
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'CUSTOM_SCHEDULE') {
    customSchedule = e.data.schedule || [];
    scheduleSWNotifs(customSchedule);
    caches.open('amal-notif-sched').then(function(c) {
      c.put('/notif-schedule', new Response(JSON.stringify(customSchedule)));
    });
  }
}, true); // true agar override listener atas

var CACHE = 'amal-v9';
var ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request).catch(function() { return caches.match('./index.html'); });
    })
  );
});
