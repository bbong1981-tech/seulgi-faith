"use strict";
/* ============================================================
   찬양 — 통일찬송가 · 은혜찬송가 · 내 찬양을 장별로 보기
   찬송가 가사와 악보는 저작권이 있어 앱에 넣지 않았습니다.
   가지고 있는 찬송가의 악보 사진과 가사를 장별로 등록해서 봅니다.
   - 목록(번호·제목·가사): localStorage "hymns"
   - 악보 이미지: IndexedDB (용량이 커서)
   ============================================================ */

const HYMN_BOOKS = { tongil: "통일찬송가", eunhye: "은혜찬송가", mine: "내 찬양" };
TITLES.hymn = "찬양";
SUBTITLES.hymn = "찬송가를 장별로 찾아 악보와 가사를 함께 봐요.";
S.hymnBook = store.get("hymnBook", "tongil");
S.hymnQ = "";

// ───────── 악보 이미지 저장소 (IndexedDB) ─────────
const hymnDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("hymn-scores", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("pages");
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction("pages", mode), st = t.objectStore("pages");
      const out = fn(st);
      t.oncomplete = () => res(out && "result" in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    put: (id, blob) => tx("readwrite", st => st.put(blob, id)),
    get: id => tx("readonly", st => st.get(id)),
    del: id => tx("readwrite", st => st.delete(id))
  };
})();
const pageUrls = new Map(); // 화면에 띄운 이미지 URL 재사용
async function pageUrl(id) {
  if (pageUrls.has(id)) return pageUrls.get(id);
  const blob = await hymnDB.get(id);
  if (!blob) return "";
  const u = URL.createObjectURL(blob); pageUrls.set(id, u); return u;
}
// 악보 글씨가 읽히도록 긴 변 2200px, 화질 0.85로 저장
async function scoreBlob(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = new Image(); im.src = url; await im.decode();
    const scale = Math.min(1, 2200 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(im.naturalWidth * scale); c.height = Math.round(im.naturalHeight * scale);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
  } finally { URL.revokeObjectURL(url); }
}

const hymns = () => store.get("hymns", []);
const saveHymns = l => store.set("hymns", l);
const bookHymns = book => hymns().filter(h => h.book === book).sort((a, b) => a.no - b.no || a.title.localeCompare(b.title, "ko"));

// ───────── 웹에서 가사 찾기 (앱에는 가사를 담지 않고, 검색 결과로 연결) ─────────
function lyricsQuery(book, no, title) {
  const name = book === "mine" ? "" : HYMN_BOOKS[book] + " ";
  if (no) return `${name}${no}장 ${title || ""} 가사`.replace(/\s+/g, " ").trim();
  return `${name}${title} ${book === "mine" ? "찬양 " : ""}가사`.replace(/\s+/g, " ").trim();
}
const lyricsLinks = (book, no, title) => {
  const q = encodeURIComponent(lyricsQuery(book, no, title));
  return `<a class="btn sm" href="https://search.naver.com/search.naver?query=${q}" target="_blank" rel="noopener">네이버에서 찾기</a>
    <a class="btn sm" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">구글에서 찾기</a>`;
};
function webCard(q) {
  const isNo = /^\d+$/.test(q), no = isNo ? Number(q) : "", title = isNo ? "" : q;
  return `<div class="card web-lyrics">
    <div class="row"><span class="t-ic">${ICON("search", 18)}</span><b>웹에서 '${esc(lyricsQuery(S.hymnBook, no, title))}' 찾기</b></div>
    <p class="small muted" style="margin:6px 0 10px">검색 결과에서 가사를 복사한 뒤 '가사 붙여넣어 저장'을 누르면, 다음부터는 이 앱에서 바로 가사로 찾을 수 있어요.</p>
    <div class="row wrap">${lyricsLinks(S.hymnBook, no, title)}
      <button class="btn sm primary" data-act="hymnNew" data-no="${no}" data-title="${esc(title)}" data-lyrics="1">가사 붙여넣어 저장</button></div>
  </div>`;
}

