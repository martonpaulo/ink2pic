import {version} from '../package.json';

export const REPOSITORY_URL = 'https://github.com/martonpaulo/ink2pic';

/** The User-Agent Wikimedia's policy asks for: the plugin, its version and a contact page. */
export const USER_AGENT = `Ink2Pic/${version} (+${REPOSITORY_URL})`;
