const pubsub = require("./pubsub");
var timeFrame;
pubsub.listen("offsetupdate", function (newoffset) {
	localStorage.setItem("lucos_NTPOffset", newoffset.offset);
});
function getTime(force) {
	function clientTime() {
		return new Date().getTime();
	}
	function fetchOffset() {
		
		// Browsers which don't support window messaging can just use their own time.
		if (typeof window.postMessage == 'undefined') return;
		if (timeFrame) {
			pubsub.send("time_offset", { force: force}, timeFrame.contentWindow);
		} else {
			pubsub.listen("api_ready", function _timeAPIReady(params, source) {
				if (source != timeFrame.contentWindow) return;
				fetchOffset();
			});
			timeFrame = document.createElement("iframe");
			timeFrame.src = "https://am.l42.eu/";
			timeFrame.setAttribute("style", "height: 0; width: 0; display:none;");
			document.body.appendChild(timeFrame);
		}
	}
	var savedOffset = parseInt(localStorage.getItem('lucos_NTPOffset'));
	
	// If the offset isn't saved, then request an update and just use client time.
	if (!savedOffset) {
		fetchOffset();
		return clientTime();
	}
	
	if (force) fetchOffset();
	return clientTime() + savedOffset;
}

module.exports = getTime;