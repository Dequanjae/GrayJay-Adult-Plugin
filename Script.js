// ============================================================
// Pornhub Grayjay Plugin
// Features: Home/Trending, Search, Login (for personalization)
// Stream extraction via flashvars mediaDefinitions
// ============================================================

const BASE_URL = "https://www.pornhub.com";

const HEADERS_BASE = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.pornhub.com/"
};

// -----------------------------------------------
// ENABLE / AUTH
// -----------------------------------------------

source.enable = function (conf, settings, savedState) {
  // Nothing needed on enable — cookies handled by Grayjay's Http package
};

source.getAuthenticationDetails = function () {
  return new OauthUserDetails(
    BASE_URL + "/login",
    null,
    null,
    null,
    null,
    null,
    "pornhub.com"  // Cookie domain to capture after login
  );
};

source.isLoggedIn = function () {
  try {
    const resp = http.GET(BASE_URL + "/user/menu", HEADERS_BASE, true);
    // If redirect to login page, not logged in
    return resp.code === 200 && !resp.url.includes("/login");
  } catch (e) {
    return false;
  }
};

// -----------------------------------------------
// HOME / TRENDING
// -----------------------------------------------

source.getHome = function (continuationToken) {
  const page = continuationToken ? continuationToken.page : 1;

  // Use recommended (logged in = personalized) or trending (anonymous)
  const url = source.isLoggedIn()
    ? BASE_URL + "/recommended?page=" + page
    : BASE_URL + "/video?page=" + page;

  const resp = http.GET(url, HEADERS_BASE, true);

  if (!resp || resp.code !== 200) {
    return new PHVideoPager([], false, null);
  }

  const videos = parseVideoList(resp.body);
  const hasMore = videos.length >= 32;

  return new PHVideoPager(videos, hasMore, {
    page: page + 1
  });
};

// -----------------------------------------------
// SEARCH
// -----------------------------------------------

source.getSearchCapabilities = function () {
  return {
    types: [Type.Feed.Mixed],
    sorts: [
      Type.Order.Chronological,
      "Most Viewed",
      "Top Rated",
      "Longest"
    ],
    filters: [
      {
        id: "hd",
        name: "HD Only",
        isMultiSelect: false,
        filters: [
          { id: "0", name: "All", value: "0" },
          { id: "1", name: "HD Only", value: "1" }
        ]
      }
    ]
  };
};

source.search = function (query, type, order, filters, continuationToken) {
  const page = continuationToken ? continuationToken.page : 1;

  let sortParam = "";
  if (order === "Most Viewed") sortParam = "&o=mv";
  else if (order === "Top Rated") sortParam = "&o=tr";
  else if (order === "Longest") sortParam = "&o=lg";
  else sortParam = "&o=mr"; // Most Recent default

  const hdParam = (filters && filters["hd"] && filters["hd"][0] === "1") ? "&hd=1" : "";

  const url = BASE_URL + "/video/search?search=" + encodeURIComponent(query)
    + sortParam + hdParam + "&page=" + page;

  const resp = http.GET(url, HEADERS_BASE, false);

  if (!resp || resp.code !== 200) {
    return new PHVideoPager([], false, null);
  }

  const videos = parseVideoList(resp.body);
  const hasMore = videos.length >= 20;

  return new PHVideoPager(videos, hasMore, {
    page: page + 1,
    query: query,
    order: order,
    filters: filters
  });
};

