/* 홈: 진행 중인 투표 실시간 요약 */
import { auth, db } from "./firebase-init.js?v=12";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, onSnapshot, orderBy, query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

window.addEventListener("DOMContentLoaded", () => {
  const section = document.querySelector("#homePollSummary");
  const list = document.querySelector("#homePollList");
  if (!section || !list) return;
  let subscribed = false;

  onAuthStateChanged(auth, (user) => {
    if (!user || subscribed) return;
    subscribed = true;
    onSnapshot(query(collection(db, "polls"), orderBy("createdAt", "desc")), (snapshot) => {
      const activePolls = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((poll) => !poll.closed)
        .slice(0, 4);
      section.hidden = activePolls.length === 0;
      list.innerHTML = activePolls.map((poll) => {
        const optionCount = Array.isArray(poll.options) ? poll.options.length : 0;
        return `
          <a class="home-poll-link" href="minigame.html?poll=${encodeURIComponent(poll.id)}#poll-${encodeURIComponent(poll.id)}">
            <span class="home-poll-live"><i></i> 진행 중</span>
            <strong>${escapeHtml(poll.title || "제목 없는 투표")}</strong>
            <small>작성자 · ${escapeHtml(poll.creatorName || "동기")} ${optionCount ? `· ${optionCount}개 항목` : ""}</small>
            <b aria-hidden="true">→</b>
          </a>`;
      }).join("");
    }, () => {
      section.hidden = true;
      list.innerHTML = "";
    });
  });
});
