document.addEventListener('keyup', function (e) {
	e.preventDefault();
	e.stopPropagation();
	switch (e.key) {
		case " ":
			document.getElementById("playpause").requestSubmit();
			break;
		case "n":
		case "ArrowRight":
			document.getElementById("next").requestSubmit();
			break;
		case "m":
			document.getElementById("edit").requestSubmit();
			break;
		case "ArrowUp":
			document.getElementById("volume-up").requestSubmit();
			break;
		case "ArrowDown":
			document.getElementById("volume-down").requestSubmit();
			break;
	}
}, false);