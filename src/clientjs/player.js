const manager = require("./manager");
const {isCastReceiver} = require("./cast-detection");

/**
 * Currently there are 3 different players included, all with a consistent API:
 * `cast-player` - uses the native cast functional for chromecast devices
 * `web-player` - uses the Web Audio API.  Allows for buffering & cross-fading for a more polished sound.  However, currently doesn't support mediaSession API and stutters when playing an inactive tab over a bluetooth headset on my phone.
 * `audio-element-player` - use the Audio element.  More basic than the Web Audio API, but more robust.
 **/
// Chromecasts are really flakely when it comes to using AudioBuffers and the like
// So use a bespoke player for those devices
const {getTimeElapsed, getCurrentTrack, isPlaying} = isCastReceiver() ? require("./cast-player") : require("./audio-element-player");

manager.setUpdateFunctions(getTimeElapsed, getCurrentTrack);

module.exports = { getCurrentTrack, isPlaying };