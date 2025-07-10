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
	document.getElementById('controls').appendChild(control);
	document.body.append(overlay);
});