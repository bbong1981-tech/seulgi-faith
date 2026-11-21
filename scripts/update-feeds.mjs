// 설교(유튜브)·블로그(네이버) 최신 목록을 모아 app/feeds/ 에 저장합니다.
// GitHub Actions가 1시간마다 실행합니다. (직접 실행: node scripts/update-feeds.mjs)
//
// - 유튜브: 채널 RSS(최신 15개)에서 제목에 '주일' 또는 '수요'가 들어간 영상만 고릅니다.
//   YT_API_KEY 환경 변수(선택)가 있으면 YouTube Data API로 더 많은 지난 영상까지 가져옵니다.
// - 네이버 블로그: RSS(최신 글)에서 가져옵니다.
// - 이미 모아 둔 목록에 새 항목을 더해 가므로, 지난 설교·글도 계속 남습니다.
// - 가져오기에 실패하면 이전 목록을 그대로 두고 경고만 남깁니다.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "feeds.config.json");
const OUT_DIR = join(ROOT, "app", "feeds");
const UA = { "User-Agent": "Mozilla/5.0 (church-app feed updater)", "Accept-Language": "ko-KR,ko;q=0.9" };
const warn = msg => console.log(`::warning::${msg}`);

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
await mkdir(OUT_DIR, { recursive: true });

// ───────── 공통 도우미 ─────────
const decode = s => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]).trim() : ""; };
const blocks = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?</${name}>`, "g"))].map(m => m[0]);
async function get(url) {
  if (process.env.FEED_MOCK_BASE) url = url.replace(/^https:\/\/[^/]+/, process.env.FEED_MOCK_BASE); // 시험용
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) {
    // Google API는 실패 이유를 JSON으로 알려 줌 (키 값은 들어 있지 않음)
    let why = "";
    try { const e = JSON.parse(await r.text()).error; why = ` — ${e.message} [${(e.errors || []).map(x => x.reason).join(", ") || e.status || ""}]`; } catch { }
    throw new Error(`${r.status}${why}`);
  }
  return r.text();
}
async function readOld(name) {
  try { return JSON.parse(await readFile(join(OUT_DIR, `${name}.json`), "utf8")); } catch { return { items: [] }; }
}
async function save(name, data) {
  const json = JSON.stringify(data);
  await writeFile(join(OUT_DIR, `${name}.json`), json + "\n");
  // 앱은 <script>로 읽으므로 같은 내용을 .js로도 저장 (폴더에서 바로 연 앱에서도 동작)
  await writeFile(join(OUT_DIR, `${name}.js`), `FEED_LOAD(${JSON.stringify(name)}, ${json});\n`);
}
// 내용이 그대로면 updated 시각도 그대로 두어, 바뀐 것이 없을 때는 커밋이 생기지 않게 함
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ───────── 유튜브 설교 ─────────
function sermonType(title) {
  const yt = config.youtube;
  if ((yt.exclude || []).some(w => title.includes(w))) return null;
  if ((yt.sunday || []).some(w => title.includes(w))) return "sunday";
  if ((yt.wednesday || []).some(w => title.includes(w))) return "wednesday";
  return null;
}
// @핸들 → 채널 ID (UC로 시작). 한글 핸들도 됨
async function resolveHandle(handle) {
  const html = await get(`https://www.youtube.com/${encodeURIComponent(handle).replace(/%40/g, "@")}`);
  const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
    || html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/)
    || html.match(/itemprop="identifier" content="(UC[\w-]{22})"/);
  if (!m) throw new Error(`채널 ID를 찾지 못했습니다: ${handle}`);
  console.log(`채널 ID: ${handle} → ${m[1]}`);
  return m[1];
}
const saveConfig = () => writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n"); // 찾은 채널 ID를 기억해 다음부터 바로 사용
async function channelId() {
  const yt = config.youtube;
  if (yt.channelId) return yt.channelId;
  yt.channelId = await resolveHandle(yt.handle);
  await saveConfig();
  return yt.channelId;
}
async function fetchRssVideos(id) {
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  const channel = tag(xml.split("<entry")[0], "title");
  return blocks(xml, "entry").map(e => ({ id: tag(e, "yt:videoId"), title: tag(e, "title"), published: tag(e, "published"), channel }));
}
async function fetchRssPlaylist(id) {
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`);
  return blocks(xml, "entry").map(e => ({ id: tag(e, "yt:videoId"), title: tag(e, "title"), published: tag(e, "published") }));
}
async function fetchApiVideos(id, key, pages = 10) {
  const list = [], playlist = "UU" + id.slice(2);
  let page = "";
  for (let i = 0; i < pages; i++) { // 한 번에 50개씩
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlist}&key=${key}${page ? "&pageToken=" + page : ""}`;
    const data = JSON.parse(await get(url));
    for (const it of data.items || []) list.push({ id: it.contentDetails.videoId, title: it.snippet.title, published: it.contentDetails.videoPublishedAt || it.snippet.publishedAt });
    if (!data.nextPageToken) break;
    page = data.nextPageToken;
  }
  return list;
}
async function updateSermons() {
  const old = await readOld("sermons");
  try {
    const id = await channelId();
    let videos = await fetchRssVideos(id);
    console.log(`YouTube RSS: 최신 영상 ${videos.length}개${process.env.YT_API_KEY ? "" : " (API 키 없음)"}`);
    if (process.env.YT_API_KEY) {
      try { const api = await fetchApiVideos(id, process.env.YT_API_KEY); console.log(`YouTube API: 채널 영상 ${api.length}개 확인`); videos = videos.concat(api); }
      catch (e) { warn(`YouTube API 실패 (RSS만 사용): ${e.message}`); }
    }
    const map = new Map(old.items.map(v => [v.id, v]));
    for (const v of videos) if (v.id) map.set(v.id, { ...map.get(v.id), ...v });
    const items = [...map.values()]
      .map(v => ({ id: v.id, title: v.title, published: v.published, type: sermonType(v.title) }))
      .filter(v => v.type)
      .sort((a, b) => b.published.localeCompare(a.published))
      .slice(0, config.youtube.max || 500);
    const channel = { id, url: `https://www.youtube.com/${config.youtube.handle}` };
    if (same(items, old.items) && same(channel, old.channel)) { console.log("설교: 바뀐 것 없음"); return; }
    await save("sermons", { updated: new Date().toISOString(), channel, items });
    console.log(`설교: ${items.length}개 저장 (주일 ${items.filter(v => v.type === "sunday").length}, 수요 ${items.filter(v => v.type === "wednesday").length})`);
  } catch (e) { warn(`설교 목록을 가져오지 못했습니다: ${e.message}`); }
}

