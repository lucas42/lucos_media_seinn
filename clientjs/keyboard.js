const volume = require("./volume");
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
			volume.increment();
			break;
		case "ArrowDown":
			volume.decrement();
			break;
	}
}, false);