import { listenExisting, unlisten } from 'lucos_pubsub';
import { put } from '../../classes/manager.js';

class VolumeControl extends HTMLElement {
	static get observedAttributes() {
		return ['volume'];
	}
	constructor() {
		super();

		let currentVolume = 0.5;

		const component = this;
		const shadow = component.attachShadow({mode: 'open'});
		component.addEventListener('click', e => {
			e.stopPropagation();
			const newVolume = 1 - (e.pageY/self.innerHeight);
			updateVolume(newVolume);
		});
		const volcontain = document.createElement('div');
		volcontain.classList.add("volcontain");
		const vol = document.createElement('span');
		vol.classList.add("vol");
		volcontain.appendChild(vol);

		const style = document.createElement('style');
		style.textContent = `

		.volcontain { 
			width: 60px;
			position: absolute;
			right: 0;
			top: 30px;
			bottom: 0;
			z-index: 1010;
		}
		.vol {
			width: 60px;
			position: absolute;
			right: 0;
			bottom: 0;
			-webkit-border-radius: 20px;
			-webkit-border-radius: 20px 20px 0 0;
			background: #aaa;
			background: rgba(0,0,0,0.6);
			background:
				-webkit-gradient(linear, 0 0, 100% 0,
					color-stop(0, rgba(50,140,255,0.5)),
					color-stop(0.15, rgba(255,255,255,0.9)),
					color-stop(0.5, rgba(50,140,255,0.5)));
			-webkit-box-shadow:0 2px 2px rgba(0,0,0,0.15);
			-webkit-transition:height 0.5s ease-out;
			border-radius: 20px;
			border-radius: 20px 20px 0 0;
			background:
				gradient(linear, 0 0, 100% 0,
					color-stop(0, rgba(50,140,255,0.5)),
					color-stop(0.15, rgba(255,255,255,0.9)),
					color-stop(0.5, rgba(50,140,255,0.5)));
			box-shadow:0 2px 2px rgba(0,0,0,0.15);
			transition:height 0.5s ease-out;
		}

		`;
		shadow.append(style);
		shadow.append(volcontain);

		function updateVolume(newVolume) {
			return put("v3/volume", newVolume);
		}

		component.querySelector("#volume-up")?.addEventListener('submit', async event => {
			event.preventDefault();
			updateVolume(Math.min(1, currentVolume+0.1),);
		});
		component.querySelector("#volume-down")?.addEventListener('submit', async event => {
			event.preventDefault();
			updateVolume(Math.max(0, currentVolume-0.1),);
		});

		this.updateData = data => {
			currentVolume = data.volume;
			const height = self.innerHeight * currentVolume;
			vol.style.height = height + "px";
		};
	}
	connectedCallback() {
		listenExisting("managerData", this.updateData);
	}
	disconnectedCallback() {
		unlisten("managerData", this.updateData);
	}
}


customElements.define('volume-control', VolumeControl);