// ───────── 목록 화면 ─────────
VIEWS.hymn = function () {
  $("#topActions").innerHTML = `<button class="icon-btn" data-act="hymnMenu" aria-label="찬양 관리">${ICON("upload")}</button><button class="icon-btn" data-act="hymnNew" aria-label="찬양 추가">${ICON("plus")}</button>`;
  const all = hymns();
  const count = b => all.filter(h => h.book === b).length;
  const favs = all.filter(h => h.fav).length;
  const recent = store.get("hymnRecent", []).map(id => all.find(h => h.id === id)).filter(Boolean)[0];
  $("#view").innerHTML = `
    <div class="tiles">
      ${tile("peach", "music", "통일찬송가", count("tongil"), "등록한 장", "장")}
      ${tile("mint", "music", "은혜찬송가", count("eunhye"), "등록한 장", "장")}
      ${tile("butter", "star", "즐겨찾기", favs, "자주 부르는 찬양", "곡")}
      ${tile("sky", "repeat", "최근에 본 찬양", recent ? recent.no || "-" : "-", recent ? esc(recent.title) : "아직 없어요", recent && recent.no ? "장" : "")}
    </div>
    <div class="seg" style="display:flex;margin-bottom:12px">${Object.entries(HYMN_BOOKS).map(([k, l]) => `<button style="flex:1" class="${S.hymnBook === k ? "on" : ""}" data-act="hymnBook" data-b="${k}">${l}</button>`).join("")}</div>
    <div class="searchbar">
      <input type="search" id="hq" placeholder="장 번호나 제목, 가사로 찾기 (예: 405, 내 주를 가까이)" value="${esc(S.hymnQ)}" data-input="hymnQ" inputmode="search">
    </div>
    <div class="row" style="margin:-2px 2px 10px"><label class="small row muted"><input type="checkbox" id="hFav" data-change="hymnFavOnly" ${S.hymnFav ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--accent)"> 즐겨찾기만</label></div>
    <div id="hlist"></div>`;
  hymnList();
};
function hymnList() {
  const q = S.hymnQ.trim().toLowerCase();
  let list = bookHymns(S.hymnBook);
  if (S.hymnFav) list = list.filter(h => h.fav);
  if (q) list = /^\d+$/.test(q) ? list.filter(h => String(h.no).startsWith(q)) : list.filter(h => [h.title, h.lyrics, h.memo].join(" ").toLowerCase().includes(q));
  const el = $("#hlist");
  if (!list.length) {
    const none = !bookHymns(S.hymnBook).length;
    el.innerHTML = none ? `<div class="card hymn-empty">
        ${MASCOT(110)}
        <h3>${HYMN_BOOKS[S.hymnBook]}를 채워 보세요</h3>
        <p class="small muted">찬송가 가사와 악보는 저작권 때문에 앱에 미리 넣어 두지 못했습니다. <b>위 검색창에 장 번호나 제목을 넣으면 웹에서 가사를 바로 찾아볼 수 있어요.</b> 찾은 가사나 가지고 있는 찬송가의 악보 사진을 장별로 저장해 두면, 다음부터는 번호만 눌러 바로 볼 수 있습니다.</p>
        <div class="row wrap" style="justify-content:center">
          <button class="btn primary" data-act="hymnNew">${ICON("camera", 16)} 한 장씩 등록</button>
          <button class="btn" data-act="hymnBulk">여러 장 한 번에 등록</button>
        </div></div>`
      : `<p class="small muted" style="margin:4px 4px 12px">저장해 둔 찬양 중에는 '${esc(S.hymnQ.trim())}'이(가) 없습니다.</p>`;
    if (q) el.innerHTML = (none ? "" : el.innerHTML) + webCard(S.hymnQ.trim());
    return;
  }
  el.innerHTML = `<div class="card hymn-list">${list.map(h => `
    <div class="hymn-row" data-act="hymnOpen" data-id="${h.id}">
      <span class="hno">${h.no || "·"}</span>
      <span class="htitle"><b>${h.title ? esc(h.title) : `<span class="muted">제목 없음</span>`}</b><span class="small muted">${h.pages?.length ? `악보 ${h.pages.length}쪽` : "악보 없음"}${h.lyrics ? " · 가사" : ""}</span></span>
      ${h.fav ? `<span class="hfav">${ICON("star", 18)}</span>` : ""}
    </div>`).join("")}</div>${q ? webCard(S.hymnQ.trim()) : ""}`;
}
ACT.hymnBook = t => { S.hymnBook = t.dataset.b; store.set("hymnBook", S.hymnBook); S.hymnQ = ""; render(); };
ACT.hymnQ = t => { S.hymnQ = t.value; hymnList(); };
ACT.hymnFavOnly = t => { S.hymnFav = t.checked; hymnList(); };

