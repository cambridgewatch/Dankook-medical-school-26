import { auth, db, ADMIN_EMAIL, ADMIN_NAME, emailToName } from "./firebase-init.js?v=12";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const optionId = () => `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

window.addEventListener("DOMContentLoaded", () => {
  const list = $("#pollList");
  const editor = $("#pollEditor");
  if (!list || !editor) return;

  let user = null;
  let currentName = "";
  let isAdmin = false;
  let polls = [];
  let members = [];
  let editingId = null;
  const requestedPollId = new URLSearchParams(location.search).get("poll");
  let requestedPollHandled = false;
  let editorOptions = [];
  const voteState = new Map();
  const voterState = new Map();
  const subscriptions = [];

  const canManage = (poll) => !!user && (isAdmin || poll.creatorUid === user.uid);

  function addEditorOption(text = "", id = optionId()) {
    editorOptions.push({ id, text });
    drawEditorOptions();
  }

  function drawEditorOptions() {
    $("#pollOptionEditor").innerHTML = editorOptions.map((option, index) => `
      <div class="poll-option-row" data-id="${option.id}">
        <input type="text" maxlength="60" value="${esc(option.text)}" placeholder="항목 ${index + 1}" aria-label="투표 항목 ${index + 1}" />
        <button type="button" aria-label="항목 삭제">×</button>
      </div>`).join("");
    $("#pollOptionEditor").querySelectorAll(".poll-option-row").forEach((row) => {
      row.querySelector("input").addEventListener("input", (e) => {
        const option = editorOptions.find((item) => item.id === row.dataset.id);
        if (option) option.text = e.target.value;
      });
      row.querySelector("button").addEventListener("click", () => {
        if (editorOptions.length <= 2) return alert("투표 항목은 최소 2개가 필요합니다.");
        editorOptions = editorOptions.filter((item) => item.id !== row.dataset.id);
        drawEditorOptions();
      });
    });
  }

  function openEditor(poll = null) {
    editingId = poll?.id || null;
    $("#pollEditorTitle").textContent = poll ? "투표 내용 수정" : "새 투표 만들기";
    $("#pollSaveBtn").textContent = poll ? "수정 저장" : "투표 올리기";
    $("#pollTitle").value = poll?.title || "";
    $("#pollDescription").value = poll?.description || "";
    $("#pollAllowChange").checked = !!poll?.allowVoteChange;
    $("#pollShowResults").checked = !!poll?.showResultsBeforeClose;
    $("#pollAllowOptions").checked = !!poll?.allowOptionAdd;
    editorOptions = poll?.options?.map((option) => ({ ...option })) || [{ id: optionId(), text: "" }, { id: optionId(), text: "" }];
    drawEditorOptions();
    editor.hidden = false;
    $("#pollTitle").focus();
    editor.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function closeEditor() {
    editor.hidden = true;
    editingId = null;
  }

  $("#pollNewBtn").addEventListener("click", () => openEditor());
  $("#pollEditorClose").addEventListener("click", closeEditor);
  $("#pollOptionAdd").addEventListener("click", () => addEditorOption());

  editor.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!user) return alert("로그인이 필요합니다.");
    const title = $("#pollTitle").value.trim();
    const options = editorOptions.map((option) => ({ id: option.id, text: option.text.trim() })).filter((option) => option.text);
    if (!title) return alert("투표 제목을 입력해 주세요.");
    if (options.length < 2) return alert("투표 항목을 2개 이상 입력해 주세요.");
    const values = {
      title,
      description: $("#pollDescription").value.trim(),
      options,
      allowVoteChange: $("#pollAllowChange").checked,
      showResultsBeforeClose: $("#pollShowResults").checked,
      allowOptionAdd: $("#pollAllowOptions").checked,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editingId) {
        const poll = polls.find((item) => item.id === editingId);
        if (!poll || !canManage(poll)) throw new Error("수정 권한이 없습니다.");
        await updateDoc(doc(db, "polls", editingId), values);
      } else {
        await addDoc(collection(db, "polls"), {
          ...values, creatorUid: user.uid, creatorName: currentName,
          closed: false, createdAt: serverTimestamp(),
        });
      }
      closeEditor();
    } catch (err) { alert("투표 저장 실패: " + err.message); }
  });

  onAuthStateChanged(auth, async (signedUser) => {
    user = signedUser;
    if (!user) return;
    currentName = user.displayName || emailToName(user.email) || "동기";
    isAdmin = user.email === ADMIN_EMAIL;
    try {
      const snap = await getDocs(collection(db, "members"));
      members = [...new Set([...snap.docs.map((d) => d.data().name).filter(Boolean), ADMIN_NAME])].sort((a, b) => a.localeCompare(b, "ko"));
    } catch { members = [ADMIN_NAME]; }
    onSnapshot(query(collection(db, "polls"), orderBy("createdAt", "desc")), (snap) => {
      polls = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      setupPolls();
    }, (err) => { list.innerHTML = `<p class="game-status">투표를 불러오지 못했습니다: ${esc(err.message)}</p>`; });
  });

  function clearSubscriptions() {
    while (subscriptions.length) subscriptions.pop()();
  }

  function setupPolls() {
    clearSubscriptions();
    voteState.clear();
    voterState.clear();
    if (!polls.length) {
      list.innerHTML = `<p class="game-status">아직 등록된 투표가 없습니다.</p>`;
      return;
    }
    list.innerHTML = polls.map((poll) => `<article class="poll-card-shell" id="poll-${poll.id}"></article>`).join("");
    polls.forEach((poll) => {
      const readAllVotes = canManage(poll) || poll.closed || poll.showResultsBeforeClose;
      if (readAllVotes) {
        subscriptions.push(onSnapshot(collection(db, "polls", poll.id, "votes"), (snap) => {
          voteState.set(poll.id, snap.docs.map((item) => ({ uid: item.id, ...item.data() })));
          renderPoll(poll);
        }));
      } else {
        getDoc(doc(db, "polls", poll.id, "votes", user.uid)).then((item) => {
          voteState.set(poll.id, item.exists() ? [{ uid: user.uid, ...item.data() }] : []);
          renderPoll(poll);
        });
      }
      if (canManage(poll)) {
        subscriptions.push(onSnapshot(collection(db, "polls", poll.id, "voters"), (snap) => {
          voterState.set(poll.id, snap.docs.map((item) => ({ uid: item.id, ...item.data() })));
          renderPoll(poll);
        }));
      }
      renderPoll(poll);
    });
    if (requestedPollId && !requestedPollHandled) {
      const target = document.querySelector(`#poll-${CSS.escape(requestedPollId)}`);
      if (target) {
        requestedPollHandled = true;
        target.classList.add("poll-deep-link");
        window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
        window.setTimeout(() => target.classList.remove("poll-deep-link"), 2600);
      }
    }
  }

  function renderPoll(poll) {
    const shell = document.querySelector(`#poll-${poll.id}`);
    if (!shell) return;
    const votes = voteState.get(poll.id) || [];
    const myVote = votes.find((vote) => vote.uid === user.uid);
    const managed = canManage(poll);
    const showResults = managed || poll.closed || poll.showResultsBeforeClose;
    const total = votes.length;
    const counts = Object.fromEntries((poll.options || []).map((option) => [option.id, votes.filter((vote) => vote.optionId === option.id).length]));
    const voters = voterState.get(poll.id) || [];
    const voterNames = [...new Set(voters.map((voter) => voter.voterName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    const nonVoters = members.filter((name) => !voterNames.includes(name));
    const individualResults = voters.map((voter) => {
      const vote = votes.find((item) => item.uid === voter.uid);
      const option = (poll.options || []).find((item) => item.id === vote?.optionId);
      return `${voter.voterName || "이름 없음"} → ${option?.text || "확인 중"}`;
    }).sort((a, b) => a.localeCompare(b, "ko"));

    const deepLinked = shell.classList.contains("poll-deep-link");
    shell.className = `poll-card ${poll.closed ? "closed" : ""}${deepLinked ? " poll-deep-link" : ""}`;
    shell.innerHTML = `
      <div class="poll-card-head">
        <div class="poll-card-title">
          <h3>${esc(poll.title)}</h3>
          ${poll.description ? `<p>${esc(poll.description)}</p>` : ""}
          <span class="poll-author">작성자 · ${esc(poll.creatorName || "동기")}</span>
        </div>
        <span class="poll-state">${poll.closed ? "종료" : "진행 중"}</span>
      </div>
      <div class="poll-options">
        ${(poll.options || []).map((option) => {
          const count = counts[option.id] || 0;
          const percent = total ? Math.round(count / total * 100) : 0;
          return `<label class="poll-choice">
            ${showResults ? `<span class="poll-result-bar" style="width:${percent}%"></span>` : ""}
            <input type="radio" name="poll-${poll.id}" value="${option.id}" ${myVote?.optionId === option.id ? "checked" : ""} ${poll.closed || (myVote && !poll.allowVoteChange) ? "disabled" : ""} />
            <span class="poll-choice-text">${esc(option.text)}</span>
            ${showResults ? `<span class="poll-count">${count}표 · ${percent}%</span>` : ""}
          </label>`;
        }).join("")}
      </div>
      ${!poll.closed && poll.allowOptionAdd ? `<div class="poll-add-option"><input type="text" maxlength="60" placeholder="새 항목 추가" /><button type="button">추가</button></div>` : ""}
      <div class="poll-actions">
        ${!poll.closed ? `<button type="button" class="poll-vote" ${myVote && !poll.allowVoteChange ? "disabled" : ""}>${myVote ? "투표 수정" : "투표하기"}</button>` : ""}
        ${managed && !poll.closed ? `<button type="button" class="poll-close">투표 종료</button>` : ""}
        ${managed ? `<button type="button" class="poll-edit">내용 수정</button><button type="button" class="poll-delete danger">삭제</button>` : ""}
      </div>
      <p class="poll-result-note">${poll.closed ? `최종 참여 ${total}명` : showResults ? `현재 참여 ${total}명` : "결과는 설정에 따라 숨겨져 있습니다."}${myVote ? " · 참여 완료" : ""}</p>
      ${managed ? `<div class="poll-people"><p><strong>개별 결과 (${individualResults.length})</strong> ${esc(individualResults.join(", ") || "없음")}</p><p><strong>미참여자 (${nonVoters.length})</strong> ${esc(nonVoters.join(", ") || "없음")}</p></div>` : ""}`;

    bindPollActions(shell, poll, myVote, votes);
  }

  function bindPollActions(shell, poll, myVote, votes) {
    shell.querySelector(".poll-vote")?.addEventListener("click", async () => {
      const selected = shell.querySelector(`input[name="poll-${poll.id}"]:checked`)?.value;
      if (!selected) return alert("투표할 항목을 선택해 주세요.");
      try {
        await setDoc(doc(db, "polls", poll.id, "votes", user.uid), { optionId: selected, updatedAt: serverTimestamp() });
        await setDoc(doc(db, "polls", poll.id, "voters", user.uid), { voterName: currentName, updatedAt: serverTimestamp() });
        alert(myVote ? "투표를 수정했습니다." : "투표했습니다.");
        if (!poll.showResultsBeforeClose && !canManage(poll)) {
          voteState.set(poll.id, [{ uid: user.uid, optionId: selected }]);
          renderPoll(poll);
        }
      } catch (err) { alert("투표 실패: " + err.message); }
    });

    const addWrap = shell.querySelector(".poll-add-option");
    addWrap?.querySelector("button").addEventListener("click", async () => {
      const text = addWrap.querySelector("input").value.trim();
      if (!text) return;
      try {
        await updateDoc(doc(db, "polls", poll.id), { options: [...poll.options, { id: optionId(), text }], updatedAt: serverTimestamp() });
      } catch (err) { alert("항목 추가 실패: " + err.message); }
    });

    shell.querySelector(".poll-close")?.addEventListener("click", async () => {
      if (!confirm("투표를 종료할까요? 종료 후에는 모두에게 결과가 공개됩니다.")) return;
      try { await updateDoc(doc(db, "polls", poll.id), { closed: true, closedAt: serverTimestamp() }); }
      catch (err) { alert("종료 실패: " + err.message); }
    });
    shell.querySelector(".poll-edit")?.addEventListener("click", () => openEditor(poll));
    shell.querySelector(".poll-delete")?.addEventListener("click", async () => {
      if (!confirm("이 투표와 모든 투표 기록을 삭제할까요?")) return;
      try {
        const [voteSnap, voterSnap] = await Promise.all([
          getDocs(collection(db, "polls", poll.id, "votes")),
          getDocs(collection(db, "polls", poll.id, "voters")),
        ]);
        const batch = writeBatch(db);
        voteSnap.docs.forEach((item) => batch.delete(item.ref));
        voterSnap.docs.forEach((item) => batch.delete(item.ref));
        batch.delete(doc(db, "polls", poll.id));
        await batch.commit();
      } catch (err) { alert("삭제 실패: " + err.message); }
    });
  }
});
