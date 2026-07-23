/* 단국대 의대 26학번 — 공통 스크립트 */

function ensureFeedbackRoot() {
  let root = document.querySelector("#dkuToastRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "dkuToastRoot";
    root.className = "dku-toast-root";
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-atomic", "false");
    document.body.appendChild(root);
  }
  return root;
}

function feedbackType(message) {
  const text = String(message || "");
  if (/실패|오류|못했|할 수 없|않습니다|없습니다|필요합니다|빠를 수|선택해 주세요|입력해 주세요|설정되지/.test(text)) return "error";
  if (/완료|성공|보냈|올렸|저장했|삭제했|투표했|수정했|변경되|등록했|추가했/.test(text)) return "success";
  return "info";
}

window.dkuToast = function dkuToast(message, options = {}) {
  const type = options.type || feedbackType(message);
  const toast = document.createElement("div");
  toast.className = `dku-toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  const icon = type === "success" ? "✓" : (type === "error" ? "!" : "i");
  toast.innerHTML = `<span class="dku-toast-icon" aria-hidden="true">${icon}</span><p></p><div class="dku-toast-actions"></div>`;
  toast.querySelector("p").textContent = String(message || "");
  const actions = toast.querySelector(".dku-toast-actions");
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 180);
  };

  if (type === "error" && options.retry !== false) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = options.retryLabel || "다시 시도";
    retry.addEventListener("click", () => {
      dismiss();
      if (typeof options.onRetry === "function") options.onRetry();
      else location.reload();
    });
    actions.appendChild(retry);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "dku-toast-close";
  close.setAttribute("aria-label", "알림 닫기");
  close.textContent = "×";
  close.addEventListener("click", dismiss);
  actions.appendChild(close);
  ensureFeedbackRoot().appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  const duration = options.duration ?? (type === "error" ? 7000 : 3600);
  if (duration > 0) setTimeout(dismiss, duration);
  return toast;
};

let dkuConfirmSequence = 0;

window.dkuConfirm = function dkuConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    const titleId = `dkuConfirmTitle${++dkuConfirmSequence}`;
    overlay.className = "dku-confirm-overlay";
    overlay.innerHTML = `<div class="dku-confirm" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <span class="dku-confirm-icon" aria-hidden="true">${options.danger ? "!" : "?"}</span>
      <div><h2 id="${titleId}"></h2><p></p></div>
      <div class="dku-confirm-actions"><button type="button" class="cancel">${options.cancelText || "취소"}</button><button type="button" class="confirm">${options.confirmText || "확인"}</button></div>
    </div>`;
    overlay.querySelector("h2").textContent = options.title || (options.danger ? "삭제 확인" : "확인");
    overlay.querySelector("p").textContent = String(message || "");
    const confirmButton = overlay.querySelector(".confirm");
    if (options.danger) confirmButton.classList.add("danger");

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 160);
      previousFocus?.focus?.();
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
      if (event.key === "Enter" && document.activeElement === confirmButton) finish(true);
    };
    overlay.querySelector(".cancel").addEventListener("click", () => finish(false));
    confirmButton.addEventListener("click", () => finish(true));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) finish(false); });
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));
    confirmButton.focus();
  });
};

window.alert = function styledAlert(message) {
  window.dkuToast(message);
};

const DKU_LINE_ICONS = {
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.1c2.7 0 4.9-2.2 4.9-4.9C22 5.9 17.5 2 12 2Z"/>',
  sparkles: '<path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2L12 3Z"/><path d="m19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8L19 14Z"/><path d="m5 13-.7 1.8-1.8.7 1.8.7L5 18l.7-1.8 1.8-.7-1.8-.7L5 13Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1.1.9-1.1 1.8"/><path d="M12 17h.01"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z"/><path d="M8 7h8M8 11h7"/>',
  pin: '<path d="M12 17v5"/><path d="M5 17h14"/><path d="m7 17 1-7-3-3V5h14v2l-3 3 1 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L20 16.4a2.1 2.1 0 0 1-3 3l-7.7-7.7"/><path d="m5 13-3 3 6 6 3-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M15 8l3 3M17 6l2 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/>',
  life: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m5.6 5.6 4.3 4.3M14.1 14.1l4.3 4.3M18.4 5.6l-4.3 4.3M9.9 14.1l-4.3 4.3"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/><circle cx="12" cy="12" r="2"/>',
  ladder: '<path d="M7 3 5 21M17 3l2 18M6.4 8h11.2M5.8 13h12.4M5.3 18h13.4"/>',
  vote: '<path d="M6 3h12l2 5-8 5-8-5 2-5Z"/><path d="M4 8v12h16V8M8 16h8"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 10v7M14 10v7"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>',
  megaphone: '<path d="m3 11 15-6v14L3 13v-2Z"/><path d="M11.6 16.4 10 22H6l1.2-7"/><path d="M21 9v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
};

window.dkuIcon = function dkuIcon(name, className = "") {
  const paths = DKU_LINE_ICONS[name] || DKU_LINE_ICONS.help;
  return `<svg class="ui-line-icon${className ? ` ${className}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
};

