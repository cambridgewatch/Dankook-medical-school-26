/* 단국대 의대 26학번 — 공통 스크립트 */

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
    mascotModulePromise = import(new URL("assets/js/danwoong-walk.js?v=34", document.baseURI).href);
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
  indicator.setAttribute("aria-live", "polite");
  indicator.innerHTML = `
    <span class="pull-refresh-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 4v13m0 0 5-5m-5 5-5-5" />
      </svg>
    </span>
    <span class="pull-refresh-copy">
      <strong class="pull-refresh-text">당겨서 새로고침</strong>
      <small class="pull-refresh-hint">최신 내용을 확인해 보세요</small>
    </span>`;
  document.body.appendChild(indicator);
  document.documentElement.classList.add("pull-refresh-enabled");

  const text = indicator.querySelector(".pull-refresh-text");
  const hint = indicator.querySelector(".pull-refresh-hint");
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
    indicator.classList.add("active");
    const nextReady = rawDistance >= threshold;
    if (!nextReady && !ready) hint.textContent = "조금 더 아래로 당겨주세요";
    if (nextReady !== ready) {
      ready = nextReady;
      indicator.classList.toggle("ready", ready);
      text.textContent = ready ? "놓아서 새로고침" : "당겨서 새로고침";
      hint.textContent = ready ? "손을 놓으면 바로 갱신돼요" : "조금 더 아래로 당겨주세요";
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
    text.textContent = "당겨서 새로고침";
    hint.textContent = "최신 내용을 확인해 보세요";
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
    text.textContent = "새로고침 중…";
    hint.textContent = "최신 내용을 불러오고 있어요";
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
