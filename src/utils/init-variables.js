import { init as initManager } from '../utils/manager.js';
import { init as initHeaders } from '../utils/media-headers.js';

(async function _init() {
	const response = await fetch('/client-variables.json');
	const { mediaManager, apiKey, mediaCreds } = await response.json();
	initManager(mediaManager, apiKey);
	initHeaders(mediaCreds);
})();