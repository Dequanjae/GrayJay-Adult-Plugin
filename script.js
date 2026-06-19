const RSS_FEED_URL = "https://www.pornhub.com/rss";

const HEADERS_BASE = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

// -----------------------------------------------
// ENABLE / AUTH (Stripped to Basics)
// -----------------------------------------------

source.enable = function (conf, settings, savedState) {
};

source.isLoggedIn = function () {
  return false;
};

// -----------------------------------------------
// HOME (Fetches and Parses RSS Feed)
// -----------------------------------------------

source.getHome = function (continuationToken) {
  if (!RSS_FEED_URL || RSS_FEED_URL === "") {
    throw new ScriptException("Please provide a valid RSS feed URL.");
  }

  const resp = http.GET(RSS_FEED_URL, HEADERS_BASE, false);

  if (!resp || resp.code !== 200) {
    return new PHVideoPager([], false, null);
  }

  const dom = domParser.parseFromString(resp.body, "text/xml");
  const items = dom.querySelectorAll("item");
  const videos = [];

  items.forEach(function (item) {
    try {
      const titleEl = item.querySelector("title");
      const linkEl = item.querySelector("link");
      if (!titleEl || !linkEl) return;

      const title = titleEl.textContent.trim();
      const videoUrl = linkEl.textContent.trim();

      // Attempt to find a thumbnail URL in media tags or enclosure
      let thumb = "";
      const mediaThumb = item.querySelector("thumbnail, content");
      if (mediaThumb && mediaThumb.getAttribute("url")) {
        thumb = mediaThumb.getAttribute("url");
      } else {
        const enclosure = item.querySelector("enclosure");
        if (enclosure && enclosure.getAttribute("type")?.startsWith("image/")) {
          thumb = enclosure.getAttribute("url");
        }
      }

      // Generate a stable ID via URL matching
      const viewkeyMatch = videoUrl.match(/viewkey=([a-zA-Z0-9]+)/);
      const viewKey = viewkeyMatch ? viewkeyMatch[1] : encodeURIComponent(videoUrl);

      videos.push(new PlatformVideo({
        id: new PlatformID("pornhub", viewKey, config.id),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(thumb, 360)]),
        author: new PlatformAuthorLink(
          new PlatformID("pornhub", "rss_feed", config.id),
          "RSS Feed Item",
          RSS_FEED_URL,
          ""
        ),
        url: videoUrl,
        duration: 0,
        viewCount: 0,
        datetime: 0,
        isLive: false
      }));
    } catch (e) {
      // Skip bad elements
    }
  });

  return new PHVideoPager(videos, false, null);
};

// -----------------------------------------------
// SEARCH (Disabled for Static RSS Usage)
// -----------------------------------------------

source.getSearchCapabilities = function () {
  return { types: [Type.Feed.Mixed], sorts: [], filters: [] };
};

source.search = function (query, type, order, filters, continuationToken) {
  return new PHVideoPager([], false, null);
};

// -----------------------------------------------
// CONTENT DETAILS (VIDEO PLAYBACK)
// -----------------------------------------------

source.isContentDetailsUrl = function (url) {
  return /pornhub\.com\/view_video\.php/.test(url)
    || /pornhub\.com\/embed\//.test(url);
};

source.getContentDetails = function (url) {
  const resp = http.GET(url, HEADERS_BASE, true);

  if (!resp || resp.code !== 200) {
    throw new ScriptException("Failed to load video page: " + url);
  }

  const html = resp.body;
  const flashvarsMatch = html.match(/var\s+flashvars_\d+\s*=\s*(\{[\s\S]*?\});\s*\n/);
  if (!flashvarsMatch) {
    throw new ScriptException("Could not find flashvars on page");
  }

  let flashvars;
  try {
    flashvars = JSON.parse(flashvarsMatch[1]);
  } catch (e) {
    throw new ScriptException("Failed to parse flashvars JSON");
  }

  const title = flashvars.video_title || "Untitled";
  const duration = parseInt(flashvars.video_duration) || 0;
  const viewKey = flashvars.video_id || "";
  const thumbUrl = flashvars.image_url || flashvars.thumbUrl || "";

  const dom = domParser.parseFromString(html, "text/html");
  let authorName = "Unknown";
  let authorUrl = "https://www.pornhub.com";

  const uploaderEl = dom.querySelector(".usernameBadgesWrapper a, .video-detailed-info .usernameWrap a");
  if (uploaderEl) {
    authorName = uploaderEl.textContent.trim();
    authorUrl = "https://www.pornhub.com" + uploaderEl.getAttribute("href");
  }

  const mediaDefs = flashvars.mediaDefinitions || [];
  const videoSources = [];

  mediaDefs.forEach(function (def) {
    if (!def.videoUrl) return;

    const quality = parseInt(def.quality) || 0;
    const format = def.format || "mp4";

    if (format === "hls" || def.videoUrl.includes(".m3u8")) {
      videoSources.unshift(new HLSSource({
        url: def.videoUrl,
        duration: duration
      }));
    } else if (format === "mp4" || def.videoUrl.includes(".mp4")) {
      videoSources.push(new VideoUrlSource({
        url: def.videoUrl,
        width: qualityToWidth(quality),
        height: quality,
        container: "video/mp4",
        codec: "h264",
        name: quality + "p",
        duration: duration,
        bitrate: qualityToBitrate(quality)
      }));
    }
  });

  if (videoSources.length === 0) {
    throw new ScriptException("No playable streams found for this video");
  }

  videoSources.sort(function (a, b) {
    return (b.height || 0) - (a.height || 0);
  });

  let description = "";
  const descEl = dom.querySelector(".categoriesWrapper");
  if (descEl) description = descEl.textContent.trim();

  let uploadedAt = 0;
  const dateEl = dom.querySelector(".videoInfoBlock .date");
  if (dateEl) {
    const parsed = Date.parse(dateEl.textContent.trim());
    if (!isNaN(parsed)) uploadedAt = Math.floor(parsed / 1000);
  }

  let viewCount = 0;
  const viewEl = dom.querySelector(".views span.count");
  if (viewEl) {
    viewCount = parseInt(viewEl.textContent.replace(/[^0-9]/g, "")) || 0;
  }

  return new PlatformVideoDetails({
    id: new PlatformID("pornhub", viewKey, config.id),
    name: title,
    thumbnails: new Thumbnails([new Thumbnail(thumbUrl, 720)]),
    author: new PlatformAuthorLink(
      new PlatformID("pornhub", authorUrl, config.id),
      authorName,
      authorUrl,
      ""
    ),
    url: url,
    duration: duration,
    viewCount: viewCount,
    datetime: uploadedAt,
    description: description,
    video: new VideoSourceDescriptor(videoSources),
    isLive: false
  });
};

// -----------------------------------------------
// CHANNEL
// -----------------------------------------------

source.isChannelUrl = function (url) {
  return false;
};

// -----------------------------------------------
// HELPERS
// -----------------------------------------------

function qualityToWidth(height) {
  const map = { 2160: 3840, 1080: 1920, 720: 1280, 480: 854, 360: 640, 240: 426 };
  return map[height] || 1280;
}

function qualityToBitrate(height) {
  const map = { 2160: 15000000, 1080: 8000000, 720: 4000000, 480: 2000000, 360: 1000000, 240: 500000 };
  return map[height] || 4000000;
}

// -----------------------------------------------
// PAGERS
// -----------------------------------------------

class PHVideoPager extends VideoPager {
  constructor(results, hasMore, context) {
    super(results, hasMore, context);
  }
  nextPage() {
    return new PHVideoPager([], false, null);
  }
}
