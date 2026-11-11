"use strict";
/* ============================================================
   월간 일정표 사진 → 일정 자동 등록 (Claude API)
   - 사진/PDF를 Claude에게 보내 일정 목록(JSON)을 받아온 뒤
   - 사용자가 확인·수정하고 체크한 일정만 등록합니다.
   - API 키는 이 기기에만 저장되고 api.anthropic.com 으로만 전송됩니다.
   ============================================================ */

const AI_MODEL = "claude-opus-5-5";
const getApiKey = () => store.get("apiKey", "");
let importFiles = [];   // [{name, kind:'image'|'pdf', media_type, data(base64), preview}]
let importDraft = [];   // Claude가 읽어 온 일정 후보

// SDK는 처음 사용할 때만 불러옵니다 (앱 첫 화면을 가볍게 유지)
function loadSdk() {
  if (window.Anthropic) return Promise.resolve(window.Anthropic);
  return loadSdk._p || (loadSdk._p = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "js/vendor/anthropic-sdk.js";
    s.onload = () => res(window.Anthropic);
    s.onerror = () => { loadSdk._p = null; rej(new Error("sdk")); };
    document.head.appendChild(s);
  }));
}

// ───────── 1단계: 방법 고르고 사진/글자 넣기 ─────────
// mode: "ocr" 무료 사진 인식(기기 안에서) · "text" 글자 붙여넣기(무료) · "ai" Claude AI(유료, 가장 정확)
let importMode = store.get("importMode", "ocr");
ACT.importStart = () => { importFiles = []; importSheet(); };
ACT.importMode = t => {
  importMode = t.dataset.m; store.set("importMode", importMode);
  if (importMode === "ai" && !getApiKey()) { apiKeySheet(true); return; }
  importSheet();
};
function importSheet(msg = "") {
  const [y, m] = (S.calMonth || todayStr().slice(0, 7)).split("-").map(Number);
  const modes = [["ocr", "사진 · 무료"], ["text", "글자 붙여넣기"], ["ai", "AI 정밀 인식"]];
  const intro = {
    ocr: "사진 속 글자를 이 휴대폰 안에서 읽습니다. 돈이 들지 않고 사진이 밖으로 나가지 않습니다. 목록 형태의 일정표에 잘 맞고, 칸이 많은 달력 모양은 틀릴 수 있으니 결과를 꼭 확인하세요. 처음 한 번 인식 프로그램(약 5MB)을 내려받습니다.",
    text: "카톡 공지나 휴대폰의 글자 인식으로 복사한 일정을 붙여 넣으세요. 무료이고, 휴대폰 기본 글자 인식이 정확해서 달력 모양 사진에도 잘 맞습니다.",
    ai: "Claude AI가 사진을 읽습니다. 달력 모양도 가장 정확하게 읽지만, 사진 한 장에 약 100원 안팎의 API 사용료가 듭니다."
  }[importMode];
  const photoPart = `
    <label class="drop" id="dropZone">
      <input type="file" id="impFile" accept="${importMode === "ai" ? "image/*,application/pdf" : "image/*"}" multiple data-change="importPick" hidden>
      <span style="font-size:28px">🖼️</span>
      <b>사진 선택 또는 촬영</b>
      <span class="small muted">최대 4장 · ${importMode === "ai" ? "JPG, PNG, PDF" : "JPG, PNG"}</span>
    </label>
    <div class="thumbs" id="thumbs">${thumbsHtml()}</div>`;
  const textPart = `
    <label class="field"><span>일정 글자</span><textarea id="impText" rows="7" data-input="importTextIn" placeholder="예)\n11/13(금) 오후 7시 30분 21구역 구역모임 (전인신 집사님 댁)\n12월 21일 월 저녁 7시 성도교제의 밤 연습\n매주 금요일 오전 10시 30분 금요말씀">${esc(importText)}</textarea></label>
    <details class="small muted" style="margin:-4px 0 12px"><summary>사진 속 글자를 복사하는 방법</summary>
      <p style="margin:6px 0 0"><b>아이폰</b>: 사진 앱에서 일정표 사진을 열고 글자를 길게 눌러 '모두 선택' → '복사'<br>
      <b>갤럭시</b>: 갤러리에서 사진을 열고 오른쪽 아래 'T'(글자 인식) 버튼 → '모두 선택' → '복사'<br>
      <b>그 밖의 안드로이드</b>: Google 렌즈 → '텍스트' → '모두 선택' → '복사'</p></details>`;
  const canRun = importMode === "text" ? importText.trim().length > 0 : importFiles.length > 0;
  openSheet(`${sheetHead("📷 일정표로 한 번에 등록")}
    <div class="seg" style="display:flex;margin-bottom:8px">${modes.map(([k, l]) => `<button style="flex:1" class="${importMode === k ? "on" : ""}" data-act="importMode" data-m="${k}">${l}</button>`).join("")}</div>
    <p class="small muted" style="margin:0 0 10px">${intro}</p>
    ${importMode === "text" ? textPart : photoPart}
    <div class="grid2">
      <label class="field"><span>일정표의 연도</span><input type="number" id="impYear" value="${y}" min="2000" max="2100"></label>
      <label class="field"><span>일정표의 달 (모르면 비워 두기)</span><input type="number" id="impMonth" value="${m}" min="1" max="12"></label>
    </div>
    ${importMode === "ai" ? `<label class="field"><span>참고 사항 (선택)</span><input type="text" id="impHint" placeholder="예: 3구역 일정만, 청년부 일정은 빼 주세요"></label>` : ""}
    ${msg ? `<p class="small" style="color:var(--warn)">${esc(msg)}</p>` : ""}
    <div class="row"><button class="btn primary" data-act="importRun" id="impRun" ${canRun ? "" : "disabled"}>일정 읽기</button>
      <span class="spacer"></span>${importMode === "ai" ? `<button class="btn sm" data-act="apiKeyOpen">API 키 설정</button>` : ""}</div>`);
}
let importText = "";
ACT.importTextIn = t => { importText = t.value; $("#impRun").disabled = !t.value.trim(); };
function thumbsHtml() {
  return importFiles.map((f, i) => `<div class="thumb">
    ${f.kind === "image" ? `<img src="${f.preview}" alt="">` : `<span>📄<br><small>${esc(f.name)}</small></span>`}
    <button data-act="importRemove" data-i="${i}" aria-label="빼기">✕</button></div>`).join("");
}
ACT.importRemove = t => { importFiles.splice(Number(t.dataset.i), 1); $("#thumbs").innerHTML = thumbsHtml(); $("#impRun").disabled = !importFiles.length; };
ACT.importPick = async t => {
  const files = [...t.files].slice(0, 4 - importFiles.length);
  t.value = "";
  for (const f of files) {
    try {
      if (f.type === "application/pdf") {
        if (f.size > 25 * 1024 * 1024) { toast("PDF가 너무 큽니다 (25MB 이하)"); continue; }
        importFiles.push({ name: f.name, kind: "pdf", media_type: "application/pdf", data: await fileToBase64(f) });
      } else {
        const img = await shrinkImage(f);
        importFiles.push({ name: f.name, kind: "image", ...img });
      }
    } catch { toast(`'${f.name}' 파일을 읽지 못했습니다`); }
  }
  $("#thumbs").innerHTML = thumbsHtml();
  $("#impRun").disabled = !importFiles.length;
};
function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
}
// 글씨가 작은 달력도 읽히도록 긴 변 2400px까지 유지하되, API 한도(5MB) 아래로 줄입니다
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let max = 2400, q = 0.9, data;
    for (let tries = 0; tries < 5; tries++) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      data = c.toDataURL("image/jpeg", q);
      if (data.length * 0.75 < 4.5 * 1024 * 1024) break;
      max = Math.round(max * 0.8); q = 0.82;
    }
    return { media_type: "image/jpeg", data: data.split(",")[1], preview: data };
  } finally { URL.revokeObjectURL(url); }
}

