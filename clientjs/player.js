const manager = require("./manager");
function isCastReceiver() {

	// Don't even bother trying to create a cast receiver with the relevant libraries
	if (!('cast' in window)) return false;
	const capabilities = cast.framework.CastReceiverContext.getInstance().getDeviceCapabilities();

	// If capabalities is null, then the device isn't set up for receiving casts;
	if (capabilities == null) return false;
	return true;
}

// Chromecasts are really flakely when it comes to using AudioBuffers and the like
// So use a bespoke player for those devices
const updateFunctions = isCastReceiver() ? require("./cast-player") : require("./web-player");

manager.setUpdateFunctions(updateFunctions.getTimeElapsed, updateFunctions.getCurrentTrack);