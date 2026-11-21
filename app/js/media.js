"use strict";
/* ============================================================
   설교(유튜브) · 블로그(네이버)
   목록은 GitHub Actions가 1시간마다 모아서 feeds/ 폴더에 넣어 둡니다.
   (유튜브·네이버는 다른 웹앱이 브라우저에서 직접 내용을 가져가는 것을 막아 두었기 때문)
   - feeds/sermons.js : FEED_LOAD("sermons", {...})
   - feeds/blog.js    : FEED_LOAD("blog", {...})
   <script>로 불러오므로 폴더에서 바로 연 앱(file://)에서도 동작합니다.
   ============================================================ */

const SERMON_CHANNEL_URL = "https://www.youtube.com/@lifewordsermon/videos";
const BLOG_URL = "https://blog.naver.com/jbch_yd";
TITLES.sermon = "설교"; SUBTITLES.sermon = "서울중앙교회 주일설교와 수요설교를 최신순으로 들어요.";
TITLES.blog = "블로그"; SUBTITLES.blog = "영동교회 블로그의 새 글을 최신순으로 읽어요.";
S.sermonType = "all";

const feedWaiters = {}, feedCache = {};
window.FEED_LOAD = (name, data) => { feedWaiters[name]?.(data); };
// 목록은 GitHub Pages에서 1시간마다 갱신되므로, 앱을 어디에 올렸든(Netlify 등) 그곳에서 먼저 받아 옴.
// <script>로 불러오면 다른 주소의 파일도 받을 수 있음. 실패하면(인터넷 없음 등) 앱과 함께 올린 feeds/ 사용.
const FEED_BASES = ["https://bbong1981-tech.github.io/seulgi-faith/feeds/", "feeds/"];
function loadFeedFrom(base, name) {
  return new Promise((res, rej) => {
    let done = false;
    feedWaiters[name] = d => { done = true; res(d); };
    const s = document.createElement("script");
    s.src = `${base}${name}.js?t=${Math.floor(Date.now() / 60000)}`; // 1분 단위로 새로 받음
    s.onload = () => { s.remove(); if (!done) rej(new Error("empty")); };
    s.onerror = () => { s.remove(); rej(new Error("load")); };
    document.head.appendChild(s);
  });
}
function loadFeed(name, fresh) {
  if (feedCache[name] && !fresh) return feedCache[name];
  return feedCache[name] = (async () => {
    let last;
    for (const base of FEED_BASES) {
      try { const d = await loadFeedFrom(base, name); if (d?.items?.length || base === FEED_BASES[FEED_BASES.length - 1]) return d; }
      catch (e) { last = e; }
    }
    delete feedCache[name];
    throw last || new Error("load");
  })();
}
const fmtFeedDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${DOW[d.getDay()]})`; };
function agoText(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (!(m >= 0)) return "";
  if (m < 60) return `${Math.max(1, m)}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}
const feedEmpty = (msg, url, label) => `<div class="card hymn-empty">${MASCOT(110)}<h3>${msg}</h3>
  <p class="small muted">새 글은 1시간마다 자동으로 모아 옵니다. 그 전에 보시려면 아래 버튼으로 바로 가 보세요.</p>
  <a class="btn primary" href="${url}" target="_blank" rel="noopener">${label}</a></div>`;

