"use strict";
/* ============================================================
   교제 — 깨사모(깨어있는 사람들의 모임) 바로가기 + 방명록
   방명록 글은 구글 시트에 저장됩니다 (Google Apps Script 웹 앱).
   설정 방법: README의 '방명록 설정' 참고 → 받은 주소를 GUESTBOOK_API에 넣음
   ============================================================ */

const KSM_URL = "https://ksm.jbch.org/";
const SCHOOL_URL = "https://www.jbch.org/ko/school/";                                       // 교회학교 홈페이지
const GUESTBOOK_API = "https://script.google.com/macros/s/AKfycbzKeDODQ1JmGZ1Zd8B20fkFetY9U4-T5leES6Ete-RzCu7ZnxFeN50WtbxXPl32wsLd/exec"; // 구글 시트 방명록 (README의 '방명록 설정')
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
    <a class="card ksm-card peach" href="${SCHOOL_URL}" target="_blank" rel="noopener">
      <span class="t-ic">${ICON("school", 24)}</span>
      <span class="invite-text"><b class="display">교회학교 홈페이지</b><span class="small muted">전국 교회학교 소식과 자료</span></span>
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

// ───────── 앱 — 선교회·교회에서 쓰는 앱 받기 (구글 플레이 스토어) ─────────
TITLES.apps = "앱"; SUBTITLES.apps = "교회 생활에 도움이 되는 앱을 받아요.";
const PLAY = id => `https://play.google.com/store/apps/details?id=${id}`;
const CHURCH_APPS = [
  { name: "성도연락처", id: "org.jbch.saints_phone", key: "saints", icon: "phone", color: "sky" },
  { name: "임원수첩", id: "org.jbch.www.address_duty", key: "duty", icon: "notebook", color: "butter" },
  { name: "생명의말씀선교회", id: "org.jbch.lifeworldmission", key: "lifeword", icon: "book", color: "peach" },
  { name: "생명선지도", id: "org.jbch.jbchmap", key: "jbchmap", icon: "map", color: "mint" },
  { name: "성경암송수첩", id: "com.hkkim.biblerecitationnotebook", key: "recite", icon: "bookmark", color: "sky" },
  { name: "뿌리깊은 싯딤나무", id: "org.jbch.shittimtree", key: "shittim", icon: "tree", color: "mint" },
  { name: "토브성경", id: "org.jbch.tovbible_for_android", key: "tov", icon: "sprout", color: "butter" },
  { name: "생명기도수첩", id: "org.jbch.praynote", key: "praynote", icon: "hands", color: "peach" }
];
// 실제 앱 아이콘 (GitHub Actions가 플레이 스토어·APK에서 받아 icons/apps/에 저장). 못 불러오면 선 아이콘으로
const appIcon = (key, icon) => `<span class="app-ic"><img src="icons/apps/${key}.png" alt="" loading="lazy" onerror="this.parentNode.classList.add('fallback');this.remove()">${ICON(icon, 24)}</span>`;
// 플레이 스토어에 없는 찬송가 앱: 구글 드라이브의 설치 파일(APK)을 받아 직접 설치
const APK_APPS = [
  { name: "통일찬송가", key: "tongil", url: "https://drive.google.com/file/d/1YBHyN3uyRA47STfMiFG1iRvckE0rqi8-/view", color: "peach" },
  { name: "은혜찬송가", key: "eunhye", url: "https://drive.google.com/file/d/1p-gO-U7O0Br1pc3NQfy9oAeBMD8IeAyg/view", color: "mint" }
];
VIEWS.apps = function () {
  $("#topActions").innerHTML = "";
  $("#view").innerHTML = `
    <div class="section-title" style="margin-top:0">찬송가 앱 <span class="small muted">· 직접 설치</span></div>
    <div class="app-list">${APK_APPS.map(a => `
      <a class="card ksm-card ${a.color}" href="${a.url}" target="_blank" rel="noopener">
        ${appIcon(a.key, "music")}
        <span class="invite-text"><b class="display">${esc(a.name)}</b><span class="small muted">구글 드라이브에서 설치 파일 받기</span></span>
        <span class="btn sm primary">받기</span>
      </a>`).join("")}</div>
    <p class="small muted apk-which">휴대폰 <b>설정 → 보안 및 개인정보 보호</b>에 <b>"보안 위험 자동 차단"</b>이 있으면 <b>최신 휴대폰</b> 방법을, 없으면 <b>예전 휴대폰</b> 방법을 따라 하세요.</p>
    <details class="card apk-help" open>
      <summary><b>📲 최신 휴대폰</b> <span class="small muted">(최근 갤럭시 등)</span></summary>
      <ol>
        <li><b>받기</b>를 누르면 구글 드라이브가 열려요. <b>다운로드(⤓)</b> 버튼을 누르세요. 안 보이면 오른쪽 위 <b>⋮ → 다운로드</b>. "바이러스 검사를 할 수 없습니다"가 나오면 <b>무시하고 다운로드</b>를 누르세요.</li>
        <li><b>[갤럭시] 자동 차단 잠시 끄기</b> — 최신 갤럭시는 이 기능이 켜져 있으면 설치가 막혀요.<br><b>설정 → 보안 및 개인정보 보호 → 보안 위험 자동 차단</b>을 <b>끄기</b>로 바꾸세요. (최신 폰에서는 "30분 뒤 자동으로 다시 켜기"를 고르면 편해요.)</li>
        <li><b>내 파일 → 다운로드</b> 폴더에서 받은 파일(<b>.apk</b>)을 누르세요. 다운로드 알림을 눌러도 돼요.</li>
        <li>"이 출처의 알 수 없는 앱을 설치할 수 없습니다"가 나오면 <b>설정</b>을 눌러 <b>권한 허용(이 출처 허용)</b>을 켜고, 뒤로 돌아와 <b>설치</b>를 누르세요.</li>
        <li>"Play 프로텍트" 경고가 나오면 <b>세부정보 더보기 → 무시하고 설치</b>를 누르세요. ("앱 검사" 안내가 나오면 <b>검사하지 않고 설치</b>)</li>
        <li>설치가 끝나면 <b>열기</b>. 받은 설치 파일은 지워도 괜찮아요.</li>
      </ol>
      <p class="small muted"><b>설치가 끝난 뒤</b>: 안전을 위해 <b>보안 위험 자동 차단</b>을 다시 켜고, 4번에서 켠 <b>이 출처 허용</b>도 꺼 두세요.</p>
      <p class="small muted"><b>잘 안 될 때</b><br>· 파일을 눌러도 아무 반응이 없으면 <b>내 파일</b> 앱에서 다시 열어 보세요.<br>· "자동 차단으로 설치가 차단됨"이 다시 나오면 2번이 다시 켜졌는지 확인하세요.<br>· 휴대폰마다 버튼 이름이 조금 다를 수 있어요.</p>
    </details>
    <details class="card apk-help">
      <summary><b>📱 예전 휴대폰</b> <span class="small muted">(자동 차단 기능이 없는 휴대폰)</span></summary>
      <ol>
        <li><b>받기</b>를 누르면 구글 드라이브가 열려요. 화면 위쪽의 <b>다운로드(⤓)</b> 버튼을 누르세요. 버튼이 안 보이면 오른쪽 위 <b>⋮</b> → <b>다운로드</b>를 누르세요.</li>
        <li>"바이러스 검사를 할 수 없습니다"라는 안내가 나오면 <b>무시하고 다운로드</b>를 누르세요. 파일이 커서 나오는 안내예요.</li>
        <li>다운로드가 끝나면 알림을 누르거나, <b>내 파일 → 다운로드</b> 폴더에서 받은 파일(<b>.apk</b>)을 누르세요.</li>
        <li>"<b>출처를 알 수 없는 앱</b>" 안내가 나오면 <b>설정</b>을 눌러 <b>이 출처 허용</b>을 켜고, 뒤로 돌아와 <b>설치</b>를 누르세요.<br><span class="small muted">아주 오래된 휴대폰(안드로이드 7 이하)은 <b>설정 → 보안(또는 잠금화면 및 보안) → 출처를 알 수 없는 앱</b>을 켜 주세요.</span></li>
        <li>"Play 프로텍트" 경고가 나오면 <b>세부정보 더보기 → 무시하고 설치</b>를 누르세요.</li>
        <li>설치가 끝나면 <b>열기</b>를 누르면 돼요. 받은 설치 파일은 지워도 괜찮아요.</li>
      </ol>
      <p class="small muted">· 안전을 위해 설치가 끝난 뒤 4번에서 켠 <b>이 출처 허용</b>은 다시 꺼 두세요.<br>· 휴대폰마다 버튼 이름이 조금 다를 수 있어요.</p>
    </details>
    <p class="small muted" style="margin:8px 4px 0">· 아이폰에는 설치할 수 없어요.</p>
    <div class="section-title">플레이 스토어 앱</div>
    <div class="app-list">${CHURCH_APPS.map(a => `
    <a class="card ksm-card ${a.color}" href="${PLAY(a.id)}" target="_blank" rel="noopener">
      ${appIcon(a.key, a.icon)}
      <span class="invite-text"><b class="display">${esc(a.name)}</b><span class="small muted">구글 플레이 스토어에서 받기</span></span>
      <span class="btn sm primary">받기</span>
    </a>`).join("")}</div>
    <p class="small muted" style="text-align:center;margin-top:14px">안드로이드 휴대폰용 앱이에요. 아이폰에서는 앱 스토어에서 같은 이름으로 찾아보세요.</p>`;
};

if (["fellow", "apps"].includes(S.tab)) render();