// ───────── 영동교회 주일설교 (유튜브 재생목록) ─────────
// 재생목록 페이지에서 영상 목록을 읽고(키 없이 전부), 올린 날짜는 영상마다 한 번만 확인해 기억해 둠
function ytJson(html, name) {
  const i = html.indexOf(name); if (i < 0) return null;
  const start = html.indexOf("{", i); let depth = 0, inStr = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) { if (ch === "\\") j++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return JSON.parse(html.slice(start, j + 1));
  }
  return null;
}
function findAll(o, key, out = []) {
  if (Array.isArray(o)) o.forEach(v => findAll(v, key, out));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === key) out.push(v); findAll(v, key, out); }
  return out;
}
const textOf = t => t?.simpleText ?? (t?.runs || []).map(r => r.text).join("") ?? t?.content ?? "";
function playlistEntries(data) {
  const list = findAll(data, "playlistVideoRenderer").map(r => ({ id: r.videoId, title: textOf(r.title), ok: r.isPlayable !== false }));
  for (const l of findAll(data, "lockupViewModel")) if (l.contentId && /VIDEO/.test(l.contentType || "")) list.push({ id: l.contentId, title: l.metadata?.lockupMetadataViewModel?.title?.content || "", ok: true });
  const token = findAll(data, "continuationCommand").map(c => c.token).find(Boolean);
  return { list, token };
}
// 유튜브 페이지 + 다음 쪽(100개씩)을 이어 읽기
async function ytBrowse(url, extract) {
  const html = await get(url);
  const data = ytJson(html, "ytInitialData");
  if (!data) throw new Error("페이지 내용을 찾지 못했습니다");
  const version = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || "2.20241101.00.00";
  let { list, token } = extract(data);
  for (let i = 0; token && i < 30; i++) {
    const r = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
      method: "POST", headers: { ...UA, "Content-Type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: version, hl: "ko", gl: "KR" } }, continuation: token })
    });
    if (!r.ok) { warn(`다음 쪽을 못 읽음 (${r.status})`); break; }
    const more = extract(await r.json());
    list = list.concat(more.list); token = more.token;
  }
  return { data, list };
}
async function fetchPlaylistOnce(id) {
  const { data, list } = await ytBrowse(`https://www.youtube.com/playlist?list=${id}&hl=ko&gl=KR`, playlistEntries);
  const title = data.metadata?.playlistMetadataRenderer?.title || textOf(findAll(data, "playlistHeaderRenderer")[0]?.title)
    || findAll(data, "pageHeaderViewModel")[0]?.title?.dynamicTextViewModel?.text?.content || "";
  const seen = new Set();
  const out = list.filter(v => v.id && v.ok && v.title && !seen.has(v.id) && seen.add(v.id));
  return { title, list: out };
}
// 유튜브가 가끔 빈 페이지를 주므로, 비어 있으면 두 번 더 시도
async function fetchPlaylist(id) {
  let r;
  for (let i = 0; i < 3; i++) { r = await fetchPlaylistOnce(id); if (r.list.length) return r; }
  return r;
}
// 채널의 재생목록 목록 (@핸들/playlists)
function channelPlaylistEntries(data) {
  const list = findAll(data, "gridPlaylistRenderer").map(r => ({ id: r.playlistId, title: textOf(r.title) }));
  for (const l of findAll(data, "lockupViewModel")) if (l.contentId && /PLAYLIST|ALBUM/.test(l.contentType || "")) list.push({ id: l.contentId, title: l.metadata?.lockupMetadataViewModel?.title?.content || "" });
  const token = findAll(data, "continuationCommand").map(c => c.token).find(Boolean);
  return { list, token };
}
async function fetchChannelPlaylists(handle) {
  const { list } = await ytBrowse(`https://www.youtube.com/${encodeURIComponent(handle).replace(/%40/g, "@")}/playlists?hl=ko&gl=KR`, channelPlaylistEntries);
  const seen = new Set();
  return list.filter(p => p.id && p.title && !seen.has(p.id) && seen.add(p.id));
}
async function videoDate(id) {
  const html = await get(`https://www.youtube.com/watch?v=${id}&hl=ko`);
  const m = html.match(/itemprop="datePublished" content="([^"]+)"/) || html.match(/itemprop="uploadDate" content="([^"]+)"/)
    || html.match(/"publishDate":"([^"]+)"/) || html.match(/"uploadDate":"([^"]+)"/);
  if (!m) return "";
  const d = new Date(m[1]);
  return isNaN(d) ? "" : d.toISOString();
}
async function updateYdSermons() {
  const c = config.ydSermons; if (!c) return;
  const old = await readOld("ydsermons");
  const known = new Map(old.items.map(v => [v.id, v]));
  const playlists = [], found = new Map();
  let ok = 0;
  for (const pl of c.playlists) {
    try {
      // 최신 15개는 RSS에 날짜가 있으니 먼저 받아 둠
      try { for (const v of await fetchRssPlaylist(pl.id)) if (!known.get(v.id)?.published) known.set(v.id, { ...known.get(v.id), published: v.published }); }
      catch (e) { warn(`영동교회 재생목록 RSS 실패 (${pl.id}): ${e.message}`); }
      const { title, list } = await fetchPlaylist(pl.id);
      for (const v of list) if (!found.has(v.id)) found.set(v.id, { ...v, playlist: pl.id });
      playlists.push({ id: pl.id, label: pl.label || title, title, url: `https://www.youtube.com/playlist?list=${pl.id}` });
      console.log(`영동교회 설교: 재생목록 "${title}" 영상 ${list.length}개 (예: ${list.slice(0, 2).map(v => v.title).join(" / ")})`);
      ok++;
    } catch (e) {
      warn(`영동교회 재생목록을 가져오지 못했습니다 (${pl.id}): ${e.message}`);
      for (const v of old.items.filter(v => v.playlist === pl.id)) found.set(v.id, v);
      const prev = (old.playlists || []).find(x => x.id === pl.id); if (prev) playlists.push(prev);
    }
  }
  if (!ok) return;
  // 제목 앞의 [2026/11/15] 날짜를 먼저 씀 (예배 날짜)
  for (const v of found.values()) {
    const m = v.title.match(/(20\d\d)[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})/);
    if (m && !known.get(v.id)?.fromTitle) known.set(v.id, { ...known.get(v.id), published: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T02:00:00.000Z`, fromTitle: true });
  }
  // 날짜를 모르는 영상만 한 번에 최대 80개씩 확인 (다음 실행 때 나머지)
  let checked = 0, failed = 0;
  for (const v of found.values()) {
    if (known.get(v.id)?.published || checked >= (c.datesPerRun || 80)) continue;
    checked++;
    try { const d = await videoDate(v.id); if (d) known.set(v.id, { ...known.get(v.id), published: d }); else failed++; } catch { failed++; }
  }
  if (checked) console.log(`영동교회 설교: 올린 날짜 ${checked - failed}/${checked}개 확인`);
  const items = [...found.values()]
    .map(v => ({ id: v.id, title: v.title, published: known.get(v.id)?.published || "", playlist: v.playlist }))
    .filter(v => v.published)
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, c.max || 1000);
  const waiting = found.size - items.length;
  if (same(items, old.items) && same(playlists, old.playlists)) { console.log("영동교회 설교: 바뀐 것 없음"); return; }
  await save("ydsermons", { updated: new Date().toISOString(), playlists, items });
  const years = {}; for (const v of items) years[v.published.slice(0, 4)] = (years[v.published.slice(0, 4)] || 0) + 1;
  console.log(`영동교회 설교: ${items.length}개 저장 (${Object.entries(years).map(([y, n]) => `${y}년 ${n}`).join(", ")})${waiting ? `, 날짜 확인 대기 ${waiting}개` : ""}`);
}

// ───────── 찬양 (가수별 유튜브 재생목록) ─────────
async function updatePraise() {
  const c = config.praise; if (!c) return;
  const old = await readOld("praise");
  const artists = [], items = [];
  for (const a of c.artists) {
    const prevA = (old.artists || []).find(x => x.name === a.name);
    try {
      let pls = (a.playlists || []).map(id => ({ id }));
      if (a.channel) {
        const all = await fetchChannelPlaylists(a.channel);
        const re = new RegExp(a.match || ".");
        pls = pls.concat(all.filter(p => re.test(p.title)));
        console.log(`찬양: ${a.name} 채널 재생목록 ${all.length}개 → 고른 것 ${pls.length}개 (${all.map(p => (re.test(p.title) ? "✓" : "✗") + p.title).join(" / ")})`);
      }
      const out = { name: a.name, url: a.channel ? `https://www.youtube.com/${a.channel}/playlists` : `https://www.youtube.com/playlist?list=${pls[0]?.id}`, playlists: [] };
      for (const pl of pls) {
        try {
          const { title, list } = await fetchPlaylist(pl.id);
          if (!list.length) throw new Error("영상이 없습니다");
          out.playlists.push({ id: pl.id, title: pl.title || title, count: list.length });
          for (const v of list) items.push({ id: v.id, title: v.title, artist: a.name, playlist: pl.id });
          console.log(`찬양: ${a.name} "${pl.title || title}" ${list.length}곡`);
        } catch (e) {
          warn(`찬양 재생목록을 가져오지 못했습니다 (${a.name}, ${pl.id}): ${e.message}`);
          const prevP = prevA?.playlists.find(x => x.id === pl.id);
          if (prevP) { out.playlists.push(prevP); items.push(...old.items.filter(v => v.playlist === pl.id && v.artist === a.name)); }
        }
      }
      if (a.channel) out.playlists.sort((x, y) => (parseInt(x.title.match(/(\d+)\s*집/)?.[1]) || 0) - (parseInt(y.title.match(/(\d+)\s*집/)?.[1]) || 0) || x.title.localeCompare(y.title, "ko"));
      if (out.playlists.length) artists.push(out);
    } catch (e) {
      warn(`찬양을 가져오지 못했습니다 (${a.name}): ${e.message}`);
      if (prevA) { artists.push(prevA); items.push(...old.items.filter(v => v.artist === a.name)); }
    }
  }
  if (!artists.length) return;
  if (same(items, old.items) && same(artists, old.artists)) { console.log("찬양: 바뀐 것 없음"); return; }
  await save("praise", { updated: new Date().toISOString(), artists, items });
  console.log(`찬양: ${items.length}곡 저장 (${artists.map(a => `${a.name} ${items.filter(v => v.artist === a.name).length}`).join(", ")})`);
}

