import { generate } from 'youtube-po-token-generator';
import { YTDL_GetInfoOptions } from '@/types/options';
import { YT_StreamingFormat, YT_YTInitialPlayerResponse, YTDL_MoreVideoDetailsAdditions, YTDL_VideoInfo } from '@/types/youtube';
import { WebCreator, TvEmbedded, Ios, Android, Web, MWeb, Tv } from '@/core/clients';
import { UnrecoverableError } from '@/core/errors';
import { YTDL_ClientTypes } from '@/meta/Clients';
import { Logger } from '@/utils/Log';
import Url from '@/utils/Url';
import utils from '@/utils';
import { Cache } from '@/cache';
import getHtml5Player from './parser/Html5Player';
import getWatchHTMLPageInfo from './parser/WatchPage';
import Formats from './parser/Formats';
import InfoExtras from './Extras';

/* Private Constants */
const AGE_RESTRICTED_URLS = ['support.google.com/youtube/?p=age_restrictions', 'youtube.com/t/community_guidelines'],
    CONTINUES_NOT_POSSIBLE_ERRORS = ['This video is private'],
    SUPPORTED_CLIENTS = ['web_creator', 'tv_embedded', 'ios', 'android', 'web', 'mweb', 'tv'],
    BASE_CLIENTS: Array<YTDL_ClientTypes> = ['web_creator', 'tv_embedded', 'ios', 'android'],
    BASIC_INFO_CACHE = new Cache();

/* ----------- */

/* Private FUnctions */
function setupClients(clients: Array<YTDL_ClientTypes>): Array<YTDL_ClientTypes> {
    if (clients && clients.length === 0) {
        Logger.warning('At least one client must be specified.');
        clients = BASE_CLIENTS;
    }

    clients = clients.filter((client) => SUPPORTED_CLIENTS.includes(client));

    return [...new Set([...BASE_CLIENTS, ...clients])];
}

async function getSignatureTimestamp(html5player: string, options: YTDL_GetInfoOptions) {
    const BODY = await utils.request<string>(html5player, options),
        MO = BODY.match(/signatureTimestamp:(\d+)/);

    return MO ? MO[1] : undefined;
}

/* ----------- */

/* Public Functions */