source.searchSuggestions = function (query) {
  try {
    const url = BASE_URL + "/video/search?search=" + encodeURIComponent(query);
    const resp = http.GET(url, HEADERS_BASE, false);
    if (!resp || resp.code !== 200) return [];

    const dom = domParser.parseFromString(resp.body, "text/html");
    const suggestions = [];
    const items = dom.querySelectorAll(".pcVideoListItem .title a");
    items.forEach(function (el) {
      const text = el.textContent.trim();
      if (text && suggestions.length < 8) suggestions.push(text);
    });
    return suggestions;
  } catch (e) {
    return [];
  }
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

  // --- Extract flashvars JSON ---
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

  // Extract author
  const dom = domParser.parseFromString(html, "text/html");
  let authorName = "Unknown";
  let authorUrl = BASE_URL;
  let authorThumb = "";

  const uploaderEl = dom.querySelector(".usernameBadgesWrapper a, .video-detailed-info .usernameWrap a");
  if (uploaderEl) {
    authorName = uploaderEl.textContent.trim();
    authorUrl = BASE_URL + uploaderEl.getAttribute("href");
  }

  // Extract video sources from mediaDefinitions
  const mediaDefs = flashvars.mediaDefinitions || [];
  const videoSources = [];

  mediaDefs.forEach(function (def) {
    if (!def.videoUrl) return;

    const quality = parseInt(def.quality) || 0;
    const format = def.format || "mp4";

    if (format === "hls" || def.videoUrl.includes(".m3u8")) {
      // HLS adaptive stream — add as highest priority
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

  // Sort MP4 sources by quality descending
  videoSources.sort(function (a, b) {
    return (b.height || 0) - (a.height || 0);
  });

  // Extract description / tags
  let description = "";
  const descEl = dom.querySelector(".categoriesWrapper");
  if (descEl) description = descEl.textContent.trim();

  // Extract upload date
  let uploadedAt = 0;
  const dateEl = dom.querySelector(".videoInfoBlock .date");
  if (dateEl) {
    const parsed = Date.parse(dateEl.textContent.trim());
    if (!isNaN(parsed)) uploadedAt = Math.floor(parsed / 1000);
  }

  // Extract view count
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
      authorThumb
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
// CHANNEL (MODEL PAGE)
// -----------------------------------------------

source.isChannelUrl = function (url) {
  return /pornhub\.com\/(model|pornstar|channels|users)\//.test(url);
};

source.getChannel = function (url) {
  const resp = http.GET(url, HEADERS_BASE, false);
  if (!resp || resp.code !== 200) throw new ScriptException("Failed to load channel: " + url);

  const dom = domParser.parseFromString(resp.body, "text/html");

  const nameEl = dom.querySelector(".nameSubscribe h1, .profileUserName h1");
  const name = nameEl ? nameEl.textContent.trim() : "Unknown";

  const thumbEl = dom.querySelector(".avatarWrap img, .profileUserName img");
  const thumb = thumbEl ? (thumbEl.getAttribute("data-src") || thumbEl.getAttribute("src") || "") : "";

  const descEl = dom.querySelector(".descriptionWrapper p, .bio");
  const desc = descEl ? descEl.textContent.trim() : "";

  let subCount = 0;
  const subEl = dom.querySelector(".infoBox .statsWrapper .stats:first-child strong");
  if (subEl) subCount = parseInt(subEl.textContent.replace(/[^0-9]/g, "")) || 0;

  return new PlatformChannel({
    id: new PlatformID("pornhub", url, config.id),
    name: name,
    thumbnail: thumb,
    banner: "",
    url: url,
    description: desc,
    subscribers: subCount
  });
};

source.getChannelContents = function (url, type, order, filters, continuationToken) {
  const page = continuationToken ? continuationToken.page : 1;
  const pageUrl = url + "/videos?page=" + page;

  const resp = http.GET(pageUrl, HEADERS_BASE, false);
  if (!resp || resp.code !== 200) return new PHVideoPager([], false, null);

  const videos = parseVideoList(resp.body);
  const hasMore = videos.length >= 20;

  return new PHVideoPager(videos, hasMore, {
    page: page + 1,
    channelUrl: url
  });
};

// -----------------------------------------------
// HELPER: Parse video list from HTML
// -----------------------------------------------

function parseVideoList(html) {
  const dom = domParser.parseFromString(html, "text/html");
  const items = dom.querySelectorAll(".pcVideoListItem, .videoBox");
  const videos = [];

  items.forEach(function (item) {
    try {
      const linkEl = item.querySelector("a.videoTitle, .title a");
      if (!linkEl) return;

      const title = linkEl.textContent.trim();
      const videoUrl = BASE_URL + linkEl.getAttribute("href");

      const thumbEl = item.querySelector("img[data-mediabook], img[data-thumb_url], img.thumb, img");
      let thumb = "";
      if (thumbEl) {
        thumb = thumbEl.getAttribute("data-thumb_url")
          || thumbEl.getAttribute("data-src")
          || thumbEl.getAttribute("src")
          || "";
      }

      const durationEl = item.querySelector(".videoDuration, .duration");
      let duration = 0;
      if (durationEl) {
        const parts = durationEl.textContent.trim().split(":");
        if (parts.length === 2) {
          duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        } else if (parts.length === 3) {
          duration = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
      }

      const viewEl = item.querySelector(".videViews, .views");
      let viewCount = 0;
      if (viewEl) {
        viewCount = parseInt(viewEl.textContent.replace(/[^0-9]/g, "")) || 0;
      }

      const uploaderEl = item.querySelector(".videoUploaderBlock a, .usernameWrap a");
      const authorName = uploaderEl ? uploaderEl.textContent.trim() : "Pornhub";
      const authorUrl = uploaderEl ? (BASE_URL + uploaderEl.getAttribute("href")) : BASE_URL;

      // Extract viewkey from URL for ID
      const viewkeyMatch = videoUrl.match(/viewkey=([a-zA-Z0-9]+)/);
      const viewKey = viewkeyMatch ? viewkeyMatch[1] : videoUrl;

      videos.push(new PlatformVideo({
        id: new PlatformID("pornhub", viewKey, config.id),
        name: title,
        thumbnails: new Thumbnails([new Thumbnail(thumb, 360)]),
        author: new PlatformAuthorLink(
          new PlatformID("pornhub", authorUrl, config.id),
          authorName,
          authorUrl,
          ""
        ),
        url: videoUrl,
        duration: duration,
        viewCount: viewCount,
        datetime: 0,
        isLive: false
      }));
    } catch (e) {
      // Skip malformed items silently
    }
  });

  return videos;
}

// -----------------------------------------------
// HELPER: Quality conversions
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
    if (this.context && this.context.query !== undefined) {
      return source.search(
        this.context.query,
        null,
        this.context.order,
        this.context.filters,
        this.context
      );
    } else if (this.context && this.context.channelUrl) {
      return source.getChannelContents(
        this.context.channelUrl,
        null, null, null,
        this.context
      );
    } else {
      return source.getHome(this.context);
    }
  }
}
