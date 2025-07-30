import { listenExisting, unlisten, send } from 'lucos_pubsub';
import { put } from '../../classes/manager.js';
import localDevice from '../../classes/local-device.js';

class DevicesOverlay extends HTMLElement {
	constructor() {
		super();
		const component = this;
		const shadow = component.attachShadow({mode: 'open'});
		const overlay = document.createElement("div");
		overlay.id = "overlay";
		const container = document.createElement("div");
		overlay.append(container);
		overlay.addEventListener("click", event => {
			this.style.display = "none";
		});
		container.addEventListener("click", event => event.stopPropagation());
		container.addEventListener("keyup", event => event.stopPropagation());
		shadow.append(overlay);
		const deviceList = document.createElement("div");
		container.append(deviceList);
		this.updateData = data => {
			while (deviceList.firstChild) {
				deviceList.removeChild(deviceList.lastChild);
			}

			data.devices.sort((a, b) => {
				if (a.uuid === localDevice.getUuid()) return -1;
				if (b.uuid === localDevice.getUuid()) return 1;
				if (a.isConnected !=  b.isConnected) return a.isConnected ? -1 : 1;
				if (a.name === b.name) return 0;
				return a.name > b.name ? 1 : -1;
			});
			data.devices.forEach(device => {
				const form = document.createElement("form");
				form.dataset.uuid = device.uuid;
				form.dataset.name = device.name;
				form.dataset.isCurrent = device.isCurrent;
				form.dataset.isConnected = device.isConnected;
				form.dataset.isLocal = (device.uuid === localDevice.getUuid());
				const nameField = document.createElement("input");
				nameField.value = device.name;
				form.appendChild(nameField);
				const saveName = document.createElement("input");
				saveName.type = "submit";
				saveName.value = "Rename";
				form.appendChild(saveName);
				const makeCurrent = document.createElement("input");
				makeCurrent.type = "button";
				makeCurrent.value = "▶";
				form.appendChild(makeCurrent);
				makeCurrent.addEventListener("click", event => {
					const new_uuid = event.currentTarget.parentNode.dataset.uuid;
					send('device_changing', { new_uuid });
					put("v3/current-device", new_uuid);
				});
				form.addEventListener("submit", event => {
					event.preventDefault();
					const uuid = event.currentTarget.dataset.uuid;
					const name = event.currentTarget.firstChild.value;
					put(`v3/device-names/${uuid}`, name);
				});
				deviceList.appendChild(form);
			})
		};
		const style = document.createElement('style');
		style.textContent = `

		#overlay {
			position: fixed;
			top: 0;
			bottom: 0;
			left: 0;
			right: 0;
			background: rgba(100, 100, 100, 0.7);
			color: #000;
			z-index: 5000;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		#overlay > div {
			padding: 1.5em;
			background: rgba(255,255,255,0.9);
			border: solid #502;
			border-top-width: 10px;
			border-radius: 10px;
			overflow: auto;
			max-width: 350px;
			max-height:88%;
		}
		#overlay form {
			padding: 5px;
		}
		#overlay form[data-is-current=true] {
			background: #503;
		}
		#overlay form[data-is-connected=false][data-is-current=false][data-is-local=false] {
			display: none;
		}

		`;
		shadow.prepend(style);

		// Close the overlay when escape button is pressed
		this.keyup = e => {
			if (e.key === "Escape") component.style.display = "none";
		};

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

customElements.define('devices-overlay', DevicesOverlay);