// ───────── 2단계: Claude에게 읽기 요청 ─────────
const EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["events", "notes"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "date", "time", "end", "place", "cat", "memo"],
        properties: {
          title: { type: "string", description: "일정 이름 (표에 적힌 표현을 살려서 짧게)" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "시작 시간 HH:MM (24시간제). 시간이 없으면 빈 문자열" },
          end: { type: "string", description: "끝 시간 HH:MM. 없으면 빈 문자열" },
          place: { type: "string", description: "장소. 없으면 빈 문자열" },
          cat: { type: "string", enum: Object.keys(EV_CATS) },
          memo: { type: "string", description: "담당자, 대상 부서, 준비물 등 표에 함께 적힌 내용. 없으면 빈 문자열" }
        }
      }
    },
    notes: { type: "string", description: "읽기 어려웠던 부분이나 확인이 필요한 점을 한국어로 짧게. 없으면 빈 문자열" }
  }
};

ACT.importRun = async t => {
  if (importMode === "text" ? !importText.trim() : !importFiles.length) return;
  const year = Number($("#impYear").value) || new Date().getFullYear();
  const month = Number($("#impMonth").value) || 0;
  const hint = $("#impHint")?.value.trim() || "";
  t.disabled = true; t.textContent = importMode === "ai" ? "읽는 중… (30초~1분)" : "읽는 중…";
  const prog = document.createElement("p"); prog.className = "small muted"; prog.id = "impProg";
  prog.textContent = importMode === "ai" ? "Claude가 일정표를 읽고 있습니다. 화면을 닫지 말고 잠시 기다려 주세요." : "일정을 찾고 있습니다…";
  t.closest(".row").after(prog);
  try {
    let result;
    if (importMode === "ai") result = await extractEvents({ year, month, hint });
    else {
      const text = importMode === "text" ? importText : await ocrImages(msg => { const el = $("#impProg"); if (el) el.textContent = msg; });
      result = parseScheduleText(text, year, month);
    }
    importDraft = result.events
      .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .map(e => ({ ...e, time: /^\d{2}:\d{2}$/.test(e.time) ? e.time : "", end: /^\d{2}:\d{2}$/.test(e.end) ? e.end : "", cat: EV_CATS[e.cat] ? e.cat : catName("etc") }))
      .map(e => ({ ...e, dup: isDuplicate(e), on: true }))
      .map(e => ({ ...e, on: !e.dup }))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    reviewSheet(result.notes);
  } catch (err) {
    importSheet(errorMessage(err));
  }
};

