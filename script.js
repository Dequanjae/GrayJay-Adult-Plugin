const PLUGIN_ID = "cc99ac03-0037-45e5-89f4-566d1e5bf495";
const RSS_URL = "https://www.pornhub.com/rss";

source.enable = function(conf, settings, savedState) {};

source.getHome = function(continuationToken) {
    const resp = http.GET(RSS_URL, {}, false);
    if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

    const videos = [];
    // Basic regex to get items without crashing
    const items = resp.body.match(/<item>([\s\S]*?)<\/item>/gi) || [];
    
    items.forEach(function(item) {
        const title = (item.match(/<title>([\s\S]*?)<\/title>/i) || ["", "Untitled"])[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
        const url = (item.match(/<link>([\s\S]*?)<\/link>/i) || ["", ""])[1].trim();
        const thumb = (item.match(/media:thumbnail.*?url=["'](.*?)["']/i) || ["", ""])[1];

        if (url) {
            videos.push(new PlatformVideo({
                id: new PlatformID("pornhub", url, PLUGIN_ID),
                name: title,
                thumbnails: new Thumbnails([new Thumbnail(thumb, 320)]),
                author: new PlatformAuthorLink(new PlatformID("pornhub", "na", PLUGIN_ID), "Creator", "https://pornhub.com", ""),
                uploadDate: 0,
                url: url,
                duration: 0,
                viewCount: 0,
                isLive: false
            }));
        }
    });

    return new PHVideoPager(videos, false, null);
};

source.isContentDetailsUrl = (url) => url.includes("view_video.php");

source.getContentDetails = function(url) {
    // Return a dummy video so the app doesn't crash on click
    return new PlatformVideoDetails({
        id: new PlatformID("pornhub", url, PLUGIN_ID),
        name: "Test Video",
        thumbnails: new Thumbnails([new Thumbnail("", 720)]),
        author: new PlatformAuthorLink(new PlatformID("pornhub", "na", PLUGIN_ID), "Creator", "https://pornhub.com", ""),
        uploadDate: 0,
        url: url,
        duration: 0,
        viewCount: 0,
        isLive: false,
        description: "Testing stability...",
        video: new VideoSourceDescriptor([]) // Empty descriptor to prevent crash
    });
};

source.getSearchCapabilities = () => ({ types: [Type.Feed.Mixed], sorts: [], filters: [] });
source.search = () => new PHVideoPager([], false, null);
