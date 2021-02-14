const pubsub = require("./pubsub");
require("./page-loaded");

function readData(data) {
	const tracks = data.tracks;
	const now = tracks.shift();
	updateNow(now);
	updatePlaylist(tracks);
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

function updatePlaylist(tracks) {
	const playlist = document.getElementById("playlist");
	while (playlist.firstChild) {
		playlist.removeChild(playlist.lastChild);
	}
	tracks.forEach(track => {
		const li = document.createElement("li");
		const span = document.createElement("span");
		span.appendChild(document.createTextNode(track.metadata.title));
		li.appendChild(span);
		playlist.appendChild(li);
	});
}

pubsub.listen("ready", () => {
	pubsub.listenExisting("managerData", readData, true);
});