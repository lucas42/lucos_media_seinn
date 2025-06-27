import { getState as getBufferState } from '../buffers.js';
import { listenExisting, unlisten } from 'lucos_pubsub';
import player from '../player.js';
import localDevice from '../../classes/local-device.js';


class TrackState extends HTMLElement {
	static get observedAttributes() {
		return ['url','service-worker-state'];
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
			let state = getState(component.getAttribute("url"), component.getAttribute("service-worker-state"));
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
					background-color: ${getBackgroundColor(state)};
				}
			`;
			stateNode.nodeValue = state;
		};
		component.trackStateChange = ({url}) => {
			if (url !== component.getAttribute("url")) return;
			component.updateState();
		};
		listenExisting('trackStateChange', component.trackStateChange, true);
		listenExisting('currentTrackUpdated', component.updateState, true);
		component.updateState();
	}
	attributeChangedCallback(name, oldValue, newValue) {
		switch (name) {
			case "url":
			case "service-worker-state":
				this.updateState();
				break;	
		}
	}
	disconnectedCallback() {
		unlisten("trackStateChange", this.trackStateChange);
	}
}

function getState(url, serviceWorkerState) {
	const currentTrack = document.querySelector("now-playing").getAttribute("url");
	let state = getBufferState(url);

	// If playing locally, base the state on what is happening
	// (regardless of what the server says *should* be happening)
	if (currentTrack === url && (!state || state === "ready")) {
		if (player.isPlaying()) return "playing";
		if (localDevice.isCurrent()) return "paused";
	}

	// If playing on a non-local device, base the state on what that device *should* be doing
	if (currentTrack === url && !localDevice.isCurrent()) {
		const shouldBePlaying = document.querySelector("now-playing").isPlaying;
		if (shouldBePlaying) return "elsewhere";
		return "paused";
	}
	if (state) return state;
	if (serviceWorkerState) return serviceWorkerState;
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