async function extractEvents({ year, month, hint }) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true, maxRetries: 2 });
  const content = importFiles.map(f => f.kind === "pdf"
    ? { type: "document", source: { type: "base64", media_type: f.media_type, data: f.data } }
    : { type: "image", source: { type: "base64", media_type: f.media_type, data: f.data } });
  content.push({
    type: "text",
    text: `첨부한 교회 일정표에서 일정을 모두 찾아 주세요.
- 일정표의 연도: ${year}년${month ? `, 달: ${month}월 (표에 다른 달이 보이면 표를 따르세요)` : " (달은 표에서 판단하세요)"}
- 오늘 날짜: ${todayStr()}
${hint ? `- 사용자 요청: ${hint}\n` : ""}`
  });
  EVENT_SCHEMA.properties.events.items.properties.cat.enum = Object.keys(EV_CATS);
  const res = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: { type: "json_schema", schema: EVENT_SCHEMA } },
    system: `당신은 한국 교회의 주보, 월간 행사표, 달력 사진을 읽어 일정 목록으로 옮기는 도우미입니다.
규칙:
- 표에 날짜가 적힌 일정은 날짜마다 하나씩 따로 적습니다. 같은 모임이 여러 날짜에 있으면 날짜마다 각각 적습니다.
- "매주 수요일 수요예배"처럼 날짜 없이 반복만 적힌 일정은 해당 달 안의 모든 해당 요일 날짜로 펼쳐 적습니다.
- 시간은 24시간제로 바꿉니다 ("오후 7시 30분" → "19:30", "저녁 8시" → "20:00", "오전 10시 30분" → "10:30"). 오전/오후 표시가 없으면 교회 모임의 상식(예배·모임은 대개 오전 9시~오후 9시)에 맞게 판단합니다.
- 날짜 칸에 적힌 공휴일·절기 이름(예: 추수감사주일, 성탄절)도 일정으로 적고 종류는 "${catName("event")}"로 합니다.
- 종류(cat)는 목록 중 가장 가까운 것을 고르고, 맞는 것이 없으면 "${catName("etc")}"를 고릅니다.
- 글씨가 흐려서 확신할 수 없는 내용은 추측한 값을 넣고 notes에 무엇을 확인해야 하는지 적습니다.
- 사진에 없는 일정을 지어내지 않습니다.`,
    messages: [{ role: "user", content }]
  });
  if (res.stop_reason === "refusal") throw new Error("refusal");
  if (res.stop_reason === "max_tokens") throw new Error("too_long");
  const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("parse"); }
  if (!Array.isArray(data.events)) throw new Error("parse");
  return data;
}

