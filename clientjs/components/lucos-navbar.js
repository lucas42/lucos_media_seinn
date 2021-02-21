require("./lucos-time");

class Navbar extends HTMLElement {
	static get observedAttributes() {
		return ['device'];
	}
	constructor() {
		// Always call super first in constructor
		super();
		const component = this;

		const shadow = this.attachShadow({mode: 'open'});
	
		const navbar = document.createElement('div');
		navbar.id="lucos_navbar";
		const homeimg = document.createElement('img');
		homeimg.src = 'https://l42.eu/logo.png';
		homeimg.setAttribute("alt", "lucOS");
		homeimg.id = 'lucos_navbar_logo';
		const homeimglnk = document.createElement("a");
		homeimglnk.setAttribute("href", "https://l42.eu/");
		homeimglnk.appendChild(homeimg);
		navbar.appendChild(homeimglnk);
		
		const titleNode = document.createElement('span');
		while (this.firstChild) titleNode.appendChild(this.firstChild);
		titleNode.id='lucos_navbar_title';
		navbar.appendChild(titleNode);
		
		titleNode.appendChild(document.createElement('lucos-time'));
		
		// Swallow any clicks on the navbar to stop pages handling them
		navbar.addEventListener("click", function _stopnavbarpropagation(event) { event.stopPropagation(); }, false);

		// Primary stylesheet for the navbar
		const mainStyle = document.createElement('style');

		// Device-specific overrides
		const deviceStyle = document.createElement('style');

		mainStyle.textContent = `

		#lucos_navbar {
			font-size: 18px;
			font-family: Georgia, serif;
			height: 100%;
		}
		#lucos_navbar_logo {
			float: left;
			height: 25px;
			padding: 2.5px 2%;
			cursor: pointer;
			max-width: 20%;
			border: none;
		}
		#lucos_navbar_title {
			text-align: center;
			display: block;
			line-height: 30px;
			font-weight: bold;
			position: absolute;
			width: 50%;
			margin: 0 25%;
			overflow: hidden;
			height: 30px;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		lucos-time {
			font-family: "Courier New", Courier, monospace;
			margin: 0 1em;
		}

		`;


		/**
		 * Some devices are tricksy (eg chromecasts), so need additional styling
		 */
		component.updateDeviceStyle = () => {
			switch(component.getAttribute("device")) {
				case "cast-receiver":

					deviceStyle.textContent = `
					#lucos_navbar {
						font-size: 4vh;
					}
					#lucos_navbar_logo {
						height: 5vh;
					}
					`;
					component.style.padding = "3vh";
					break;
				default:
					deviceStyle.textContent = '';
					component.style.padding = '';
			}
		};
		shadow.appendChild(mainStyle);
		shadow.appendChild(deviceStyle);
		addGlobalStyle();
		component.updateDeviceStyle();

		shadow.appendChild(navbar);
	}

	attributeChangedCallback(name, oldValue, newValue) {
		switch (name) {
			case "device":
				this.updateDeviceStyle();
				break;
		}
	}
}

let globalStyleAdded = false;
function addGlobalStyle() {

	//Only ever load global style once
	if (globalStyleAdded) return;

	// Device-specific overrides
	const globalStyle = document.createElement('style');

	globalStyle.textContent = `
		lucos-navbar {
			z-index:1000;
			color: white;
			background-color: black;
			background-image: -webkit-gradient(linear, 0 100%, 0 0, color-stop(0, transparent), color-stop(0.15, transparent), color-stop(0.9, rgba(255, 255, 255, 0.4)));
			height: 100%;
			position: absolute;
			left: 0;
			right: 0;
			top: 0;
			height: 30px;
		}
		body {
			padding-top: 30px;
		}
	`;

	// Prepend the global style, so individual pages can easily override (eg to set their own background-color)
	document.head.prepend(globalStyle);
	globalStyleAdded = true;
}

customElements.define('lucos-navbar', Navbar);
