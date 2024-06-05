import { abortAllRequests } from '../classes/manager.js';
import { freeUpConnections } from './polling.js';
self.addEventListener("message", function streamStatusMessage(event) {
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
