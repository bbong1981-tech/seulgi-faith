"use strict";
/* ============================================================
   교제 — 깨사모(깨어있는 사람들의 모임) 바로가기 + 방명록
   방명록 글은 구글 시트에 저장됩니다 (Google Apps Script 웹 앱).
   설정 방법: README의 '방명록 설정' 참고 → 받은 주소를 GUESTBOOK_API에 넣음
   ============================================================ */

const KSM_URL = "https://ksm.jbch.org/";
const GUESTBOOK_API = ""; // 예: "https://script.google.com/macros/s/……/exec"
TITLES.fellow = "교제"; SUBTITLES.fellow = "깨사모에서 소식을 나누고, 방명록에 따뜻한 한마디를 남겨요.";

let guestbookCache = null;
async function loadGuestbook(fresh) {
  if (guestbookCache && !fresh) return guestbookCache;
  const r = await fetch(`${GUESTBOOK_API}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || "fail");
  return guestbookCache = d.items || [];
}

VIEWS.fellow = function () {
  $("#topActions").innerHTML = `<a class="icon-btn" href="${KSM_URL}" target="_blank" rel="noopener" aria-label="깨사모 열기">${ICON("users")}</a>`;
  const draft = store.get("gbDraft", { name: "", text: "" });
  $("#view").innerHTML = `
    <a class="card ksm-card" href="${KSM_URL}" target="_blank" rel="noopener">
      <span class="t-ic">${ICON("users", 24)}</span>
      <span class="invite-text"><b class="display">깨사모 홈페이지</b><span class="small muted">깨어있는 사람들의 모임 · 로그인 후 이용할 수 있어요</span></span>
      <span class="btn sm primary">열기</span>
    </a>
    <div class="section-title">방명록</div>
    ${GUESTBOOK_API ? `
    <form class="card gb-form" id="gbForm" autocomplete="off">
      <input type="text" id="gbName" maxlength="20" placeholder="이름 (비워 두면 '익명')" value="${esc(draft.name)}" data-input="gbDraft">
      <textarea id="gbText" maxlength="300" rows="3" placeholder="따뜻한 인사, 기도 부탁, 감사의 말을 남겨 주세요 (300자까지)" data-input="gbDraft">${esc(draft.text)}</textarea>
      <input type="text" id="gbWebsite" class="gb-trap" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="row"><span class="small muted" id="gbCount">${draft.text.length} / 300</span><span class="spacer"></span><button class="btn primary" type="submit" id="gbSubmit">남기기</button></div>
    </form>
    <div id="gbList"><p class="muted small" style="margin:4px">방명록을 불러오는 중…</p></div>`
    : `<div class="card small muted">방명록을 준비하고 있어요. 곧 이곳에 글을 남길 수 있습니다.</div>`}`;
  if (!GUESTBOOK_API) return;
  $("#gbForm").addEventListener("submit", e => { e.preventDefault(); postGuestbook(); });
  renderGuestbook();
};
ACT.gbDraft = () => {
  store.set("gbDraft", { name: $("#gbName").value, text: $("#gbText").value });
  $("#gbCount").textContent = `${$("#gbText").value.length} / 300`;
};
async function renderGuestbook(fresh) {
  const el = $("#gbList"); if (!el) return;
  try {
    const items = await loadGuestbook(fresh);
    if (S.tab !== "fellow" || !$("#gbList")) return;
    $("#gbList").innerHTML = items.length ? `<div class="card gb-list">${items.map(it => `
      <div class="gb-item">
        <div class="row"><span class="gb-avatar">${esc((it.name || "익명").slice(0, 1))}</span><b>${esc(it.name || "익명")}</b><span class="spacer"></span><span class="small muted">${agoText(it.time) || ""}</span></div>
        <p>${esc(it.text)}</p>
      </div>`).join("")}</div>` : `<p class="empty">아직 남긴 글이 없어요. 첫 인사를 남겨 주세요!</p>`;
  } catch {
    if ($("#gbList")) $("#gbList").innerHTML = `<p class="empty">방명록을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.</p>`;
  }
}
async function postGuestbook() {
  const name = $("#gbName").value.trim(), text = $("#gbText").value.trim(), website = $("#gbWebsite").value;
  if (!text) { toast("내용을 적어 주세요"); return; }
  const last = store.get("gbLast", 0);
  if (Date.now() - last < 30000) { toast("조금 뒤에 다시 남겨 주세요"); return; }
  const btn = $("#gbSubmit"); btn.disabled = true; btn.textContent = "남기는 중…";
  try {
    // text/plain으로 보내야 구글 쪽에서 별도 허가 절차 없이 받음
    const r = await fetch(GUESTBOOK_API, { method: "POST", body: JSON.stringify({ name, text, website }) });
    const d = await r.json().catch(() => ({ ok: r.ok }));
    if (!d.ok) throw new Error(d.error || "fail");
    store.set("gbLast", Date.now()); store.set("gbDraft", { name, text: "" });
    $("#gbText").value = ""; $("#gbCount").textContent = "0 / 300";
    toast("방명록에 남겼어요 🙏");
    await renderGuestbook(true);
  } catch (e) {
    toast(e.message && e.message !== "fail" && !/^\d+$/.test(e.message) ? e.message : "남기지 못했어요. 잠시 후 다시 시도해 주세요");
  } finally { btn.disabled = false; btn.textContent = "남기기"; }
}

if (S.tab === "fellow") render();