// ───────── 찬양 보기 ─────────
ACT.hymnOpen = t => hymnView(t.dataset.id);
async function hymnView(id) {
  const all = hymns(), h = all.find(x => x.id === id); if (!h) return;
  const rec = [id, ...store.get("hymnRecent", []).filter(x => x !== id)].slice(0, 10); store.set("hymnRecent", rec);
  if (S.tab === "hymn") { const y = scrollY; VIEWS.hymn(); scrollTo(0, y); }
  const list = bookHymns(h.book), i = list.findIndex(x => x.id === id);
  const prev = list[i - 1], next = list[i + 1];
  openSheet(`<div class="sheet-head">
      <h2>${h.no ? `<span class="hno-big">${h.no}</span>` : ""}${h.title ? esc(h.title) : `<span class="muted">제목 없음</span>`}</h2>
      <button class="icon-btn" data-act="hymnFav" data-id="${id}" aria-label="즐겨찾기" style="color:${h.fav ? "var(--butter-ic)" : "inherit"}">${ICON("star")}</button>
      <button class="icon-btn" data-act="close" aria-label="닫기">${ICON("close")}</button></div>
    <p class="small muted" style="margin:-8px 0 12px">${HYMN_BOOKS[h.book]}${h.memo ? " · " + esc(h.memo) : ""}</p>
    <div id="scorePages">${(h.pages || []).length ? h.pages.map(() => `<div class="score-page"><span class="muted small">악보 불러오는 중…</span></div>`).join("") : `<div class="card small muted">등록된 악보가 없습니다. '수정'에서 악보 사진을 추가하세요.</div>`}</div>
    ${h.lyrics ? `<div class="section-title">가사</div><div class="card lyrics">${esc(h.lyrics)}</div>`
      : `<div class="card small"><b>가사가 아직 없어요.</b> 웹에서 찾아 복사한 뒤 '수정'에서 붙여 넣으세요.<div class="row wrap" style="margin-top:8px">${lyricsLinks(h.book, h.no, h.title)}</div></div>`}
    <div class="row wrap" style="margin-top:14px">
      <button class="btn" data-act="hymnOpen" data-id="${prev?.id || ""}" ${prev ? "" : "disabled"}>${ICON("prev", 14)} ${prev ? (prev.no || "") + "장" : "이전"}</button>
      <button class="btn" data-act="hymnOpen" data-id="${next?.id || ""}" ${next ? "" : "disabled"}>${next ? (next.no || "") + "장" : "다음"} ${ICON("next", 14)}</button>
      <span class="spacer"></span>
      <button class="btn" data-act="hymnEdit" data-id="${id}">수정</button>
    </div>`);
  const box = $("#scorePages");
  for (let k = 0; k < (h.pages || []).length; k++) {
    const u = await pageUrl(h.pages[k]);
    const slot = box?.children[k]; if (!slot) return;
    slot.innerHTML = u ? `<img src="${u}" alt="${esc(h.title)} 악보 ${k + 1}쪽">` : `<span class="muted small">악보를 찾을 수 없습니다.</span>`;
  }
}
ACT.hymnFav = t => {
  const l = hymns(), h = l.find(x => x.id === t.dataset.id); h.fav = !h.fav; saveHymns(l);
  t.style.color = h.fav ? "var(--butter-ic)" : "inherit"; toast(h.fav ? "즐겨찾기에 넣었습니다" : "즐겨찾기에서 뺐습니다");
  if (S.tab === "hymn") { const y = scrollY; VIEWS.hymn(); scrollTo(0, y); }
};