/** Gets info from a video without getting additional formats. */
type YTDL_PlayerResponses = {
    web_creator: YT_YTInitialPlayerResponse;
    tv_embedded: YT_YTInitialPlayerResponse;
    ios: YT_YTInitialPlayerResponse;
    android: YT_YTInitialPlayerResponse;
    web?: YT_YTInitialPlayerResponse;
    mweb?: YT_YTInitialPlayerResponse;
    tv?: YT_YTInitialPlayerResponse;
};
async function _getBasicInfo(id: string, options: YTDL_GetInfoOptions, isFromGetInfo?: boolean): Promise<YTDL_VideoInfo> {
    utils.applyIPv6Rotations(options);
    utils.applyDefaultHeaders(options);
    utils.applyDefaultAgent(options);
    utils.applyOldLocalAddress(options);

    options.requestOptions ??= {};

    const { jar, dispatcher } = options.agent || {};

    utils.setPropInsensitive(options.requestOptions?.headers, 'cookie', jar?.getCookieStringSync('https://www.youtube.com'));
    options.requestOptions.dispatcher ??= dispatcher;

    const HTML5_PLAYER_PROMISE = getHtml5Player(id, options),
        WATCH_PAGE_INFO_PROMISE = getWatchHTMLPageInfo(id, options);

    if (options.oauth2 && options.oauth2.shouldRefreshToken()) {
        Logger.info('The specified OAuth2 token has expired and will be renewed automatically.');
        await options.oauth2.refreshAccessToken();
    }

    if (!options.poToken) {
        Logger.warning('Specify poToken for stable and fast operation. See README for details.');
        Logger.info('Automatically generates poToken, but stable operation cannot be guaranteed.');

        try {
            const { poToken, visitorData } = await generate();
            options.poToken = poToken;
            options.visitorData = visitorData;

            Logger.success('Successfully generated a poToken.');
        } catch (err) {
            Logger.error('Failed to generate a poToken.');
        }
    }

    if (options.poToken && !options.visitorData) {
        Logger.warning('If you specify a poToken, you must also specify the visitorData.');
    }

    options.clients = setupClients(options.clients || BASE_CLIENTS);

    const HTML5_PLAYER_URL = (await HTML5_PLAYER_PROMISE).playerUrl;

    if (!HTML5_PLAYER_URL) {
        throw new Error('Unable to find html5player file');
    }

    const SIGNATURE_TIMESTAMP = parseInt((await getSignatureTimestamp(HTML5_PLAYER_URL, options)) || ''),
        PLAYER_API_PARAMS = {
            videoId: id,
            signatureTimestamp: SIGNATURE_TIMESTAMP,
            options,
        },
        PLAYER_API_PROMISE = {
            web_creator: WebCreator.getPlayerResponse(PLAYER_API_PARAMS),
            tv_embedded: TvEmbedded.getPlayerResponse(PLAYER_API_PARAMS),
            ios: Ios.getPlayerResponse(PLAYER_API_PARAMS),
            android: Android.getPlayerResponse(PLAYER_API_PARAMS),
            web: options.clients.includes('web') ? Web.getPlayerResponse(PLAYER_API_PARAMS) : Promise.resolve(null),
            mweb: options.clients.includes('mweb') ? MWeb.getPlayerResponse(PLAYER_API_PARAMS) : Promise.resolve(null),
            tv: options.clients.includes('tv') ? Tv.getPlayerResponse(PLAYER_API_PARAMS) : Promise.resolve(null),
        },
        PLAYER_FETCH_PROMISE = Promise.allSettled(Object.values(PLAYER_API_PROMISE)),
        WATCH_PAGE_INFO = await WATCH_PAGE_INFO_PROMISE,
        PLAYER_API_RESPONSES = await PLAYER_FETCH_PROMISE,
        PLAYER_RESPONSES: YTDL_PlayerResponses = {} as any,
        PLAYER_RESPONSE_ARRAY: Array<YT_YTInitialPlayerResponse> = [],
        VIDEO_INFO: YTDL_VideoInfo = {
            _watchPageInfo: WATCH_PAGE_INFO,
            related_videos: [],
            videoDetails: {},
            formats: [],
            html5Player: null,
            clients: options.clients,
            full: false,
            isMinimumMode: false,
        } as any;

    let errorDetails: any | null = null;

    options.clients.forEach((client, i) => {
        if (PLAYER_API_RESPONSES[i].status === 'fulfilled') {
            if (PLAYER_API_RESPONSES[i].value === null) {
                return;
            }

            const CONTENTS = PLAYER_API_RESPONSES[i].value?.contents as any;
            PLAYER_RESPONSES[client] = CONTENTS;
            PLAYER_RESPONSE_ARRAY.push(CONTENTS);

            Logger.debug(`[ ${client} ]: Success`);
        } else {
            const REASON = PLAYER_API_RESPONSES[i].reason;
            Logger.debug(`[ ${client} ]: Error\nReason: ${REASON.error}`);
            PLAYER_RESPONSES[client] = REASON.contents;

            if (client === 'ios') {
                errorDetails = REASON;
            }
        }
    });

    const IS_MINIMUM_MODE = PLAYER_API_RESPONSES.every((r) => r.status === 'rejected');

    if (IS_MINIMUM_MODE) {
        const ERROR_TEXT = `All player APIs responded with an error. (Clients: ${options.clients.join(', ')})\nFor more information, specify YTDL_DEBUG as an environment variable.`;

        if (errorDetails && (CONTINUES_NOT_POSSIBLE_ERRORS.includes(errorDetails.contents.playabilityStatus.reason) || !errorDetails.contents.videoDetails)) {
            throw new UnrecoverableError(ERROR_TEXT + `\nNote: This error cannot continue processing. (Details: ${JSON.stringify(errorDetails.contents.playabilityStatus.reason)})`);
        }

        Logger.error(ERROR_TEXT);
        Logger.info('Only minimal information is available, as information from the Player API is not available.');
    }

    VIDEO_INFO.isMinimumMode = IS_MINIMUM_MODE;
    VIDEO_INFO.html5Player = HTML5_PLAYER_URL;

    if (isFromGetInfo) {
        VIDEO_INFO._playerResponses = PLAYER_RESPONSES;
    }

    if (!IS_MINIMUM_MODE) {
        /* Filtered */
        const INCLUDE_STORYBOARDS = PLAYER_RESPONSE_ARRAY.filter((p) => p.storyboards)[0],
            VIDEO_DETAILS = (PLAYER_RESPONSE_ARRAY.filter((p) => p.videoDetails)[0]?.videoDetails as any) || {},
            MICROFORMAT = PLAYER_RESPONSE_ARRAY.filter((p) => p.microformat)[0]?.microformat || null;

        const STORYBOARDS = InfoExtras.getStoryboards(INCLUDE_STORYBOARDS),
            MEDIA = InfoExtras.getMedia(PLAYER_RESPONSES.web_creator) || InfoExtras.getMedia(PLAYER_RESPONSES.tv_embedded) || InfoExtras.getMedia(PLAYER_RESPONSES.ios) || InfoExtras.getMedia(PLAYER_RESPONSES.android),
            AGE_RESTRICTED = !!MEDIA && AGE_RESTRICTED_URLS.some((url) => Object.values(MEDIA || {}).some((v) => typeof v === 'string' && v.includes(url))),
            ADDITIONAL_DATA: YTDL_MoreVideoDetailsAdditions = {
                video_url: Url.getWatchPageUrl(id),
                author: InfoExtras.getAuthor(PLAYER_RESPONSES.web_creator) || InfoExtras.getAuthor(PLAYER_RESPONSES.tv_embedded) || InfoExtras.getAuthor(PLAYER_RESPONSES.ios) || InfoExtras.getAuthor(PLAYER_RESPONSES.android),
                media: MEDIA,
                likes: InfoExtras.getLikes(WATCH_PAGE_INFO),
                age_restricted: AGE_RESTRICTED,
                storyboards: STORYBOARDS,
                chapters: InfoExtras.getChapters(WATCH_PAGE_INFO),
            };

        VIDEO_INFO.videoDetails = InfoExtras.cleanVideoDetails(Object.assign({}, VIDEO_DETAILS, ADDITIONAL_DATA), MICROFORMAT);
    } else {
        VIDEO_INFO.videoDetails = InfoExtras.cleanVideoDetails(errorDetails.contents.videoDetails as any, null);
    }

    VIDEO_INFO.related_videos = InfoExtras.getRelatedVideos(WATCH_PAGE_INFO);
    VIDEO_INFO.formats = PLAYER_RESPONSE_ARRAY.reduce((items: Array<YT_StreamingFormat>, playerResponse) => {
        return [...items, ...Formats.parseFormats(playerResponse)];
    }, []) as any;

    return VIDEO_INFO;
}

async function getBasicInfo(link: string, options: YTDL_GetInfoOptions = {}): Promise<YTDL_VideoInfo> {
    utils.checkForUpdates();
    const ID = Url.getVideoID(link),
        CACHE_KEY = ['getBasicInfo', ID, options.lang].join('-');

    return BASIC_INFO_CACHE.getOrSet(CACHE_KEY, () => _getBasicInfo(ID, options)) as Promise<YTDL_VideoInfo>;
}

export { _getBasicInfo };
export default getBasicInfo;
