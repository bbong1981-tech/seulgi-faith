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
TITLES.sermon = "설교"; SUBTITLES.sermon = "주일설교와 수요설교를 최신순으로 들어요.";
TITLES.blog = "블로그"; SUBTITLES.blog = "교회 블로그의 새 글을 최신순으로 읽어요.";
S.sermonType = "all";

const feedWaiters = {}, feedCache = {};
window.FEED_LOAD = (name, data) => { feedWaiters[name]?.(data); };
function loadFeed(name, fresh) {
  if (feedCache[name] && !fresh) return feedCache[name];
  return feedCache[name] = new Promise((res, rej) => {
    let done = false;
    feedWaiters[name] = d => { done = true; res(d); };
    const s = document.createElement("script");
    s.src = `feeds/${name}.js?t=${Math.floor(Date.now() / 60000)}`; // 1분 단위로 새로 받음
    s.onload = () => { s.remove(); if (!done) rej(new Error("empty")); };
    s.onerror = () => { s.remove(); delete feedCache[name]; rej(new Error("load")); };
    document.head.appendChild(s);
  });
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
VIEWS.sermon = async function () {
  $("#topActions").innerHTML = `<a class="icon-btn" href="${SERMON_CHANNEL_URL}" target="_blank" rel="noopener" aria-label="유튜브 채널 열기">${ICON("play")}</a>`;
  $("#view").innerHTML = `<p class="muted">설교 목록을 불러오는 중…</p>`;
  let data;
  try { data = await loadFeed("sermons"); } catch { data = null; }
  if (S.tab !== "sermon") return;
  const items = (data?.items || []).filter(v => S.sermonType === "all" || v.type === S.sermonType);
  const all = data?.items || [];
  const latest = t => all.find(v => v.type === t);
  if (!all.length) { $("#view").innerHTML = feedEmpty("아직 설교 목록이 없어요", SERMON_CHANNEL_URL, "유튜브 채널에서 보기"); return; }
  const first = items[0];
  $("#view").innerHTML = `
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
ACT.sermonType = t => { S.sermonType = t.dataset.t; render(); };
ACT.sermonPlay = async t => {
  const data = await loadFeed("sermons").catch(() => null);
  const v = data?.items.find(x => x.id === t.dataset.id); if (!v) return;
  const watch = `https://www.youtube.com/watch?v=${v.id}`;
  const sp = sermonParts(v.title);
  openSheet(`${sheetHead(esc(sp.title))}
    <div class="video-box"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?rel=0&playsinline=1" title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>
    <p class="small muted" style="margin:10px 2px"><span class="badge">${SERMON_TYPES[v.type]}</span> ${fmtFeedDate(v.published)}${sp.preacher ? " · " + esc(sp.preacher) : ""}</p>
    <div class="row wrap"><a class="btn" href="${watch}" target="_blank" rel="noopener">${ICON("play", 14)} 유튜브 앱에서 보기</a>
      <button class="btn" data-act="sermonShare" data-id="${v.id}">공유</button></div>`);
};
ACT.sermonShare = async t => {
  const data = await loadFeed("sermons").catch(() => null);
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

// 바로가기(./?tab=sermon 등)로 열었을 때
if (S.tab === "sermon" || S.tab === "blog") render();
