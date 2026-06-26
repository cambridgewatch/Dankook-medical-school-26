/* 단국대 의대 26학번 — 공통 스크립트 */

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
});