// ───────── 네이버 블로그 ─────────
async function updateBlog() {
  const old = await readOld("blog");
  const blogId = config.naver.blogId;
  try {
    const xml = await get(`https://rss.blog.naver.com/${blogId}.xml`);
    const posts = blocks(xml, "item").map(it => {
      const raw = tag(it, "link") || tag(it, "guid");
      const logNo = (raw.match(/\/(\d{6,})/) || raw.match(/logNo=(\d+)/) || [])[1];
      const link = logNo ? `https://blog.naver.com/${blogId}/${logNo}` : raw.replace(/\?.*$/, "");
      const desc = tag(it, "description");
      const img = (desc.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
      const summary = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
      const d = new Date(tag(it, "pubDate"));
      return { title: tag(it, "title"), link, published: isNaN(d) ? "" : d.toISOString(), category: tag(it, "category"), summary, thumb: img };
    }).filter(p => p.title && p.link);
    const map = new Map(old.items.map(p => [p.link, p]));
    for (const p of posts) map.set(p.link, p);
    const items = [...map.values()].sort((a, b) => b.published.localeCompare(a.published)).slice(0, config.naver.max || 300);
    const blog = { title: tag(xml.split("<item")[0], "title"), url: `https://blog.naver.com/${blogId}` };
    if (same(items, old.items) && same(blog, old.blog)) { console.log("블로그: 바뀐 것 없음"); return; }
    await save("blog", { updated: new Date().toISOString(), blog, items });
    console.log(`블로그: ${items.length}개 저장`);
  } catch (e) { warn(`블로그 글을 가져오지 못했습니다: ${e.message}`); }
}

// ───────── 조각설교 (여러 채널에서 제목에 정해진 낱말이 들어간 영상만) ─────────
function clipType(title) {
  const c = config.clips;
  return (c.types || []).find(t => t.words.some(w => title.includes(w)))?.id || null;
}
async function updateClips() {
  const c = config.clips; if (!c) return;
  const old = await readOld("clips");
  const map = new Map(old.items.map(v => [v.id, v]));
  const channels = [];
  let changedConfig = false, ok = 0;
  for (const ch of c.channels) {
    try {
      if (!ch.id) { ch.id = await resolveHandle(ch.handle); changedConfig = true; }
      let videos = await fetchRssVideos(ch.id);
      const name = videos[0]?.channel || ch.name || ch.handle;
      if (process.env.YT_API_KEY) {
        try { videos = videos.concat((await fetchApiVideos(ch.id, process.env.YT_API_KEY, 4)).map(v => ({ ...v, channel: name }))); }
        catch (e) { warn(`YouTube API 실패 (${ch.handle}, RSS만 사용): ${e.message}`); }
      }
      if (name && ch.name !== name) { ch.name = name; changedConfig = true; }
      for (const v of videos) if (v.id) map.set(v.id, { ...map.get(v.id), ...v, channel: name, handle: ch.handle });
      channels.push({ handle: ch.handle, name, url: `https://www.youtube.com/${ch.handle}` });
      console.log(`조각설교: ${ch.handle} (${name}) 최신 영상 ${videos.length}개 확인`);
      ok++;
    } catch (e) {
      warn(`조각설교 채널을 가져오지 못했습니다 (${ch.handle}): ${e.message}`);
      const prev = (old.channels || []).find(x => x.handle === ch.handle);
      if (prev) channels.push(prev);
    }
  }
  if (changedConfig) await saveConfig();
  if (!ok) return;
  // 채널마다 "types"를 적어 두면 그 종류만 모음 (예: 질의응답만)
  const only = Object.fromEntries(c.channels.filter(ch => ch.types).map(ch => [ch.handle, ch.types]));
  const items = [...map.values()]
    .map(v => ({ id: v.id, title: v.title, published: v.published, type: clipType(v.title), channel: v.channel, handle: v.handle }))
    .filter(v => v.type && (!only[v.handle] || only[v.handle].includes(v.type)))
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, c.max || 500);
  if (same(items, old.items) && same(channels, old.channels)) { console.log("조각설교: 바뀐 것 없음"); return; }
  await save("clips", { updated: new Date().toISOString(), channels, items });
  console.log(`조각설교: ${items.length}개 저장 (${(c.types || []).map(t => `${t.label} ${items.filter(v => v.type === t.id).length}`).join(", ")})`);
}