// ───────── 설교 ─────────
// "생명의말씀선교회 주일설교 | 제목 - 이요한 목사(2026.11.08) / 생명선 / 대한예수교침례회"
//  → { title: "제목", preacher: "이요한 목사" } (형식이 다르면 원래 제목 그대로)
function sermonParts(raw) {
  let t = String(raw).replace(/\s*\/\s*[^/|]*\s*\/\s*[^/|]*$/, "");          // 끝의 "/ 생명선 / 대한예수교침례회"
  t = t.replace(/^.*?(주일|수요)\s*(설교|예배)\s*[|｜:]\s*/, "");              // 앞의 "○○ 주일설교 | "
  const m = t.match(/^(.*\S)\s*[-–]\s*([^-–()]+?(목사|전도사|선교사|장로|강도사))\s*(\([\d.\s]+\))?\s*$/);
  return m ? { title: m[1], preacher: m[2].trim() } : { title: t.replace(/\s*\([\d.\s]+\)\s*$/, "") || raw, preacher: "" };
}
const SERMON_TYPES = { all: "전체", sunday: "주일설교", wednesday: "수요설교" };
// 교회 고르기: 영동교회(주일설교 재생목록) / 서울중앙교회(채널 전체)
const SERMON_CHURCHES = { yd: "영동교회", central: "서울중앙교회" };
const SERMON_SUBTITLES = { central: "서울중앙교회 주일설교와 수요설교를 최신순으로 들어요.", yd: "영동교회 주일설교를 최신순으로 들어요." };
const YD_PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLQZk6y9PKKgpqid53qSu8NHZjXZ_0f4Td";
S.sermonChurch = SERMON_CHURCHES[store.get("sermonChurch")] ? store.get("sermonChurch") : "yd";
SUBTITLES.sermon = SERMON_SUBTITLES[S.sermonChurch];
S.ydShow = 30;
const churchSeg = () => `<div class="seg church-seg" style="display:flex;margin-bottom:12px">${Object.entries(SERMON_CHURCHES).map(([k, l]) => `<button style="flex:1" class="${S.sermonChurch === k ? "on" : ""}" data-act="sermonChurch" data-c="${k}">${l}</button>`).join("")}</div>`;
ACT.sermonChurch = t => {
  S.sermonChurch = t.dataset.c; store.set("sermonChurch", S.sermonChurch);
  SUBTITLES.sermon = SERMON_SUBTITLES[S.sermonChurch]; S.ydShow = 30; render();
};
VIEWS.sermon = async function () {
  if (S.sermonChurch === "yd") return ydSermonView();
  $("#topActions").innerHTML = `<a class="icon-btn" href="${SERMON_CHANNEL_URL}" target="_blank" rel="noopener" aria-label="유튜브 채널 열기">${ICON("play")}</a>`;
  $("#view").innerHTML = `<p class="muted">설교 목록을 불러오는 중…</p>`;
  let data;
  try { data = await loadFeed("sermons"); } catch { data = null; }
  if (S.tab !== "sermon") return;
  const items = (data?.items || []).filter(v => S.sermonType === "all" || v.type === S.sermonType);
  const all = data?.items || [];
  const latest = t => all.find(v => v.type === t);
  if (!all.length) { $("#view").innerHTML = churchSeg() + feedEmpty("아직 설교 목록이 없어요", SERMON_CHANNEL_URL, "유튜브 채널에서 보기"); return; }
  const first = items[0];
  $("#view").innerHTML = `${churchSeg()}
    <div class="tiles">
      ${tile("peach", "play", "최근 주일설교", latest("sunday") ? fmtDate(latest("sunday").published.slice(0, 10)).replace(/ \(.\)/, "") : "-", latest("sunday") ? esc(sermonParts(latest("sunday").title).title) : "아직 없어요")}
      ${tile("mint", "play", "최근 수요설교", latest("wednesday") ? fmtDate(latest("wednesday").published.slice(0, 10)).replace(/ \(.\)/, "") : "-", latest("wednesday") ? esc(sermonParts(latest("wednesday").title).title) : "아직 없어요")}
    </div>
    <div class="seg" style="display:flex;margin-bottom:14px">${Object.entries(SERMON_TYPES).map(([k, l]) => `<button style="flex:1" class="${S.sermonType === k ? "on" : ""}" data-act="sermonType" data-t="${k}">${l}</button>`).join("")}</div>
    ${first ? `<button class="card sermon-hero" data-act="sermonPlay" data-id="${first.id}">
        <span class="thumb169"><img src="https://i.ytimg.com/vi/${first.id}/hqdefault.jpg" alt="" loading="lazy"><span class="play-badge">${ICON("play", 26)}</span></span>
        <span class="sermon-meta"><span class="badge">${SERMON_TYPES[first.type]}</span> <span class="small muted">${fmtFeedDate(first.published)}</span></span>
        <b class="sermon-title">${esc(sermonParts(first.title).title)}</b>
        ${sermonParts(first.title).preacher ? `<span class="sermon-meta small muted" style="margin-top:0">${esc(sermonParts(first.title).preacher)}</span>` : ""}
      </button>` : ""}
    <div class="card feed-list">${items.slice(1).map(v => `
      <button class="feed-row" data-act="sermonPlay" data-id="${v.id}">
        <span class="feed-thumb"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy"></span>
        <span class="feed-text"><b>${esc(sermonParts(v.title).title)}</b><span class="small muted"><span class="badge">${SERMON_TYPES[v.type]}</span> ${fmtFeedDate(v.published)}${sermonParts(v.title).preacher ? " · " + esc(sermonParts(v.title).preacher) : ""}</span></span>
      </button>`).join("") || `<p class="small muted" style="margin:6px 4px">더 지난 설교는 유튜브 채널에서 볼 수 있어요.</p>`}</div>
    <p class="small muted" style="text-align:center">${data.updated ? `${agoText(data.updated)}에 업데이트됨 · ` : ""}<a href="${SERMON_CHANNEL_URL}" target="_blank" rel="noopener">유튜브 채널 전체 보기</a></p>`;
};
// "[2026/11/15] 주일말씀 - 제목 (엡 4:11~12) (김재광P)" → { title: "제목 (엡 4:11~12)", preacher: "김재광P" }
function ydParts(v) {
  let t = String(v.title).replace(/^\s*\[[\d/.\s-]+\]\s*/, "").replace(/^(주일|수요)\s*(말씀|설교|예배)\s*[-–|｜:]\s*/, "");
  const m = t.match(/^(.*\S)\s*\(([^()]{1,15}(P|목사|전도사|선교사|장로|강도사|형제|자매))\)\s*$/);
  return m ? { title: m[1], preacher: m[2] } : { title: t || v.title, preacher: "" };
}
// 영동교회: 연도별로 나눠 보기 (재생목록이 여러 개여도 올린 날짜로 묶음)
async function ydSermonView() {
  $("#topActions").innerHTML = `<a class="icon-btn" href="${YD_PLAYLIST_URL}" target="_blank" rel="noopener" aria-label="유튜브 재생목록 열기">${ICON("play")}</a>`;
  $("#view").innerHTML = `${churchSeg()}<p class="muted">영동교회 설교를 불러오는 중…</p>`;
  let data;
  try { data = await loadFeed("ydsermons"); } catch { data = null; }
  if (S.tab !== "sermon" || S.sermonChurch !== "yd") return;
  const all = data?.items || [];
  if (!all.length) { $("#view").innerHTML = churchSeg() + feedEmpty("아직 영동교회 설교 목록이 없어요", YD_PLAYLIST_URL, "유튜브 재생목록에서 보기"); return; }
  const years = [...new Set(all.map(v => v.published.slice(0, 4)))];
  if (!years.includes(S.ydYear)) S.ydYear = years[0];
  const items = all.filter(v => v.published.startsWith(S.ydYear));
  const first = items[0], pl = data.playlists || [];
  const sp = ydParts;
  $("#view").innerHTML = `${churchSeg()}
    <div class="chips">${years.map(y => `<button class="chip ${S.ydYear === y ? "on" : ""}" data-act="ydYear" data-y="${y}">${y}년 <small>${all.filter(v => v.published.startsWith(y)).length}</small></button>`).join("")}</div>
    <button class="card sermon-hero" data-act="sermonPlay" data-feed="ydsermons" data-id="${first.id}">
      <span class="thumb169"><img src="https://i.ytimg.com/vi/${first.id}/hqdefault.jpg" alt="" loading="lazy"><span class="play-badge">${ICON("play", 26)}</span></span>
      <span class="sermon-meta"><span class="badge">주일설교</span> <span class="small muted">${fmtFeedDate(first.published)}</span></span>
      <b class="sermon-title">${esc(sp(first).title)}</b>
      ${sp(first).preacher ? `<span class="sermon-meta small muted" style="margin-top:0">${esc(sp(first).preacher)}</span>` : ""}
    </button>
    ${items.length > 1 ? `<div class="card feed-list">${items.slice(1, S.ydShow).map(v => `
      <button class="feed-row" data-act="sermonPlay" data-feed="ydsermons" data-id="${v.id}">
        <span class="feed-thumb"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy"></span>
        <span class="feed-text"><b>${esc(sp(v).title)}</b><span class="small muted">${fmtFeedDate(v.published)}${sp(v).preacher ? " · " + esc(sp(v).preacher) : ""}</span></span>
      </button>`).join("")}</div>
    ${items.length > S.ydShow ? `<p style="text-align:center"><button class="btn" data-act="ydMore">더 보기 (${items.length - S.ydShow}개 더)</button></p>` : ""}` : ""}
    <div class="card feed-list">${(pl.length ? pl : [{ label: "주일설교 (영동교회)", url: YD_PLAYLIST_URL }]).map(p => `
      <a class="feed-row" href="${esc(p.url)}" target="_blank" rel="noopener"><span class="t-ic">${ICON("play", 20)}</span><span class="feed-text"><b>${esc(p.label)}</b><span class="small muted">유튜브 재생목록 전체 보기</span></span></a>`).join("")}</div>
    <p class="small muted" style="text-align:center">${data.updated ? `${agoText(data.updated)}에 업데이트됨` : ""}</p>`;
}
ACT.ydYear = t => { S.ydYear = t.dataset.y; S.ydShow = 30; render(); };
ACT.ydMore = () => { const y = scrollY; S.ydShow += 30; render(); scrollTo(0, y); };
ACT.sermonType = t => { S.sermonType = t.dataset.t; render(); };
// 재생 화면: 설교(sermons)와 조각설교(clips)가 함께 씀
ACT.sermonPlay = async t => {
  const feed = t.dataset.feed || "sermons";
  const data = await loadFeed(feed).catch(() => null);
  const v = data?.items.find(x => x.id === t.dataset.id); if (!v) return;
  const watch = `https://www.youtube.com/watch?v=${v.id}`;
  const sp = feed === "churchevents" ? { title: evTitle(v.title), preacher: "" } : feed === "praise" ? { title: v.title, preacher: "" } : feed === "ydsermons" ? ydParts(v) : feed === "clips" ? (cp => ({ title: cp.title, preacher: [cp.speaker, v.channel].filter(Boolean).join(" · ") }))(clipParts(v.title)) : sermonParts(v.title);
  const label = feed === "churchevents" ? "행사" : feed === "praise" ? v.artist : feed === "clips" ? CLIP_TYPES[v.type] : feed === "ydsermons" ? "영동교회 주일설교" : SERMON_TYPES[v.type];
  openSheet(`${sheetHead(esc(sp.title))}
    <div class="video-box"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?rel=0&playsinline=1" title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>
    <p class="small muted" style="margin:10px 2px"><span class="badge">${label}</span> ${fmtFeedDate(v.published || (v.date ? v.date + "T12:00:00" : ""))}${sp.preacher ? " · " + esc(sp.preacher) : ""}</p>
    <div class="row wrap"><a class="btn" href="${watch}" target="_blank" rel="noopener">${ICON("play", 14)} 유튜브 앱에서 보기</a>
      <button class="btn" data-act="sermonShare" data-id="${v.id}" data-feed="${feed}">공유</button></div>`);
};
ACT.sermonShare = async t => {
  const data = await loadFeed(t.dataset.feed || "sermons").catch(() => null);
  const v = data?.items.find(x => x.id === t.dataset.id); if (!v) return;
  const text = `${v.title}\nhttps://www.youtube.com/watch?v=${v.id}`;
  if (navigator.share) { try { await navigator.share({ text }); } catch { } }
  else { try { await navigator.clipboard.writeText(text); toast("링크를 복사했습니다"); } catch { prompt("복사하세요", text); } }
};