window.dkuHydrateIcons = function dkuHydrateIcons(root = document) {
  root.querySelectorAll?.("[data-icon]").forEach((element) => {
    if (element.dataset.iconReady === "true") return;
    element.innerHTML = window.dkuIcon(element.dataset.icon);
    element.dataset.iconReady = "true";
  });
};

window.dkuHydrateIcons();

const BANNER_COLOR_KEY = "dkuBannerColor";
const DEFAULT_BANNER_COLOR = "#6fa8d6";
const storageGet = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const storageSet = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const LEGACY_BANNER_COLORS = {
  navy: "#003b78", purple: "#62378f", green: "#146a55",
  burgundy: "#7b263e", orange: "#a95620", charcoal: DEFAULT_BANNER_COLOR,
};

function bannerRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function bannerMix(rgb, target, amount) {
  return rgb.map((value, index) => Math.round(value + (target[index] - value) * amount));
}

function bannerHex(rgb) {
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function applyBannerColor(hex) {
  const base = bannerRgb(hex) || bannerRgb(DEFAULT_BANNER_COLOR);
  const root = document.documentElement.style;
  root.setProperty("--banner-start", bannerHex(bannerMix(base, [0, 0, 0], .42)));
  root.setProperty("--banner-end", bannerHex(bannerMix(base, [0, 0, 0], .10)));
  root.setProperty("--hero-a", bannerMix(base, [0, 0, 0], .48).join(", "));
  root.setProperty("--hero-b", bannerMix(base, [0, 0, 0], .20).join(", "));
  root.setProperty("--hero-c", bannerMix(base, [0, 0, 0], .06).join(", "));
}
window.applyBannerColor = applyBannerColor;

const legacyBannerColor = LEGACY_BANNER_COLORS[storageGet("dkuBannerTheme")];
const storedBannerColor = storageGet(BANNER_COLOR_KEY);
const savedBannerColor = !storedBannerColor || storedBannerColor === "#334150"
  ? DEFAULT_BANNER_COLOR
  : (storedBannerColor || legacyBannerColor || DEFAULT_BANNER_COLOR);
if (storedBannerColor !== savedBannerColor) storageSet(BANNER_COLOR_KEY, savedBannerColor);
applyBannerColor(savedBannerColor);

const MASCOT_DISPLAY_KEY = "dkuMascotDisplay";
let mascotModulePromise = null;

function mountHeaderMascots() {
  if (!document.querySelector(".site-header")) return;
  if (!mascotModulePromise) {
    mascotModulePromise = import(new URL("assets/js/danwoong-walk.js?v=48", document.baseURI).href);
  }
  mascotModulePromise
    .then(({ mountDanwoongWalk }) => mountDanwoongWalk())
    .catch((error) => console.warn("단웅이 애니메이션을 불러오지 못했습니다.", error));
}

function applyMascotDisplay(enabled, save = false) {
  const visible = enabled !== false;
  if (save) storageSet(MASCOT_DISPLAY_KEY, String(visible));
  document.documentElement.dataset.mascots = visible ? "show" : "hide";
  window.dispatchEvent(new CustomEvent("dkuMascotVisibility", { detail: { visible, restart: visible } }));
  if (visible) mountHeaderMascots();
}

window.setMascotDisplay = (enabled) => applyMascotDisplay(Boolean(enabled), true);
const savedMascotDisplay = storageGet(MASCOT_DISPLAY_KEY) !== "false";
document.documentElement.dataset.mascots = savedMascotDisplay ? "show" : "hide";

document.addEventListener("DOMContentLoaded", () => {
  /* 모바일 메뉴 토글 */
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.querySelector(".nav-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", () => menu.classList.toggle("open"));
  }

  /* 현재 페이지 네비 active 표시 */
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-menu a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === path) a.classList.add("active");
  });

  /* 학사일정 학기 탭 */
  const tabs = document.querySelectorAll(".term-tabs button");
  if (tabs.length) {
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const term = btn.dataset.term;
        document.querySelectorAll("[data-term-panel]").forEach((panel) => {
          panel.style.display =
            panel.dataset.termPanel === term ? "block" : "none";
        });
      });
    });
  }

  /* 갤러리 라이트박스 */
  const lb = document.querySelector(".lightbox");
  if (lb) {
    const lbImg = lb.querySelector("img");
    document.querySelectorAll(".gallery-grid img").forEach((img) => {
      img.addEventListener("click", () => {
        lbImg.src = img.src;
        lb.classList.add("open");
      });
    });
    const close = () => lb.classList.remove("open");
    lb.querySelector(".close").addEventListener("click", close);
    lb.addEventListener("click", (e) => {
      if (e.target === lb) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  /* 동기 명단 검색은 members.js(Firestore 연동)에서 처리합니다. */

  /* 상단 헤더의 단웅이 3D 걷기 애니메이션 */
  if (savedMascotDisplay) mountHeaderMascots();

  /* 모바일: 화면 최상단에서 아래로 당겨 새로고침 */
  installPullToRefresh();
});

function installPullToRefresh() {
  const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  if (!isTouchDevice || !document.body) return;

  const indicator = document.createElement("div");
  indicator.className = "pull-refresh-indicator";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-label", "Refresh");
  indicator.innerHTML = `
    <span class="pull-refresh-icon" aria-hidden="true">
      <span class="pull-refresh-paw"></span>
    </span>`;
  document.body.appendChild(indicator);
  document.documentElement.classList.add("pull-refresh-enabled");

  const threshold = 110;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let pulling = false;
  let ready = false;
  let refreshing = false;

  const setPull = (rawDistance) => {
    const progress = Math.min(1, rawDistance / threshold);
    const visualDistance = Math.min(88, rawDistance * .68);
    indicator.style.setProperty("--pull-distance", `${visualDistance}px`);
    indicator.style.setProperty("--pull-progress", String(progress));
    indicator.style.setProperty("--pull-border-alpha", String(progress * .24));
    indicator.style.setProperty("--pull-fill-inset", `${100 - progress * 100}%`);
    indicator.style.setProperty("--pull-scale", String(.94 + progress * .06));
    indicator.style.setProperty("--pull-opacity", String(Math.min(1, progress * 1.7)));
    indicator.classList.add("active");
    const nextReady = rawDistance >= threshold;
    if (nextReady !== ready) {
      ready = nextReady;
      indicator.classList.toggle("ready", ready);
      if (ready && navigator.vibrate) navigator.vibrate(12);
    }
  };

  const reset = () => {
    tracking = false;
    pulling = false;
    ready = false;
    indicator.classList.remove("active", "ready");
    indicator.style.setProperty("--pull-distance", "0px");
    indicator.style.setProperty("--pull-progress", "0");
    indicator.style.setProperty("--pull-border-alpha", "0");
    indicator.style.setProperty("--pull-fill-inset", "100%");
    indicator.style.setProperty("--pull-scale", ".94");
    indicator.style.setProperty("--pull-opacity", "0");
  };

  document.addEventListener("touchstart", (event) => {
    if (refreshing || event.touches.length !== 1 || window.scrollY > 0) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
    pulling = false;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!tracking || refreshing || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
      if (pulling) reset();
      return;
    }
    if (window.scrollY > 0) {
      reset();
      return;
    }
    if (deltaY < 7) return;

    event.preventDefault();
    pulling = true;
    setPull(deltaY);
  }, { passive: false });

  const finish = () => {
    if (!tracking || refreshing) return;
    if (!pulling || !ready) {
      reset();
      return;
    }
    refreshing = true;
    tracking = false;
    indicator.classList.add("loading");
    indicator.style.setProperty("--pull-distance", "76px");
    indicator.style.setProperty("--pull-scale", "1");
    indicator.style.setProperty("--pull-opacity", "1");
    indicator.style.setProperty("--pull-fill-inset", "0%");
    if (navigator.vibrate) navigator.vibrate(20);
    window.setTimeout(() => window.location.reload(), 280);
  };

  document.addEventListener("touchend", finish, { passive: true });
  document.addEventListener("touchcancel", () => {
    if (!refreshing) reset();
  }, { passive: true });
}

/* 설치형 웹앱(PWA) 등록 */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(new URL("service-worker.js", document.baseURI))
      .catch((error) => console.warn("앱 설치 기능을 준비하지 못했습니다.", error));
  });
}
