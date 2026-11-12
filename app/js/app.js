"use strict";
/* ============================================================
   슬기로운 신앙생활 — 성경 · 읽기표 · 단어사전 · 기도노트 · 찬양 · 교회 일정/알람
   모든 데이터는 이 기기의 브라우저(localStorage)에 저장됩니다.
   ============================================================ */

// ───────── 유틸 ─────────
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYMD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = parseYMD(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseYMD(a) - parseYMD(b)) / 86400000);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const fmtDate = s => { const d = parseYMD(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
const fmtTime = t => { if (!t) return "종일"; const [h, m] = t.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(m)}`; };

const store = {
  get(k, def) { try { const v = localStorage.getItem("mw." + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem("mw." + k, JSON.stringify(v)); } catch { toast("저장 공간이 부족합니다"); } }
};

function toast(msg, ms = 2200) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}
function openSheet(html) { $("#sheet").innerHTML = html; $("#modal").classList.remove("hidden"); $("#sheet").scrollTop = 0; }
function closeSheet() { $("#modal").classList.add("hidden"); $("#sheet").innerHTML = ""; }
// 앱 안에서 띄우는 확인 창 (브라우저 confirm 대신)
function askConfirm(msg, okLabel = "확인") {
  return new Promise(res => {
    openSheet(`<p style="font-size:16.5px;margin:4px 0 18px;white-space:pre-wrap">${esc(msg)}</p>
      <div class="row"><span class="spacer"></span><button class="btn" id="cfNo">취소</button><button class="btn primary" id="cfYes">${esc(okLabel)}</button></div>`);
    $("#cfNo").onclick = () => { closeSheet(); res(false); };
    $("#cfYes").onclick = () => { closeSheet(); res(true); };
  });
}
const sheetHead = title => `<div class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-act="close" aria-label="닫기">${ICON("close")}</button></div>`;

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ───────── 상태 ─────────
const S = {
  tab: "bible",
  settings: Object.assign({ mode: "ko", fontSize: 18, theme: "auto", dailyOn: false, dailyTime: "07:00", ref: { book: 0, chapter: 1 } }, store.get("settings", {})),
  sel: null,        // 선택한 절
  flash: null,      // 이동 후 강조할 절
  planView: "plan",
  dictQ: "", dictCat: "전체",
  prayerFilter: "praying", prayerCat: "전체", prayerQ: "",
  calMonth: null, calSel: todayStr()
};
const saveSettings = () => store.set("settings", S.settings);
const readSet = new Set(store.get("read", []));
const saveRead = () => store.set("read", [...readSet]);

function applyTheme() {
  const t = S.settings.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.setProperty("--fs", S.settings.fontSize + "px");
}

// ───────── 성경 데이터 ─────────
// 본문 파일은 <script>로 불러옵니다. 그래야 폴더에서 index.html을 바로 열어도(file://) 읽을 수 있습니다.
const dataWaiters = {};
window.BIBLE_LOAD = (lang, key, data) => { const w = dataWaiters[lang + ":" + key]; if (w) w(data); };
function loadDataScript(lang, key) {
  return new Promise((res, rej) => {
    let done = false;
    dataWaiters[lang + ":" + key] = d => { done = true; res(d); };
    const s = document.createElement("script");
    s.src = `data/${lang}/${key === "titles" ? "psalm-titles" : key}.js`;
    s.onload = () => { s.remove(); if (!done) rej(new Error("empty")); };
    s.onerror = () => { s.remove(); rej(new Error("load")); };
    document.head.appendChild(s);
  });
}
const bookCache = { ko: {}, en: {} };
function loadBook(lang, b) {
  if (!bookCache[lang][b]) bookCache[lang][b] = loadDataScript(lang, b + 1).catch(e => { delete bookCache[lang][b]; throw e; });
  return bookCache[lang][b];
}
let psalmTitles = null;
const getPsalmTitle = async ch => { try { psalmTitles = psalmTitles || await loadDataScript("ko", "titles"); return psalmTitles[ch] || ""; } catch { return ""; } };
async function getVerses(book, chapter, lang) { const bk = await loadBook(lang, book); return bk[chapter - 1] || []; }
async function verseText(ref, lang = "ko") {
  const vs = await getVerses(ref.book, ref.chapter, lang);
  const from = ref.verse || 1, to = ref.verseEnd || ref.verse || Math.min(vs.length, 3);
  return vs.slice(from - 1, to).map((t, i) => (to > from ? `${from + i} ` : "") + t).join(" ");
}

// ───────── 렌더 라우팅 ─────────
const VIEWS = {};
const TITLES = { bible: "성경", plan: "성경 읽기표", dict: "성경 단어사전", prayer: "기도 노트", events: "교회 일정" };
const SUBTITLES = {
  bible: "개역한글과 KJV를 나란히 읽고, 마음에 남는 구절을 표시해요.",
  plan: "매일 조금씩, 성경 전체를 끝까지 함께 읽어요.",
  dict: "성경에 나오는 낯선 단어의 뜻과 원어를 찾아봐요.",
  prayer: "부탁받은 기도 제목을 잊지 않고 기록하고, 응답을 남겨요.",
  events: "예배와 모임 일정을 정리하고 알림을 받아요."
};
const tile = (color, icon, label, num, sub, unit = "") =>
  `<div class="tile ${color}"><span class="t-ic">${ICON(icon, 20)}</span><span class="t-label">${label}</span><span class="t-num">${num}${unit ? `<small>${unit}</small>` : ""}</span><span class="t-sub">${sub}</span></div>`;
function renderSide() {
  const tr = todayReading();
  let card;
  if (tr) {
    const n = tr.list.filter(([b, c]) => chDone(tr.p, tr.i, b, c)).length;
    card = `<div class="mini"><span class="bolt">${ICON("flame", 20)}</span><b>오늘 읽을 말씀</b><span class="num">${n} / ${tr.list.length}장</span>
      <div class="progress"><div style="width:${n / tr.list.length * 100}%"></div></div><button data-act="goPlan">${fmtReadings(tr.list)}</button></div>`;
  } else {
    const pct = Math.round(readSet.size / TOTAL_CHAPTERS * 100);
    card = `<div class="mini"><span class="bolt">${ICON("star", 20)}</span><b>성경 전체 진도</b><span class="num">${readSet.size} / ${TOTAL_CHAPTERS}장</span>
      <div class="progress"><div style="width:${pct}%"></div></div><button data-act="goPlan">읽기표 시작하기</button></div>`;
  }
  $("#sideCard").innerHTML = card;
  const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
    (S.settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll("[data-act=quickTheme]").forEach(b => b.classList.toggle("on", (b.dataset.t === "dark") === dark));
}
function render() {
  if (!VIEWS[S.tab]) return; // 찬양 화면은 hymn.js가 불러진 뒤 그려짐
  document.querySelectorAll("#tabbar button, #sideNav button").forEach(b => b.classList.toggle("active", b.dataset.tab === S.tab));
  $("#title").textContent = TITLES[S.tab];
  $("#subtitle").textContent = SUBTITLES[S.tab];
  $("#topActions").innerHTML = "";
  VIEWS[S.tab]();
  renderSide();
  showActiveTab();
}
// 하단 탭바: 고른 메뉴가 화면 밖에 있으면 보이게 밀어 주고, 양끝 흐림 표시를 갱신
function tabFade() {
  const sc = $("#tabScroll"); if (!sc) return;
  const left = sc.scrollLeft > 4, right = sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 4;
  for (const el of [sc, $("#tabbar")]) { el.classList.toggle("more-left", left); el.classList.toggle("more-right", right); }
}
function showActiveTab() {
  const sc = $("#tabScroll"), b = sc?.querySelector("button.active"); if (!b) return;
  if (b.offsetLeft < sc.scrollLeft) sc.scrollLeft = b.offsetLeft;
  else if (b.offsetLeft + b.offsetWidth > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = b.offsetLeft + b.offsetWidth - sc.clientWidth;
  tabFade();
}
$("#tabScroll")?.addEventListener("scroll", tabFade, { passive: true });
window.addEventListener("resize", tabFade);
function go(tab) { S.tab = tab; render(); window.scrollTo(0, 0); }

const ACT = {};
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (t && ACT[t.dataset.act]) { ACT[t.dataset.act](t, e); return; }
  if (e.target.id === "modal") closeSheet();
});
document.addEventListener("change", e => {
  const t = e.target.closest("[data-change]");
  if (t && ACT[t.dataset.change]) ACT[t.dataset.change](t, e);
});
document.addEventListener("input", e => {
  const t = e.target.closest("[data-input]");
  if (t && ACT[t.dataset.input]) ACT[t.dataset.input](t, e);
});
ACT.close = closeSheet;
document.querySelectorAll("#tabbar button, #sideNav button").forEach(b => b.onclick = () => go(b.dataset.tab));
ACT.goPlan = () => go("plan");
ACT.quickTheme = t => { S.settings.theme = t.dataset.t; saveSettings(); applyTheme(); renderSide(); };

/* ============================================================
   1. 성경
   ============================================================ */
function openRef(book, chapter, verse) {
  S.settings.ref = { book, chapter }; saveSettings();
  S.flash = verse || null; S.sel = null;
  closeSheet(); go("bible");
}

VIEWS.bible = async function () {
  const { book, chapter } = S.settings.ref;
  const mode = S.settings.mode;
  $("#topActions").innerHTML = `
    <button class="icon-btn" data-act="openSearch" aria-label="검색">${ICON("search")}</button>
    <button class="icon-btn" data-act="openBookmarks" aria-label="북마크">${ICON("bookmark")}</button>`;
  const view = $("#view");
  const tr = todayReading();
  const hero = tr && !isDone(tr.p, tr.i) ? `
    <div class="hero">
      ${MASCOT(120)}
      <div class="hero-body">
        <p class="eyebrow">오늘의 말씀 · ${tr.i + 1}일째</p>
        <h2>${fmtReadings(tr.list)}</h2>
        <div class="reads">${tr.list.map(([b, c]) => `<button class="${chDone(tr.p, tr.i, b, c) ? "done" : ""}" data-act="goCh" data-b="${b}" data-c="${c}">${BOOKS[b][1]} ${c}</button>`).join("")}</div>
      </div>
    </div>` : "";
  view.innerHTML = hero + `
    <div class="reader-nav">
      <button class="icon-btn" data-act="prevCh" aria-label="이전 장">${ICON("prev")}</button>
      <button class="ref-btn" data-act="pickBook">${BOOKS[book][0]} ${chapter}${book === 18 ? "편" : "장"} ▾</button>
      <button class="icon-btn" data-act="nextCh" aria-label="다음 장">${ICON("next")}</button>
    </div>
    <div class="reader-tools">
      <div class="seg">
        ${[["ko", "개역한글"], ["both", "대조"], ["en", "KJV"]].map(([k, l]) => `<button class="${mode === k ? "on" : ""}" data-act="setMode" data-mode="${k}">${l}</button>`).join("")}
      </div>
      <span class="spacer"></span>
      <button class="icon-btn" data-act="font" data-d="-1" aria-label="글자 작게">A-</button>
      <button class="icon-btn" data-act="font" data-d="1" aria-label="글자 크게">A+</button>
    </div>
    <div class="verses mode-${mode}" id="verses"><p class="muted">불러오는 중…</p></div>`;
  try {
    const [ko, en, ptitle] = await Promise.all([
      mode !== "en" ? getVerses(book, chapter, "ko") : null,
      mode !== "ko" ? getVerses(book, chapter, "en") : null,
      book === 18 && mode !== "en" ? getPsalmTitle(chapter) : ""
    ]);
    if (S.tab !== "bible" || S.settings.ref.book !== book || S.settings.ref.chapter !== chapter) return;
    const hls = store.get("highlights", {});
    const bms = new Set(store.get("bookmarks", []).filter(x => x.book === book && x.chapter === chapter).map(x => x.verse));
    const n = Math.max(ko?.length || 0, en?.length || 0);
    let html = ptitle ? `<div class="ps-title">${esc(ptitle)}</div>` : "";
    for (let i = 0; i < n; i++) {
      const v = i + 1, hl = hls[`${book}:${chapter}:${v}`];
      html += `<div class="verse ${hl ? "hl-" + hl : ""}" id="v${v}" data-act="verse" data-v="${v}"><span class="vn">${v}</span>`;
      if (ko) html += esc(ko[i] || "");
      if (en) html += `<span class="en">${esc(en[i] || "")}</span>`;
      if (bms.has(v)) html += `<span class="bm">🔖</span>`;
      html += `</div>`;
    }
    const read = readSet.has(`${book}:${chapter}`);
    html += `<div class="chapter-foot">
      <button class="btn" data-act="prevCh">◀ 이전</button>
      <button class="btn ${read ? "" : "primary"}" data-act="toggleRead">${read ? "✓ 읽음 완료" : "이 장 읽음 표시"}</button>
      <button class="btn" data-act="nextCh">다음 ▶</button></div>`;
    $("#verses").innerHTML = html;
    if (S.flash) {
      const el = $("#v" + S.flash);
      if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }
      S.flash = null;
    }
  } catch (e) {
    $("#verses").innerHTML = `<p class="empty">성경 본문을 불러오지 못했습니다.<br>인터넷 연결을 확인해 주세요.</p>`;
  }
};

function moveChapter(d) {
  let { book, chapter } = S.settings.ref;
  chapter += d;
  if (chapter < 1) { if (book === 0) return; book--; chapter = BOOKS[book][3]; }
  else if (chapter > BOOKS[book][3]) { if (book === 65) return; book++; chapter = 1; }
  S.settings.ref = { book, chapter }; saveSettings(); render(); window.scrollTo(0, 0);
}
ACT.prevCh = () => moveChapter(-1);
ACT.nextCh = () => moveChapter(1);
ACT.setMode = t => { S.settings.mode = t.dataset.mode; saveSettings(); render(); };
ACT.font = t => { S.settings.fontSize = Math.max(13, Math.min(30, S.settings.fontSize + Number(t.dataset.d))); saveSettings(); applyTheme(); };
ACT.toggleRead = () => {
  const k = `${S.settings.ref.book}:${S.settings.ref.chapter}`;
  if (readSet.has(k)) { readSet.delete(k); markPlanChapter(k, false); } else { readSet.add(k); markPlanChapter(k, true); toast("읽음으로 표시했습니다 ✓"); }
  saveRead(); render();
};

// 책/장 선택
ACT.pickBook = () => {
  const cur = S.settings.ref.book;
  const grid = (from, to) => BOOKS.slice(from, to).map((b, i) => `<button class="${from + i === cur ? "cur" : ""}" data-act="pickCh" data-b="${from + i}">${b[0]}</button>`).join("");
  openSheet(`${sheetHead("성경 선택")}
    <div class="section-title">구약 (39권)</div><div class="book-grid">${grid(0, 39)}</div>
    <div class="section-title">신약 (27권)</div><div class="book-grid">${grid(39, 66)}</div>`);
};
ACT.pickCh = t => {
  const b = Number(t.dataset.b);
  let html = "";
  for (let c = 1; c <= BOOKS[b][3]; c++) {
    const cls = [readSet.has(`${b}:${c}`) ? "read" : "", b === S.settings.ref.book && c === S.settings.ref.chapter ? "cur" : ""].join(" ");
    html += `<button class="${cls}" data-act="goCh" data-b="${b}" data-c="${c}">${c}</button>`;
  }
  openSheet(`${sheetHead(`${BOOKS[b][0]} <span class="muted small">${BOOKS[b][2]}</span>`)}
    <p class="small muted" style="margin-top:-6px">초록색은 읽은 장입니다.</p>
    <div class="ch-grid">${html}</div>
    <p><button class="btn sm" data-act="pickBook">← 다른 책</button></p>`);
};
ACT.goCh = t => openRef(Number(t.dataset.b), Number(t.dataset.c));

// 절 선택 메뉴
ACT.verse = t => {
  const v = Number(t.dataset.v), { book, chapter } = S.settings.ref;
  document.querySelectorAll(".verse.sel").forEach(x => x.classList.remove("sel"));
  t.classList.add("sel");
  S.sel = { book, chapter, verse: v };
  const bm = store.get("bookmarks", []).find(x => x.book === book && x.chapter === chapter && x.verse === v);
  openSheet(`${sheetHead(`${BOOKS[book][0]} ${chapter}:${v}`)}
    <div class="section-title" style="margin-top:0">형광펜</div>
    <div class="color-dots">
      ${["yellow", "green", "blue", "pink"].map(c => `<button style="background:var(--hl-${c})" data-act="hl" data-c="${c}" aria-label="${c}"></button>`).join("")}
      <button data-act="hl" data-c="" aria-label="지우기">✕</button>
    </div>
    <div class="section-title">메모</div>
    <textarea id="bmNote" placeholder="이 구절에 대한 묵상이나 메모 (북마크와 함께 저장)">${esc(bm?.note || "")}</textarea>
    <div class="row wrap" style="margin-top:12px">
      <button class="btn primary" data-act="bookmark">${bm ? "북마크 저장" : "🔖 북마크"}</button>
      ${bm ? `<button class="btn danger" data-act="unbookmark">북마크 삭제</button>` : ""}
      <button class="btn" data-act="copyVerse">📋 복사</button>
      <button class="btn" data-act="verseToPrayer">🙏 기도노트에</button>
    </div>`);
};
document.getElementById("modal").addEventListener("click", e => {
  if (e.target.id === "modal") document.querySelectorAll(".verse.sel").forEach(x => x.classList.remove("sel"));
});
ACT.hl = t => {
  const { book, chapter, verse } = S.sel, k = `${book}:${chapter}:${verse}`;
  const hls = store.get("highlights", {});
  if (t.dataset.c) hls[k] = t.dataset.c; else delete hls[k];
  store.set("highlights", hls); closeSheet(); render(); S.flash = null;
};
ACT.bookmark = () => {
  const { book, chapter, verse } = S.sel;
  const list = store.get("bookmarks", []);
  const note = $("#bmNote").value.trim();
  const ex = list.find(x => x.book === book && x.chapter === chapter && x.verse === verse);
  if (ex) ex.note = note; else list.unshift({ id: uid(), book, chapter, verse, note, created: todayStr() });
  store.set("bookmarks", list); closeSheet(); toast("북마크에 저장했습니다"); render();
};
ACT.unbookmark = () => {
  const { book, chapter, verse } = S.sel;
  store.set("bookmarks", store.get("bookmarks", []).filter(x => !(x.book === book && x.chapter === chapter && x.verse === verse)));
  closeSheet(); render();
};
ACT.copyVerse = async () => {
  const { book, chapter, verse } = S.sel;
  const ref = `${BOOKS[book][0]} ${chapter}:${verse}`;
  const parts = [];
  if (S.settings.mode !== "en") parts.push(await verseText({ book, chapter, verse }, "ko"));
  if (S.settings.mode !== "ko") parts.push(await verseText({ book, chapter, verse }, "en"));
  const text = `${parts.join("\n")}\n(${ref})`;
  try { await navigator.clipboard.writeText(text); toast("복사했습니다"); }
  catch { prompt("아래 내용을 복사하세요", text); }
  closeSheet();
};
ACT.verseToPrayer = () => {
  const { book, chapter, verse } = S.sel;
  closeSheet(); S.tab = "prayer"; render();
  prayerForm(null, `${BOOKS[book][1]} ${chapter}:${verse}`);
};

// 북마크 목록
ACT.openBookmarks = async () => {
  const list = store.get("bookmarks", []);
  if (!list.length) { openSheet(`${sheetHead("북마크")}<p class="empty">아직 북마크가 없습니다.<br>본문에서 구절을 눌러 저장해 보세요.</p>`); return; }
  openSheet(`${sheetHead(`북마크 <span class="muted small">${list.length}</span>`)}<div id="bmList"><p class="muted">불러오는 중…</p></div>`);
  const rows = await Promise.all(list.map(async x => {
    let txt = ""; try { txt = await verseText(x); } catch { }
    return `<div class="result" data-act="goVerse" data-b="${x.book}" data-c="${x.chapter}" data-v="${x.verse}">
      <b class="ref">${BOOKS[x.book][1]} ${x.chapter}:${x.verse}</b>${esc(txt)}
      ${x.note ? `<div class="small" style="margin-top:4px">📝 ${esc(x.note)}</div>` : ""}</div>`;
  }));
  const el = $("#bmList"); if (el) el.innerHTML = rows.join("");
};
ACT.goVerse = t => openRef(Number(t.dataset.b), Number(t.dataset.c), Number(t.dataset.v) || null);

// 검색
let searchLang = "ko";
ACT.openSearch = (t, e, q = "") => {
  openSheet(`${sheetHead("성경 검색")}
    <div class="searchbar">
      <input type="search" id="sq" placeholder="단어 또는 구절 (예: 사랑, 요 3:16, love)" value="${esc(q)}" enterkeyhint="search">
      <button class="btn primary" data-act="doSearch">검색</button>
    </div>
    <div class="row" style="margin-bottom:8px">
      <div class="seg">
        <button class="${searchLang === "ko" ? "on" : ""}" data-act="sLang" data-l="ko">개역한글</button>
        <button class="${searchLang === "en" ? "on" : ""}" data-act="sLang" data-l="en">KJV</button>
      </div>
      <span class="spacer"></span>
      <select id="sScope" style="width:auto"><option value="all">전체</option><option value="ot">구약</option><option value="nt">신약</option></select>
    </div>
    <div id="sres" class="small muted">여러 단어는 띄어 쓰면 모두 포함된 구절을 찾습니다.</div>`);
  const inp = $("#sq");
  inp.addEventListener("keydown", ev => { if (ev.key === "Enter") ACT.doSearch(); });
  if (q) ACT.doSearch(); else setTimeout(() => inp.focus(), 50);
};
ACT.sLang = t => { searchLang = t.dataset.l; document.querySelectorAll("[data-act=sLang]").forEach(b => b.classList.toggle("on", b === t)); if ($("#sq").value.trim()) ACT.doSearch(); };
ACT.doSearch = async () => {
  const q = $("#sq").value.trim(); if (!q) return;
  const ref = parseRef(q);
  if (ref && /\d/.test(q)) { openRef(ref.book, ref.chapter, ref.verse); return; }
  const out = $("#sres"); out.innerHTML = `<p class="muted">검색 중… (처음 한 번은 성경 전체를 내려받습니다)</p>`;
  const scope = $("#sScope").value, [from, to] = scope === "ot" ? [0, 39] : scope === "nt" ? [39, 66] : [0, 66];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  try {
    const books = await Promise.all(Array.from({ length: to - from }, (_, i) => loadBook(searchLang, from + i)));
    const res = []; let total = 0;
    books.forEach((bk, bi) => bk.forEach((ch, ci) => ch.forEach((txt, vi) => {
      const low = txt.toLowerCase();
      if (terms.every(w => low.includes(w))) { total++; if (res.length < 300) res.push([from + bi, ci + 1, vi + 1, txt]); }
    })));
    if (!$("#sres")) return;
    const re = new RegExp("(" + terms.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
    out.innerHTML = `<p class="small muted">${total.toLocaleString()}개 구절${total > 300 ? " (처음 300개 표시)" : ""}</p>` +
      (res.map(([b, c, v, t]) => `<div class="result" data-act="goVerse" data-b="${b}" data-c="${c}" data-v="${v}"><b class="ref">${BOOKS[b][1]} ${c}:${v}</b>${esc(t).replace(re, "<mark>$1</mark>")}</div>`).join("") || `<p class="empty">검색 결과가 없습니다.</p>`);
  } catch { out.innerHTML = `<p class="empty">검색하려면 인터넷 연결이 필요합니다.</p>`; }
};

/* ============================================================
   2. 성경 읽기표
   ============================================================ */
const allChapters = (from = 0, to = 66) => { const a = []; for (let b = from; b < to; b++) for (let c = 1; c <= BOOKS[b][3]; c++) a.push([b, c]); return a; };
function splitDays(list, days) {
  const out = [];
  for (let d = 0; d < days; d++) out.push(list.slice(Math.round(d * list.length / days), Math.round((d + 1) * list.length / days)));
  return out;
}
// 성경 전체를 n번 이어 붙인 목록 (n독 계획용)
const repeatBible = n => Array.from({ length: n }, () => allChapters()).flat();
const PLANS = {
  whole1y: { name: "1년 성경 통독", desc: "창세기부터 요한계시록까지 365일 (하루 약 3~4장)", gen: () => splitDays(allChapters(), 365) },
  whole1y2: { name: "1년 성경 2독", desc: "1년에 성경 전체를 2번 (하루 약 6~7장)", passes: 2, gen: () => splitDays(repeatBible(2), 365) },
  whole1y3: { name: "1년 성경 3독", desc: "1년에 성경 전체를 3번 (하루 약 10장)", passes: 3, gen: () => splitDays(repeatBible(3), 365) },
  whole1y4: { name: "1년 성경 4독", desc: "1년에 성경 전체를 4번 (하루 약 13장)", passes: 4, gen: () => splitDays(repeatBible(4), 365) },
  whole1y5: { name: "1년 성경 5독", desc: "1년에 성경 전체를 5번 (하루 약 16장)", passes: 5, gen: () => splitDays(repeatBible(5), 365) },
  mixed1y: { name: "구약+신약 병행 1년", desc: "매일 구약 2~3장과 신약 1장을 함께 읽기", gen: () => { const o = splitDays(allChapters(0, 39), 365), n = splitDays(allChapters(39, 66), 365); return o.map((x, i) => x.concat(n[i])); } },
  nt90: { name: "신약 90일", desc: "신약 27권 260장을 90일 동안 (하루 약 3장)", gen: () => splitDays(allChapters(39, 66), 90) },
  ot1y: { name: "구약 1년", desc: "구약 39권 929장을 365일 동안", gen: () => splitDays(allChapters(0, 39), 365) },
  gospel30: { name: "사복음서 30일", desc: "마태·마가·누가·요한복음 89장을 한 달 동안", gen: () => splitDays(allChapters(39, 43), 30) },
  psprov31: { name: "시편·잠언 31일", desc: "매일 시편 5편과 잠언 1장", gen: () => Array.from({ length: 31 }, (_, d) => [...(d < 30 ? [1, 2, 3, 4, 5].map(k => [18, d * 5 + k]) : []), [19, d + 1]]) },
  whole2y: { name: "2년 성경 통독", desc: "천천히 하루 1~2장씩 730일", gen: () => splitDays(allChapters(), 730) }
};
let planCache = null;
function curPlan() {
  const p = store.get("plan", null); if (!p || !PLANS[p.id]) return null;
  if (!planCache || planCache.id !== p.id) planCache = { id: p.id, days: PLANS[p.id].gen() };
  return { ...p, ...PLANS[p.id], days: planCache.days };
}
function fmtReadings(list) {
  const groups = [];
  for (const [b, c] of list) {
    const g = groups[groups.length - 1];
    if (g && g.b === b && g.e === c - 1) g.e = c; else groups.push({ b, s: c, e: c });
  }
  return groups.map(g => `${BOOKS[g.b][1]} ${g.s}${g.e > g.s ? "-" + g.e : ""}`).join(", ");
}
const dayDone = list => list.length && list.every(([b, c]) => readSet.has(`${b}:${c}`));
const multiPass = p => (p?.passes || 1) > 1;
// i번째 날의 그 장을 읽었는지
function chDone(p, i, b, c) {
  const k = `${b}:${c}`;
  return multiPass(p) ? ((p.prog || {})[i] || []).includes(k) : readSet.has(k);
}
// i번째 날 분량을 다 읽었는지
const isDone = (p, i) => { const l = p.days[i]; return !!l && l.length > 0 && l.every(([b, c]) => chDone(p, i, b, c)); };
// n독 계획에서 아직 안 읽은 첫날이 몇 번째 회차에 속하는지
function currentPass(p) {
  let f = p.days.findIndex((_, i) => !isDone(p, i));
  if (f < 0) return p.passes;
  let before = 0; for (let i = 0; i < f; i++) before += p.days[i].length;
  return Math.min(p.passes, Math.floor(before / TOTAL_CHAPTERS) + 1);
}
function savePlanProg(prog) { const st = store.get("plan"); st.prog = prog; store.set("plan", st); }
// 성경 탭에서 '읽음 표시'한 장을 n독 계획의 날짜에 반영
function markPlanChapter(k, add) {
  const p = curPlan(); if (!multiPass(p)) return;
  const prog = p.prog || {}, today = Math.min(diffDays(todayStr(), p.start), p.days.length - 1);
  const has = i => p.days[i].some(([b, c]) => `${b}:${c}` === k);
  if (add) {
    // 아직 안 읽은 가장 이른 날(오늘까지) → 없으면 오늘 이후 가장 가까운 날
    let target = -1;
    for (let i = 0; i <= today && target < 0; i++) if (has(i) && !(prog[i] || []).includes(k)) target = i;
    for (let i = Math.max(today + 1, 0); i < p.days.length && target < 0; i++) if (has(i) && !(prog[i] || []).includes(k)) target = i;
    if (target < 0) return;
    prog[target] = (prog[target] || []).concat(k);
  } else {
    for (let i = p.days.length - 1; i >= 0; i--) if ((prog[i] || []).includes(k)) { prog[i] = prog[i].filter(x => x !== k); break; }
  }
  savePlanProg(prog);
}
function todayReading() {
  const p = curPlan(); if (!p) return null;
  const i = diffDays(todayStr(), p.start);
  return i >= 0 && i < p.days.length ? { i, list: p.days[i], p } : null;
}

VIEWS.plan = function () {
  const p = curPlan();
  const tabs = `<div class="seg" style="margin-bottom:12px">
    <button class="${S.planView === "plan" ? "on" : ""}" data-act="planView" data-v="plan">읽기표</button>
    <button class="${S.planView === "progress" ? "on" : ""}" data-act="planView" data-v="progress">성경 전체 진도</button></div>`;
  if (S.planView === "progress") { $("#view").innerHTML = tabs + progressView(); return; }
  if (!p) { $("#view").innerHTML = tabs + planPicker(); return; }

  $("#topActions").innerHTML = `<button class="icon-btn" data-act="scrollToday" aria-label="오늘로">${ICON("pin")}</button>`;
  const idx = diffDays(todayStr(), p.start);
  const doneCount = p.days.filter((_, i) => isDone(p, i)).length;
  const pct = Math.round(doneCount / p.days.length * 100);
  let todayHtml;
  const heroBox = (eyebrow, title, body) => `<div class="hero">${MASCOT(120)}<div class="hero-body"><p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${body}</div></div>`;
  if (idx < 0) todayHtml = heroBox(p.name, `${fmtDate(p.start)}에 시작해요`, `<p>시작일이 되면 오늘 읽을 말씀이 여기에 나타납니다.</p>`);
  else if (idx >= p.days.length) todayHtml = heroBox(p.name, doneCount === p.days.length ? "완독을 축하합니다!" : "읽기표 기간이 끝났어요", `<p>${doneCount === p.days.length ? "끝까지 함께 읽으셨어요." : `남은 ${p.days.length - doneCount}일 분량을 마저 읽어 보세요.`}</p>`);
  else {
    const list = p.days[idx];
    todayHtml = heroBox(`오늘의 말씀 · ${idx + 1}일째 · ${fmtDate(todayStr())}`, fmtReadings(list), `
      <div class="reads">${list.map(([b, c]) => `<button class="${chDone(p, idx, b, c) ? "done" : ""}" data-act="goCh" data-b="${b}" data-c="${c}">${BOOKS[b][1]} ${c}</button>`).join("")}</div>
      <button class="btn primary" data-act="dayToggle" data-i="${idx}">${isDone(p, idx) ? "✓ 오늘 읽기 완료" : "오늘 분량 모두 읽음"}</button>`);
  }
  let behind = 0;
  for (let i = 0; i < Math.min(idx, p.days.length); i++) if (!isDone(p, i)) behind++;
  let rows = "";
  p.days.forEach((list, i) => {
    const d = addDays(p.start, i), done = isDone(p, i);
    rows += `<div class="day-row ${done ? "done" : ""} ${i === idx ? "today" : ""}" id="day${i}">
      <input type="checkbox" ${done ? "checked" : ""} data-act="dayToggle" data-i="${i}" aria-label="${i + 1}일째 완료">
      <span class="d">${i + 1}일 · ${parseYMD(d).getMonth() + 1}/${parseYMD(d).getDate()}</span>
      <span class="t" data-act="goCh" data-b="${list[0][0]}" data-c="${list[0][1]}">${fmtReadings(list)}</span></div>`;
  });
  let streak = 0;
  for (let i = Math.min(idx, p.days.length - 1); i >= 0; i--) { if (isDone(p, i)) streak++; else if (i !== idx) break; }
  const tiles = `<div class="tiles">
    ${tile("mint", "check", "진도", pct, `${doneCount} / ${p.days.length}일 완료`, "%")}
    ${tile("peach", "flame", "연속으로 읽은 날", streak, "오늘까지 이어서", "일")}
    ${tile("butter", "calendar", "밀린 날", behind, behind ? "천천히 따라잡아요" : "잘하고 있어요", "일")}
    ${multiPass(p) ? tile("sky", "book", "지금 읽는 회차", currentPass(p), `${p.passes}독 중`, "독째")
      : tile("sky", "book", "성경 전체", readSet.size, `/ ${TOTAL_CHAPTERS}장 읽음`, "장")}
  </div>`;
  $("#view").innerHTML = tabs + todayHtml + tiles + `
    <div class="card">
      <div class="row"><b>${p.name}</b><span class="spacer"></span><span class="small muted">${doneCount}/${p.days.length}일 · ${pct}%</span></div>
      <div class="progress" style="margin:8px 0"><div style="width:${pct}%"></div></div>
      <div class="row small muted"><span>시작일 ${p.start}</span><span class="spacer"></span>${behind ? `<span style="color:var(--warn)">밀린 날 ${behind}일</span>` : `<span>잘하고 있어요 👍</span>`}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="changePlan">읽기표 변경</button><button class="btn sm" data-act="planStart">시작일 변경</button></div>
    </div>
    <div class="card">${rows}</div>`;
  if (idx > 2 && idx < p.days.length) setTimeout(() => $("#day" + idx)?.scrollIntoView({ block: "center" }), 0);
};
function planPicker() {
  return `<p class="muted">읽기 계획을 선택하세요. 성경 본문에서 '읽음 표시'한 장은 자동으로 체크됩니다.</p>` +
    Object.entries(PLANS).map(([id, p]) => `<div class="card plan-pick" data-act="choosePlan" data-id="${id}">
      <b>${p.name}</b><div class="small muted">${p.desc}</div></div>`).join("") +
    (store.get("plan", null) ? `<button class="btn" data-act="cancelChange">취소</button>` : "");
}
function progressView() {
  const total = readSet.size, pct = (total / TOTAL_CHAPTERS * 100).toFixed(1);
  let html = `<div class="card"><div class="row"><b>성경 전체</b><span class="spacer"></span><span class="small muted">${total}/${TOTAL_CHAPTERS}장 · ${pct}%</span></div>
    <div class="progress" style="margin-top:8px"><div style="width:${pct}%"></div></div></div><div class="card">`;
  BOOKS.forEach((b, i) => {
    if (i === 0) html += `<div class="section-title" style="margin-top:0">구약</div>`;
    if (i === 39) html += `<div class="section-title">신약</div>`;
    let n = 0; for (let c = 1; c <= b[3]; c++) if (readSet.has(`${i}:${c}`)) n++;
    html += `<div class="book-prog" data-act="pickCh" data-b="${i}"><span>${b[0]}</span><div class="progress"><div style="width:${n / b[3] * 100}%"></div></div><span class="small muted" style="text-align:right">${n}/${b[3]}</span></div>`;
  });
  return html + `</div><button class="btn danger sm" data-act="resetRead">읽은 기록 모두 지우기</button>`;
}
ACT.planView = t => { S.planView = t.dataset.v; render(); };
ACT.choosePlan = t => {
  const id = t.dataset.id;
  openSheet(`${sheetHead(PLANS[id].name)}<p class="muted">${PLANS[id].desc}</p>
    <label class="field"><span>시작일</span><input type="date" id="pStart" value="${todayStr()}"></label>
    <button class="btn primary" data-act="startPlan" data-id="${id}">이 계획으로 시작</button>`);
};
ACT.startPlan = t => { store.set("plan", { id: t.dataset.id, start: $("#pStart").value || todayStr() }); S.changing = false; closeSheet(); render(); toast("읽기표를 시작합니다. 화이팅! 🙌"); };
ACT.changePlan = () => { $("#view").innerHTML = planPicker(); };
ACT.cancelChange = () => render();
ACT.planStart = () => {
  const p = store.get("plan");
  openSheet(`${sheetHead("시작일 변경")}<label class="field"><span>시작일</span><input type="date" id="pStart" value="${p.start}"></label>
    <button class="btn primary" data-act="startPlan" data-id="${p.id}">저장</button>`);
};
ACT.dayToggle = (t, e) => {
  e.preventDefault();
  const p = curPlan(), i = Number(t.dataset.i), list = p.days[i], done = isDone(p, i);
  if (multiPass(p)) {
    const prog = p.prog || {};
    if (done) delete prog[i]; else { prog[i] = list.map(([b, c]) => `${b}:${c}`); list.forEach(([b, c]) => readSet.add(`${b}:${c}`)); }
    savePlanProg(prog);
  } else list.forEach(([b, c]) => done ? readSet.delete(`${b}:${c}`) : readSet.add(`${b}:${c}`));
  saveRead(); const y = window.scrollY; render(); window.scrollTo(0, y);
};
ACT.scrollToday = () => { const p = curPlan(); const i = diffDays(todayStr(), p.start); $("#day" + i)?.scrollIntoView({ block: "center", behavior: "smooth" }); };
ACT.resetRead = async () => { if (await askConfirm("읽은 장 기록을 모두 지울까요?", "지우기")) { readSet.clear(); saveRead(); render(); } };

/* ============================================================
   3. 성경 단어사전
   ============================================================ */
const allDict = () => DICT.map((e, i) => ({ ...e, id: "d" + i })).concat(store.get("myDict", []).map(e => ({ ...e, c: e.c || "내 단어", mine: true })));
VIEWS.dict = function () {
  $("#topActions").innerHTML = `<button class="icon-btn" data-act="dictForm" aria-label="단어 추가">${ICON("plus")}</button>`;
  const items = allDict();
  const cats = ["전체", ...new Set(items.map(e => e.c))];
  $("#view").innerHTML = `
    <input type="search" placeholder="단어, 영어, 뜻으로 찾기" value="${esc(S.dictQ)}" data-input="dictQ" id="dq" style="margin-bottom:10px">
    <div class="chips">${cats.map(c => `<button class="chip ${S.dictCat === c ? "on" : ""}" data-act="dictCat" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    <div id="dlist"></div>`;
  dictList();
};
function dictList() {
  const q = S.dictQ.trim().toLowerCase();
  let items = allDict().filter(e => S.dictCat === "전체" || e.c === S.dictCat);
  if (q) items = items.filter(e => [e.w, e.en, e.o, e.d].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (b.w.toLowerCase().startsWith(q) ? 1 : 0) - (a.w.toLowerCase().startsWith(q) ? 1 : 0));
  else items.sort((a, b) => a.w.localeCompare(b.w, "ko"));
  $("#dlist").innerHTML = `<p class="small muted">${items.length}개 단어</p>` + (items.map(e => `
    <div class="dict-item" data-act="dictShow" data-id="${e.id}">
      <div><span class="w">${esc(e.w)}</span>${e.en && e.en !== "—" ? `<span class="en">${esc(e.en)}</span>` : ""} ${e.mine ? `<span class="badge">내 단어</span>` : ""}</div>
      <div class="d">${esc(e.d)}</div></div>`).join("") ||
    `<div class="empty">찾는 단어가 없습니다.<br><button class="btn" style="margin-top:10px" data-act="searchBibleWord" data-w="${esc(S.dictQ)}">성경 본문에서 '${esc(S.dictQ)}' 검색</button></div>`);
}
ACT.dictQ = t => { S.dictQ = t.value; dictList(); };
ACT.dictCat = t => { S.dictCat = t.dataset.c; render(); };
ACT.dictShow = async t => {
  const e = allDict().find(x => x.id === t.dataset.id); if (!e) return;
  const refs = (e.r || []).map(r => ({ r, p: parseRef(r) })).filter(x => x.p);
  openSheet(`${sheetHead(esc(e.w))}
    ${e.en && e.en !== "—" ? `<div class="muted" style="font-style:italic">${esc(e.en)}</div>` : ""}
    <div class="row wrap small" style="margin:6px 0 12px"><span class="badge">${esc(e.c)}</span>${e.o && e.o !== "—" ? `<span class="muted">${esc(e.o)}</span>` : ""}</div>
    <p style="font-size:16px;white-space:pre-wrap">${esc(e.d)}</p>
    ${refs.length ? `<div class="section-title">관련 말씀</div><div id="drefs">${refs.map(x => `<div style="margin-bottom:10px"><div class="ref-links"><button data-act="goVerse" data-b="${x.p.book}" data-c="${x.p.chapter}" data-v="${x.p.verse || ""}">${esc(x.r)}</button></div><div class="verse-preview" data-ref="${esc(x.r)}">…</div></div>`).join("")}</div>` : ""}
    <div class="row wrap" style="margin-top:14px">
      <button class="btn" data-act="searchBibleWord" data-w="${esc(e.w.replace(/\(.*\)/, ""))}">📖 성경에서 '${esc(e.w.replace(/\(.*\)/, ""))}' 찾기</button>
      ${e.mine ? `<button class="btn" data-act="dictForm" data-id="${e.id}">수정</button><button class="btn danger" data-act="dictDel" data-id="${e.id}">삭제</button>` : ""}
    </div>`);
  for (const x of refs) {
    try { const txt = await verseText(x.p); const el = document.querySelector(`.verse-preview[data-ref="${CSS.escape(x.r)}"]`); if (el) el.textContent = txt; } catch { }
  }
};
ACT.searchBibleWord = t => { closeSheet(); go("bible"); searchLang = /[a-z]/i.test(t.dataset.w) ? "en" : "ko"; ACT.openSearch(null, null, t.dataset.w); };
ACT.dictForm = t => {
  const e = t.dataset.id ? store.get("myDict", []).find(x => x.id === t.dataset.id) : {};
  openSheet(`${sheetHead(e.id ? "단어 수정" : "내 단어 추가")}
    <label class="field"><span>단어 *</span><input type="text" id="fw" value="${esc(e.w)}"></label>
    <div class="grid2">
      <label class="field"><span>영어</span><input type="text" id="fen" value="${esc(e.en)}"></label>
      <label class="field"><span>원어</span><input type="text" id="fo" value="${esc(e.o)}"></label>
    </div>
    <label class="field"><span>뜻 *</span><textarea id="fd">${esc(e.d)}</textarea></label>
    <label class="field"><span>관련 구절 (쉼표로 구분, 예: 요 3:16, 롬 8:28)</span><input type="text" id="fr" value="${esc((e.r || []).join(", "))}"></label>
    <button class="btn primary" data-act="dictSave" data-id="${e.id || ""}">저장</button>`);
};
ACT.dictSave = t => {
  const w = $("#fw").value.trim(), d = $("#fd").value.trim();
  if (!w || !d) { toast("단어와 뜻을 입력해 주세요"); return; }
  const list = store.get("myDict", []);
  const r = $("#fr").value.split(/[,;]/).map(s => s.trim()).filter(s => s && parseRef(s));
  const item = { id: t.dataset.id || "m" + uid(), w, en: $("#fen").value.trim(), o: $("#fo").value.trim(), d, r, c: "내 단어" };
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = item; else list.unshift(item);
  store.set("myDict", list); closeSheet(); render(); toast("저장했습니다");
};
ACT.dictDel = async t => { if (!await askConfirm("이 단어를 삭제할까요?", "삭제")) return; store.set("myDict", store.get("myDict", []).filter(x => x.id !== t.dataset.id)); closeSheet(); render(); };

/* ============================================================
   4. 기도 부탁 정리 노트
   ============================================================ */
const PRAYER_CATS = ["개인", "가족", "교회", "구역", "친구·이웃", "선교", "국가", "기타"];
// 예전 분류 이름으로 저장된 기도 제목을 새 이름으로 옮김
(() => {
  const RENAME = { "구역·목장": "구역", "나라·사회": "국가" };
  const list = store.get("prayers", []);
  let changed = false;
  list.forEach(p => { if (RENAME[p.cat]) { p.cat = RENAME[p.cat]; changed = true; } });
  if (changed) store.set("prayers", list);
})();
VIEWS.prayer = function () {
  $("#topActions").innerHTML = `<button class="icon-btn" data-act="prayerNew" aria-label="기도제목 추가">${ICON("plus")}</button>`;
  const all = store.get("prayers", []);
  const n1 = all.filter(p => p.status !== "answered").length, n2 = all.length - n1;
  const prayedToday = all.filter(p => p.lastPrayed === todayStr()).length;
  const totalCount = all.reduce((s, p) => s + (p.count || 0), 0);
  $("#view").innerHTML = `
    <div class="tiles">
      ${tile("peach", "hands", "기도 중", n1, "함께 기도하는 제목", "개")}
      ${tile("mint", "star", "응답받은 기도", n2, "하나님이 하신 일", "개")}
      ${tile("butter", "flame", "오늘 기도함", prayedToday, n1 ? `기도 중 ${n1}개 중` : "기도 제목을 추가해 보세요", "개")}
      ${tile("sky", "repeat", "누적 기도", totalCount, "'기도했어요'를 누른 횟수", "회")}
    </div>
    <div class="row" style="margin-bottom:10px">
      <div class="seg">
        <button class="${S.prayerFilter === "praying" ? "on" : ""}" data-act="pf" data-f="praying">기도 중 ${n1}</button>
        <button class="${S.prayerFilter === "answered" ? "on" : ""}" data-act="pf" data-f="answered">응답 ${n2}</button>
        <button class="${S.prayerFilter === "all" ? "on" : ""}" data-act="pf" data-f="all">전체</button>
      </div>
    </div>
    <input type="search" placeholder="이름, 제목, 내용으로 찾기" value="${esc(S.prayerQ)}" data-input="prayerQ" style="margin-bottom:10px">
    <div class="chips">${["전체", ...PRAYER_CATS].map(c => `<button class="chip ${S.prayerCat === c ? "on" : ""}" data-act="pc" data-c="${c}">${c}</button>`).join("")}</div>
    <div id="plist"></div>`;
  prayerList();
};
function prayerList() {
  const q = S.prayerQ.trim().toLowerCase();
  const list = store.get("prayers", []).filter(p =>
    (S.prayerFilter === "all" || (S.prayerFilter === "answered" ? p.status === "answered" : p.status !== "answered")) &&
    (S.prayerCat === "전체" || p.cat === S.prayerCat) &&
    (!q || [p.title, p.person, p.content, p.answer].join(" ").toLowerCase().includes(q)));
  const today = todayStr();
  $("#plist").innerHTML = list.map(p => {
    const ref = p.verse && parseRef(p.verse);
    return `<div class="card prayer ${p.status === "answered" ? "answered" : ""}">
      <div class="row"><span class="badge">${esc(p.cat)}</span>${p.person ? `<span class="small"><b>${esc(p.person)}</b></span>` : ""}<span class="spacer"></span><span class="small muted">${p.created}</span></div>
      <h3 style="margin-top:6px">${esc(p.title)}</h3>
      ${p.content ? `<div class="content">${esc(p.content)}</div>` : ""}
      ${ref ? `<div class="ref-links"><button data-act="goVerse" data-b="${ref.book}" data-c="${ref.chapter}" data-v="${ref.verse || ""}">📖 ${esc(p.verse)}</button></div>` : ""}
      ${p.status === "answered" ? `<div class="answer">✨ <b>${p.answeredAt} 응답</b>${p.answer ? "\n" + esc(p.answer) : ""}</div>` : ""}
      <div class="acts">
        ${p.status !== "answered" ? `<button class="btn sm ${p.lastPrayed === today ? "" : "primary"}" data-act="prayed" data-id="${p.id}">${p.lastPrayed === today ? "✓ 오늘 기도함" : "🙏 기도했어요"}</button>
          <button class="btn sm" data-act="answerForm" data-id="${p.id}">응답 기록</button>` : `<button class="btn sm" data-act="unanswer" data-id="${p.id}">다시 기도 중으로</button>`}
        <button class="btn sm" data-act="prayerEdit" data-id="${p.id}">수정</button>
        <button class="btn sm" data-act="sharePrayer" data-id="${p.id}">공유</button>
        <span class="spacer"></span><span class="small muted">${p.count ? `기도 ${p.count}회` : ""}</span>
      </div></div>`;
  }).join("") || `<div class="empty">${S.prayerFilter === "answered" ? "아직 응답 기록이 없습니다." : "기도 제목이 없습니다.<br>＋ 버튼으로 기도 부탁을 기록해 보세요."}</div>`;
}
ACT.pf = t => { S.prayerFilter = t.dataset.f; render(); };
ACT.pc = t => { S.prayerCat = t.dataset.c; render(); };
ACT.prayerQ = t => { S.prayerQ = t.value; prayerList(); };
ACT.prayerNew = () => prayerForm(null);
ACT.prayerEdit = t => prayerForm(t.dataset.id);
function prayerForm(id, verse = "") {
  const p = id ? store.get("prayers", []).find(x => x.id === id) : { cat: "개인", verse, created: todayStr() };
  openSheet(`${sheetHead(id ? "기도 제목 수정" : "기도 제목 추가")}
    <label class="field"><span>기도 제목 *</span><input type="text" id="ptitle" value="${esc(p.title)}" placeholder="예: 어머니 수술이 잘 되도록"></label>
    <div class="grid2">
      <label class="field"><span>부탁한 사람 / 대상</span><input type="text" id="pperson" value="${esc(p.person)}" placeholder="예: 김집사님"></label>
      <label class="field"><span>분류</span><select id="pcat">${PRAYER_CATS.map(c => `<option ${p.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    </div>
    <label class="field"><span>내용</span><textarea id="pcontent" placeholder="자세한 기도 내용">${esc(p.content)}</textarea></label>
    <div class="grid2">
      <label class="field"><span>붙잡는 말씀</span><input type="text" id="pverse" value="${esc(p.verse)}" placeholder="예: 빌 4:6"></label>
      <label class="field"><span>시작일</span><input type="date" id="pdate" value="${p.created}"></label>
    </div>
    <div class="row"><button class="btn primary" data-act="prayerSave" data-id="${id || ""}">저장</button><span class="spacer"></span>
    ${id ? `<button class="btn danger" data-act="prayerDel" data-id="${id}">삭제</button>` : ""}</div>`);
}
ACT.prayerSave = t => {
  const title = $("#ptitle").value.trim(); if (!title) { toast("기도 제목을 입력해 주세요"); return; }
  const verse = $("#pverse").value.trim();
  if (verse && !parseRef(verse)) { toast("말씀 구절 형식을 확인해 주세요 (예: 빌 4:6)"); return; }
  const list = store.get("prayers", []);
  const id = t.dataset.id;
  const data = { title, person: $("#pperson").value.trim(), cat: $("#pcat").value, content: $("#pcontent").value.trim(), verse, created: $("#pdate").value || todayStr() };
  if (id) Object.assign(list.find(x => x.id === id), data);
  else list.unshift({ id: uid(), status: "praying", count: 0, ...data });
  store.set("prayers", list); closeSheet(); render(); toast("저장했습니다");
};
ACT.prayerDel = async t => { if (!await askConfirm("이 기도 제목을 삭제할까요?", "삭제")) return; store.set("prayers", store.get("prayers", []).filter(x => x.id !== t.dataset.id)); closeSheet(); render(); };
const updPrayer = (id, fn) => { const l = store.get("prayers", []); const p = l.find(x => x.id === id); fn(p); store.set("prayers", l); };
ACT.prayed = t => {
  updPrayer(t.dataset.id, p => { if (p.lastPrayed !== todayStr()) { p.count = (p.count || 0) + 1; p.lastPrayed = todayStr(); } });
  prayerList();
};
ACT.answerForm = t => openSheet(`${sheetHead("응답 기록 ✨")}
  <label class="field"><span>응답 받은 날</span><input type="date" id="adate" value="${todayStr()}"></label>
  <label class="field"><span>어떻게 응답하셨나요?</span><textarea id="anote" placeholder="하나님께서 하신 일을 기록해 두세요"></textarea></label>
  <button class="btn primary" data-act="answerSave" data-id="${t.dataset.id}">응답으로 저장</button>`);
ACT.answerSave = t => {
  updPrayer(t.dataset.id, p => { p.status = "answered"; p.answeredAt = $("#adate").value || todayStr(); p.answer = $("#anote").value.trim(); });
  closeSheet(); render(); toast("할렐루야! 응답을 기록했습니다 🙌");
};
ACT.unanswer = t => { updPrayer(t.dataset.id, p => { p.status = "praying"; }); render(); };
ACT.sharePrayer = async t => {
  const p = store.get("prayers", []).find(x => x.id === t.dataset.id);
  const text = `[기도 부탁] ${p.title}${p.person ? ` (${p.person})` : ""}${p.content ? "\n" + p.content : ""}${p.verse ? "\n말씀: " + p.verse : ""}`;
  if (navigator.share) { try { await navigator.share({ text }); } catch { } }
  else { try { await navigator.clipboard.writeText(text); toast("복사했습니다. 단톡방에 붙여넣으세요"); } catch { prompt("복사하세요", text); } }
};

/* ============================================================
   5. 교회 모임 일정표 & 알람
   ============================================================ */
// 일정 종류: 이름과 색은 사용자가 바꿀 수 있고, id는 자동 분류용으로 고정
const DEFAULT_EV_CATS = [
  { id: "wednesday", name: "수요말씀", color: "#5b4a8a" }, { id: "friday", name: "금요말씀", color: "#b5482f" },
  { id: "sunday", name: "주일말씀", color: "#3b2f5c" }, { id: "cell", name: "구역모임", color: "#2e7d4f" },
  { id: "choir", name: "찬양대연습", color: "#c2477e" }, { id: "teacher", name: "교사모임", color: "#2a6fb0" },
  { id: "serve", name: "봉사", color: "#c98a1c" }, { id: "event", name: "행사", color: "#6b6b6b" },
  { id: "etc", name: "기타", color: "#888888" }
];
// 예전 기본 종류 이름 → 새 기본 종류 (종류를 직접 바꾼 적이 없는 기기에서만 옮김)
const OLD_DEFAULT_CATS = { "주일예배": "sunday", "수요예배": "wednesday", "금요기도회": "friday", "구역·목장": "cell", "찬양연습": "choir", "새벽기도": "etc", "성경공부": "etc" };
const EV_CATS = {};   // 이름 → 색 (화면 표시용)
let evCatList = [];
function loadEvCats() {
  const custom = store.get("evCats", null);
  evCatList = custom || DEFAULT_EV_CATS.map(c => ({ ...c }));
  Object.keys(EV_CATS).forEach(k => delete EV_CATS[k]);
  evCatList.forEach(c => { EV_CATS[c.name] = c.color; });
  if (!custom) {
    const events = store.get("events", []);
    let changed = false;
    events.forEach(e => {
      const id = OLD_DEFAULT_CATS[e.cat];
      if (id && !EV_CATS[e.cat]) { e.cat = DEFAULT_EV_CATS.find(c => c.id === id).name; changed = true; }
    });
    if (changed) store.set("events", events);
  }
}
// id로 현재 이름 찾기 (지운 종류면 '기타', 그것도 없으면 마지막 종류)
const catName = id => (evCatList.find(c => c.id === id) || evCatList.find(c => c.id === "etc") || evCatList[evCatList.length - 1]).name;
loadEvCats();
const REPEATS = { none: "반복 안 함", daily: "매일", weekly: "매주", biweekly: "격주", monthly: "매월 같은 날짜", monthlyNth: "매월 같은 주·요일", yearly: "매년" };
const REMINDS = { "-1": "알림 없음", 0: "정시", 10: "10분 전", 30: "30분 전", 60: "1시간 전", 120: "2시간 전", 1440: "하루 전" };

function nthOfMonth(d) { return Math.ceil(d.getDate() / 7); }
function occursOn(ev, ds) {
  if (ds < ev.date || (ev.until && ds > ev.until)) return false;
  if ((ev.skip || []).includes(ds)) return false;
  if (ds === ev.date) return true;
  const a = parseYMD(ev.date), b = parseYMD(ds), n = diffDays(ds, ev.date);
  switch (ev.repeat) {
    case "daily": return true;
    case "weekly": return n % 7 === 0;
    case "biweekly": return n % 14 === 0;
    case "monthly": return a.getDate() === b.getDate();
    case "monthlyNth": return a.getDay() === b.getDay() && nthOfMonth(a) === nthOfMonth(b);
    case "yearly": return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    default: return false;
  }
}
const eventsOn = ds => store.get("events", []).filter(e => occursOn(e, ds)).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

VIEWS.events = function () {
  $("#topActions").innerHTML = `<button class="icon-btn" data-act="importStart" aria-label="일정표 사진으로 등록">${ICON("camera")}</button><button class="icon-btn" data-act="icsAll" aria-label="캘린더로 내보내기">${ICON("upload")}</button><button class="icon-btn" data-act="eventNew" aria-label="일정 추가">${ICON("plus")}</button>`;
  if (!S.calMonth) S.calMonth = todayStr().slice(0, 7);
  const [y, m] = S.calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1), start = new Date(first); start.setDate(1 - first.getDay());
  const evs = store.get("events", []);
  let cells = DOW.map(d => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const ds = ymd(d);
    const day = evs.filter(e => occursOn(e, ds));
    cells += `<button class="${d.getMonth() !== m - 1 ? "other" : ""} ${ds === todayStr() ? "today" : ""} ${ds === S.calSel ? "sel" : ""} ${d.getDay() === 0 ? "sun" : ""}" data-act="calSel" data-d="${ds}">
      <span>${d.getDate()}</span><span class="dots">${day.slice(0, 3).map(e => `<i style="background:${EV_CATS[e.cat] || "#888"}"></i>`).join("")}</span></button>`;
    if (i === 34 && d.getMonth() !== m - 1) break;
  }
  const selList = eventsOn(S.calSel);
  // 다가오는 일정 (14일)
  let upcoming = "";
  for (let i = 0; i < 14; i++) {
    const ds = addDays(todayStr(), i);
    eventsOn(ds).forEach(e => { upcoming += eventCard(e, ds, true); });
  }
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  let weekCount = 0;
  for (let i = 0; i < 7; i++) weekCount += eventsOn(addDays(todayStr(), i)).length;
  $("#view").innerHTML = `
    ${perm === "default" ? `<div class="alarm-banner"><span>🔔</span><span style="flex:1">일정 알림을 받으려면 알림을 허용해 주세요.</span><button class="btn sm" data-act="askNotify">허용</button></div>` : ""}
    ${perm === "denied" ? `<div class="card small">🔕 브라우저에서 알림이 차단되어 있습니다. 브라우저 설정에서 이 사이트의 알림을 허용하거나, 📤 버튼으로 휴대폰 캘린더에 일정을 추가하세요.</div>` : ""}
    <div class="tiles">
      ${tile("peach", "calendar", "오늘 일정", eventsOn(todayStr()).length, eventsOn(todayStr())[0] ? `${fmtTime(eventsOn(todayStr())[0].time)} ${esc(eventsOn(todayStr())[0].title)}` : "오늘은 일정이 없어요", "개")}
      ${tile("mint", "check", "이번 주", weekCount, "앞으로 7일 동안", "개")}
      ${tile("butter", "bell", "알림 켠 일정", evs.filter(e => e.remind >= 0).length, perm === "granted" ? "알림이 허용됨" : "알림 허용이 필요해요", "개")}
      ${tile("sky", "repeat", "반복 일정", evs.filter(e => e.repeat !== "none").length, "매주·매월 모임", "개")}
    </div>
    ${evs.length < 5 ? `<button class="card import-cta" data-act="importStart"><span class="t-ic">${ICON("camera", 22)}</span><span><b class="display" style="font-size:18px">월간 일정표로 한 번에 등록</b><br><span class="small muted">주보나 행사표 사진, 카톡 공지 글을 넣으면 일정을 찾아서 넣어 드려요 (무료)</span></span></button>` : ""}
    <div class="cal">
      <div class="cal-head"><button class="icon-btn" data-act="calMove" data-d="-1" aria-label="이전 달">${ICON("prev")}</button><span>${y}년 ${m}월</span><button class="icon-btn" data-act="calMove" data-d="1" aria-label="다음 달">${ICON("next")}</button></div>
      <div class="cal-grid">${cells}</div>
    </div>
    <div class="row"><div class="section-title" style="margin-top:4px">${fmtDate(S.calSel)}</div><span class="spacer"></span><button class="btn sm" data-act="eventNew" data-d="${S.calSel}">＋ 이 날 일정</button></div>
    ${selList.map(e => eventCard(e, S.calSel)).join("") || `<p class="muted small" style="margin:4px 2px 12px">일정이 없습니다.</p>`}
    <div class="section-title">다가오는 2주</div>
    ${upcoming || `<p class="muted small">예정된 일정이 없습니다.</p>`}`;
};
function eventCard(e, ds, showDate) {
  const c = EV_CATS[e.cat] || "#888";
  return `<div class="card event" data-act="eventShow" data-id="${e.id}" data-d="${ds}" style="cursor:pointer">
    <div class="time">${e.time ? e.time : "종일"}</div>
    <div class="body"><h3><span class="cat-dot" style="background:${c}"></span>${esc(e.title)}</h3>
      <div class="meta">${showDate ? fmtDate(ds) + " · " : ""}${esc(e.cat)}${e.place ? " · 📍" + esc(e.place) : ""}${e.repeat !== "none" ? " · 🔁" + REPEATS[e.repeat] : ""}${e.remind >= 0 ? " · 🔔" + REMINDS[e.remind] : ""}</div></div></div>`;
}
ACT.calMove = t => { const [y, m] = S.calMonth.split("-").map(Number); const d = new Date(y, m - 1 + Number(t.dataset.d), 1); S.calMonth = ymd(d).slice(0, 7); render(); };
ACT.calSel = t => { S.calSel = t.dataset.d; S.calMonth = t.dataset.d.slice(0, 7); render(); };
ACT.eventNew = t => eventForm(null, t?.dataset.d || S.calSel);
ACT.eventShow = t => {
  const e = store.get("events", []).find(x => x.id === t.dataset.id), ds = t.dataset.d;
  openSheet(`${sheetHead(esc(e.title))}
    <p><span class="cat-dot" style="background:${EV_CATS[e.cat] || "#888"}"></span>${esc(e.cat)}</p>
    <p>📅 ${fmtDate(ds)} ${fmtTime(e.time)}${e.end ? " ~ " + fmtTime(e.end) : ""}</p>
    ${e.place ? `<p>📍 ${esc(e.place)}</p>` : ""}
    <p>🔁 ${REPEATS[e.repeat]}${e.until ? ` (${e.until}까지)` : ""} · 🔔 ${REMINDS[e.remind]}</p>
    ${e.memo ? `<p style="white-space:pre-wrap" class="card">${esc(e.memo)}</p>` : ""}
    <div class="row wrap">
      <button class="btn primary" data-act="eventEdit" data-id="${e.id}">수정</button>
      <button class="btn" data-act="icsOne" data-id="${e.id}">📲 휴대폰 캘린더에 추가</button>
      ${e.repeat !== "none" ? `<button class="btn" data-act="eventSkip" data-id="${e.id}" data-d="${ds}">이번만 취소</button>` : ""}
      <button class="btn danger" data-act="eventDel" data-id="${e.id}">삭제</button>
    </div>`);
};
ACT.eventEdit = t => eventForm(t.dataset.id);
function eventForm(id, date) {
  const e = id ? store.get("events", []).find(x => x.id === id) : { date, time: "19:30", cat: catName("cell"), repeat: "none", remind: 30 };
  openSheet(`${sheetHead(id ? "일정 수정" : "일정 추가")}
    <label class="field"><span>제목 *</span><input type="text" id="etitle" value="${esc(e.title)}" placeholder="예: 3구역 구역예배"></label>
    <label class="field"><span class="row">종류<span class="spacer"></span><button type="button" class="link-btn" data-act="catManage">종류 이름·색 바꾸기</button></span><select id="ecat">${Object.keys(EV_CATS).concat(e.cat && !EV_CATS[e.cat] ? [e.cat] : []).map(c => `<option ${e.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
    <label class="field"><span>날짜 (반복 시 첫 날짜)</span><input type="date" id="edate" value="${e.date}"></label>
    <div class="grid2">
      <label class="field"><span>시작 시간</span><input type="time" id="etime" value="${e.time || ""}"></label>
      <label class="field"><span>끝 시간</span><input type="time" id="eend" value="${e.end || ""}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>반복</span><select id="erepeat">${Object.entries(REPEATS).map(([k, v]) => `<option value="${k}" ${e.repeat === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="field"><span>반복 종료일 (선택)</span><input type="date" id="euntil" value="${e.until || ""}"></label>
    </div>
    <label class="field"><span>알림</span><select id="eremind">${Object.entries(REMINDS).map(([k, v]) => `<option value="${k}" ${String(e.remind) === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="field"><span>장소</span><input type="text" id="eplace" value="${esc(e.place)}" placeholder="예: 본당, 김성도님 댁"></label>
    <label class="field"><span>메모</span><textarea id="ememo" placeholder="준비물, 담당자, 말씀 본문 등">${esc(e.memo)}</textarea></label>
    <button class="btn primary" data-act="eventSave" data-id="${id || ""}">저장</button>`);
}
ACT.eventSave = t => {
  const title = $("#etitle").value.trim(), date = $("#edate").value;
  if (!title || !date) { toast("제목과 날짜를 입력해 주세요"); return; }
  const list = store.get("events", []);
  const data = { title, date, cat: $("#ecat").value, time: $("#etime").value, end: $("#eend").value, repeat: $("#erepeat").value, until: $("#euntil").value, remind: Number($("#eremind").value), place: $("#eplace").value.trim(), memo: $("#ememo").value.trim() };
  if (t.dataset.id) Object.assign(list.find(x => x.id === t.dataset.id), data);
  else list.push({ id: uid(), skip: [], ...data });
  store.set("events", list); closeSheet(); S.calSel = date; S.calMonth = date.slice(0, 7); render();
  toast("일정을 저장했습니다");
  if (data.remind >= 0 && "Notification" in window && Notification.permission === "default") askNotify();
};
ACT.eventDel = async t => { if (!await askConfirm("이 일정을 삭제할까요?\n반복 일정이면 모든 날짜가 삭제됩니다.", "삭제")) return; store.set("events", store.get("events", []).filter(x => x.id !== t.dataset.id)); closeSheet(); render(); };
ACT.eventSkip = t => { const l = store.get("events", []); const e = l.find(x => x.id === t.dataset.id); (e.skip = e.skip || []).push(t.dataset.d); store.set("events", l); closeSheet(); render(); toast("이 날짜만 취소했습니다"); };

// ───────── 일정 종류 관리 (이름·색 바꾸기, 추가, 삭제) ─────────
let catDraft = [];
ACT.catManage = () => { catDraft = evCatList.map(c => ({ ...c })); catSheet(); };
function catSheet(msg = "") {
  openSheet(`${sheetHead("일정 종류 관리")}
    <p class="small muted" style="margin-top:-4px">이름과 색을 바꾸면 이미 등록한 일정에도 바로 반영됩니다. 사진·글자로 일정을 등록할 때 자동으로 고르는 종류도 바뀐 이름을 따라갑니다.</p>
    <div id="catRows">${catDraft.map((c, i) => `
      <div class="cat-row">
        <input type="color" value="${c.color}" data-input="catEdit" data-i="${i}" data-k="color" aria-label="${esc(c.name)} 색">
        <input type="text" value="${esc(c.name)}" data-input="catEdit" data-i="${i}" data-k="name" maxlength="12" aria-label="종류 이름">
        <button class="icon-btn" data-act="catDel" data-i="${i}" aria-label="${esc(c.name)} 삭제" ${catDraft.length < 2 ? "disabled" : ""}>${ICON("close", 16)}</button>
      </div>`).join("")}</div>
    ${msg ? `<p class="small" style="color:var(--warn)">${esc(msg)}</p>` : ""}
    <div class="row wrap" style="margin-top:12px">
      <button class="btn" data-act="catAdd">${ICON("plus", 14)} 종류 추가</button>
      <button class="btn sm" data-act="catReset">기본값으로</button>
      <span class="spacer"></span>
      <button class="btn primary" data-act="catSave">저장</button>
    </div>`);
}
ACT.catEdit = t => { catDraft[Number(t.dataset.i)][t.dataset.k] = t.value; };
ACT.catAdd = () => { catDraft.push({ id: "c" + uid(), name: "새 종류", color: "#7d9bd2" }); catSheet(); setTimeout(() => { const ins = document.querySelectorAll("#catRows input[type=text]"); const el = ins[ins.length - 1]; el?.focus(); el?.select(); }, 50); };
ACT.catDel = t => { if (catDraft.length < 2) return; catDraft.splice(Number(t.dataset.i), 1); catSheet(); };
ACT.catReset = () => { catDraft = DEFAULT_EV_CATS.map(c => ({ ...c })); catSheet("기본값으로 바꿨습니다. 저장을 눌러야 적용됩니다."); };
ACT.catSave = async () => {
  catDraft.forEach(c => { c.name = c.name.trim().replace(/\s+/g, " "); });
  if (catDraft.some(c => !c.name)) { catSheet("이름이 빈 종류가 있습니다."); return; }
  const names = catDraft.map(c => c.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) { catSheet(`'${dup}'이(가) 두 번 있습니다. 이름을 다르게 해 주세요.`); return; }
  // 바뀐 이름, 지운 종류 계산
  const rename = {}, removed = new Set();
  for (const old of evCatList) {
    const now = catDraft.find(c => c.id === old.id);
    if (!now) removed.add(old.name); else if (now.name !== old.name) rename[old.name] = now.name;
  }
  const fallback = (catDraft.find(c => c.id === "etc") || catDraft[catDraft.length - 1]).name;
  const events = store.get("events", []);
  const moved = events.filter(e => removed.has(e.cat) && !rename[e.cat]).length;
  if (moved && !await askConfirm(`지운 종류에 속한 일정 ${moved}개는 '${fallback}'(으)로 옮겨집니다. 저장할까요?`, "저장")) { catSheet(); return; }
  events.forEach(e => { if (rename[e.cat]) e.cat = rename[e.cat]; else if (removed.has(e.cat)) e.cat = fallback; });
  store.set("events", events);
  store.set("evCats", catDraft);
  loadEvCats();
  closeSheet(); render(); toast("일정 종류를 저장했습니다");
};

// .ics 내보내기 (휴대폰 기본 캘린더 알람과 연동)
function icsEvent(e) {
  const dt = (d, t) => d.replace(/-/g, "") + (t ? "T" + t.replace(":", "") + "00" : "");
  const icsEsc = s => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
  const L = ["BEGIN:VEVENT", `UID:${e.id}@malsseum`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `SUMMARY:${icsEsc(e.title)}`];
  if (e.time) {
    L.push(`DTSTART:${dt(e.date, e.time)}`);
    let end = e.end;
    if (!end || end <= e.time) { const [h, m] = e.time.split(":").map(Number); end = `${pad(Math.min(23, h + 1))}:${pad(h + 1 > 23 ? 59 : m)}`; }
    L.push(`DTEND:${dt(e.date, end)}`);
  } else { L.push(`DTSTART;VALUE=DATE:${dt(e.date)}`, `DTEND;VALUE=DATE:${dt(addDays(e.date, 1))}`); }
  const a = parseYMD(e.date), nth = nthOfMonth(a), byday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][a.getDay()];
  const rr = { daily: "FREQ=DAILY", weekly: "FREQ=WEEKLY", biweekly: "FREQ=WEEKLY;INTERVAL=2", monthly: "FREQ=MONTHLY", monthlyNth: `FREQ=MONTHLY;BYDAY=${nth}${byday}`, yearly: "FREQ=YEARLY" }[e.repeat];
  if (rr) L.push(`RRULE:${rr}${e.until ? ";UNTIL=" + dt(e.until) + "T235959" : ""}`);
  (e.skip || []).forEach(s => L.push(e.time ? `EXDATE:${dt(s, e.time)}` : `EXDATE;VALUE=DATE:${dt(s)}`));
  if (e.place) L.push(`LOCATION:${icsEsc(e.place)}`);
  if (e.memo) L.push(`DESCRIPTION:${icsEsc(e.memo)}`);
  if (e.remind >= 0) L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(e.title)}`, `TRIGGER:-PT${e.remind}M`, "END:VALARM");
  L.push("END:VEVENT");
  return L.join("\r\n");
}
const icsWrap = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//malsseum//church//KO\r\nCALSCALE:GREGORIAN\r\n${body}\r\nEND:VCALENDAR\r\n`;
ACT.icsOne = t => { const e = store.get("events", []).find(x => x.id === t.dataset.id); download(`${e.title}.ics`, icsWrap(icsEvent(e)), "text/calendar"); };
ACT.icsAll = () => {
  const l = store.get("events", []);
  if (!l.length) { toast("내보낼 일정이 없습니다"); return; }
  download("교회일정.ics", icsWrap(l.map(icsEvent).join("\r\n")), "text/calendar");
  toast("파일을 열면 휴대폰 캘린더에 추가됩니다");
};

// ───────── 알람 엔진 ─────────
async function askNotify() {
  if (!("Notification" in window)) { toast("이 브라우저는 알림을 지원하지 않습니다"); return; }
  const r = await Notification.requestPermission();
  toast(r === "granted" ? "알림이 허용되었습니다 🔔" : "알림이 허용되지 않았습니다");
  if (S.tab === "events") render();
}
ACT.askNotify = askNotify;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.3, ctx.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .32);
    });
  } catch { }
}
async function notify(title, body, tag) {
  let shown = false;
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.showNotification(title, { body, tag, icon: "icons/icon-192-v2.png", badge: "icons/badge-96-v2.png", vibrate: [200, 100, 200], requireInteraction: true }); shown = true; }
      else { new Notification(title, { body, tag, icon: "icons/icon-192-v2.png" }); shown = true; }
    } catch { }
  }
  if (document.visibilityState === "visible") {
    beep();
    openSheet(`${sheetHead("🔔 " + esc(title))}<p style="font-size:17px;white-space:pre-wrap">${esc(body)}</p><button class="btn primary" data-act="close">확인</button>`);
  }
}
const GRACE = 30 * 60000; // 앱이 늦게 열려도 30분 이내 놓친 알림은 울림
function checkAlarms() {
  const now = Date.now(), fired = store.get("fired", {});
  let changed = false;
  const fire = (key, at, title, body) => {
    if (fired[key] || now < at || now - at > GRACE) return;
    fired[key] = now; changed = true; notify(title, body, key);
  };
  const evs = store.get("events", []);
  for (let i = 0; i <= 1; i++) {
    const ds = addDays(todayStr(), i);
    evs.filter(e => e.remind >= 0 && occursOn(e, ds)).forEach(e => {
      const [h, m] = (e.time || "09:00").split(":").map(Number);
      const start = parseYMD(ds); start.setHours(h, m, 0, 0);
      const at = start.getTime() - e.remind * 60000;
      fire(`ev:${e.id}:${ds}`, at, e.title, `${fmtDate(ds)} ${fmtTime(e.time)}${e.place ? " · " + e.place : ""}${e.remind > 0 ? `\n(${REMINDS[e.remind]} 알림)` : ""}`);
    });
  }
  if (S.settings.dailyOn) {
    const [h, m] = S.settings.dailyTime.split(":").map(Number);
    const at = new Date(); at.setHours(h, m, 0, 0);
    const tr = todayReading();
    if (!tr || !isDone(tr.p, tr.i)) fire(`daily:${todayStr()}`, at.getTime(), "오늘의 성경 읽기 📖", tr ? `${tr.p.name} ${tr.i + 1}일째: ${fmtReadings(tr.list)}` : "오늘도 말씀과 함께 하루를 시작하세요.");
  }
  if (changed) {
    const cutoff = now - 3 * 86400000; // 오래된 기록 정리
    Object.keys(fired).forEach(k => { if (fired[k] < cutoff) delete fired[k]; });
    store.set("fired", fired);
  }
}

