import { updateTrackStatus } from './track-status-update.js';
import { abortAllRequests } from '../utils/manager.js';
import './components/cache-thrash-banner.js';
const statusChannel = new BroadcastChannel("lucos_status");

// Show a recovery banner when the SW cache enters a thrash state.
// Handled at module level so it works even if SW registration fails.
statusChannel.addEventListener("message", function handleCacheThrash(event) {
	if (event.data !== "cache-thrash") return;
	if (!document.querySelector('cache-thrash-banner')) {
		document.body.prepend(document.createElement('cache-thrash-banner'));
	}
});
try {
	if (!('serviceWorker' in navigator)) throw "no service worker support";
	const registration = await navigator.serviceWorker.register('/serviceworker-v3.js');
	console.log('ServiceWorker registration successful with scope: ' + registration.scope);
	if (registration.waiting) {
		statusChannel.postMessage('service-worker-waiting');
	}
	registration.addEventListener("updatefound", () => {
		if (registration.installing) registration.installing.addEventListener("statechange", () => {
			// If there's no existing sw, then this is the first install, so nothing to do.
			if (!navigator.serviceWorker.controller) return;
			if (registration.waiting) {
				statusChannel.postMessage('service-worker-waiting');
			}
		});
	});
	registration.update();
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		updateTrackStatus();
		window.location.reload();
	});
	statusChannel.addEventListener("message", async function statusMessage(event) {
		if (event.data == "service-worker-skip-waiting") {
			await updateTrackStatus();
			abortAllRequests("Shutting down old service worker");
			registration.active?.postMessage('abort-connections');
			registration.waiting?.postMessage('skip-waiting');
		}
	});

} catch (error) {
	console.error('ServiceWorker registration failed: ' + error);
}