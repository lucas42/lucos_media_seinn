const pubsub = require("./pubsub");

function readData(data) {
	const now = data.tracks[0] || {};
	updateNow(now);
}

function updateNow(now) {
	const metadata = now.metadata || {};
	document.getElementById("now_title").firstChild.nodeValue = metadata.title;
	document.getElementById("now_artist").firstChild.nodeValue = metadata.artist;
	document.getElementById("now_thumb").src = metadata.thumb;
}

pubsub.listen("ready", () => {
	pubsub.listenExisting("managerData", readData, true);
});