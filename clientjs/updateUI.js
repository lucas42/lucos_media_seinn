const pubsub = require("./pubsub");
require("./page-loaded");

function updateNow(data) {
	const now = data.tracks[0];
	const metadata = now.metadata || {};
	document.getElementById("now_title").firstChild.nodeValue = metadata.title;
	document.getElementById("now_artist").firstChild.nodeValue = metadata.artist;
	document.getElementById("now_thumb").src = metadata.thumb;
	document.getElementById("edit").action = metadata.editurl;
}

function updatePlaylist(data) {
	const tracks = data.tracks.slice(1); // Ignore first track as that's used by `now`
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

function updateVolume(data) {
	document.querySelectorAll("volume-control")
		.forEach(volControl => volControl.setAttribute("volume", data.volume));
}

pubsub.listen("ready", () => {
	pubsub.listenExisting("managerData", updateNow, true);
	pubsub.listenExisting("managerData", updatePlaylist, true);
	pubsub.listenExisting("managerData", updateVolume, true);
});