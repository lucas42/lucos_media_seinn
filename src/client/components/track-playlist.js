import './track-state.js';
import './track-options.js';
import { listenExisting } from 'lucos_pubsub';

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
				list-style-type: none;
				padding-inline-start: 0;
			}
			li {
				font-weight: bold;
				font-size: larger;
				line-height: 0.9em;
				cursor: pointer;
			}
			li > .toggle {
				width: 1em;
				display: inline-block;
				text-align: center;
			}
			li > .title {
				font-size: small;
				padding: 0 1em;
			}
			track-options {
				overflow: hidden;
				transition: max-height 0.5s ease-out;
			}
			[expanded=false] track-options {
				max-height: 0;
			}
			[expanded=true] track-options {
				max-height: 2em;
			}
			li.new-track > .title:after {
				content: "NEW";
				background-color: #dd0;
				color: #000;
				font-size: 9px;
				padding: 0 3px;
				border-radius: 3px;
				margin-left: 5px;
				vertical-align: super;
			}

		`;
		shadow.append(style);
		const list = document.createElement("ol");
		list.start = 2;
		shadow.append(list);

		function updatePlaylist(data) {
			const tracks = data.tracks.slice(1); // Ignore first track as that's used by `now`
			while (list.lastChild) {
				if (typeof list.lastChild.removeCustomListeners == 'function') list.lastChild.removeCustomListeners();
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
				title.className = "title";
				li.appendChild(title);

				const options = document.createElement("track-options");
				options.setAttribute("url", track.url);
				options.setAttribute("uuid", track.uuid);
				options.setAttribute("editurl", track.metadata.editurl);
				li.append(options);

				// Identify new tracks
				if (track.metadata.new) {
					li.classList.add("new-track");
				}

				listenForPress(component, li, options);
				list.appendChild(li);
			});
		}
		listenExisting("managerData", updatePlaylist, true);
	}
}

function listenForPress(playlist, node, options) {
	let timer;
	function startPress(event) {
		stopPress();  // Ensure there is only one press at a time
		timer = window.setTimeout(pressed, 500);
	}
	function stopPress() {
		if (timer) window.clearTimeout(timer);
	}
	node.addEventListener("mousedown", startPress, {passive: true});
	node.addEventListener("touchstart", startPress, {passive: true});
	node.addEventListener("mouseup", stopPress, {passive: true});
	node.addEventListener("mouseleave", stopPress, {passive: true});
	node.addEventListener("touchend", stopPress, {passive: true});
	node.addEventListener("contextmenu", stopPress, {passive: true});
	playlist.addEventListener("scroll", stopPress, {passive: true});
	node.setAttribute("expanded", "false");

	const toggle = document.createElement("span");
	toggle.appendChild(document.createTextNode("+"));  // Was originally going to use ▶ for the toggle, but that gets confused with play
	toggle.addEventListener("click", pressed, {passive: true});
	toggle.className = "toggle";
	node.prepend(toggle);

	function pressed() {
		stopPress();
		if (node.getAttribute("expanded") == "true") {
			node.setAttribute("expanded", "false");
			toggle.firstChild.textContent = "+";
		} else {
			node.setAttribute("expanded", "true");
			toggle.firstChild.textContent = "-";
		}
	}

	// Create single function to remove all the event listeners, to help clean up the node on removal and avoid memory leaks
	node.removeCustomListeners = () => {
		node.removeEventListener("mousedown", startPress, {passive: true});
		node.removeEventListener("touchstart", startPress, {passive: true});
		node.removeEventListener("mouseup", stopPress, {passive: true});
		node.removeEventListener("mouseleave", stopPress, {passive: true});
		node.removeEventListener("touchend", stopPress, {passive: true});
		node.removeEventListener("contextmenu", stopPress, {passive: true});
		playlist.removeEventListener("scroll", stopPress, {passive: true});
		toggle.removeEventListener("click", pressed, {passive: true});
	}
}

customElements.define('track-playlist', Playlist);