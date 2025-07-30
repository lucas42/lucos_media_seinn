import './track-state.js';
import './lyric-viewer.js';
import { listenExisting, send, unlisten } from 'lucos_pubsub';

class NowPlaying extends HTMLElement {
	constructor() {
		super();

		const component = this;
		const shadow = component.attachShadow({mode:'closed'});

		const style = document.createElement('style');
		style.textContent = `
			:host {
				text-align: center;
				background:#000;
				border-bottom: solid #502;
				color: white;
				overflow: hidden;
				padding: 1em;
				flex-shrink: 0;
			}
			.thumbnail {
				height: 100px;
				margin: 1em auto;
			}
			.thumbnail, .title, .artist {
				display: block;
				font-weight: bold;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
			.lyricButton:not([data-has-lyrics]) {
				display: none;
			}
			[hidden] {
				display: none;
			}
			:host(.new-track):before {
				content: "NEW";
				background-color: #dd0;
				color: #000;
				font-size: 11px;
				font-weight: bold;
				text-align: center;
				position: absolute;
				transform: rotate(-45deg);
				width: 100px;
				left: -28px;
				box-shadow: 2px 4px 5px rgba(200, 0,0, 0.5);
			}
		`;
		shadow.append(style);

		const titleDiv = document.createElement("div");
		titleDiv.classList.add("title");
		const title = document.createTextNode("");
		titleDiv.appendChild(title);
		shadow.append(titleDiv);

		const artistDiv = document.createElement("div");
		artistDiv.classList.add("artist");
		const artist = document.createTextNode("");
		artistDiv.appendChild(artist);
		shadow.appendChild(artistDiv);

		const state = document.createElement("track-state");
		shadow.appendChild(state);

		const thumbnail = document.createElement("img");
		thumbnail.alt = "";
		thumbnail.classList.add("thumbnail");
		shadow.appendChild(thumbnail);

		const lyricViewer = document.createElement("lyric-viewer");
		lyricViewer.hidden = true;
		lyricViewer.addEventListener("click", event => event.stopPropagation(), true); // Prevent clicks on lyric viewer being handled as play/pause
		shadow.appendChild(lyricViewer);

		// Close the lyricViewer when escape button is pressed
		this.keyup = e => {
			if (e.key === "Escape") lyricViewer.hidden = true;
			if (e.key === "l") lyricViewer.hidden = !lyricViewer.hidden;
		};

		const lyricButton = document.createElement("button");
		lyricButton.classList.add("lyricButton");
		lyricButton.addEventListener("click", event => {
			event.stopPropagation();
			lyricViewer.hidden = !lyricViewer.hidden;
		});
		lyricButton.appendChild(document.createTextNode("Lyrics"));
		shadow.appendChild(lyricButton);

		this.updateData = data => {
			const now = data.tracks[0] || {};
			const metadata = now.metadata || {};
			title.nodeValue = metadata.title;
			artist.nodeValue = metadata.artist;
			thumbnail.src = metadata.thumb || "https://staticmedia.l42.eu/music-error.png";
			if (metadata.lyrics) {
				lyricButton.dataset.hasLyrics = true
			} else {
				delete lyricButton.dataset.hasLyrics;
			}
			lyricViewer.setAttribute("lyrics", metadata.lyrics || "");
			if (component.getAttribute("uuid") != now.uuid || component.getAttribute("url") != now.url) {
				component.setAttribute("uuid", now.uuid);
				component.setAttribute("url", now.url);
				state.setAttribute("url", now.url);
				send('currentTrackUpdated', now);
			}
			if (now.state) state.setAttribute("service-worker-state", now.state);
			if (data.isPlaying !== component.isPlaying) {
				component.isPlaying = data.isPlaying;
				send('trackStateChange', {url:now.url, isPlaying:data.isPlaying});
			}
			if (metadata.new) {
				shadow.host.classList.add("new-track");
			} else {
				shadow.host.classList.remove("new-track");
			}
		};

		component.addEventListener("click", event => {
			document.getElementById("playpause").requestSubmit();
		});
	}
	connectedCallback() {
		listenExisting("managerData", this.updateData);
		document.addEventListener('keyup', this.keyup, false);
	}
	disconnectedCallback() {
		unlisten("managerData", this.updateData);
		document.removeEventListener('keyup', this.keyup);
	}
}


customElements.define('now-playing', NowPlaying);
