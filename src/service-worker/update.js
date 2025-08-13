import { abortAllRequests } from '../utils/manager.js';
import { freeUpConnections } from './polling.js';
self.addEventListener("message", function serviceWorkerMessage(event) {
	switch (event.data) {
		case "abort-connections":
			abortAllRequests("Shutting down old service worker");
			freeUpConnections();
			break;
		case "skip-waiting":
			self.skipWaiting();
			break;
	}
});
