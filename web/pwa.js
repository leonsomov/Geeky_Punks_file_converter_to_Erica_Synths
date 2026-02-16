let deferredInstallPrompt = null;

const installButton = document.getElementById("installAppBtn");

const showInstallButton = () => {
  if (!installButton) {
    return;
  }
  installButton.hidden = !deferredInstallPrompt;
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallButton();
});

if (installButton) {
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch {
      // Ignore prompt cancellation.
    }
    deferredInstallPrompt = null;
    showInstallButton();
  });
}

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  showInstallButton();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Service worker registration should not block app usage.
    });
  });
}
