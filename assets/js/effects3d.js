/* 스크롤 3D 등장 효과 (되돌리기 쉽게 독립 파일로 분리)
   - 요소가 화면에 들어오면 3D로 젖혀진 상태 → 제자리로 세워짐.
   - 이 파일과 각 페이지의 <script ...effects3d.js> 한 줄만 지우면 원래대로 복구됨. */

(function () {
  /* 스타일을 스스로 주입 (별도 CSS 파일 불필요) */
  const css = `
    .reveal3d {
      opacity: 0;
      transform: perspective(1100px) rotateX(14deg) translateY(52px) scale(.97);
      transform-origin: 50% 100%;
      transition: opacity .75s cubic-bezier(.2,.75,.2,1),
                  transform .75s cubic-bezier(.2,.75,.2,1);
      will-change: opacity, transform;
    }
    .reveal3d.in {
      opacity: 1;
      transform: perspective(1100px) rotateX(0) translateY(0) scale(1);
    }
    @media (prefers-reduced-motion: reduce) {
      .reveal3d, .reveal3d.in { opacity: 1 !important; transform: none !important; transition: none !important; }
    }
  `;
  const style = document.createElement("style");
  style.id = "effects3d-style";
  style.textContent = css;
  document.head.appendChild(style);

  /* 효과를 적용할 요소들 */
  const SEL = [
    ".section-title", ".card", ".stat", ".notice-item", ".tl-item",
    ".gallery-grid figure", ".member", ".greeting", ".cal-card",
    ".cal-banner", ".cal-legend", ".cal-events", ".hero-inner",
    ".page-head .container", ".footer-top", ".auth-card",
  ].join(", ");

  function init() {
    const els = [...document.querySelectorAll(SEL)];
    els.forEach((el) => el.classList.add("reveal3d"));

    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in")); // 미지원 브라우저는 그냥 표시
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
