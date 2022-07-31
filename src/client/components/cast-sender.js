const receiverApplicationId = clientVariables.receiverApplicationId; // TODO: don't read directly from global scope

class CastSender extends HTMLElement {
	constructor() {
		super();
		const component = this;
		const shadow = component.attachShadow({mode: 'open'});

		const castUrl = "cast:"+receiverApplicationId;
		const castRequest = new PresentationRequest(castUrl);

		function startCasting() {
			castRequest.start()
				.catch(() => {}); // Handle any errors silently
		}

		const sendCast = document.createElement("input");
		sendCast.type = "button";
		sendCast.value = "Cast Elsewhere ☄";
		sendCast.id = "sendCast";
		sendCast.addEventListener("click", startCasting);
		shadow.append(sendCast);

		function setVisibility(availability) {
			component.style.display = availability.value ? "block" : "none";
		}

		castRequest.getAvailability().then(availability => {
			setVisibility(availability);
			availability.onchange = event => setVisibility(event.target);
		});


		// Also cast when the 'c' button is pressed
		document.addEventListener('keyup', e => {
			if (e.key === "c") startCasting();
		}, false);
	}
}

customElements.define('cast-sender', CastSender);