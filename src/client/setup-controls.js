import PlayHereForm from './components/playhere-form.js';

const controls = document.getElementById('controls');
if (!controls) throw new Error("No #controls element found");

['devices', 'collections'].forEach(type => {
	const overlay = document.createElement(`${type}-overlay`);
	overlay.style.display = "none";
	const showOverlay = document.createElement("input");
	showOverlay.type = "button";
	showOverlay.value = type.charAt(0).toUpperCase() + type.substring(1);
	showOverlay.addEventListener("click", event => {
		event.stopPropagation();
		overlay.style.display = "block";
	});
	const control = document.createElement("li");
	control.appendChild(showOverlay);
	controls.appendChild(control);
	document.body.append(overlay);
});


const playhereControl = document.createElement("li");
const form = new PlayHereForm();
playhereControl.append(form);

// Should be the 2nd control (straight after playpause)
controls.firstElementChild.after(playhereControl);