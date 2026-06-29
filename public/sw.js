// Oprix Web Push service worker — shows OS notifications and routes clicks.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Oprix", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Oprix";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/notifications" },
    tag: data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Focus an existing window already on the target, else reuse any window.
      for (const w of wins) {
        if (w.url.includes(target) && "focus" in w) return w.focus();
      }
      for (const w of wins) {
        if ("focus" in w) {
          if ("navigate" in w) w.navigate(target);
          return w.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