// ───────── 성경강연회 연간 일정 (교회 홈페이지의 표) ─────────
// 한국 교회 홈페이지는 EUC-KR로 된 곳이 많아, 문자 코드를 확인해 읽음
async function getPage(url) {
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const head = buf.subarray(0, 3000).toString("latin1");
  const cs = ((r.headers.get("content-type") || "").match(/charset=([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || "utf-8";
  return new TextDecoder(/euc-?kr|ks_c_5601|cp949/i.test(cs) ? "euc-kr" : "utf-8").decode(buf);
}
const cellText = h => decode(h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
function parseTables(html) {
  return blocks(html, "table").map(t => blocks(t, "tr").map(tr => [...tr.matchAll(/<t([hd])(?:\s[^>]*)?>([\s\S]*?)<\/t[hd]>/gi)].map(m => cellText(m[2]))).filter(r => r.some(c => c)));
}
// 강연회 페이지는 표가 아니라 칸(div)으로 되어 있어, 본문 글자 순서로 읽음:
//   "19 / 1월 / 대집회 / ~1/25일까지 / 대강당 / 최훈일 목사 / 3 / 2월 / 교회학교 / ..."
function parseSeminarText(html, year) {
  const body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0].replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const toks = decode(body.replace(/<[^>]+>/g, "\n")).split("\n").map(t => t.replace(/[\s\u00a0]+/g, " ").trim()).filter(Boolean);
  let a = toks.findIndex(t => t.includes("지난일정보기")); if (a < 0) a = 0;
  let b = toks.findIndex((t, k) => k > a && /일정 등록|일정등록/.test(t)); if (b < 0) b = toks.length;
  const seg = toks.slice(a + 1, b), out = [];
  for (let k = 0; k < seg.length; k++) {
    const d = seg[k].match(/^(\d{1,2})$/), m = (seg[k + 1] || "").match(/^(\d{1,2})\s*월$/);
    if (!d || !m) continue;
    const it = { start: `${year}-${String(m[1]).padStart(2, "0")}-${String(d[1]).padStart(2, "0")}`, end: "", kind: "", place: "", speaker: "" };
    let n = k + 2;
    for (; n < seg.length; n++) {
      const t = seg[n];
      if (/^\d{1,2}$/.test(t) && /^\d{1,2}\s*월$/.test(seg[n + 1] || "")) break;
      const e = t.match(/~\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
      if (e) { let y = year; if (Number(e[1]) < Number(m[1])) y++; it.end = `${y}-${e[1].padStart(2, "0")}-${e[2].padStart(2, "0")}`; }
      else if (/(목사|전도사|선교사|강도사)$/.test(t)) it.speaker = t;
      else if (/집회|교회학교|강연|세미나|캠프/.test(t) && !it.kind) it.kind = t;
      else if (!it.place) it.place = t;
    }
    out.push(it); k = n - 1;
  }
  return out;
}
// 화면에 보이는 연도: 연도 버튼(2025, 2027) 사이에 글자로만 적힌 연도
const pageYear = html => Number((html.match(/<\/div>\s*(20\d\d)\s*<div[^>]*selYear=/) || [])[1]) || 0;
async function updateSeminar() {
  const c = config.seminar; if (!c) return;
  const old = await readOld("seminar");
  try {
    const kstYear = new Date(Date.now() + 9 * 3600e3).getUTCFullYear();
    const html = await getPage(c.url);
    const year = pageYear(html) || kstYear;
    if (process.env.SEMINAR_DEBUG) console.log(`성경강연회: 페이지 연도 ${pageYear(html) || "(못 찾음)"}`);
    let items = parseSeminarText(html, year);
    // 다음 해 일정이 올라와 있으면 함께 (연말에 내년 일정을 미리 볼 수 있게)
    try {
      const nextHtml = await getPage(`${c.url}&selYear=${year + 1}`);
      const next = parseSeminarText(nextHtml, year + 1);
      if (next.length) { items = items.concat(next); console.log(`성경강연회: ${year + 1}년 ${next.length}건도 있음`); }
    } catch (e) { warn(`성경강연회 ${year + 1}년 일정 확인 실패: ${e.message}`); }
    if (!items.length) { warn("성경강연회: 일정을 찾지 못했습니다"); return; }
    const data = { source: c.url, title: c.title, year, items };
    if (same(data.items, old.items) && data.year === old.year) { console.log("성경강연회: 바뀐 것 없음"); return; }
    await save("seminar", { updated: new Date().toISOString(), ...data });
    console.log(`성경강연회: ${items.length}건 저장 →`, items.map(x => `${x.start}~${x.end} ${x.kind} ${x.place} ${x.speaker}`).join(" | "));
  } catch (e) { warn(`성경강연회 일정을 가져오지 못했습니다: ${e.message}`); }
}

// ───────── 강연회 (영동교회 유튜브 '성경강연회' 재생목록 + 연령별 강연회 영상) ─────────
async function updateLectures() {
  const c = config.lectures; if (!c) return;
  const old = await readOld("lectures");
  let yd = old.yd || null;
  try {
    const all = await fetchChannelPlaylists(c.yd.channel);
    const re = new RegExp(c.yd.match);
    const picked = all.filter(p => re.test(p.title));
    console.log(`강연회: ${c.yd.channel} 재생목록 ${all.length}개 → 고른 것 ${picked.length}개 (${all.map(p => (re.test(p.title) ? "✓" : "✗") + p.title).join(" / ")})`);
    const playlists = [];
    for (const pl of picked) {
      try {
        const { list } = await fetchPlaylist(pl.id);
        if (!list.length) continue;
        playlists.push({ id: pl.id, title: pl.title, items: list.map(v => ({ id: v.id, title: v.title })) });
        console.log(`강연회: "${pl.title}" ${list.length}개`);
      } catch (e) {
        warn(`강연회 재생목록을 가져오지 못했습니다 (${pl.title}): ${e.message}`);
        const prev = old.yd?.playlists.find(x => x.id === pl.id); if (prev) playlists.push(prev);
      }
    }
    if (playlists.length) yd = { url: `https://www.youtube.com/${c.yd.channel}/playlists`, playlists };
  } catch (e) { warn(`영동교회 강연회 재생목록을 가져오지 못했습니다: ${e.message}`); }
  // 연령별 강연회: 페이지에 강사(목사님)별 칸이 있고, 각 칸의 영상 목록은 process.php가 JSON으로 줌
  const ages = [];
  for (const g of c.ages) {
    const prev = (old.ages || []).find(x => x.id === g.id);
    try {
      const html = await getPage(g.url);
      const sec = html.slice(html.indexOf("card-group-about"), html.indexOf("card-group-content"));
      const cats = [...sec.matchAll(/loadSeminar\((\d+)\)[\s\S]*?<img src='([^']*)'[\s\S]*?class='h7[^']*'>([\s\S]*?)<\/div>/g)]
        .map(m => ({ cat: m[1], pic: m[2], name: cellText(m[3]).replace(/(\S)목사$/, "$1 목사") }));
      if (!cats.length) throw new Error("강사 목록을 찾지 못했습니다");
      const groups = [];
      for (const k of cats) {
        try {
          const r = await fetch("https://www.jbch.org/common/inc/process.php", { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" }, body: `mode=loadSeminar&cId=${k.cat}` });
          if (!r.ok) throw new Error(`${r.status}`);
          const list = (await r.json()).map(x => ({ psId: x.psId, title: decode(String(x.title || "")).trim(), yt: x.defaultVideo == 3 ? "" : (x.youtubeLink || "") })).filter(x => x.title);
          if (list.length) groups.push({ ...k, items: list });
        } catch (e) {
          warn(`강연회 영상 목록 실패 (${g.name} ${k.name}): ${e.message}`);
          const pg = prev?.groups.find(x => x.cat === k.cat); if (pg) groups.push(pg);
        }
      }
      ages.push({ id: g.id, name: g.name, url: g.url, groups });
      console.log(`강연회: ${g.name} — ${groups.map(x => `${x.name} ${x.items.length}`).join(", ")}`);
    } catch (e) {
      warn(`연령별 강연회를 가져오지 못했습니다 (${g.name}): ${e.message}`);
      if (prev) ages.push(prev);
    }
  }
  const out = { yd, ages: ages.length ? ages : old.ages || [] };
  if (same(out.yd, old.yd) && same(out.ages, old.ages)) { console.log("강연회: 바뀐 것 없음"); return; }
  await save("lectures", { updated: new Date().toISOString(), ...out });
}

// ───────── 행사 (영동교회 행사 영상 재생목록) ─────────
// 제목 속 날짜: [2026/10/30] · (26.10.26~) · 2026.10.30 · 2026년 10월 30일
function titleDate(t) {
  let m = String(t).match(/(20\d\d)\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/) || String(t).match(/(20\d\d)년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) { m = String(t).match(/\(\s*(\d{2})\.(\d{1,2})\.(\d{1,2})/); if (m) m = [m[0], "20" + m[1], m[2], m[3]]; }
  return m ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}` : "";
}
async function updateChurchEvents() {
  const c = config.churchEvents; if (!c) return;
  const old = await readOld("churchevents");
  try {
    const { title, list } = await fetchPlaylist(c.playlist);
    if (!list.length) throw new Error("영상이 없습니다");
    const items = list.map((v, i) => ({ id: v.id, title: v.title, date: titleDate(v.title), order: i }));
    const playlist = { id: c.playlist, title, url: `https://www.youtube.com/playlist?list=${c.playlist}` };
    console.log(`행사: "${title}" ${items.length}개, 날짜 있는 것 ${items.filter(v => v.date).length}개 (예: ${list.slice(0, 4).map(v => v.title).join(" / ")})`);
    if (same(items, old.items) && same(playlist, old.playlist)) { console.log("행사: 바뀐 것 없음"); return; }
    await save("churchevents", { updated: new Date().toISOString(), playlist, items });
  } catch (e) { warn(`행사 재생목록을 가져오지 못했습니다: ${e.message}`); }
}

// ───────── 주일 소식지 (교회 홈페이지 게시판) ─────────
async function bulletinImages(uid, year) {
  const r = await fetch("https://church.jbch.org/age/board/process.php", {
    method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: `mode=load_post&post_uid=${uid}&flag=1&chId=58&uid=${uid}&use_kind=1&boardId=13096&year=${year}&result=`
  });
  if (!r.ok) throw new Error(`${r.status}`);
  const parts = (await r.text()).split("@@");
  if (parts[1] !== "ok") throw new Error(parts[1] || "글을 읽지 못했습니다");
  const imgs = [...parts[2].matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => new URL(decode(m[1]), "https://church.jbch.org/").href)
    .filter(u => /file\d*\.jbch\.org|\/upload|\/board\//i.test(u) && !/icon|emoti|btn/i.test(u))
    .map(u => u.replace(/\/sum_/, "/"));
  return [...new Set(imgs)];
}
async function updateBulletin() {
  const c = config.bulletin; if (!c) return;
  const old = await readOld("bulletin");
  try {
    const xml = await getPage(c.rss);
    const posts = blocks(xml, "item").map(it => {
      const title = tag(it, "title").trim();
      const m = title.match(/(20\d\d)\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
      const pub = new Date(tag(it, "pubDate"));
      const date = m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : isNaN(pub) ? "" : pub.toISOString().slice(0, 10);
      return { uid: tag(it, "id"), title, date, year: isNaN(pub) ? date.slice(0, 4) : String(pub.getFullYear()) };
    }).filter(p => p.uid && p.title).slice(0, c.max || 60);
    const known = new Map(old.items.map(p => [p.uid, p]));
    let fetched = 0;
    const items = [];
    for (const p of posts) {
      let images = known.get(p.uid)?.images || [];
      if (!images.length && fetched < 30) { // 새 글만 (한 번에 30개까지)
        fetched++;
        try { images = await bulletinImages(p.uid, p.year); } catch (e) { warn(`주일 소식지 그림을 못 읽음 (${p.title}): ${e.message}`); }
      }
      items.push({ uid: p.uid, title: p.title, date: p.date, images });
    }
    const url = `https://church.jbch.org/age/board/list.php?flag=1&chId=58&gCode=11157&abtype=2&boardId=13096`;
    console.log(`주일 소식지: ${items.length}개, 새로 읽음 ${fetched}개 (최근: ${items.slice(0, 3).map(p => `${p.title} 그림 ${p.images.length}장`).join(" / ")})`);
    if (same(items, old.items)) { console.log("주일 소식지: 바뀐 것 없음"); return; }
    await save("bulletin", { updated: new Date().toISOString(), url, items });
  } catch (e) { warn(`주일 소식지를 가져오지 못했습니다: ${e.message}`); }
}

await updateSermons();
await updateYdSermons();
await updatePraise();
await updateBlog();
await updateClips();
await updateSeminar();
await updateLectures();
await updateChurchEvents();
await updateBulletin();
