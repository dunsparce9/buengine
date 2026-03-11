import { showToast, updateRunLabels, updateWindowTitle, isStandalonePWA } from './ui.js';

let deferredInstallPrompt = null;
let hasReloadedForServiceWorkerUpdate = false;

function setupServiceWorkerUpdates(registration) {
  const requestUpdateCheck = () => registration.update().catch(() => {});

  window.addEventListener('focus', requestUpdateCheck);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestUpdateCheck();
  });

  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        worker.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForServiceWorkerUpdate) return;
    hasReloadedForServiceWorkerUpdate = true;
    window.location.reload();
  });
}

export function updateInstallMenuVisibility() {
  const installBtn = document.getElementById('install-app-btn');
  const installSep = document.getElementById('install-app-sep');
  const standalone = isStandalonePWA();
  if (installBtn) installBtn.hidden = standalone;
  if (installSep) installSep.hidden = standalone;
}

export function setupPWAInstall() {
  updateRunLabels();
  updateWindowTitle();
  updateInstallMenuVisibility();

  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    updateRunLabels();
    updateWindowTitle();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallMenuVisibility();
    showToast('Editor installed successfully', 'info');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(setupServiceWorkerUpdates)
        .catch(() => {});
    });
  }
}

export async function installApp() {
  if (!deferredInstallPrompt) {
    showToast('Install prompt is not available in this browser/session', 'error');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallMenuVisibility();
}
