"use strict";
// 선 아이콘 (24×24, 둥근 선) — 모든 버튼·메뉴에서 공통으로 사용
const ICON_PATHS = {
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M12 7v6M9 10h6"/>',
  check: '<rect x="3" y="4" width="18" height="17" rx="4"/><path d="M8 2v4M16 2v4M8 13l3 3 5-6"/>',
  dict: '<circle cx="10.4" cy="10.4" r="8.2"/><path d="M16.4 16.4l5.4 5.4"/><text x="10.4" y="14" text-anchor="middle" font-size="10" font-weight="800" fill="currentColor" stroke="none" font-family="Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif">가</text>',
  // 기도하는 손: Phosphor Icons 'hands-praying' (bold), MIT License, Copyright (c) 2023 Phosphor Icons
  hands: '<svg viewBox="0 0 256 256" x="1.8" y="1.6" width="20.4" height="20.4" fill="currentColor" stroke="none"><path d="M238.15,177.18l-35.53-35.53L166.45,22.3A25.75,25.75,0,0,0,128,8,25.75,25.75,0,0,0,89.55,22.3L53.38,141.65,17.85,177.18a20,20,0,0,0,0,28.28l32.69,32.69a20,20,0,0,0,28.28,0l48.29-48.28c.31-.31.6-.62.89-.94.29.32.58.63.89.94l48.29,48.28a20,20,0,0,0,28.28,0l32.69-32.69A20,20,0,0,0,238.15,177.18ZM64.68,218.35l-27-27,11-11,27,27ZM116,158.75a19.85,19.85,0,0,1-5.86,14.14L92.68,190.35l-27-27,6.83-6.83a11.94,11.94,0,0,0,3-5l37-122.23a1.78,1.78,0,0,1,3.48.52Zm47.5,31.78-17.64-17.64A19.85,19.85,0,0,1,140,158.75v-129a1.78,1.78,0,0,1,3.48-.52l37,122.23a11.94,11.94,0,0,0,3,5l7.6,7.6Zm27.82,27.82-10.85-10.84,27.63-26.44,10.25,10.25Z"/></svg>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="4"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><circle cx="8" cy="14.5" r=".6" fill="currentColor"/><circle cx="12" cy="14.5" r=".6" fill="currentColor"/><circle cx="16" cy="14.5" r=".6" fill="currentColor"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6.5-4.5-10-1 2.5-2 3.5-3.5 4.5C9.5 7 9 5.5 9 4c-3 2.5-4 6-4 11a7 7 0 0 0 7 7z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  play: '<rect x="2.5" y="5" width="19" height="14" rx="4.2"/><path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor"/>',
  clip: '<rect x="6.2" y="2.5" width="11.6" height="19" rx="3.2"/><path d="M10.4 9.3v5.4l4.4-2.7z" fill="currentColor"/>',
  pen: '<path d="M4 20h4.2L19.3 8.9a2.9 2.9 0 0 0-4.2-4.2L4 15.8z"/><path d="M13.6 6.3l4.1 4.1M12 20h8"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'
};
const ICON = (name, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(el => { if (!el.firstChild) el.innerHTML = ICON(el.dataset.icon, Number(el.dataset.size) || 20); });
}

// 마스코트 "말씀이" — 성경책을 든 아기 양 (단순한 평면 스타일, 밝은 배경에서도 보이도록 바깥선 포함)
const MASCOT = (size = 120) => `<svg width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true" class="mascot"><ellipse cx="60" cy="116.5" rx="28" ry="3.5" fill="#000" opacity=".10"/><g fill="#ead7c4" stroke="#ead7c4" stroke-width="5"><circle cx="60" cy="94" r="23"/><circle cx="41" cy="97" r="11"/><circle cx="79" cy="97" r="11"/><circle cx="60" cy="50" r="33"/><circle cx="37" cy="33" r="12"/><circle cx="48" cy="23" r="13"/><circle cx="60" cy="20" r="13.5"/><circle cx="72" cy="23" r="13"/><circle cx="83" cy="33" r="12"/><circle cx="89" cy="47" r="11"/><circle cx="31" cy="47" r="11"/></g><ellipse cx="21" cy="51" rx="12" ry="7" fill="#f6dccb" transform="rotate(-24 21 51)"/><ellipse cx="99" cy="51" rx="12" ry="7" fill="#f6dccb" transform="rotate(24 99 51)"/><ellipse cx="19" cy="51" rx="7" ry="3.6" fill="#f2b3a1" transform="rotate(-24 19 51)"/><ellipse cx="101" cy="51" rx="7" ry="3.6" fill="#f2b3a1" transform="rotate(24 101 51)"/><g fill="#fffaf2"><circle cx="60" cy="94" r="23"/><circle cx="41" cy="97" r="11"/><circle cx="79" cy="97" r="11"/><circle cx="60" cy="50" r="33"/><circle cx="37" cy="33" r="12"/><circle cx="48" cy="23" r="13"/><circle cx="60" cy="20" r="13.5"/><circle cx="72" cy="23" r="13"/><circle cx="83" cy="33" r="12"/><circle cx="89" cy="47" r="11"/><circle cx="31" cy="47" r="11"/></g><ellipse cx="60" cy="57" rx="23" ry="20" fill="#f6dccb"/><g fill="#fffaf2"><circle cx="51" cy="39.5" r="7"/><circle cx="60" cy="37" r="7.5"/><circle cx="69" cy="39.5" r="7"/></g><g fill="#4a3129"><ellipse cx="50.5" cy="56.5" rx="4.2" ry="4.8"/><ellipse cx="69.5" cy="56.5" rx="4.2" ry="4.8"/></g><g fill="#fff"><circle cx="52" cy="54.6" r="1.6"/><circle cx="71" cy="54.6" r="1.6"/></g><g fill="#f39a84" opacity=".75"><ellipse cx="43.5" cy="64" rx="4.3" ry="2.7"/><ellipse cx="76.5" cy="64" rx="4.3" ry="2.7"/></g><path d="M56.2 64.2q1.9 2.4 3.8 0q1.9 2.4 3.8 0" stroke="#4a3129" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="40" y="78" width="40" height="27" rx="5" fill="#5a8569"/><rect x="40" y="76" width="40" height="26" rx="5" fill="#6f9b80"/><path d="M60 82.5v14M54 87.5h12" stroke="#fff4e6" stroke-width="3.2" stroke-linecap="round"/><g fill="#fffaf2"><circle cx="41" cy="83" r="6.5"/><circle cx="79" cy="83" r="6.5"/></g></svg>`;