function errorMessage(err) {
  const A = window.Anthropic;
  if (A && err instanceof A.AuthenticationError) return "API 키가 올바르지 않습니다. 'API 키 설정'에서 다시 입력해 주세요.";
  if (A && err instanceof A.PermissionDeniedError) return "이 API 키로는 사용할 수 없습니다. Anthropic 콘솔에서 키 권한과 결제 상태를 확인해 주세요.";
  if (A && err instanceof A.RateLimitError) return "요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.";
  if (A && err instanceof A.BadRequestError) return /credit|balance/i.test(err.message) ? "API 크레딧이 부족합니다. Anthropic 콘솔에서 결제 정보를 확인해 주세요." : "사진을 보낼 수 없었습니다. 다른 사진으로 시도해 주세요. (" + (err.message || "").slice(0, 120) + ")";
  if (A && err instanceof A.APIConnectionError) return "인터넷에 연결되어 있지 않거나 서버에 접속하지 못했습니다.";
  if (A && err instanceof A.APIError) return "일시적인 서버 오류입니다. 잠시 후 다시 시도해 주세요.";
  if (err.message === "ocr_load" && location.protocol === "file:") return "무료 사진 인식은 폴더에서 바로 연 앱에서는 동작하지 않습니다. 앱을 인터넷 주소(https://)로 올려서 쓰거나, '글자 붙여넣기'를 이용해 주세요.";
  if (err.message === "ocr_load") return "글자 인식 프로그램을 내려받지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. (한 번 받으면 다음부터는 인터넷 없이도 됩니다)";
  if (err.message === "ocr") return "사진의 글자를 읽지 못했습니다. 밝은 곳에서 일정표가 화면에 꽉 차게 다시 찍어 주세요.";
  if (err.message === "sdk") return "인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  if (err.message === "refusal") return "이 사진은 처리할 수 없습니다. 일정표가 잘 보이는 사진으로 다시 시도해 주세요.";
  if (err.message === "too_long") return "일정이 너무 많습니다. 사진을 나누어 한두 장씩 올려 주세요.";
  if (err.message === "parse") return "결과를 읽지 못했습니다. 다시 시도해 주세요.";
  return "알 수 없는 오류가 났습니다. 다시 시도해 주세요.";
}

// 이미 등록된 일정(반복 일정 포함)과 같은 날 같은 이름이거나, 같은 날 같은 시간·종류면 중복으로 봅니다
const normTitle = s => String(s || "").replace(/[\s·()\[\]-]/g, "").toLowerCase();
function isDuplicate(e) {
  return eventsOn(e.date).some(x => normTitle(x.title) === normTitle(e.title) ||
    normTitle(x.title).includes(normTitle(e.title)) && normTitle(e.title).length >= 2 ||
    (e.time && x.time === e.time && x.cat === e.cat));
}

