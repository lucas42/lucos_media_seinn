require("./track-state");
const pubsub = require("../pubsub");
const manager = require("../manager");
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


		pubsub.listenExisting("managerData", data => {
			const now = data.tracks[0];
			const metadata = now.metadata || {};
			title.nodeValue = metadata.title;
			artist.nodeValue = metadata.artist;
			thumbnail.src = metadata.thumb;
			component.setAttribute("url", now.url);
			state.setAttribute("url", now.url);
			if (now.state) state.setAttribute("service-worker-state", now.state);
			if (data.isPlaying !== component.isPlaying) {
				component.isPlaying = data.isPlaying;
				pubsub.send('trackStateChange', {url:now.url, isPlaying:data.isPlaying});
			}
		}, true);

		component.addEventListener("click", event => {
			document.getElementById("playpause").requestSubmit();
		});
	}
}


customElements.define('now-playing', NowPlaying);
