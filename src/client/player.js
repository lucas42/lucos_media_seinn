import { setUpdateFunctions } from '../classes/manager.js';

/**
 * Currently there are 2 different players included, both with a consistent API:
 * `web-player` - uses the Web Audio API.  Allows for buffering & cross-fading for a more polished sound.  However, currently doesn't support mediaSession API and stutters when playing an inactive tab over a bluetooth headset on my phone.
 * `audio-element-player` - use the Audio element.  More basic than the Web Audio API, but more robust.
 **/
import webPlayer from './web-player.js';
import audioElementPlayer from './audio-element-player.js';

const { getTimeElapsed, getCurrentTrack, isPlaying, init } = audioElementPlayer;

init();

setUpdateFunctions(getTimeElapsed, getCurrentTrack);

export default { getCurrentTrack, isPlaying };