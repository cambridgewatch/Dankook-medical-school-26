/* 미니게임 카드 열기/닫기 */
window.addEventListener("DOMContentLoaded", function () {
  var cards = Array.from(document.querySelectorAll(".game-launch-card"));

  function closeCard(card) {
    var button = card.querySelector(".game-toggle");
    var panel = card.querySelector(".game-panel");
    card.classList.remove("game-open");
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.textContent = "게임 열기";
  }

  function openCard(card) {
    cards.forEach(function (other) {
      if (other !== card) closeCard(other);
    });
    var button = card.querySelector(".game-toggle");
    var panel = card.querySelector(".game-panel");
    card.classList.add("game-open");
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.textContent = "게임 닫기";
    requestAnimationFrame(function () {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  cards.forEach(function (card) {
    var button = card.querySelector(".game-toggle");
    closeCard(card);
    button.addEventListener("click", function () {
      if (card.classList.contains("game-open")) closeCard(card);
      else openCard(card);
    });
  });
});
