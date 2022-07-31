import { setUpdateFunctions } from '../classes/manager.js';
import { isCastReceiver } from './cast-detection.js';

/**
 * Currently there are 3 different players included, all with a consistent API:
 * `cast-player` - uses the native cast functional for chromecast devices
 * `web-player` - uses the Web Audio API.  Allows for buffering & cross-fading for a more polished sound.  However, currently doesn't support mediaSession API and stutters when playing an inactive tab over a bluetooth headset on my phone.
 * `audio-element-player` - use the Audio element.  More basic than the Web Audio API, but more robust.
 **/
// Chromecasts are really flakely when it comes to using AudioBuffers and the like
// So use a bespoke player for those devices
import castPlayer from './cast-player.js';
import webPlayer from './web-player.js';
import audioElementPlayer from './audio-element-player.js';

const { getTimeElapsed, getCurrentTrack, isPlaying, init } = isCastReceiver() ? castPlayer : audioElementPlayer;

init();

setUpdateFunctions(getTimeElapsed, getCurrentTrack);

export default { getCurrentTrack, isPlaying };