/* 로그인된 기기의 페이지 전환 때 인증 화면이 잠깐 보이는 것을 막는다. */
(() => {
  try {
    const key = "dkuSessionKnown";
    const initialSetupKey = "dkuInitialSetupRequiredUid";
    const known = sessionStorage.getItem(key) === "1"
      || (localStorage.getItem("dkuAutoLogin") !== "false" && localStorage.getItem(key) === "1");
    const initialSetupRequired = !!(
      sessionStorage.getItem(initialSetupKey) || localStorage.getItem(initialSetupKey)
    );
    if (known && !initialSetupRequired) document.documentElement.classList.add("dku-session-known");
  } catch (_) {
    /* 저장소 접근이 제한되면 gate.js의 실제 인증 확인을 기다린다. */
  }
})();