// ───────── 3단계: 확인하고 등록 ─────────
function reviewSheet(notes) {
  const n = importDraft.length, dups = importDraft.filter(e => e.dup).length;
  if (!n) { importSheet(importMode === "ai" ? "사진에서 일정을 찾지 못했습니다. 일정표가 잘 보이게 다시 찍어 주세요." : "날짜가 있는 일정을 찾지 못했습니다. 날짜(예: 12/6, 12월 6일)와 시간이 함께 적혀 있는지 확인하거나, 다른 방법으로 시도해 주세요."); return; }
  openSheet(`${sheetHead(`일정 ${n}개를 찾았습니다`)}
    ${notes ? `<div class="card small">📝 ${esc(notes)}</div>` : ""}
    <p class="small muted" style="margin-top:0">등록할 일정을 체크하고, 틀린 내용은 바로 고치세요.${dups ? ` 이미 있는 일정과 겹치는 ${dups}개는 체크를 꺼 두었습니다.` : ""}</p>
    <div class="row wrap" style="margin-bottom:8px">
      <button class="btn sm" data-act="impAll" data-v="1">모두 선택</button>
      <button class="btn sm" data-act="impAll" data-v="0">모두 해제</button>
      <span class="spacer"></span>
      <label class="small row">알림 <select id="impRemind" style="width:auto;padding:5px 8px">${Object.entries(REMINDS).map(([k, v]) => `<option value="${k}" ${k === "60" ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    </div>
    <div id="impList">${importDraft.map((e, i) => draftRow(e, i)).join("")}</div>
    <div class="row" style="position:sticky;bottom:-20px;background:var(--bg);padding:12px 0 4px">
      <button class="btn" data-act="importStartOver">다시 찍기</button><span class="spacer"></span>
      <button class="btn primary" data-act="importSave" id="impSave">${importDraft.filter(e => e.on).length}개 등록</button>
    </div>`);
}
function draftRow(e, i) {
  return `<div class="draft ${e.on ? "" : "off"}" data-i="${i}">
    <input type="checkbox" ${e.on ? "checked" : ""} data-change="impToggle" data-i="${i}" aria-label="등록">
    <div class="draft-body">
      <input type="text" value="${esc(e.title)}" data-input="impEdit" data-i="${i}" data-k="title" aria-label="제목" class="draft-title">
      <div class="draft-meta">
        <input type="date" value="${e.date}" data-change="impEdit" data-i="${i}" data-k="date" aria-label="날짜">
        <input type="time" value="${e.time}" data-change="impEdit" data-i="${i}" data-k="time" aria-label="시간">
        <select data-change="impEdit" data-i="${i}" data-k="cat" aria-label="종류">${Object.keys(EV_CATS).map(c => `<option ${c === e.cat ? "selected" : ""}>${c}</option>`).join("")}</select>
      </div>
      ${e.place || e.memo || e.dup ? `<div class="small muted">${e.dup ? `<span class="badge warn">이미 있음</span> ` : ""}${e.place ? "📍" + esc(e.place) + " " : ""}${e.memo ? esc(e.memo) : ""}</div>` : ""}
    </div></div>`;
}
const impCount = () => { const b = $("#impSave"); if (b) { const n = importDraft.filter(e => e.on).length; b.textContent = `${n}개 등록`; b.disabled = !n; } };
ACT.impToggle = t => { const e = importDraft[Number(t.dataset.i)]; e.on = t.checked; t.closest(".draft").classList.toggle("off", !e.on); impCount(); };
ACT.impEdit = t => { importDraft[Number(t.dataset.i)][t.dataset.k] = t.value; };
ACT.impAll = t => { importDraft.forEach(e => e.on = t.dataset.v === "1"); $("#impList").innerHTML = importDraft.map(draftRow).join(""); impCount(); };
ACT.importStartOver = () => importSheet();
ACT.importSave = () => {
  const chosen = importDraft.filter(e => e.on && e.title.trim() && e.date);
  if (!chosen.length) return;
  const remind = Number($("#impRemind").value);
  const list = store.get("events", []);
  chosen.forEach(e => list.push({ id: uid(), skip: [], title: e.title.trim(), date: e.date, time: e.time, end: e.end, cat: e.cat, repeat: "none", until: "", remind: e.time ? remind : -1, place: e.place, memo: e.memo, source: "photo" }));
  store.set("events", list);
  importFiles = []; importDraft = []; importText = "";
  S.calSel = chosen[0].date; S.calMonth = chosen[0].date.slice(0, 7);
  closeSheet(); render(); toast(`일정 ${chosen.length}개를 등록했습니다 📅`);
  if (remind >= 0 && "Notification" in window && Notification.permission === "default") askNotify();
};

// ───────── API 키 설정 ─────────
ACT.apiKeyOpen = () => apiKeySheet(false);
function apiKeySheet(thenImport) {
  const has = !!getApiKey();
  openSheet(`${sheetHead("사진 인식 설정")}
    <p>'AI 정밀 인식'은 Anthropic의 Claude AI를 사용합니다. 처음 한 번 <b>API 키</b>를 넣어 주세요. 돈이 들지 않는 '사진 · 무료'나 '글자 붙여넣기'를 쓰면 키가 필요 없습니다.</p>
    <ol class="small" style="padding-left:18px;margin:0 0 12px">
      <li><b>console.anthropic.com</b>에 가입하고 결제 수단을 등록합니다.</li>
      <li>API Keys 메뉴에서 키를 만들어 복사합니다 (sk-ant-로 시작).</li>
      <li>아래에 붙여 넣고 저장합니다.</li>
    </ol>
    <label class="field"><span>API 키</span><input type="password" id="apiKeyIn" placeholder="${has ? "저장됨 (바꾸려면 새 키 입력)" : "sk-ant-..."}" autocomplete="off"></label>
    <p class="small muted">사진 한 장을 읽을 때마다 약 100원 안팎의 사용료가 Anthropic 계정에 청구됩니다. 키는 이 기기에만 저장되고 백업 파일에도 들어가지 않으며, 사진과 함께 Anthropic 서버로만 전송됩니다.</p>
    <div class="row"><button class="btn primary" data-act="apiKeySave" data-next="${thenImport ? 1 : 0}">저장</button>
      ${has ? `<button class="btn danger" data-act="apiKeyDel">키 삭제</button>` : ""}<span class="spacer"></span>
      <button class="btn" data-act="importMode" data-m="ocr">무료 방법으로</button></div>`);
}
ACT.apiKeySave = t => {
  const v = $("#apiKeyIn").value.trim();
  if (!v) { toast("API 키를 입력해 주세요"); return; }
  if (!/^sk-ant-/.test(v)) { toast("API 키는 sk-ant- 로 시작합니다"); return; }
  store.set("apiKey", v); toast("API 키를 저장했습니다");
  importMode = "ai"; store.set("importMode", "ai"); importSheet();
};
ACT.apiKeyDel = async () => { if (await askConfirm("저장된 API 키를 삭제할까요?", "삭제")) { store.set("apiKey", ""); toast("삭제했습니다"); } };

/* ============================================================
   무료 방법: 기기 안에서 글자 인식(Tesseract) + 일정 글자 해석
   ============================================================ */
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return loadTesseract._p || (loadTesseract._p = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "js/vendor/tesseract/tesseract.min.js";
    s.onload = () => res(window.Tesseract);
    s.onerror = () => { loadTesseract._p = null; rej(new Error("ocr_load")); };
    document.head.appendChild(s);
  }));
}
// 작은 글씨도 읽히도록 2배 가까이 키우고 흑백으로 바꿉니다
async function ocrCanvas(dataUrl) {
  const im = new Image(); im.src = dataUrl; await im.decode();
  const scale = Math.max(1, Math.min(2, 2400 / Math.max(im.naturalWidth, im.naturalHeight)));
  const c = document.createElement("canvas");
  c.width = Math.round(im.naturalWidth * scale); c.height = Math.round(im.naturalHeight * scale);
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(im, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const g = .299 * a[i] + .587 * a[i + 1] + .114 * a[i + 2]; a[i] = a[i + 1] = a[i + 2] = g; }
  x.putImageData(d, 0, 0);
  return c;
}
async function ocrImages(progress) {
  let T;
  try { T = await loadTesseract(); } catch { throw new Error("ocr_load"); }
  const base = new URL("js/vendor/tesseract/", location.href).href;
  let worker;
  try {
    progress("글자 인식 준비 중… (처음 한 번은 1분 정도 걸릴 수 있습니다)");
    worker = await T.createWorker("kor", 1, {
      workerPath: base + "worker.min.js", corePath: base + "core", langPath: base + "lang", gzip: true,
      logger: m => { if (m.status === "recognizing text") progress(`글자 읽는 중… ${Math.round(m.progress * 100)}%`); }
    });
  } catch { throw new Error("ocr_load"); }
  try {
    // psm 4: 한 줄씩 읽기 (표의 한 행이 한 줄로 이어져서 날짜·시간·제목이 함께 나옵니다)
    await worker.setParameters({ tessedit_pageseg_mode: "4", preserve_interword_spaces: "1" });
    let text = "";
    for (let i = 0; i < importFiles.length; i++) {
      progress(`사진 ${i + 1}/${importFiles.length} 글자 읽는 중…`);
      const r = await worker.recognize(await ocrCanvas(importFiles[i].preview));
      text += r.data.text + "\n";
    }
    if (!text.trim()) throw new Error("ocr");
    return text;
  } catch (e) { throw e.message === "ocr" ? e : new Error("ocr"); }
  finally { worker.terminate(); }
}

// ── 일정 글자 해석: "12/6(주일) 오후 2시 3구역 구역예배 (김성도님 댁)" → 일정
const WD = { "일": 0, "주일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6 };
// 제목 낱말로 종류 짐작 → 종류 id (이름은 사용자가 바꿀 수 있으므로 id로 찾음)
const CAT_RULES = [
  [/교사/, "teacher"], [/금요/, "friday"], [/수요/, "wednesday"], [/주일.*(예배|말씀)|주일\s*(낮|오전|오후|대)?\s*예배|대예배/, "sunday"],
  [/구역|목장|속회|셀\b|순모임|소그룹/, "cell"], [/찬양대|성가대|찬양|성가|연습|리허설/, "choir"],
  [/봉사|청소|주차|식당|애찬|안내/, "serve"],
  [/성탄|부활|추수|감사절|맥추|수련회|바자|체육|행사|기념|세례|성찬|임직|헌당|축제|캠프|발표회/, "event"]
];
// 사용자가 직접 만든 종류는 이름이 제목에 들어 있으면 그 종류로
const guessCat = t => {
  const own = evCatList.find(c => !DEFAULT_EV_CATS.some(d => d.id === c.id) && t.includes(c.name));
  if (own) return own.name;
  return catName((CAT_RULES.find(([re]) => re.test(t)) || [0, "etc"])[1]);
};
const PLACE_HINT = /님|댁|집|실|당|관|홀|교회|센터|카페|층|호|교육관|비전|체육|공원|식당|가정/;

function parseTime(str) {
  // 반환: {time, end, rest}
  // 분은 "30분"처럼 '분'이 붙거나 "7:30"처럼 쌍점으로 쓴 경우만 (그래야 "8시 21구역"을 8:21로 읽지 않음)
  const re = /(오전|오후|저녁|밤|새벽|아침|낮|AM|PM|am|pm)?\s*(\d{1,2})\s*(?:시\s*반|시\s*(\d{1,2})\s*분|[:;]\s*(\d{2})|시)/;
  const re3 = /(오전|오후|저녁|밤|새벽|아침|낮)\s*(\d)(\d{2})(?!\d)/; // OCR이 "7:30"을 "730"으로 읽은 경우
  const toHM = (mer, h, mm, ctx) => {
    h = Number(h); mm = Number(mm || 0);
    if (h > 24 || mm > 59) return null;
    if (/오후|저녁|밤|pm|PM/.test(mer || "") && h < 12) h += 12;
    else if (/낮/.test(mer || "") && h < 6) h += 12;
    else if (!mer && !/새벽|아침|오전/.test(ctx) && (h >= 1 && h <= 6 || h === 7 || h === 8)) h += 12; // 표시 없는 1~8시는 대개 오후
    if (h === 24) h = 0;
    return `${pad(h)}:${pad(mm)}`;
  };
  let rest = str, time = "", end = "";
  const m3 = rest.match(re3);
  let m = m3 || rest.match(re);
  if (m) {
    const isHalf = /시\s*반/.test(m[0]);
    time = (m === m3 ? toHM(m[1], m[2], m[3], str) : toHM(m[1], m[2], isHalf ? 30 : (m[3] || m[4]), str)) || "";
    const after = rest.slice(m.index + m[0].length);
    rest = rest.slice(0, m.index) + " " + after;
    // 끝 시간: 시작 시간 바로 뒤의 "~ 9시", "- 21:00"
    const em = after.match(/^\s*[~\-–]\s*(오전|오후|저녁|밤)?\s*(\d{1,2})\s*(?:시\s*(\d{1,2})\s*분|[:;]\s*(\d{2})|시)/);
    if (em) {
      let e = toHM(em[1] || m[1], em[2], em[3] || em[4], str);
      if (e && e <= time && Number(e.slice(0, 2)) < 12) e = `${pad(Number(e.slice(0, 2)) + 12)}:${e.slice(3)}`;
      end = e || ""; rest = rest.replace(em[0], " ");
    }
  }
  return { time, end, rest };
}

function datesInMonth(year, month, wd) {
  const out = [];
  for (let d = 1; d <= 31; d++) { const dt = new Date(year, month - 1, d); if (dt.getMonth() !== month - 1) break; if (dt.getDay() === wd) out.push(ymd(dt)); }
  return out;
}

function parseScheduleText(raw, year, month) {
  const lines = raw.replace(/[｜|ㅣ│]/g, " ").replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/[：]/g, ":").replace(/[~～〜]/g, "~")
    .split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const events = [], unsure = [];
  let pending = null; // 날짜·시간은 있는데 제목이 다음 줄에 있는 경우
  const ymdOf = (mo, d) => {
    let y = year;
    if (month && mo === 1 && month === 12) y++;          // 12월 표에 1월 일정
    if (month && mo === 12 && month === 1) y--;
    const dt = new Date(y, mo - 1, d);
    return dt.getMonth() === mo - 1 ? ymd(dt) : null;
  };
  const finish = (dates, info, title) => {
    title = title.replace(/^[\s.,:;·\-–~*•ㆍ)\/]+|[\s.,:;·\-–~*•ㆍ(\/]+$/g, "").replace(/\s{2,}/g, " ").trim();
    if (!title || title.length < 2 || /^\d+$/.test(title)) return false;
    for (const date of dates) events.push({ title, date, time: info.time, end: info.end, place: info.place, cat: guessCat(title), memo: "" });
    return true;
  };
  for (const line0 of lines) {
    let line = line0.replace(/^\s*(?:\d{1,2}[.)]|[-*•ㆍ·▶►○●◎□■]|\(\d{1,2}\))\s+(?=\S)/, ""), dates = [];
    // 1) 매주 ○요일 → 그 달의 해당 요일 모두
    let m = line.match(/매\s*주\s*(주일|[월화수목금토일])\s*(?:요일)?/);
    if (m && month) { dates = datesInMonth(year, month, WD[m[1]]); line = line.replace(m[0], " "); }
    // 2) 12월 6일 / 12/6 / 12.6 (뒤 요일 표시는 지움)
    if (!dates.length) {
      m = line.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || line.match(/(?:^|[^\d:])(\d{1,2})(?:\s*\/\s*|\.)(\d{1,2})(?![\d:])/);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) { const d = ymdOf(Number(m[1]), Number(m[2])); if (d) { dates = [d]; line = line.replace(m[0], " "); } }
    }
    // OCR이 "/"를 7, 1, l 등으로 잘못 읽은 경우 ("12724(목)") → 뒤의 요일과 맞을 때만 인정
    if (!dates.length) {
      m = line.match(/(?:^|\s)(1[0-2]|[1-9])[71lI|](\d{1,2})\s*\((주일|[월화수목금토일])\)/);
      if (m) { const d = ymdOf(Number(m[1]), Number(m[2])); if (d && parseYMD(d).getDay() === WD[m[3]]) { dates = [d]; line = line.replace(m[0], " "); } }
    }
    // 3) 줄 맨 앞의 "6일", "6(주일)" → 일정표의 달
    if (!dates.length && month) {
      m = line.match(/^(\d{1,2})\s*(?:일\s*(?:\((?:주일|[월화수목금토일])\))?|\((?:주일|[월화수목금토일])\))/);
      if (m) { const d = ymdOf(month, Number(m[1])); if (d) { dates = [d]; line = line.replace(m[0], " "); } }
    }
    if (dates.length) line = line.replace(/^\s*\(?(주일|[월화수목금토일])(요일)?\)?(?=\s|$)/, " ");
    line = line.replace(/\(\s*(주일|[월화수목금토일])(요일)?\s*\)|(^|\s)(주일|[월화수목금토일])요일(?=\s|$)/g, " ");
    // 시간
    const tm = parseTime(line);
    line = tm.rest;
    // 장소: (김성도님 댁) / 장소: 본당
    let place = "";
    const pm = line.match(/장소\s*[:：]?\s*([^,/]+)$/) || line.match(/\(([^)]{1,20})\)/);
    if (pm && (pm[0].startsWith("장소") || PLACE_HINT.test(pm[1]))) { place = pm[1].replace(/[()]/g, "").trim(); line = line.replace(pm[0], " "); }
    line = line.replace(/\(\s*\)/g, " ");
    const info = { time: tm.time, end: tm.end, place };
    if (dates.length) {
      if (!finish(dates, info, line)) pending = { dates, info };
      else pending = null;
    } else if (pending) {
      const inf = { time: pending.info.time || info.time, end: pending.info.end || info.end, place: pending.info.place || info.place };
      if (finish(pending.dates, inf, line)) pending = null;
      else if (info.time) pending.info = inf;
    } else if (/\d/.test(line0) && line0.length > 4) unsure.push(line0);
  }
  // 같은 날 같은 제목 중복 제거
  const seen = new Set();
  const out = events.filter(e => { const k = e.date + normTitle(e.title) + e.time; if (seen.has(k)) return false; seen.add(k); return true; });
  const notes = [
    out.some(e => !e.time) ? "시간을 찾지 못한 일정이 있습니다. 시간을 넣어 주세요." : "",
    unsure.length ? `날짜를 알 수 없어 건너뛴 줄: ${unsure.slice(0, 3).map(s => `"${s.slice(0, 30)}"`).join(", ")}${unsure.length > 3 ? ` 외 ${unsure.length - 3}줄` : ""}` : ""
  ].filter(Boolean).join(" ");
  return { events: out, notes };
}
