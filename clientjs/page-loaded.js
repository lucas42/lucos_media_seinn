const pubsub = require("./pubsub");
function load() {
	
	// Remove event listeners so it doesn't get called twice
	document.removeEventListener("DOMContentLoaded", load, false);
	window.removeEventListener("load", load, false);
	pubsub.unlisten("bootloaderReady", _onBootloaderReady);
		
	// Trigger a ready event
	pubsub.send('ready');
}
function _onBootloaderReady() {
	
	// It's possible for the bootloader to be ready before the DOM, in which case ignore
	if (document.body) load();
}

// Use DOMContentLoaded with load as a fallback incase the browser dosen't support the former
// If both were fired before lucos.js was loaded, then listen for the bootloaderReady message
document.addEventListener("DOMContentLoaded", load, false);
window.addEventListener("load", load, false);
pubsub.listen("bootloaderReady", _onBootloaderReady, true);