// ───────── 블로그 ─────────
VIEWS.blog = async function () {
  $("#topActions").innerHTML = `<a class="icon-btn" href="${BLOG_URL}" target="_blank" rel="noopener" aria-label="블로그 열기">${ICON("pen")}</a>`;
  $("#view").innerHTML = `<p class="muted">블로그 글을 불러오는 중…</p>`;
  let data;
  try { data = await loadFeed("blog"); } catch { data = null; }
  if (S.tab !== "blog") return;
  const items = data?.items || [];
  if (!items.length) { $("#view").innerHTML = feedEmpty("아직 블로그 글이 없어요", BLOG_URL, "네이버 블로그에서 보기"); return; }
  $("#view").innerHTML = `
    <div class="card feed-list">${items.map(p => `
      <a class="feed-row" href="${esc(p.link)}" target="_blank" rel="noopener">
        ${p.thumb ? `<span class="feed-thumb"><img src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>` : ""}
        <span class="feed-text"><b>${esc(p.title)}</b>${p.summary ? `<span class="feed-sum">${esc(p.summary)}</span>` : ""}<span class="small muted">${p.category ? `<span class="badge">${esc(p.category)}</span> ` : ""}${fmtFeedDate(p.published)}</span></span>
      </a>`).join("")}</div>
    <p class="small muted" style="text-align:center">${data.updated ? `${agoText(data.updated)}에 업데이트됨 · ` : ""}<a href="${BLOG_URL}" target="_blank" rel="noopener">블로그 전체 보기</a></p>`;
};

