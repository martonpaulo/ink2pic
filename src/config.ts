import {version} from '../package.json';

export const REPOSITORY_URL = 'https://github.com/martonpaulo/ink2pic';

/** The User-Agent Wikimedia's policy asks for: the plugin, its version and a contact page. */
export const USER_AGENT = `Ink2Pic/${version} (+${REPOSITORY_URL})`;

/**
 * The #75 spike's Probe pen and page and Lasso last word buttons in the Log view. True for build
 * 16, which the owner tests them on; false once the spike ends (brief section 8.11).
 */
export const PROBE_CONTROLS = true;
