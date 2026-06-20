const RSS_FEED_URL = "https://www.pornhub.com/rss";
const PLUGIN_ID = "cc99ac03-0037-45e5-89f4-566d1e5bf495";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

// Default APIs
const NAS_API = "http://192.168.50.235:9001/";
const PUBLIC_API = "https://api.cobalt.tools/";

source.enable = function (conf, settings, savedState) {};
source.isLoggedIn = function () { return false; };

// --- CATALOG / HOME FEED ---
source.getHome = function (continuationToken) {
  const resp = http.GET(RSS_FEED_URL, HEADERS, false);
  if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

  const items = resp.body.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  const videos = [];

  items.forEach(function (itemXml) {
    try {
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
      if (!linkMatch) return;

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "Untitled Video";
      const videoUrl = linkMatch[1].trim();

      let thumb = "";
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
      if (descMatch) {
        const imgMatch = descMatch[1].match(/src=["'](https?:\/\/[^"']+)["']/i);
        if (imgMatch) thumb = imgMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      }

      if (!thumb) {
        const fallbackMatch = itemXml.match(/(https?:\/\/ei\.phncdn\.com\/videos\/[^\s"'<>]+)/i);
        if (fallbackMatch) thumb = fallbackMatch[1];
      }

      videos.push(new PlatformVideo({
        id: new PlatformID("pornhub", videoUrl, PLUGIN_ID),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(thumb, 360)]),
        author: new PlatformAuthorLink(new PlatformID("pornhub", "unknown", PLUGIN_ID), "Loading...", "https://www.pornhub.com", ""),
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

// --- CONTENT DETAILS & DEEP EXTRACTION ---
source.isContentDetailsUrl = function (url) {
  return url.includes("view_video.php");
};

source.getContentDetails = function (url) {
  // 1. Fetch metadata HTML
  const resp = http.GET(url, HEADERS, true);
  const html = resp.body;
  const dom = domParser.parseFromString(html, "text/html");

  // Parse Metadata
  const title = dom.querySelector("meta[property='og:title']")?.getAttribute("content") || dom.querySelector("h1")?.textContent?.trim() || "Untitled Video";
  const thumb = dom.querySelector("meta[property='og:image']")?.getAttribute("content") || "";
  const viewText = dom.querySelector(".views .count")?.textContent || "0";
  const viewCount = parseInt(viewText.replace(/[^0-9]/g, "")) || 0;

  // Parse Creator
  const authorEl = dom.querySelector(".usernameBadgesWrapper a") || dom.querySelector(".usernameWrap a") || dom.querySelector("a[href*='/users/']");
  const authorName = authorEl ? authorEl.textContent.trim() : "Verified Creator";
  let authorUrl = authorEl ? authorEl.getAttribute("href") : "https://www.pornhub.com";
  if (authorUrl && !authorUrl.startsWith("http")) authorUrl = "https://www.pornhub.com" + authorUrl;

  const videoSources = [];
  let streamUrl = null;
  let extractionMethod = "Failed";

  // ==========================================
  // THE TRIPLE-THREAT EXTRACTION SYSTEM
  // ==========================================

  const cobaltHeaders = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  const cobaltPayload = JSON.stringify({ url: url });

  // METHOD 1: Try Local NAS First
  try {
    const localResp = http.POST(NAS_API, cobaltPayload, cobaltHeaders, false);
    if (localResp && localResp.code === 200) {
      const json = JSON.parse(localResp.body);
      if (json && json.url) {
        streamUrl = json.url;
        extractionMethod = "Streamed via Private NAS";
      }
    }
  } catch (e) { /* NAS failed or phone blocked HTTP */ }

  // METHOD 2: Try Public Cobalt if NAS Failed
  if (!streamUrl) {
    try {
      const publicResp = http.POST(PUBLIC_API, cobaltPayload, cobaltHeaders, false);
      if (publicResp && publicResp.code === 200) {
        const json = JSON.parse(publicResp.body);
        if (json && json.url) {
          streamUrl = json.url;
          extractionMethod = "Streamed via Public API";
        }
      }
    } catch (e) { /* Public API failed */ }
  }

  // METHOD 3: Native Web Scraper (Absolute Last Resort)
  if (!streamUrl) {
    const flashvarsMatch = html.match(/var\s+flashvars_\d+\s*=\s*(\{[\s\S]*?\});/);
    if (flashvarsMatch) {
      const mediaDefsMatch = flashvarsMatch[1].match(/"mediaDefinitions"\s*:\s*(\[[\s\S]*?\])/);
      if (mediaDefsMatch) {
        const urlRegex = /"videoUrl"\s*:\s*"([^"]+)"/g;
        let match;
        // Grab the last (usually highest quality) URL
        while ((match = urlRegex.exec(mediaDefsMatch[1])) !== null) {
          const cleanUrl = match[1].replace(/\\/g, "");
          if (cleanUrl) streamUrl = cleanUrl;
        }
        if (streamUrl) extractionMethod = "Streamed via Native Scraper";
      }
    }
  }

  // Finalize stream push
  if (streamUrl) {
    videoSources.push(new VideoUrlSource({
      url: streamUrl,
      width: 1280,
      height: 720,
      container: "video/mp4",
      codec: "h264",
      name: "720p",
      duration: 0,
      bitrate: 4000000
    }));
  }

  return new PlatformVideoDetails({
    id: new PlatformID("pornhub", url, PLUGIN_ID),
    name: title,
    thumbnails: new Thumbnails([new Thumbnail(thumb, 720)]),
    author: new PlatformAuthorLink(new PlatformID("pornhub", authorUrl, PLUGIN_ID), authorName, authorUrl, ""),
    url: url,
    duration: 0,
    viewCount: viewCount,
    uploadDate: Math.floor(Date.now() / 1000),
    description: extractionMethod, // This will tell us WHICH method actually worked!
    video: new VideoSourceDescriptor(videoSources),
    isLive: false
  });
};

// --- CHANNEL LINK RESOLUTION ---
source.isChannelUrl = function (url) {
  return url.includes("pornhub.com/user/") || url.includes("pornhub.com/channels/") || url.includes("pornhub.com/model/");
};

source.getChannel = function (url) {
  return new PlatformChannel({
    id: new PlatformID("pornhub", url, PLUGIN_ID),
    name: "Creator Profile",
    thumbnail: "",
    banner: "",
    description: "Browse direct uploads.",
    subscribers: 0,
    links: []
  });
};

source.getSearchCapabilities = function () { return { types: [Type.Feed.Mixed], sorts: [], filters: [] }; };
source.search = function (query, type, order, filters, continuationToken) { return new PHVideoPager([], false, null); };

class PHVideoPager extends VideoPager {
  constructor(results, hasMore, context) { super(results, hasMore, context); }
  nextPage() { return new PHVideoPager([], false, null); }
}
