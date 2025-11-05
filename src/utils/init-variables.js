import { init as initManager } from '../utils/manager.js';
import { init as initHeaders } from '../utils/media-headers.js';

(async function _init() {
	const request = new Request("/client-variables.json");
	let response = await caches.match(request);
	if (!response) {
		console.warn("client-variables.json not found in cache; falling back to network");
		response = await fetch(request);
	}
	const { mediaManager, apiKey, mediaCreds } = await response.json();
	initManager(mediaManager, apiKey);
	initHeaders(mediaCreds);
})();