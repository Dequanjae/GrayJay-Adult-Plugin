const RSS_FEED_URL = "https://www.pornhub.com/rss";
const PLUGIN_ID = "cc99ac03-0037-45e5-89f4-566d1e5bf495";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

source.enable = function (conf, settings, savedState) {};
source.isLoggedIn = function () { return false; };

source.getHome = function (continuationToken) {
  const resp = http.GET(RSS_FEED_URL, HEADERS, false);
  if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

  const items = resp.body.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  const videos = [];

  items.forEach(function (itemXml) {
    try {
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
      const thumbMatch = itemXml.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|png|webp))/i);
      
      if (!linkMatch) return;

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "Untitled";
      const videoUrl = linkMatch[1].trim();
      const thumb = thumbMatch ? thumbMatch[1] : "";
      const viewKey = videoUrl.split("viewkey=")[1] || videoUrl;

      videos.push(new PlatformVideo({
        id: new PlatformID("pornhub", viewKey, PLUGIN_ID),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(thumb, 360)]),
        author: new PlatformAuthorLink(new PlatformID("pornhub", "rss", PLUGIN_ID), "Pornhub Feed", RSS_FEED_URL, ""),
        url: videoUrl,
        duration: 0,
        viewCount: 0,
        uploadDate: Math.floor(Date.now() / 1000),
        isLive: false
      }));
    } catch (e) {}
  });

  return new PHVideoPager(videos, false, null);
};

// --- FIXES THE "NO SOURCE ENABLED" ERROR ---
source.isChannelUrl = function (url) {
  return url.includes("pornhub.com/user/") || url.includes("pornhub.com/channel/");
};

source.getChannel = function (url) {
  return new PlatformChannel({
    id: new PlatformID("pornhub", url, PLUGIN_ID),
    name: "Pornhub Creator",
    thumbnail: "",
    banner: "",
    description: "User profile.",
    subscribers: 0,
    links: []
  });
};

source.isContentDetailsUrl = function (url) {
  return url.includes("view_video.php");
};

source.getContentDetails = function (url) {
  const resp = http.GET(url, HEADERS, true);
  const dom = domParser.parseFromString(resp.body, "text/html");
  
  // Use a safer title selector
  const title = dom.querySelector("h1")?.textContent?.trim() || "Untitled Video";
  const viewCount = parseInt(dom.querySelector(".views .count")?.textContent?.replace(/[^0-9]/g, "") || "0");

  return new PlatformVideoDetails({
    id: new PlatformID("pornhub", url, PLUGIN_ID),
    name: title,
    thumbnails: new Thumbnails([new Thumbnail("", 720)]),
    author: new PlatformAuthorLink(new PlatformID("pornhub", "unknown", PLUGIN_ID), "Creator", "https://www.pornhub.com", ""),
    url: url,
    duration: 0,
    viewCount: viewCount,
    uploadDate: Math.floor(Date.now() / 1000),
    description: "",
    video: new VideoSourceDescriptor([]), // Note: You may need to add your media parser here
    isLive: false
  });
};

source.getSearchCapabilities = function () { return { types: [Type.Feed.Mixed], sorts: [], filters: [] }; };
source.search = function (query, type, order, filters, continuationToken) { return new PHVideoPager([], false, null); };

class PHVideoPager extends VideoPager {
  constructor(results, hasMore, context) { super(results, hasMore, context); }
  nextPage() { return new PHVideoPager([], false, null); }
}
