const pubsub = require("./pubsub");
require("./page-loaded");

function readData(data) {
	const now = data.tracks[0] || {};
	updateNow(now);
	document.querySelectorAll("volume-control")
		.forEach(volControl => volControl.setAttribute("volume", data.volume));
}

function updateNow(now) {
	const metadata = now.metadata || {};
	document.getElementById("now_title").firstChild.nodeValue = metadata.title;
	document.getElementById("now_artist").firstChild.nodeValue = metadata.artist;
	document.getElementById("now_thumb").src = metadata.thumb;
	document.getElementById("edit").action = metadata.editurl;
}

pubsub.listen("ready", () => {
	pubsub.listenExisting("managerData", readData, true);
});