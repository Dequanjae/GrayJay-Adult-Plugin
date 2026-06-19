const RSS_FEED_URL = "https://www.pornhub.com/rss";
const PLUGIN_ID = "cc99ac03-0037-45e5-89f4-566d1e5bf495";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
};

source.enable = function (conf, settings, savedState) {};
source.isLoggedIn = function () { return false; };

// Home Feed
source.getHome = function (continuationToken) {
  const resp = http.GET(RSS_FEED_URL, HEADERS, false);
  if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

  const items = resp.body.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  const videos = [];

  items.forEach(function (itemXml) {
    try {
      const title = (itemXml.match(/<title>([\s\S]*?)<\/title>/i) || ["","Untitled"])[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
      if (!linkMatch) return;
      
      const videoUrl = linkMatch[1].trim();
      // Try to find a thumbnail inside the XML item
      const thumbMatch = itemXml.match(/url=["'](https?:\/\/[^"']+\.(?:jpg|png|webp))/i);
      const thumb = thumbMatch ? thumbMatch[1] : "";

      videos.push(new PlatformVideo({
        id: new PlatformID("pornhub", videoUrl, PLUGIN_ID),
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

// Video Page Details
source.getContentDetails = function (url) {
  const resp = http.GET(url, HEADERS, true);
  const html = resp.body;
  const dom = domParser.parseFromString(html, "text/html");

  // 1. Get Real Author Name
  const authorEl = dom.querySelector(".usernameBadgesWrapper a") || dom.querySelector(".usernameWrap a");
  const authorName = authorEl ? authorEl.textContent.trim() : "Unknown Creator";
  const authorUrl = authorEl ? "https://www.pornhub.com" + authorEl.getAttribute("href") : "https://www.pornhub.com";

  // 2. Get Video Stream (Using flexible flashvars logic)
  let videoSources = [];
  const flashvarsMatch = html.match(/var\s+flashvars_\d+\s*=\s*(\{[\s\S]*?\});/);
  
  if (flashvarsMatch) {
    try {
      const flashvars = JSON.parse(flashvarsMatch[1]);
      if (flashvars.mediaDefinitions) {
        flashvars.mediaDefinitions.forEach(function(def) {
          videoSources.push(new VideoUrlSource({
            url: def.videoUrl,
            width: 1280, height: parseInt(def.quality) || 720,
            container: "video/mp4",
            codec: "h264", name: def.quality + "p",
            duration: 0, bitrate: 4000000
          }));
        });
      }
    } catch (e) { /* Fallback if JSON fails */ }
  }

  return new PlatformVideoDetails({
    id: new PlatformID("pornhub", url, PLUGIN_ID),
    name: dom.querySelector("h1")?.textContent?.trim() || "Untitled Video",
    thumbnails: new Thumbnails([new Thumbnail(dom.querySelector("meta[property='og:image']")?.getAttribute("content") || "", 720)]),
    author: new PlatformAuthorLink(new PlatformID("pornhub", authorUrl, PLUGIN_ID), authorName, authorUrl, ""),
    url: url,
    duration: 0,
    viewCount: 0,
    uploadDate: Math.floor(Date.now() / 1000),
    description: "",
    video: new VideoSourceDescriptor(videoSources),
    isLive: false
  });
};

source.isChannelUrl = function (url) { return url.includes("pornhub.com/user/") || url.includes("pornhub.com/channel/"); };
source.getChannel = function (url) { return new PlatformChannel({ id: new PlatformID("pornhub", url, PLUGIN_ID), name: "Pornhub User", thumbnail: "", banner: "", description: "Profile", subscribers: 0, links: [] }); };
source.isContentDetailsUrl = function (url) { return url.includes("view_video.php"); };
source.getSearchCapabilities = function () { return { types: [Type.Feed.Mixed], sorts: [], filters: [] }; };
source.search = function (query, type, order, filters, continuationToken) { return new PHVideoPager([], false, null); };

class PHVideoPager extends VideoPager {
  constructor(results, hasMore, context) { super(results, hasMore, context); }
  nextPage() { return new PHVideoPager([], false, null); }
}
