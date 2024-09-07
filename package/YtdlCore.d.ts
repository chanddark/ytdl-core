import { PassThrough } from 'stream';
import { chooseFormat, filterFormats } from './format-utils';
import { validateID, validateURL, getURLVideoID, getVideoID } from './url-utils';
import { createAgent, createProxyAgent } from './core/Agent';
import { OAuth2 } from './core/OAuth2';
import { getBasicInfo, getFullInfo, getInfo } from './core/Info';
import { YTDL_DownloadOptions } from './types/options';
import { YTDL_VideoInfo } from './types/youtube';
import { VERSION } from './utils/constants';
declare const ytdl: {
    (link: string, options?: YTDL_DownloadOptions): PassThrough;
    downloadFromInfo: typeof downloadFromInfo;
    getBasicInfo: typeof getBasicInfo;
    getInfo: typeof getInfo;
    getFullInfo: typeof getFullInfo;
    chooseFormat: typeof chooseFormat;
    filterFormats: typeof filterFormats;
    validateID: typeof validateID;
    validateURL: typeof validateURL;
    getURLVideoID: typeof getURLVideoID;
    getVideoID: typeof getVideoID;
    createAgent: typeof createAgent;
    createProxyAgent: typeof createProxyAgent;
    OAuth2: typeof OAuth2;
    version: string;
};
/** Can be used to download video after its `info` is gotten through
 * `ytdl.getInfo()`. In case the user might want to look at the
 * `info` object before deciding to download. */
declare function downloadFromInfo(info: YTDL_VideoInfo, options?: YTDL_DownloadOptions): PassThrough;
export { downloadFromInfo, getBasicInfo, getInfo, chooseFormat, filterFormats, validateID, validateURL, getURLVideoID, getVideoID, createAgent, createProxyAgent, OAuth2, VERSION };
export default ytdl;