// ───────── 조각설교 ─────────
// 여러 유튜브 채널에서 제목에 '조각설교'·'조각말씀'·'질의응답'이 들어간 짧은 영상
TITLES.clips = "조각설교"; SUBTITLES.clips = "짧은 조각설교·조각말씀·질의응답을 최신순으로 들어요.";
const CLIP_TYPES = { piece: "조각설교", word: "조각말씀", qna: "질의응답" };
const CLIP_CHANNELS = ["@ludiasermon", "@1분말씀l", "@godislove67778", "@today_word7", "@야곱의우물-i3s"];
S.clipType = "all"; S.clipCh = "all"; S.clipShow = 40;
// "[조각말씀] 제목ㅣ홍정현 목사 #해시태그" → { title: "제목", speaker: "홍정현 목사" }
function clipParts(raw) {
  let t = String(raw).replace(/#\S+/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^\s*[\[(【]?\s*(조각설교|조각말씀|질의응답)\s*[\])】]?\s*[|｜ㅣ:·\-–]?\s*/, "");
  let speaker = "";
  const m = t.match(/^(.*\S)\s*[|｜ㅣ]\s*([^|｜ㅣ]{1,20})$/); // 마지막 구분선 뒤가 짧으면 말씀하신 분
  if (m && /(목사|전도사|선교사|장로|강도사|P|형제|자매|님)\s*$/.test(m[2])) { t = m[1]; speaker = m[2].trim(); }
  return { title: t.replace(/\s*[|｜ㅣ]\s*$/, "").trim() || String(raw), speaker };
}
const clipTitle = raw => clipParts(raw).title;
VIEWS.clips = async function () {
  $("#topActions").innerHTML = `<button class="icon-btn" data-act="clipChannels" aria-label="채널 보기">${ICON("play")}</button>`;
  $("#view").innerHTML = `<p class="muted">조각설교를 불러오는 중…</p>`;
  let data;
  try { data = await loadFeed("clips"); } catch { data = null; }
  if (S.tab !== "clips") return;
  const all = data?.items || [];
  if (!all.length) { $("#view").innerHTML = feedEmpty("아직 조각설교가 없어요", `https://www.youtube.com/${CLIP_CHANNELS[0]}`, "유튜브에서 보기"); return; }
  const chans = data.channels || [];
  const items = all.filter(v => (S.clipType === "all" || v.type === S.clipType) && (S.clipCh === "all" || v.handle === S.clipCh));
  const count = t => all.filter(v => v.type === t).length;
  $("#view").innerHTML = `
    <div class="seg" style="display:flex;margin-bottom:10px">${[["all", "전체"], ...Object.entries(CLIP_TYPES).filter(([k]) => count(k) > 0)].map(([k, l]) => `<button style="flex:1" class="${S.clipType === k ? "on" : ""}" data-act="clipType" data-t="${k}">${l}${k === "all" ? "" : ` <small>${count(k)}</small>`}</button>`).join("")}</div>
    <div class="chips">${[["all", "모든 채널"], ...chans.map(c => [c.handle, c.name || c.handle])].map(([k, l]) => `<button class="chip ${S.clipCh === k ? "on" : ""}" data-act="clipCh" data-c="${esc(k)}">${esc(l)}</button>`).join("")}</div>
    ${items.length ? `<div class="card feed-list">${items.slice(0, S.clipShow).map(v => `
      <button class="feed-row" data-act="sermonPlay" data-feed="clips" data-id="${v.id}">
        <span class="feed-thumb"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy"></span>
        <span class="feed-text"><b>${esc(clipTitle(v.title))}</b><span class="small muted"><span class="badge">${CLIP_TYPES[v.type]}</span> ${fmtFeedDate(v.published)} · ${esc([clipParts(v.title).speaker, v.channel].filter(Boolean).join(" · "))}</span></span>
      </button>`).join("")}</div>
      ${items.length > S.clipShow ? `<p style="text-align:center"><button class="btn" data-act="clipMore">더 보기 (${items.length - S.clipShow}개 더)</button></p>` : ""}`
    : `<p class="empty">이 조건에 맞는 영상이 아직 없어요.</p>`}
    <p class="small muted" style="text-align:center">${data.updated ? `${agoText(data.updated)}에 업데이트됨` : ""}</p>`;
};
ACT.clipType = t => { S.clipType = t.dataset.t; S.clipShow = 40; render(); };
ACT.clipCh = t => { S.clipCh = t.dataset.c; S.clipShow = 40; render(); };
ACT.clipMore = () => { const y = scrollY; S.clipShow += 40; render(); scrollTo(0, y); };
ACT.clipChannels = async () => {
  const data = await loadFeed("clips").catch(() => null);
  const chans = data?.channels?.length ? data.channels : CLIP_CHANNELS.map(h => ({ handle: h, name: h }));
  openSheet(`${sheetHead("조각설교 채널")}
    <p class="small muted" style="margin-top:-4px">아래 채널에서 제목에 '조각설교', '조각말씀', '질의응답'이 들어간 영상만 모아 옵니다.</p>
    <div class="card feed-list">${chans.map(c => `<a class="feed-row" href="https://www.youtube.com/${encodeURI(c.handle)}/videos" target="_blank" rel="noopener"><span class="feed-text"><b>${esc(c.name || c.handle)}</b><span class="small muted">${esc(c.handle)}</span></span></a>`).join("")}</div>`);
};

// ───────── 성경강연회 연간 일정 (일정 메뉴 맨 위) ─────────
const SEMINAR_PAGE = "https://church.jbch.org/newsnotice/church_sche_seminar/seminar.php?flag=1&chId=58";
const md = ds => { const d = parseYMD(ds); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; };
window.renderSeminar = async function () {
  const box = $("#seminarBox"); if (!box) return;
  let data;
  try { data = await loadFeed("seminar"); } catch { data = null; }
  if (S.tab !== "events" || !$("#seminarBox")) return;
  const items = data?.items || [];
  if (!items.length) {
    box.innerHTML = `<div class="card seminar"><div class="row"><b class="display seminar-title">영동교회 성경강연회</b><span class="spacer"></span><a class="btn sm" href="${SEMINAR_PAGE}" target="_blank" rel="noopener">홈페이지에서 보기</a></div></div>`;
    return;
  }
  const today = todayStr();
  const years = [...new Set(items.map(x => x.start.slice(0, 4)))];
  const state = x => (x.end || x.start) < today ? "past" : x.start <= today ? "now" : "next";
  const nextOne = items.find(x => state(x) !== "past");
  // 처음에는 다가오는 강연회가 있는 해(올해가 다 끝났으면 내년)를 보여 줌
  if (!years.includes(S.semYear)) S.semYear = nextOne ? nextOne.start.slice(0, 4) : (years.includes(today.slice(0, 4)) ? today.slice(0, 4) : years[years.length - 1]);
  const list = items.filter(x => x.start.startsWith(S.semYear));
  box.innerHTML = `<div class="card seminar">
    <div class="row wrap" style="margin-bottom:6px">
      <b class="display seminar-title">영동교회 성경강연회</b>
      ${years.length > 1 ? `<div class="seg">${years.map(y => `<button class="${y === S.semYear ? "on" : ""}" data-act="semYear" data-y="${y}">${y}</button>`).join("")}</div>` : `<span class="badge">${S.semYear}년</span>`}
    </div>
    ${nextOne ? `<p class="small" style="margin:0 2px 10px">${state(nextOne) === "now" ? "🔔 지금 <b>진행 중</b>" : `다음 강연회 <b>${md(nextOne.start)}</b> · ${Math.max(0, diffDays(nextOne.start, today))}일 남음`} — ${esc(nextOne.kind)}, ${esc(nextOne.speaker)}</p>` : ""}
    <div class="sem-table-wrap"><table class="sem-table">
      <thead><tr><th>기간</th><th>구분</th><th>장소</th><th>강사</th></tr></thead>
      <tbody>${list.map(x => `<tr class="${state(x)}">
        <td class="nowrap">${md(x.start)}${x.end && x.end !== x.start ? `<br><span class="muted">~ ${md(x.end)}</span>` : ""}${state(x) === "now" ? `<br><span class="badge">진행 중</span>` : ""}</td>
        <td>${esc(x.kind)}</td><td>${esc(x.place)}</td><td>${esc(x.speaker)}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="small muted" style="margin:8px 2px 0">${data.updated ? `${agoText(data.updated)} 확인 · ` : ""}<a href="${SEMINAR_PAGE}" target="_blank" rel="noopener">교회 홈페이지에서 보기</a></p>
  </div>`;
};
ACT.semYear = t => { S.semYear = t.dataset.y; window.renderSeminar(); };

// ───────── 초대장 (성경강연회 초대장 만들기·보내기) ─────────
const INVITE_URL = "https://mdata.jbch.org/mcard/";
TITLES.invite = "초대장"; SUBTITLES.invite = "사랑하는 당신을 성경강연회에 초대합니다";
VIEWS.invite = function () {
  $("#topActions").innerHTML = `<a class="icon-btn" href="${INVITE_URL}" target="_blank" rel="noopener" aria-label="새 창에서 열기">${ICON("upload")}</a>`;
  $("#view").innerHTML = `
    <div class="card invite-head">
      <span class="t-ic">${ICON("mail", 22)}</span>
      <span class="invite-text"><b class="display">성경강연회 초대장</b><span class="small muted">마음에 드는 초대장을 골라 사랑하는 분께 보내 보세요.</span></span>
      <a class="btn sm" href="${INVITE_URL}" target="_blank" rel="noopener">새 창에서 열기</a>
    </div>
    <div class="invite-frame"><iframe src="${INVITE_URL}" title="성경강연회 초대장" loading="lazy" allow="clipboard-write; web-share"></iframe></div>`;
};

// ───────── 강연회 (영동교회 성경강연회 재생목록 + 연령별 성경강연회) ─────────
TITLES.lecture = "강연회"; SUBTITLES.lecture = "영동교회와 연령별 성경강연회 말씀을 다시 들어요.";
const LEC_MODES = { yd: "영동교회 성경강연회", ages: "연령별 성경강연회" };
const YD_LEC_URL = "https://www.youtube.com/@yeongdong_church/playlists";
S.lecMode = LEC_MODES[store.get("lecMode")] ? store.get("lecMode") : "yd";
S.lecAge = store.get("lecAge", "adult"); S.lecGroup = "all";
// "성경강연회(26.10.26-11.1) 오경연P" → { year: "2026", when: "10월 26일 ~ 11월 1일", speaker: "오경연P" }
function lecParts(title) {
  const m = String(title).match(/\(\s*(?:20)?(\d{2})\.(\d{1,2})\.(\d{1,2})\s*[~\-–]\s*(?:(\d{1,2})\.)?(\d{1,2})\s*\)\s*(.*)$/);
  if (!m) return { year: "", when: title, speaker: "" };
  const [, y, m1, d1, m2, d2, sp] = m;
  return { year: "20" + y, when: `${+m1}월 ${+d1}일 ~ ${m2 ? `${+m2}월 ` : ""}${+d2}일`, speaker: sp.trim() };
}
const lecSeg = () => `<div class="seg" style="display:flex;margin-bottom:12px">${Object.entries(LEC_MODES).map(([k, l]) => `<button style="flex:1" class="${S.lecMode === k ? "on" : ""}" data-act="lecMode" data-m="${k}">${l}</button>`).join("")}</div>`;
VIEWS.lecture = async function () {
  $("#topActions").innerHTML = `<a class="icon-btn" href="${S.lecMode === "yd" ? YD_LEC_URL : (LEC_AGE_URL[S.lecAge] || "https://www.jbch.org/ko/seminar/seminar.php?cId=26")}" target="_blank" rel="noopener" aria-label="원래 페이지 열기">${ICON("play")}</a>`;
  $("#view").innerHTML = `${lecSeg()}<p class="muted">강연회 목록을 불러오는 중…</p>`;
  let data;
  try { data = await loadFeed("lectures"); } catch { data = null; }
  if (S.tab !== "lecture") return;
  const body = S.lecMode === "yd" ? lecYdHtml(data?.yd) : lecAgesHtml(data?.ages || []);
  $("#view").innerHTML = `${lecSeg()}${body}<p class="small muted" style="text-align:center">${data?.updated ? `${agoText(data.updated)}에 업데이트됨` : ""}</p>`;
};
const LEC_AGE_URL = {};
function lecYdHtml(yd) {
  const pls = yd?.playlists || [];
  if (!pls.length) return feedEmpty("아직 강연회 목록이 없어요", YD_LEC_URL, "유튜브에서 보기");
  const byYear = {};
  for (const p of pls) { const y = lecParts(p.title).year || "그 밖의"; (byYear[y] ||= []).push(p); }
  return Object.keys(byYear).sort((a, b) => b.localeCompare(a)).map(y => `
    <div class="section-title">${y}${/^\d+$/.test(y) ? "년" : ""}</div>
    <div class="card feed-list">${byYear[y].map(p => { const lp = lecParts(p.title); return `
      <button class="feed-row" data-act="lecPl" data-id="${esc(p.id)}">
        <span class="feed-thumb"><img src="https://i.ytimg.com/vi/${p.items[0].id}/mqdefault.jpg" alt="" loading="lazy"><span class="thumb-count">${p.items.length}편</span></span>
        <span class="feed-text"><b>${esc(lp.speaker || p.title)}</b><span class="small muted">${esc(lp.when)}</span></span>
      </button>`; }).join("")}</div>`).join("");
}
function lecAgesHtml(ages) {
  if (!ages.length) return feedEmpty("아직 강연회 목록이 없어요", "https://www.jbch.org/ko/seminar/seminar.php?cId=26", "홈페이지에서 보기");
  for (const a of ages) LEC_AGE_URL[a.id] = a.url;
  const age = ages.find(a => a.id === S.lecAge) || ages[0]; S.lecAge = age.id;
  if (S.lecGroup !== "all" && !age.groups.some(g => g.cat === S.lecGroup)) S.lecGroup = "all";
  const groups = age.groups.filter(g => S.lecGroup === "all" || g.cat === S.lecGroup);
  const short = n => n.length > 18 ? n.slice(0, 17) + "…" : n;
  return `
    <div class="chips">${ages.map(a => `<button class="chip ${a.id === age.id ? "on" : ""}" data-act="lecAge" data-a="${a.id}">${esc(a.name)}</button>`).join("")}</div>
    ${age.groups.length > 1 ? `<div class="chips">${[["all", "모두"], ...age.groups.map(g => [g.cat, short(g.name)])].map(([k, l]) => `<button class="chip sm ${S.lecGroup === k ? "on" : ""}" data-act="lecGroup" data-g="${k}">${esc(l)}</button>`).join("")}</div>` : ""}
    ${groups.map(g => `
      <div class="lec-who">${g.pic ? `<img src="${esc(g.pic)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="t-ic">${ICON("users", 18)}</span>`}<b>${esc(g.name)}</b><span class="small muted">${g.items.length}편</span></div>
      <div class="card feed-list">${g.items.map(v => v.yt ? `
        <button class="feed-row" data-act="lecPlay" data-yt="${esc(v.yt)}" data-t="${esc(v.title)}" data-s="${esc(`${age.name} · ${g.name}`)}">
          <span class="feed-thumb"><img src="https://i.ytimg.com/vi/${esc(v.yt)}/mqdefault.jpg" alt="" loading="lazy"></span>
          <span class="feed-text"><b>${esc(v.title)}</b></span>
        </button>` : `
        <a class="feed-row" href="https://www.jbch.org/ko/seminar/view.php?psId=${esc(v.psId)}&cId=${esc(g.cat)}" target="_blank" rel="noopener">
          <span class="feed-text"><b>${esc(v.title)}</b><span class="small muted">홈페이지에서 보기</span></span>
        </a>`).join("")}</div>`).join("")}`;
}
ACT.lecMode = t => { S.lecMode = t.dataset.m; store.set("lecMode", S.lecMode); render(); };
ACT.lecAge = t => { S.lecAge = t.dataset.a; store.set("lecAge", S.lecAge); S.lecGroup = "all"; render(); };
ACT.lecGroup = t => { S.lecGroup = t.dataset.g; render(); };
const ytFrame = src => `<div class="video-box"><iframe src="${src}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
ACT.lecPlay = t => {
  openSheet(`${sheetHead(esc(t.dataset.t))}${ytFrame(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.dataset.yt)}?rel=0&playsinline=1`)}
    <p class="small muted" style="margin:10px 2px">${esc(t.dataset.s)}</p>
    <div class="row wrap"><a class="btn" href="https://www.youtube.com/watch?v=${encodeURIComponent(t.dataset.yt)}" target="_blank" rel="noopener">${ICON("play", 14)} 유튜브 앱에서 보기</a></div>`);
};
// 영동교회 강연회 한 회: 위에서 재생, 아래 목록에서 골라 듣기 (처음엔 차례로 이어서 재생)
// 회차 제목 "[2026/10/26] 성경강연회 1일차 (오경연P)" → { t: "성경강연회 1일차", d: "2026-10-26" }
function lecEp(v) {
  const m = String(v.title).match(/^\s*\[(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})\]\s*/);
  const t = String(v.title).replace(/^\s*\[[^\]]*\]\s*/, "").replace(/\s*\([^()]*(P|목사)\)\s*$/, "").trim() || v.title;
  return { id: v.id, t, d: m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "" };
}
ACT.lecPl = async t => {
  const data = await loadFeed("lectures").catch(() => null);
  const p = data?.yd?.playlists.find(x => x.id === t.dataset.id); if (!p) return;
  const lp = lecParts(p.title);
  let eps = p.items.map(lecEp);
  if (eps.every(e => e.d)) eps = eps.sort((a, b) => a.d.localeCompare(b.d)); // 1일차부터
  const ids = eps.map(e => e.id);
  openSheet(`${sheetHead(esc(lp.speaker ? `성경강연회 · ${lp.speaker}` : p.title))}
    <p class="small muted" style="margin:-6px 2px 10px">${esc(lp.year ? `${lp.year}년 ${lp.when}` : "")} · ${eps.length}편 차례로 듣기</p>
    ${ytFrame(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(ids[0])}?playlist=${encodeURIComponent(ids.slice(1).join(","))}&rel=0&playsinline=1`)}
    <div class="card feed-list lec-ep" style="margin-top:12px">${eps.map((e, i) => `
      <button class="feed-row ${i === 0 ? "on" : ""}" data-act="lecEp" data-i="${i}" data-ids="${esc(ids.join(","))}"><span class="hno">${i + 1}</span><span class="feed-text"><b>${esc(e.t)}</b>${e.d ? `<span class="small muted">${fmtFeedDate(e.d + "T12:00:00")}</span>` : ""}</span></button>`).join("")}</div>
    <div class="row wrap"><a class="btn" href="https://www.youtube.com/playlist?list=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">${ICON("play", 14)} 유튜브 앱에서 보기</a></div>`);
};
ACT.lecEp = t => {
  const f = document.querySelector(".sheet .video-box iframe"); if (!f) return;
  const ids = t.dataset.ids.split(","), i = +t.dataset.i; // 고른 회차부터 끝까지 이어서
  f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ids[i])}?playlist=${encodeURIComponent(ids.slice(i + 1).join(","))}&rel=0&playsinline=1&autoplay=1`;
  document.querySelectorAll(".lec-ep .feed-row").forEach(b => b.classList.toggle("on", b === t));
  f.scrollIntoView({ behavior: "smooth", block: "center" });
};

