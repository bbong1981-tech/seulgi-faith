// 슬기로운 신앙생활 — 방명록 서버 (Google Apps Script)
// 구글 시트의 [확장 프로그램 → Apps Script]에 이 내용을 그대로 붙여 넣고
// [배포 → 새 배포 → 웹 앱, 실행: 나, 액세스: 모든 사용자]로 배포하세요.
// 남긴 글은 이 시트의 '방명록' 탭에 쌓입니다.
// 글을 숨기려면 그 줄의 D칸(숨김)에 아무 글자나 쓰고, 지우려면 줄을 삭제하세요.

const SHEET = "방명록";

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET);
  if (!s) {
    s = ss.insertSheet(SHEET);
    s.appendRow(["시간", "이름", "내용", "숨김 (아무 글자나 쓰면 숨김)"]);
    s.setFrozenRows(1);
  }
  return s;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 시트에서 =, +, -, @ 로 시작하는 글이 수식으로 바뀌지 않게 함
function safe_(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// 글 목록 (최신 300개, 숨김 표시한 글 제외)
function doGet() {
  const s = sheet_();
  const n = s.getLastRow();
  const rows = n > 1 ? s.getRange(2, 1, n - 1, 4).getValues() : [];
  const items = rows
    .filter(r => r[0] && !String(r[3]).trim())
    .map(r => ({ time: new Date(r[0]).toISOString(), name: String(r[1]), text: String(r[2]) }))
    .reverse()
    .slice(0, 300);
  return out_({ ok: true, items: items });
}

// 글 남기기
function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: "잘못된 요청입니다" }); }
  if (d.website) return out_({ ok: true }); // 스팸 로봇이 채우는 숨은 칸
  const name = String(d.name || "").replace(/\s+/g, " ").trim().slice(0, 20) || "익명";
  const text = String(d.text || "").trim().slice(0, 300);
  if (!text) return out_({ ok: false, error: "내용을 적어 주세요" });
  if (/https?:\/\/|www\./i.test(text + name)) return out_({ ok: false, error: "링크는 남길 수 없어요" });

  // 1분에 30개가 넘게 들어오면 잠시 막음 (도배 방지)
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get("count") || 0);
  if (count >= 30) return out_({ ok: false, error: "잠시 후 다시 남겨 주세요" });
  cache.put("count", String(count + 1), 60);

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try { sheet_().appendRow([new Date(), safe_(name), safe_(text), ""]); }
  finally { lock.releaseLock(); }
  return out_({ ok: true });
}
