const RSS_FEED_URL = "https://www.pornhub.com/rss";
const PLUGIN_ID = "cc99ac03-0037-45e5-89f4-566d1e5bf495";

source.enable = function(conf, settings, savedState) {};

source.getHome = function(continuationToken) {
    const resp = http.GET(RSS_FEED_URL, {}, false);
    if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

    const videos = [];
    const items = resp.body.match(/<item>([\s\S]*?)<\/item>/gi) || [];

    items.forEach(function(item) {
        try {
            const title = (item.match(/<title>([\s\S]*?)<\/title>/i) || ["", "Untitled"])[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
            const url = (item.match(/<link>([\s\S]*?)<\/link>/i) || ["", ""])[1].trim();
            const thumb = (item.match(/media:thumbnail.*?url=["'](.*?)["']/i) || ["", ""])[1];
            
            // Extract views from description string
            const desc = (item.match(/<description>([\s\S]*?)<\/description>/i) || ["", ""])[1];
            const views = parseInt((desc.match(/Views: ([\d,]+)/i) || ["", "0"])[1].replace(/,/g, ""));

            videos.push(new PlatformVideo({
                id: new PlatformID("pornhub", url, PLUGIN_ID),
                name: title,
                thumbnails: new Thumbnails([new Thumbnail(thumb, 320)]),
                author: new PlatformAuthorLink(new PlatformID("pornhub", "unknown", PLUGIN_ID), "Creator", "https://www.pornhub.com", ""),
                url: url,
                duration: 0,
                viewCount: views,
                uploadDate: 0,
                isLive: false
            }));
        } catch (e) {
            // Skip broken items
        }
    });

    return new PHVideoPager(videos, false, null);
};

source.getContentDetails = function(url) {
    const resp = http.GET(url, {}, true);
    if (!resp || resp.code !== 200) throw "Failed to load video page";
    
    const html = resp.body;
    
    // Attempt to extract stream URL directly using regex
    const streamMatch = html.match(/"videoUrl":"([^"]+)"/);
    const streamUrl = streamMatch ? streamMatch[1].replace(/\\/g, "") : null;

    if (!streamUrl) throw "Could not extract video stream";

    return new PlatformVideoDetails({
        id: new PlatformID("pornhub", url, PLUGIN_ID),
        name: (html.match(/<title>([\s\S]*?)<\/title>/i) || ["", "Video"])[1].trim(),
        thumbnails: new Thumbnails([new Thumbnail((html.match(/og:image" content="([^"]+)"/) || ["", ""])[1], 720)]),
        url: url,
        video: new VideoSourceDescriptor([
            new VideoUrlSource({
                url: streamUrl,
                width: 1280, height: 720, container: "video/mp4", codec: "h264", name: "720p"
            })
        ])
    });
};

source.isContentDetailsUrl = (url) => url.includes("view_video.php");
source.getSearchCapabilities = () => ({ types: [Type.Feed.Mixed], sorts: [], filters: [] });
source.search = () => new PHVideoPager([], false, null);