/* ============================================================
   6. 설정 · 백업
   ============================================================ */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
$("#settingsBtn").onclick = () => {
  const s = S.settings, perm = "Notification" in window ? Notification.permission : "unsupported";
  openSheet(`${sheetHead("설정")}
    ${location.protocol === "file:" ? `<div class="card small">📁 지금은 앱을 폴더에서 바로 열었습니다. 성경·읽기표·사전·기도노트·일정은 그대로 쓸 수 있지만, <b>알림, 홈 화면 설치, 무료 사진 인식</b>은 인터넷 주소(https://)로 올린 앱에서만 됩니다. 올리는 방법은 README를 참고하세요.</div>` : ""}
    ${installEvt ? `<button class="btn primary" data-act="install" style="width:100%;margin-bottom:12px">📲 홈 화면에 앱 설치</button>` : ""}
    <div class="card">
      <div class="row"><b>화면</b></div>
      <div class="row" style="margin-top:8px"><span>테마</span><span class="spacer"></span>
        <div class="seg">${[["auto", "자동"], ["light", "밝게"], ["dark", "어둡게"]].map(([k, l]) => `<button class="${s.theme === k ? "on" : ""}" data-act="setTheme" data-t="${k}">${l}</button>`).join("")}</div></div>
      <div class="row" style="margin-top:10px"><span>본문 글자 크기</span><span class="spacer"></span><input type="range" min="13" max="30" value="${s.fontSize}" data-input="fsRange" style="width:140px"><span id="fsVal" style="width:28px">${s.fontSize}</span></div>
    </div>
    <div class="card">
      <b>알림</b>
      <div class="row small" style="margin-top:6px"><span>알림 권한: ${{ granted: "✅ 허용됨", denied: "🚫 차단됨", default: "아직 묻지 않음", unsupported: "지원 안 됨" }[perm]}</span><span class="spacer"></span>
        ${perm === "default" ? `<button class="btn sm" data-act="askNotify">허용하기</button>` : ""}<button class="btn sm" data-act="testNotify">테스트</button></div>
      <div class="row" style="margin-top:10px"><label class="row"><input type="checkbox" ${s.dailyOn ? "checked" : ""} data-change="dailyOn" style="width:20px;height:20px"> 매일 성경 읽기 알림</label><span class="spacer"></span><input type="time" value="${s.dailyTime}" data-change="dailyTime" style="width:auto"></div>
      <p class="small muted" style="margin-bottom:0">※ 웹앱 알림은 앱이 열려 있거나 백그라운드에 있을 때 울립니다. 앱을 완전히 종료해도 확실히 울리게 하려면 일정 화면의 📤 버튼으로 휴대폰 캘린더에 일정을 추가하세요.</p>
    </div>
    <div class="card">
      <div class="row"><b>일정 종류</b><span class="spacer"></span><button class="btn sm" data-act="catManage">이름·색 바꾸기</button></div>
      <p class="small muted" style="margin:6px 0 0">${evCatList.map(c => `<span class="cat-dot" style="background:${c.color}"></span>${esc(c.name)}`).join(" · ")}</p>
    </div>
    <div class="card">
      <b>데이터</b>
      <p class="small muted">기도 노트·일정·읽기 기록은 이 기기에만 저장됩니다. 기기를 바꾸기 전에 백업하세요.</p>
      <div class="row wrap">
        <button class="btn" data-act="backup">💾 백업 파일 저장</button>
        <label class="btn">📂 백업 불러오기<input type="file" accept=".json,application/json" data-change="restore" hidden></label>
        <button class="btn" data-act="offline">⬇ 오프라인용 성경 저장</button>
      </div>
    </div>
    <div class="card">
      <div class="row"><b>일정표 사진 인식</b><span class="spacer"></span><span class="small muted">${store.get("apiKey", "") ? "✅ API 키 저장됨" : "API 키 없음"}</span></div>
      <p class="small muted">사진으로 일정을 등록할 때 쓰는 Claude API 키를 관리합니다.</p>
      <button class="btn sm" data-act="apiKeyOpen">API 키 설정</button>
    </div>
    <p class="small muted">성경 본문: 개역한글판(1961), King James Version(1769). 본문 데이터 출처: scrollmapper/bible_databases.</p>`);
};
ACT.install = async () => { if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; closeSheet(); } };
ACT.setTheme = t => { S.settings.theme = t.dataset.t; saveSettings(); applyTheme(); document.querySelectorAll("[data-act=setTheme]").forEach(b => b.classList.toggle("on", b === t)); };
ACT.fsRange = t => { S.settings.fontSize = Number(t.value); $("#fsVal").textContent = t.value; saveSettings(); applyTheme(); };
ACT.dailyOn = t => { S.settings.dailyOn = t.checked; saveSettings(); if (t.checked && "Notification" in window && Notification.permission === "default") askNotify(); };
ACT.dailyTime = t => { S.settings.dailyTime = t.value || "07:00"; saveSettings(); const f = store.get("fired", {}); delete f["daily:" + todayStr()]; store.set("fired", f); };
ACT.testNotify = () => { closeSheet(); setTimeout(() => notify("테스트 알림", "알림이 정상적으로 동작합니다 🔔", "test"), 300); };
const BACKUP_KEYS = ["settings", "read", "plan", "bookmarks", "highlights", "myDict", "prayers", "events", "evCats"];
ACT.backup = () => {
  const data = { app: "malsseum", version: 1, exported: new Date().toISOString() };
  BACKUP_KEYS.forEach(k => data[k] = store.get(k, null));
  download(`슬기로운_신앙생활_백업_${todayStr()}.json`, JSON.stringify(data, null, 1), "application/json");
};
ACT.restore = async t => {
  const f = t.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== "malsseum") throw 0;
    if (!await askConfirm("현재 데이터를 백업 파일 내용으로 바꿀까요?", "불러오기")) return;
    BACKUP_KEYS.forEach(k => { if (data[k] != null) store.set(k, data[k]); });
    location.reload();
  } catch { toast("올바른 백업 파일이 아닙니다"); }
};
ACT.offline = async t => {
  t.disabled = true;
  let n = 0;
  const jobs = [];
  for (const lang of ["ko", "en"]) for (let b = 0; b < 66; b++) jobs.push(() => loadBook(lang, b).then(() => { n++; t.textContent = `⬇ 저장 중 ${Math.round(n / 132 * 100)}%`; }));
  try { for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(j => j())); t.textContent = "✓ 오프라인 저장 완료"; }
  catch { t.textContent = "⬇ 다시 시도"; t.disabled = false; toast("인터넷 연결을 확인해 주세요"); }
};

// ───────── 기본 일정 (처음 한 번만 추가, 지우면 다시 생기지 않음) ─────────
function seedDefaultEvents() {
  if (store.get("seededDefaults", false)) return;
  const first = new Date(); first.setDate(1);
  const firstOf = wd => { const d = new Date(first); d.setDate(1 + (wd - d.getDay() + 7) % 7); return ymd(d); };
  const list = store.get("events", []);
  const defaults = [
    { title: "수요말씀", cat: catName("wednesday"), date: firstOf(3), time: "19:30" },
    { title: "주일말씀", cat: catName("sunday"), date: firstOf(0), time: "11:00" }
  ];
  for (const d of defaults) {
    if (list.some(e => e.title === d.title)) continue;
    list.push({ id: uid(), skip: [], end: "", repeat: "weekly", until: "", remind: 30, place: "", memo: "", ...d });
  }
  store.set("events", list);
  store.set("seededDefaults", true);
}

// ───────── 시작 ─────────
seedDefaultEvents();
// 바로가기(./?tab=plan 등)로 열면 그 메뉴부터 보여 줌
{ const qt = new URLSearchParams(location.search).get("tab"); if (["bible", "plan", "dict", "prayer", "hymn", "sermon", "clips", "blog", "events"].includes(qt)) S.tab = qt; }
hydrateIcons();
$("#mascotSide").innerHTML = MASCOT(98);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => renderSide());
applyTheme();
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
checkAlarms();
setInterval(checkAlarms, 20000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { checkAlarms(); if (S.tab !== "bible") render(); } });
