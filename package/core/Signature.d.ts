import vm from 'node:vm';
import { YTDL_GetInfoOptions, YTDL_RequestOptions } from '../types/Options';
import { Cache } from './Cache';
declare const CACHE: Cache;
declare function extractFunctions(body: string): (vm.Script | null)[];
declare function getFunctions<T = unknown>(html5PlayerFile: string, options: YTDL_RequestOptions): T | null;
declare function setDownloadURL(format: any, decipherScript: vm.Script, nTransformScript: vm.Script): void;
declare function decipherFormats(formats: any, html5PlayerFile: string, options: YTDL_RequestOptions): Promise<Record<string, string>>;
declare function getSignatureTimestamp(html5PlayerUrl: string, options: YTDL_GetInfoOptions): Promise<string | undefined>;
export { CACHE, extractFunctions, getFunctions, setDownloadURL, decipherFormats, getSignatureTimestamp };
declare const _default: {
    CACHE: Cache;
    extractFunctions: typeof extractFunctions;
    getFunctions: typeof getFunctions;
    setDownloadURL: typeof setDownloadURL;
    decipherFormats: typeof decipherFormats;
    getSignatureTimestamp: typeof getSignatureTimestamp;
};
export default _default;