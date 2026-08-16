const CACHE_NAME =
  "tata-pharmacist-v1";

self.addEventListener(
  "install",
  () => {
    self.skipWaiting();
  }
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      self.clients.claim()
    );
  }
);

// เตรียมไว้สำหรับ Push Notification
self.addEventListener(
  "push",
  (event) => {
    let data = {};

    try {
      data = event.data
        ? event.data.json()
        : {};
    } catch {
      data = {
        title:
          "Tata Medication",
        body:
          event.data?.text() ||
          "มีรายการใหม่",
      };
    }

    const title =
      data.title ||
      "Tata Medication";

    const options = {
      body:
        data.body ||
        "มีงานใหม่รอดำเนินการ",
      icon:
        "/pwa-192x192.png",
      badge:
        "/pwa-192x192.png",
      data: {
        url:
          data.url ||
          "/admin?tab=orders",
      },
    };

    event.waitUntil(
      self.registration
        .showNotification(
          title,
          options
        )
    );
  }
);

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const targetUrl =
      event.notification
        ?.data?.url ||
      "/admin?tab=orders";

    event.waitUntil(
      clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      }).then(
        async (clientList) => {
          for (
            const client of clientList
          ) {
            if (
              "focus" in client
            ) {
              await client.focus();

              if (
                "navigate" in client
              ) {
                await client.navigate(
                  targetUrl
                );
              }

              return;
            }
          }

          if (
            clients.openWindow
          ) {
            return clients.openWindow(
              targetUrl
            );
          }
        }
      )
    );
  }
);