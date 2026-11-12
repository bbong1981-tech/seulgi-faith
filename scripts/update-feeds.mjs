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
  const items = [...map.values()]
    .map(v => ({ id: v.id, title: v.title, published: v.published, type: clipType(v.title), channel: v.channel, handle: v.handle }))
    .filter(v => v.type)
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
async function updateSeminar() {
  const c = config.seminar; if (!c) return;
  const old = await readOld("seminar");
  try {
    const html = await getPage(c.url);
    const title = cellText((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const tables = parseTables(html);
    if (process.env.SEMINAR_DEBUG || !tables.length) {
      // 처음 한 번 페이지 구조를 확인하기 위한 기록
      console.log(`성경강연회: 페이지 제목 "${title}", 표 ${tables.length}개, 길이 ${html.length}`);
      tables.forEach((t, i) => console.log(`표 ${i + 1}: ${t.length}줄 →`, JSON.stringify(t.slice(0, 6))));
      const body = cellText((html.match(/<body[\s\S]*<\/body>/i) || [html])[0].replace(/<(script|style)[\s\S]*?<\/\1>/gi, ""));
      console.log("본문 글자(앞부분):", body.slice(0, 3000).replace(/\n+/g, " / "));
    }
    // 날짜처럼 보이는 칸이 가장 많은 표를 일정표로 봄
    const score = t => t.flat().filter(x => /\d{1,2}\s*[./월]\s*\d{1,2}/.test(x)).length;
    const best = tables.slice().sort((a, b) => score(b) - score(a))[0];
    if (!best || !score(best)) { warn("성경강연회: 일정 표를 찾지 못했습니다"); return; }
    const head = best[0].every(x => !/\d{1,2}\s*[./월]\s*\d{1,2}/.test(x)) ? best[0] : [];
    const rows = head.length ? best.slice(1) : best;
    const data = { source: c.url, title: c.title || title, headers: head, rows };
    if (same(data.headers, old.headers) && same(data.rows, old.rows)) { console.log("성경강연회: 바뀐 것 없음"); return; }
    await save("seminar", { updated: new Date().toISOString(), ...data });
    console.log(`성경강연회: ${rows.length}줄 저장 (머리줄: ${head.join(" | ")})`);
  } catch (e) { warn(`성경강연회 일정을 가져오지 못했습니다: ${e.message}`); }
}

await updateSermons();
await updateBlog();
await updateClips();
await updateSeminar();
