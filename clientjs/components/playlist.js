require("./track-state");
require("./track-options");
const pubsub = require("../pubsub");

class Playlist extends HTMLElement {
	constructor() {
		super();

		const component = this;
		const shadow = component.attachShadow({mode: 'closed'});
		const style = document.createElement('style');
		style.textContent = `
			:host {
				overflow: auto;
				margin: 0;
				padding-top: 20px;
				padding-bottom: 10px;
				-webkit-overflow-scrolling: touch;
			}
			ol {
				list-style-type: disc;
			}
			li {
				font-weight: bold;
				font-size: larger;
				line-height: 0.9em;
				cursor: pointer;
			}
			li > span {
				font-size: small;
				padding: 0 1em;
			}

		`;
		shadow.append(style);
		const list = document.createElement("ol");
		list.start = 2;
		shadow.append(list);

		function updatePlaylist(data) {
			const tracks = data.tracks.slice(1); // Ignore first track as that's used by `now`
			while (list.firstChild) {
				list.removeChild(list.lastChild);
			}
			tracks.forEach(track => {
				const li = document.createElement("li");

				const state = document.createElement("track-state");
				state.setAttribute("url", track.url);
				if (track.state) state.setAttribute("service-worker-state", track.state);
				li.appendChild(state);

				const title = document.createElement("span");
				title.appendChild(document.createTextNode(track.metadata.title));
				li.appendChild(title);

				listenForPress(li, track);
				list.appendChild(li);
			});
		}
		pubsub.listenExisting("managerData", updatePlaylist, true);
	}
}

function listenForPress(node, track) {
	let timer;
	function startPress(event) {
		event.preventDefault();
		stopPress();  // Ensure there is only one press at a time
		timer = window.setTimeout(pressed, 1000);
	}
	function stopPress() {
		if (timer) window.clearTimeout(timer);
	}
	node.addEventListener("mousedown", startPress, false);
	node.addEventListener("touchstart", startPress, false);
	node.addEventListener("mouseup", stopPress, false);
	node.addEventListener("mouseleave", stopPress, false);
	node.addEventListener("touchend", stopPress, false);
	node.addEventListener("contextmenu", stopPress, false);
	function pressed() {
		const options = node.querySelector("track-options");
		if (options) {
			node.removeChild(options);
		} else {
			const options = document.createElement("track-options");
			options.setAttribute("url", track.url);
			options.setAttribute("editurl", track.metadata.editurl);
			node.append(options);
		}
	}
}

customElements.define('track-playlist', Playlist);