// ───────── 행사 (영동교회 행사 영상) ─────────
TITLES.churchev = "행사"; SUBTITLES.churchev = "영동교회 행사 영상을 최신순으로 봐요.";
const CHURCHEV_URL = "https://www.youtube.com/playlist?list=PLQZk6y9PKKgpaUoan2uBQxN8vbP2Z66eD";
// "[2026/05/24] 2026 영동교회 찬양제" → "2026 영동교회 찬양제"
const evTitle = t => String(t).replace(/^\s*\[[\d/.\s-]+\]\s*/, "").trim() || t;
VIEWS.churchev = async function () {
  $("#topActions").innerHTML = `<a class="icon-btn" href="${CHURCHEV_URL}" target="_blank" rel="noopener" aria-label="유튜브 재생목록 열기">${ICON("play")}</a>`;
  $("#view").innerHTML = `<p class="muted">행사 영상을 불러오는 중…</p>`;
  let data;
  try { data = await loadFeed("churchevents"); } catch { data = null; }
  if (S.tab !== "churchev") return;
  const all = (data?.items || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.order - b.order);
  if (!all.length) { $("#view").innerHTML = feedEmpty("아직 행사 영상이 없어요", CHURCHEV_URL, "유튜브 재생목록에서 보기"); return; }
  const first = all[0], byYear = {};
  for (const v of all.slice(1)) (byYear[v.date ? v.date.slice(0, 4) + "년" : "그 밖의 영상"] ||= []).push(v);
  const when = v => v.date ? fmtFeedDate(v.date + "T12:00:00") : "";
  $("#view").innerHTML = `
    <button class="card sermon-hero" data-act="sermonPlay" data-feed="churchevents" data-id="${first.id}">
      <span class="thumb169"><img src="https://i.ytimg.com/vi/${first.id}/hqdefault.jpg" alt="" loading="lazy"><span class="play-badge">${ICON("play", 26)}</span></span>
      <span class="sermon-meta"><span class="badge">최근 행사</span> <span class="small muted">${when(first)}</span></span>
      <b class="sermon-title">${esc(evTitle(first.title))}</b>
    </button>
    ${Object.entries(byYear).map(([y, list]) => `<div class="section-title">${y}</div>
    <div class="card feed-list">${list.map(v => `
      <button class="feed-row" data-act="sermonPlay" data-feed="churchevents" data-id="${v.id}">
        <span class="feed-thumb"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy"></span>
        <span class="feed-text"><b>${esc(evTitle(v.title))}</b><span class="small muted">${when(v)}</span></span>
      </button>`).join("")}</div>`).join("")}
    <p class="small muted" style="text-align:center">${data.updated ? `${agoText(data.updated)}에 업데이트됨 · ` : ""}<a href="${CHURCHEV_URL}" target="_blank" rel="noopener">유튜브 재생목록 전체 보기</a></p>`;
};

// 바로가기(./?tab=sermon 등)로 열었을 때
if (["sermon", "blog", "clips", "invite", "hymn", "lecture", "churchev"].includes(S.tab)) render(); // 찬양도 이 파일의 loadFeed를 씀
else if (S.tab === "events") window.renderSeminar(); // 일정 화면이 먼저 그려졌으면 강연회 표만 채움
