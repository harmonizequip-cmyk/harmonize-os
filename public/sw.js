// Service worker do Harmonize: recebe os avisos (web push) mesmo com o app
// fechado e, ao tocar no aviso ou num botão dele, abre a tela certa (ou o
// WhatsApp da cliente, no botão de cobrar).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (e) {
    dados = { title: "Harmonize", body: event.data ? event.data.text() : "" };
  }
  const acoes = Array.isArray(dados.actions) ? dados.actions.slice(0, 2) : [];
  const destinos = {};
  for (const a of acoes) destinos[a.action] = a.url;
  event.waitUntil(
    self.registration.showNotification(dados.title || "Harmonize", {
      body: dados.body || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: dados.tag || "harmonize",
      renotify: true,
      actions: acoes.map((a) => ({ action: a.action, title: a.title })),
      data: { url: dados.url || "/dashboard", destinos },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const dados = event.notification.data || {};
  const escolhido = (event.action && dados.destinos && dados.destinos[event.action]) || dados.url || "/dashboard";
  const destino = new URL(escolhido, self.location.origin).href;

  // Link de fora do app (WhatsApp): abre direto, sem passar pelo Harmonize.
  if (!destino.startsWith(self.location.origin)) {
    event.waitUntil(self.clients.openWindow(destino));
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin) && "focus" in j) {
          j.navigate(destino);
          return j.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
