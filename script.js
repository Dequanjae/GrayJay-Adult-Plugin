const PLUGIN_ID = "cc99ac03-0037-45e5-89f4-566d1e5bf495";
const RSS_URL = "https://www.pornhub.com/rss";

// YOUR custom API link!
const HF_API_URL = "https://dirtydeequan-pornhub-api.hf.space/video?url="; 

source.enable = function(conf, settings, savedState) {};

// --- BROWSE / HOME FEED ---
source.getHome = function(continuationToken) {
    const resp = http.GET(RSS_URL, {}, false);
    if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

    const videos = [];
    const items = resp.body.match(/<item>([\s\S]*?)<\/item>/gi) || [];
    
    items.forEach(function(item) {
        try {
            const title = (item.match(/<title>([\s\S]*?)<\/title>/i) || ["", "Untitled"])[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
            const url = (item.match(/<link>([\s\S]*?)<\/link>/i) || ["", ""])[1].trim();
            const thumb = (item.match(/media:thumbnail.*?url=["'](.*?)["']/i) || ["", ""])[1];
            
            // Getting views from the description string
            const desc = (item.match(/<description>([\s\S]*?)<\/description>/i) || ["", ""])[1];
            const views = parseInt((desc.match(/Views: ([\d,]+)/i) || ["", "0"])[1].replace(/,/g, ""));

            if (url) {
                videos.push(new PlatformVideo({
                    id: new PlatformID("pornhub", url, PLUGIN_ID),
                    name: title,
                    thumbnails: new Thumbnails([new Thumbnail(thumb, 320)]),
                    author: new PlatformAuthorLink(new PlatformID("pornhub", "na", PLUGIN_ID), "Creator", "https://pornhub.com", ""),
                    uploadDate: 0,
                    url: url,
                    duration: 0,
                    viewCount: views,
                    isLive: false
                }));
            }
        } catch (e) {}
    });

    return new PHVideoPager(videos, false, null);
};

source.isContentDetailsUrl = (url) => url.includes("view_video.php");

// --- VIDEO DETAILS & EXTRACTION ---
source.getContentDetails = function(url) {
    // Ping your Hugging Face API
    const resp = http.GET(HF_API_URL + encodeURIComponent(url), {}, false);
    if (!resp || resp.code !== 200) throw "Failed to connect to backend API";

    const json = JSON.parse(resp.body);
    const videoSources = [];

    // Map the .mp4 streams for Grayjay
    if (json.streams && json.streams.length > 0) {
        json.streams.forEach(stream => {
            if (stream.videoUrl && stream.videoUrl.includes(".mp4")) {
                let quality = parseInt(stream.quality) || 720;
                videoSources.push(new VideoUrlSource({
                    url: stream.videoUrl,
                    width: quality === 1080 ? 1920 : 1280,
                    height: quality,
                    container: "video/mp4",
                    codec: "h264",
                    name: quality + "p",
                    bitrate: 4000000
                }));
            }
        });
    }

    if (videoSources.length === 0) throw "No downloadable streams found by API.";

    return new PlatformVideoDetails({
        id: new PlatformID("pornhub", url, PLUGIN_ID),
        name: json.title || "Video",
        thumbnails: new Thumbnails([new Thumbnail(json.thumb || "", 720)]),
        author: new PlatformAuthorLink(new PlatformID("pornhub", "na", PLUGIN_ID), "Creator", "https://pornhub.com", ""),
        uploadDate: 0,
        url: url,
        duration: 0,
        viewCount: 0,
        isLive: false,
        description: "Powered by custom Hugging Face API",
        video: new VideoSourceDescriptor(videoSources) 
    });
};

source.getSearchCapabilities = () => ({ types: [Type.Feed.Mixed], sorts: [], filters: [] });
source.search = () => new PHVideoPager([], false, null);
