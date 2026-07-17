/* 단국대 의대 26학번 — 공통 스크립트 */

const BANNER_COLOR_KEY = "dkuBannerColor";
const DEFAULT_BANNER_COLOR = "#6fa8d6";
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

const legacyBannerColor = LEGACY_BANNER_COLORS[localStorage.getItem("dkuBannerTheme")];
const storedBannerColor = localStorage.getItem(BANNER_COLOR_KEY);
const savedBannerColor = !storedBannerColor || storedBannerColor === "#334150"
  ? DEFAULT_BANNER_COLOR
  : (storedBannerColor || legacyBannerColor || DEFAULT_BANNER_COLOR);
if (storedBannerColor !== savedBannerColor) localStorage.setItem(BANNER_COLOR_KEY, savedBannerColor);
applyBannerColor(savedBannerColor);

const MASCOT_DISPLAY_KEY = "dkuMascotDisplay";
let mascotModulePromise = null;

function mountHeaderMascots() {
  if (!document.querySelector(".site-header")) return;
  if (!mascotModulePromise) {
    mascotModulePromise = import(new URL("assets/js/danwoong-walk.js?v=29", document.baseURI).href);
  }
  mascotModulePromise
    .then(({ mountDanwoongWalk }) => mountDanwoongWalk())
    .catch((error) => console.warn("단웅이 애니메이션을 불러오지 못했습니다.", error));
}

function applyMascotDisplay(enabled, save = false) {
  const visible = enabled !== false;
  if (save) localStorage.setItem(MASCOT_DISPLAY_KEY, String(visible));
  document.documentElement.dataset.mascots = visible ? "show" : "hide";
  window.dispatchEvent(new CustomEvent("dkuMascotVisibility", { detail: { visible, restart: visible } }));
  if (visible) mountHeaderMascots();
}

window.setMascotDisplay = (enabled) => applyMascotDisplay(Boolean(enabled), true);
const savedMascotDisplay = localStorage.getItem(MASCOT_DISPLAY_KEY) !== "false";
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
});

/* 설치형 웹앱(PWA) 등록 */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(new URL("service-worker.js", document.baseURI))
      .catch((error) => console.warn("앱 설치 기능을 준비하지 못했습니다.", error));
  });
}
