const RSS_FEED_URL = "https://www.pornhub.com/rss";
const PLUGIN_ID = "cc99ac03-0037-45e5-89f4-566d1e5bf495";

const HEADERS_BASE = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

source.enable = function (conf, settings, savedState) {};
source.isLoggedIn = function () { return false; };

source.getHome = function (continuationToken) {
  const resp = http.GET(RSS_FEED_URL, HEADERS_BASE, false);
  if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

  const body = resp.body;
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const videos = [];
  let match;

  while ((match = itemRegex.exec(body)) !== null) {
    try {
      const itemXml = match[1];
      const title = (itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || itemXml.match(/<title>([\s\S]*?)<\/title>/i))[1].trim();
      const videoUrl = itemXml.match(/<link>([\s\S]*?)<\/link>/i)[1].trim();
      const thumb = (itemXml.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|png|webp))/i) || ["", ""])[1];
      const viewKey = videoUrl.match(/viewkey=([a-zA-Z0-9]+)/)[1];

      videos.push(new PlatformVideo({
        id: new PlatformID("pornhub", viewKey, PLUGIN_ID),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(thumb, 360)]),
        author: new PlatformAuthorLink(new PlatformID("pornhub", "rss_feed", PLUGIN_ID), "Pornhub RSS", RSS_FEED_URL, ""),
        url: videoUrl,
        duration: 0,
        viewCount: 0, // Set to 0 if not available in RSS
        uploadDate: Math.floor(Date.now() / 1000), 
        isLive: false
      }));
    } catch (e) {}
  }
  return new PHVideoPager(videos, false, null);
};

// --- CHANNEL HANDLING ---
source.isChannelUrl = function (url) {
  return url.includes("pornhub.com/user/") || url.includes("pornhub.com/channels/");
};

source.getChannel = function (url) {
  return new PlatformChannel({
    id: new PlatformID("pornhub", url, PLUGIN_ID),
    name: "Pornhub User",
    thumbnail: "",
    banner: "",
    description: "Browse content from this user.",
    subscribers: 0,
    links: []
  });
};

// --- VIDEO DETAILS ---
source.isContentDetailsUrl = function (url) {
  return /pornhub\.com\/view_video\.php/.test(url);
};

source.getContentDetails = function (url) {
  const resp = http.GET(url, HEADERS_BASE, true);
  const html = resp.body;
  const flashvarsMatch = html.match(/var\s+flashvars_\d+\s*=\s*(\{[\s\S]*?\});\s*\n/);
  const flashvars = JSON.parse(flashvarsMatch[1]);

  const dom = domParser.parseFromString(html, "text/html");
  
  // Extract Views as Number
  const viewText = dom.querySelector(".views .count")?.textContent || "0";
  const viewCount = parseInt(viewText.replace(/[^0-9]/g, "")) || 0;

  return new PlatformVideoDetails({
    id: new PlatformID("pornhub", flashvars.video_id, PLUGIN_ID),
    name: flashvars.video_title,
    thumbnails: new Thumbnails([new Thumbnail(flashvars.image_url, 720)]),
    author: new PlatformAuthorLink(new PlatformID("pornhub", "user_link", PLUGIN_ID), "Creator", "https://www.pornhub.com", ""),
    url: url,
    duration: parseInt(flashvars.video_duration) || 0,
    viewCount: viewCount, // Now a proper number
    uploadDate: Math.floor(Date.now() / 1000),
    description: "",
    video: new VideoSourceDescriptor(parseMediaDefinitions(flashvars.mediaDefinitions)),
    isLive: false
  });
};

function parseMediaDefinitions(defs) {
  const sources = [];
  defs.forEach(function (def) {
    if (def.format === "mp4") {
      sources.push(new VideoUrlSource({
        url: def.videoUrl,
        width: 1280, height: parseInt(def.quality), container: "video/mp4",
        codec: "h264", name: def.quality + "p", duration: 0, bitrate: 4000000
      }));
    }
  });
  return sources;
}

source.getSearchCapabilities = function () { return { types: [Type.Feed.Mixed], sorts: [], filters: [] }; };
source.search = function (query, type, order, filters, continuationToken) { return new PHVideoPager([], false, null); };

class PHVideoPager extends VideoPager {
  constructor(results, hasMore, context) { super(results, hasMore, context); }
  nextPage() { return new PHVideoPager([], false, null); }
}
