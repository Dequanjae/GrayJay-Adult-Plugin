const RSS_FEED_URL = "https://www.pornhub.com/rss?mode=async"; // Using async mode for better metadata
const PLUGIN_ID = "cc99ac03-0037-45e5-89f4-566d1e5bf495";

source.enable = function (conf, settings, savedState) {};

// 1. HOME/BROWSE FEED (Fast and reliable)
source.getHome = function (continuationToken) {
    const resp = http.GET(RSS_FEED_URL, {}, false);
    if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

    const items = resp.body.match(/<item>([\s\S]*?)<\/item>/gi) || [];
    const videos = items.map(item => {
        const title = (item.match(/<title>([\s\S]*?)<\/title>/i) || ["",""])[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
        const url = (item.match(/<link>([\s\S]*?)<\/link>/i) || ["",""])[1].trim();
        const thumb = (item.match(/media:thumbnail.*?url=["'](.*?)["']/i) || ["",""])[1];
        
        // Extracting view count from description if available in XML
        const desc = (item.match(/<description>([\s\S]*?)<\/description>/i) || ["",""])[1];
        const views = parseInt((desc.match(/Views: ([\d,]+)/i) || ["", "0"])[1].replace(/,/g, ""));

        return new PlatformVideo({
            id: new PlatformID("pornhub", url, PLUGIN_ID),
            name: title,
            thumbnails: new Thumbnails([new Thumbnail(thumb, 320)]),
            author: new PlatformAuthorLink(new PlatformID("pornhub", "unknown", PLUGIN_ID), "Creator", "https://www.pornhub.com", ""),
            url: url,
            duration: 0,
            viewCount: views,
            uploadDate: 0,
            isLive: false
        });
    });
    return new PHVideoPager(videos, false, null);
};

// 2. VIDEO EXTRACTION (Direct & Bulletproof)
source.getContentDetails = function (url) {
    const resp = http.GET(url, {}, true);
    const html = resp.body;

    // Use a Regex-based extraction (The fastest way to bypass modern anti-bot headers)
    const streamMatch = html.match(/"videoUrl":"([^"]+)"/);
    const streamUrl = streamMatch ? streamMatch[1].replace(/\\/g, "") : null;

    const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || ["","Unknown"])[1].trim();
    const thumb = (html.match(/og:image" content="([^"]+)"/) || ["",""])[1];

    return new PlatformVideoDetails({
        id: new PlatformID("pornhub", url, PLUGIN_ID),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(thumb, 720)]),
        author: new PlatformAuthorLink(new PlatformID("pornhub", "n/a", PLUGIN_ID), "Creator", "", ""),
        url: url,
        video: new VideoSourceDescriptor([
            new VideoUrlSource({
                url: streamUrl,
                width: 1280, height: 720, container: "video/mp4", codec: "h264", name: "720p", bitrate: 2000000
            })
        ])
    });
};

source.isContentDetailsUrl = (url) => url.includes("view_video.php");
