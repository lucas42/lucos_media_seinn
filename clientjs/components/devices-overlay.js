const pubsub = require("../pubsub");
const manager = require("../manager");

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
			component.style.display = "none";
		});
		container.addEventListener("click", event => event.stopPropagation());
		container.addEventListener("keyup", event => event.stopPropagation());
		shadow.append(overlay);
		pubsub.listenExisting("managerData", data => {
			while (container.firstChild) {
				container.removeChild(container.lastChild);
			}
			data.devices.forEach(device => {
				const form = document.createElement("form");
				form.dataset.uuid = device.uuid;
				form.dataset.name = device.name;
				form.dataset.isCurrent = device.isCurrent;
				form.dataset.isConnected = device.isConnected;
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
					manager.post("devices/current", {uuid:device.uuid});
				});
				form.addEventListener("submit", event => {
					event.preventDefault();
					manager.post("devices", {uuid:device.uuid, name:nameField.value});
				});
				container.appendChild(form);
			})
		});		
		const style = document.createElement('style');
		style.textContent = `

		#overlay {
			position: fixed;
			top: 0;
			bottom: 0;
			left: 0;
			right: 0;
			background: rgba(100, 100, 100, 0.7);
			z-index: 5000;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		#overlay > div {
			padding: 2em;
			background: rgba(255,255,255,0.9);
			border: solid #502;
			border-top-width: 10px;
			border-radius: 10px;
		}
		#overlay form {
			padding: 5px;
		}
		#overlay form[data-is-current=true] {
			background: #503;
		}
		#overlay form[data-is-connected=false] {
			opacity: 0.4;
		}

		`;
		shadow.prepend(style);
	}
}

customElements.define('devices-overlay', DevicesOverlay);

const overlay = document.createElement("devices-overlay");
overlay.style.display = "none";
const showOverlay = document.createElement("input");
showOverlay.type = "button";
showOverlay.value = "Devices";
showOverlay.addEventListener("click", event => {
	event.stopPropagation();
	overlay.style.display = "block";
});
const control = document.createElement("li");
control.appendChild(showOverlay);
document.getElementById('controls').appendChild(control);
document.body.append(overlay);