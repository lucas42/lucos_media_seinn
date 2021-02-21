const buffers = require("../buffers");
const pubsub = require("../pubsub");
const player = require("../player");

class TrackState extends HTMLElement {
	static get observedAttributes() {
		return ['url'];
	}
	constructor() {
		super();

		const component = this;
		const shadow = component.attachShadow({mode: 'closed'});
		const style = document.createElement('style');
		shadow.append(style);
		const stateNode = document.createTextNode("");
		shadow.append(stateNode);

		component.updateState = () => {
			let state = getState(component.getAttribute("url"));
			style.textContent = `
				:host {
					text-align: center;
					color: white; 
					font-family: Geneva, Arial, sans-serif;
					text-transform: capitalize;
					margin: 3px 5px;
					background-color: grey;
					width: 90px;
					display: inline-block;
					font-size: 0.7em;
					color: white;
					text-transform: capitalize;
					background-color: ${getBackgroundColor(state)};
				}
			`;
			stateNode.nodeValue = state;
		}
		pubsub.listenExisting("trackStateChange", ({url}) => {
			if (url !== component.getAttribute("url")) return;
			component.updateState();
		}, true);
		component.updateState();
	}
	attributeChangedCallback(name, oldValue, newValue) {
		switch (name) {
			case "url":
				this.updateState();
				break;	
		}
	}
}

function getState(url) {
	currentTrack = document.querySelector("now-playing").getAttribute("url");
	if (currentTrack === url && player.isPlaying()) return "playing";
	let state = buffers.getState(url);
	if (currentTrack === url && state === "ready") {
		// TODO: check whether the local device is current
		return "paused";
	}
	if (state) return state;
	return "unloaded";
}

const stateColors = {
	"unloaded": "grey",
	"disabled": "#555",
	"failed": "darkred",
	"paused": "indigo",
	"ready": "indigo",
	"playing": "green",
	"downloaded": "dodgerblue",
	"disk quota full": "deeppink",
	"elsewhere": "darkmagenta",
}
function getBackgroundColor(state){
	if (state in stateColors) return stateColors[state];
	if (state.endsWith("ing")) return "chocolate";
	return "grey";
}

customElements.define('track-state', TrackState);