// Service worker for push notifications. Kept deliberately small: it shows what
// the server sent and opens the app at the right page when the client taps it.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: "WOD.COACH", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "WOD.COACH"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || "/client" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/client"
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Reuse an open tab when there is one, so tapping never piles up windows.
      for (const w of wins) {
        if (w.url.includes(url) && "focus" in w) return w.focus()
      }
      for (const w of wins) {
        if ("navigate" in w && "focus" in w) return w.navigate(url).then((c) => c && c.focus())
      }
      return clients.openWindow(url)
    })
  )
})

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
