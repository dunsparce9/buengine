import { showToast, updateRunLabels, updateWindowTitle, isStandalonePWA, hasUnsavedChanges } from './ui.js';
import { hooks } from '../core/state.js';

let deferredInstallPrompt = null;
let hasReloadedForServiceWorkerUpdate = false;
let pendingServiceWorkerReload = false;
let updateNoticeShown = false;
let serviceWorkerRegistration = null;
let activatingWorker = null;

function applyPendingUpdate() {
  const waiting = serviceWorkerRegistration?.waiting;
  if ((!pendingServiceWorkerReload && !waiting) || hasReloadedForServiceWorkerUpdate) return;
  if (hasUnsavedChanges()) {
    if (!updateNoticeShown) {
      updateNoticeShown = true;
      showToast('Editor update ready. Save all changes to reload.');
    }
    return;
  }
  if (pendingServiceWorkerReload) {
    hasReloadedForServiceWorkerUpdate = true;
    window.location.reload();
  } else if (waiting && waiting !== activatingWorker) {
    activatingWorker = waiting;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

function setupServiceWorkerUpdates(registration) {
  serviceWorkerRegistration = registration;
  hooks.afterSave = applyPendingUpdate;
  const requestUpdateCheck = () => {
    applyPendingUpdate();
    registration.update().catch(() => {});
  };

  window.addEventListener('focus', requestUpdateCheck);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestUpdateCheck();
  });

  applyPendingUpdate();

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (worker) watchInstallingWorker(worker);
  });
  if (registration.installing) watchInstallingWorker(registration.installing);
}

function watchInstallingWorker(worker) {
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') applyPendingUpdate();
  });
}

function registerServiceWorker() {
  let hadController = Boolean(navigator.serviceWorker.controller);
  // Listen before registration, including when installation finishes quickly.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const isUpdate = hadController;
    hadController = true;
    if (!isUpdate) return;
    pendingServiceWorkerReload = true;
    applyPendingUpdate();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(setupServiceWorkerUpdates)
    .catch(() => {});
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
    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker, { once: true });
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
