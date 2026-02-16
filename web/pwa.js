let deferredInstallPrompt = null;

const installButton = document.getElementById("installAppBtn");
const iosInstallHint = document.getElementById("iosInstallHint");

const isStandaloneMode = () => {
  const displayStandalone = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = typeof navigator.standalone === "boolean" && navigator.standalone;
  return displayStandalone || iosStandalone;
};

const isIOSWebKitInstallFlow = () => {
  const hasTouch = typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  const hasWKMessageHandlers =
    typeof window.webkit === "object" &&
    window.webkit !== null &&
    typeof window.webkit.messageHandlers === "object";
  const hasWebkitTouchCallout =
    typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-touch-callout", "none");
  const lacksBeforeInstallPrompt = !("BeforeInstallPromptEvent" in window);
  return hasTouch && hasWKMessageHandlers && hasWebkitTouchCallout && lacksBeforeInstallPrompt;
};

const syncInstallControls = () => {
  const installed = isStandaloneMode();
  if (installButton) {
    installButton.hidden = installed || !deferredInstallPrompt;
  }
  if (iosInstallHint) {
    iosInstallHint.hidden = installed || !isIOSWebKitInstallFlow();
  }
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  syncInstallControls();
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
    syncInstallControls();
  });
}

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  syncInstallControls();
});

if (typeof window.matchMedia === "function") {
  const media = window.matchMedia("(display-mode: standalone)");
  const handleDisplayModeChange = () => syncInstallControls();
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handleDisplayModeChange);
  } else if (typeof media.addListener === "function") {
    media.addListener(handleDisplayModeChange);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Service worker registration should not block app usage.
    });
    syncInstallControls();
  });
} else {
  syncInstallControls();
}