// ───────── 등록·수정 ─────────
let hymnDraftPages = []; // [{id, url, blob?}]
ACT.hymnNew = t => hymnForm(null, t?.dataset.no, t?.dataset.title, t?.dataset.lyrics === "1");
ACT.hymnEdit = t => hymnForm(t.dataset.id);
async function hymnForm(id, no, title, focusLyrics) {
  const h = id ? hymns().find(x => x.id === id) : { book: S.hymnBook, no: no ? Number(no) : "", title: title || "", lyrics: "", memo: "", pages: [] };
  hymnDraftPages = [];
  for (const pid of h.pages || []) hymnDraftPages.push({ id: pid, url: await pageUrl(pid) });
  openSheet(`${sheetHead(id ? "찬양 수정" : "찬양 등록")}
    <div class="grid2">
      <label class="field"><span>찬송가</span><select id="hfBook">${Object.entries(HYMN_BOOKS).map(([k, l]) => `<option value="${k}" ${h.book === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field"><span>장 번호</span><input type="number" id="hfNo" min="1" max="9999" value="${h.no}" inputmode="numeric"></label>
    </div>
    <label class="field"><span>제목</span><input type="text" id="hfTitle" value="${esc(h.title)}" placeholder="찬송가 첫 줄이나 제목"></label>
    <label class="field"><span>악보 사진 (여러 쪽이면 순서대로)</span></label>
    <label class="drop" style="margin-top:-8px">
      <input type="file" accept="image/*" multiple data-change="hymnPick" hidden>
      ${ICON("camera", 26)}<b>악보 사진 추가</b><span class="small muted">찍거나 앨범에서 고르기</span>
    </label>
    <div class="thumbs" id="hfThumbs">${hymnThumbs()}</div>
    <div class="row" style="margin-bottom:6px"><span class="small muted" style="font-weight:700;margin-left:4px">가사 (선택)</span><span class="spacer"></span><button class="btn sm" data-act="hymnWebFromForm">${ICON("search", 14)} 웹에서 가사 찾기</button></div>
    <label class="field"><textarea id="hfLyrics" rows="8" placeholder="웹에서 찾은 가사를 여기에 붙여 넣으세요&#10;1절…&#10;2절…">${esc(h.lyrics)}</textarea></label>
    <label class="field"><span>메모 (선택)</span><input type="text" id="hfMemo" value="${esc(h.memo)}" placeholder="예: 주일 2부 예배, 성가대 특송"></label>
    <div class="row"><button class="btn primary" data-act="hymnSave" data-id="${id || ""}">저장</button><span class="spacer"></span>
      ${id ? `<button class="btn danger" data-act="hymnDel" data-id="${id}">삭제</button>` : ""}</div>`);
  if (focusLyrics) setTimeout(() => { const el = $("#hfLyrics"); el?.scrollIntoView({ block: "center" }); el?.focus(); }, 80);
}
ACT.hymnWebFromForm = () => {
  const q = lyricsQuery($("#hfBook").value, Number($("#hfNo").value) || "", $("#hfTitle").value.trim());
  window.open(`https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`, "_blank", "noopener");
};
function hymnThumbs() {
  return hymnDraftPages.map((p, i) => `<div class="thumb"><img src="${p.url}" alt="${i + 1}쪽"><button data-act="hymnPageDel" data-i="${i}" aria-label="빼기">✕</button><span class="pg">${i + 1}</span></div>`).join("");
}
ACT.hymnPick = async t => {
  const files = [...t.files]; t.value = "";
  for (const f of files) {
    try { const blob = await scoreBlob(f); hymnDraftPages.push({ id: "p" + uid(), blob, url: URL.createObjectURL(blob) }); }
    catch { toast(`'${f.name}'을 읽지 못했습니다`); }
  }
  $("#hfThumbs").innerHTML = hymnThumbs();
};
ACT.hymnPageDel = t => { hymnDraftPages.splice(Number(t.dataset.i), 1); $("#hfThumbs").innerHTML = hymnThumbs(); };
ACT.hymnSave = async t => {
  const no = Number($("#hfNo").value) || 0, title = $("#hfTitle").value.trim(), book = $("#hfBook").value;
  if (!no && !title) { toast("장 번호나 제목을 넣어 주세요"); return; }
  const l = hymns();
  if (no && l.some(x => x.book === book && x.no === no && x.id !== t.dataset.id)) { toast(`${HYMN_BOOKS[book]} ${no}장은 이미 있습니다`); return; }
  t.disabled = true; t.textContent = "저장 중…";
  try {
    for (const p of hymnDraftPages) if (p.blob) { await hymnDB.put(p.id, p.blob); pageUrls.set(p.id, p.url); delete p.blob; }
  } catch { toast("악보를 저장할 공간이 부족합니다"); t.disabled = false; t.textContent = "저장"; return; }
  const data = { book, no, title, lyrics: $("#hfLyrics").value.trim(), memo: $("#hfMemo").value.trim(), pages: hymnDraftPages.map(p => p.id) };
  let id = t.dataset.id;
  if (id) {
    const h = l.find(x => x.id === id);
    (h.pages || []).filter(pid => !data.pages.includes(pid)).forEach(pid => hymnDB.del(pid).catch(() => { }));
    Object.assign(h, data);
  } else { id = "h" + uid(); l.push({ id, fav: false, ...data }); }
  saveHymns(l); S.hymnBook = book; store.set("hymnBook", book);
  if (S.tab === "hymn") render();
  hymnView(id); toast("저장했습니다");
};
ACT.hymnDel = async t => {
  if (!await askConfirm("이 찬양과 악보를 삭제할까요?", "삭제")) return;
  const l = hymns(), h = l.find(x => x.id === t.dataset.id);
  (h?.pages || []).forEach(pid => hymnDB.del(pid).catch(() => { }));
  saveHymns(l.filter(x => x.id !== t.dataset.id)); render();
};

// ───────── 여러 장 한 번에 등록 (파일 이름의 번호로 장 구분) ─────────
ACT.hymnBulk = () => openSheet(`${sheetHead("여러 장 한 번에 등록")}
  <p class="small muted" style="margin-top:-4px">악보 사진의 <b>파일 이름에 있는 숫자</b>로 장을 나눕니다. 예: <code>001.jpg</code> → 1장, <code>405-1.jpg</code>, <code>405-2.jpg</code> → 405장의 1·2쪽. 제목은 나중에 '수정'에서 넣을 수 있습니다.</p>
  <label class="field"><span>찬송가</span><select id="hbBook">${Object.entries(HYMN_BOOKS).map(([k, l]) => `<option value="${k}" ${S.hymnBook === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
  <label class="drop"><input type="file" accept="image/*" multiple data-change="hymnBulkPick" hidden>${ICON("upload", 26)}<b>악보 사진 여러 장 고르기</b><span class="small muted">이미 있는 장에는 쪽이 덧붙여집니다</span></label>
  <p class="small" id="hbProg"></p>`);
ACT.hymnBulkPick = async t => {
  const files = [...t.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); t.value = "";
  const book = $("#hbBook").value, prog = $("#hbProg");
  const l = hymns(); let added = 0, skipped = [];
  for (let k = 0; k < files.length; k++) {
    const f = files[k], m = f.name.match(/(\d{1,4})/);
    if (!m) { skipped.push(f.name); continue; }
    const no = Number(m[1]);
    prog.textContent = `저장 중… ${k + 1} / ${files.length}`;
    try {
      const blob = await scoreBlob(f), pid = "p" + uid();
      await hymnDB.put(pid, blob);
      let h = l.find(x => x.book === book && x.no === no);
      if (!h) { h = { id: "h" + uid(), book, no, title: "", lyrics: "", memo: "", pages: [], fav: false }; l.push(h); added++; }
      h.pages.push(pid);
    } catch { skipped.push(f.name); }
  }
  saveHymns(l); S.hymnBook = book; store.set("hymnBook", book);
  prog.innerHTML = `새로 ${added}장을 만들고 악보 ${files.length - skipped.length}쪽을 저장했습니다.${skipped.length ? `<br>번호가 없어 건너뛴 파일: ${skipped.slice(0, 5).map(esc).join(", ")}${skipped.length > 5 ? " 외" : ""}` : ""}`;
  if (S.tab === "hymn") render();
};

// ───────── 관리: 찬양 백업·복원 (악보 포함) ─────────
ACT.hymnMenu = () => openSheet(`${sheetHead("찬양 관리")}
  <div class="row wrap">
    <button class="btn" data-act="hymnBulk">여러 장 한 번에 등록</button>
    <button class="btn" data-act="hymnExport">찬양 백업 파일 저장 (악보 포함)</button>
    <label class="btn">찬양 백업 불러오기<input type="file" accept=".json,application/json" data-change="hymnImport" hidden></label>
  </div>
  <p class="small muted">설정의 일반 백업에는 악보 사진이 들어가지 않습니다. 기기를 바꿀 때는 이 '찬양 백업'도 함께 저장해 두세요.</p>`);
const blobToB64 = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(b); });
ACT.hymnExport = async t => {
  t.disabled = true; t.textContent = "만드는 중…";
  const l = hymns(), pages = {};
  for (const h of l) for (const pid of h.pages || []) { const b = await hymnDB.get(pid).catch(() => null); if (b) pages[pid] = await blobToB64(b); }
  download(`슬기로운_신앙생활_찬양백업_${todayStr()}.json`, JSON.stringify({ app: "malsseum-hymn", version: 1, hymns: l, pages }), "application/json");
  t.disabled = false; t.textContent = "찬양 백업 파일 저장 (악보 포함)";
};
ACT.hymnImport = async t => {
  const f = t.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== "malsseum-hymn" || !Array.isArray(data.hymns)) throw 0;
    if (!await askConfirm(`찬양 ${data.hymns.length}곡을 불러올까요?\n같은 찬송가·같은 장 번호는 백업 내용으로 바뀝니다.`, "불러오기")) return;
    for (const [pid, b64] of Object.entries(data.pages || {})) {
      const bin = atob(b64), arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      await hymnDB.put(pid, new Blob([arr], { type: "image/jpeg" }));
    }
    const l = hymns().filter(x => !data.hymns.some(y => y.book === x.book && y.no && y.no === x.no));
    saveHymns(l.concat(data.hymns)); closeSheet(); render(); toast(`찬양 ${data.hymns.length}곡을 불러왔습니다`);
  } catch { toast("올바른 찬양 백업 파일이 아닙니다"); }
};

// 바로가기(./?tab=hymn)로 열었을 때
if (S.tab === "hymn") render();
