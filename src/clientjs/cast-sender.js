function addCastLauncher(receiverApplicationId) {
	window['__onGCastApiAvailable'] = (isAvailable) => {

		// I've never seen `isAvailable` to be be false, but the docs say to check for it.
		if (!isAvailable) return;

		/**
		 * The cast library has a race condition which means occasionally it hasn't set its global variables by the time this function is called.
		 * I haven't debugged it in detail, so just bail when it's detected and log the error
		 * If no cast library has loaded properly, the `cast` global will be missing
		 * If the receiver library has loaded, but not the sender, `CastContext` will be missing from `cast.framework`
		 **/
		if (!('cast' in window)) return console.error("Race condition: cast variable not ready");
		if (!('CastContext' in cast.framework)) return console.error("Race condition: CastContext variable not ready");

		// Instruct the cast library which receiver app to use when launched
		cast.framework.CastContext.getInstance().setOptions({
			receiverApplicationId
		});

		// Add a launcher button to the control panel
		const launcher = document.createElement("google-cast-launcher");
		const control = document.createElement("li");
		control.appendChild(launcher);
		document.getElementById("controls").appendChild(control);
	};
}
module.exports = addCastLauncher;