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
				const span = document.createElement("span");
				span.appendChild(document.createTextNode(track.metadata.title));
				li.appendChild(span);
				list.appendChild(li);
			});
		}
		pubsub.listenExisting("managerData", updatePlaylist, true);
	}
}

customElements.define('track-playlist', Playlist);