const pubsub = require("../pubsub");

class Playlist extends HTMLOListElement {
	constructor() {
		super();

		const component = this;
		addGlobalStyle();

		function updatePlaylist(data) {
			const tracks = data.tracks.slice(1); // Ignore first track as that's used by `now`
			while (component.firstChild) {
				component.removeChild(component.lastChild);
			}
			tracks.forEach(track => {
				const li = document.createElement("li");
				const span = document.createElement("span");
				span.appendChild(document.createTextNode(track.metadata.title));
				li.appendChild(span);
				component.appendChild(li);
			});
		}
		pubsub.listenExisting("managerData", updatePlaylist, true);
	}
}

let globalStyleAdded = false;
function addGlobalStyle() {

	//Only ever load global style once
	if (globalStyleAdded) return;

	// Device-specific overrides
	const globalStyle = document.createElement('style');

	globalStyle.textContent = `
		[is=track-playlist] {
			overflow: auto;
			margin: 0;
			padding-top: 20px;
			padding-bottom: 10px;
			-webkit-overflow-scrolling: touch;
			list-style-type: disc;
		}
		[is=track-playlist] li {
			font-weight: bold;
			font-size: larger;
			line-height: 0.9em;
		}
		[is=track-playlist] li > span {
			font-size: small;
			padding: 0 1em;
		}
	`;

	// Prepend the global style, so individual pages can easily override (eg to set their own background-color)
	document.head.prepend(globalStyle);
	globalStyleAdded = true;
}

customElements.define('track-playlist', Playlist, { extends: "ol" });