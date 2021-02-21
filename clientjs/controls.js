const pubsub = require("./pubsub");
const manager = require("./manager");
require("./page-loaded");

/**
 * The refresh button isn't needed if JS is running as we poll for changes constantly
 */
function removeRefresh() {
	const refresh = document.getElementById('refresh');
	const controls = document.getElementById('controls');

	// Remove refresh's list-item for tidyness
	controls.removeChild(refresh.parentNode);
}
function setupControls() {
	removeRefresh();
}

pubsub.waitFor('ready', setupControls);
