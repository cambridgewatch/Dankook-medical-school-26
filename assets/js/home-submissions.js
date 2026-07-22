/* 관리자 홈: 학생별 제출 체크리스트 */
import { auth, db, ADMIN_EMAIL } from "./firebase-init.js?v=12";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

window.addEventListener("DOMContentLoaded", () => {
  const section = document.querySelector("#homeSubmissionSection");
  const form = document.querySelector("#submissionChecklistForm");
  const titleInput = document.querySelector("#submissionChecklistTitle");
  const status = document.querySelector("#submissionChecklistStatus");
  const list = document.querySelector("#submissionChecklistList");
  if (!section || !form || !titleInput || !status || !list) return;

  let members = [];
  let checklists = [];
  let active = false;
  let stopMembers = null;
  let stopChecklists = null;

  onAuthStateChanged(auth, (user) => {
    const isAdmin = !!user && user.email === ADMIN_EMAIL;
    section.hidden = !isAdmin;
    if (!isAdmin) {
      stopMembers?.();
      stopChecklists?.();
      stopMembers = null;
      stopChecklists = null;
      active = false;
      members = [];
      checklists = [];
      list.innerHTML = "";
      return;
    }
    if (active) return;
    active = true;

    stopMembers = onSnapshot(collection(db, "members"), (snapshot) => {
      members = snapshot.docs
        .map((item) => ({ id: item.id, name: String(item.data().name || "").trim() }))
        .filter((member) => member.name)
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
      render();
    }, (error) => showError(`학생 명단을 불러오지 못했습니다: ${error.message}`));

    stopChecklists = onSnapshot(
      query(collection(db, "submissionChecklists"), orderBy("createdAt", "desc")),
      (snapshot) => {
        checklists = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        render();
      },
      (error) => showError(`체크리스트를 불러오지 못했습니다: ${error.message}`),
    );
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    titleInput.disabled = true;
    try {
      await addDoc(collection(db, "submissionChecklists"), {
        title: title.slice(0, 80),
        submitted: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      titleInput.value = "";
    } catch (error) {
      showError(`체크리스트를 만들지 못했습니다: ${error.message}`);
    } finally {
      button.disabled = false;
      titleInput.disabled = false;
      titleInput.focus();
    }
  });

  function render() {
    if (!active) return;
    const openIds = new Set(
      [...list.querySelectorAll(".submission-checklist[open]")].map((item) => item.dataset.id),
    );
    status.classList.remove("error");
    if (!members.length) {
      status.textContent = "동기 명단이 비어 있습니다. 동기 명단을 먼저 등록해 주세요.";
    } else if (!checklists.length) {
      status.textContent = `등록된 체크리스트가 없습니다. 현재 학생 ${members.length}명`;
    } else {
      status.textContent = `체크리스트 ${checklists.length}개 · 학생 ${members.length}명`;
    }

    list.innerHTML = checklists.map((checklist) => {
      const submitted = checklist.submitted && typeof checklist.submitted === "object"
        ? checklist.submitted : {};
      const submittedCount = members.filter((member) => submitted[member.id] === true).length;
      const studentRows = members.map((member) => {
        const checked = submitted[member.id] === true;
        return `
          <label class="submission-student${checked ? " is-submitted" : ""}">
            <input type="checkbox" data-checklist-id="${escapeHtml(checklist.id)}" data-member-id="${escapeHtml(member.id)}"${checked ? " checked" : ""} />
            <strong>${escapeHtml(member.name)}</strong>
            <small>${checked ? "제출" : "미제출"}</small>
          </label>`;
      }).join("");
      return `
        <details class="submission-checklist" data-id="${escapeHtml(checklist.id)}"${openIds.has(checklist.id) ? " open" : ""}>
          <summary>
            <span class="submission-checklist-title">
              <strong>${escapeHtml(checklist.title || "제목 없는 체크리스트")}</strong>
              <small>항목 이름을 눌러 학생별 제출 여부 확인</small>
            </span>
            <span class="submission-progress">${submittedCount}/${members.length}명</span>
            <span class="submission-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div class="submission-checklist-body">
            <div class="submission-checklist-toolbar">
              <span>체크하면 제출, 해제하면 미제출로 저장됩니다.</span>
              <button class="submission-delete" type="button" data-delete-id="${escapeHtml(checklist.id)}">항목 삭제</button>
            </div>
            <div class="submission-students">${studentRows || "<p>등록된 학생이 없습니다.</p>"}</div>
          </div>
        </details>`;
    }).join("");

    list.querySelectorAll("input[data-checklist-id]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => saveSubmission(checkbox));
    });
    list.querySelectorAll("button[data-delete-id]").forEach((button) => {
      button.addEventListener("click", () => removeChecklist(button.dataset.deleteId));
    });
  }

  async function saveSubmission(checkbox) {
    const { checklistId, memberId } = checkbox.dataset;
    const label = checkbox.closest(".submission-student");
    const stateText = label?.querySelector("small");
    checkbox.disabled = true;
    try {
      await updateDoc(doc(db, "submissionChecklists", checklistId), {
        [`submitted.${memberId}`]: checkbox.checked,
        updatedAt: serverTimestamp(),
      });
      label?.classList.toggle("is-submitted", checkbox.checked);
      if (stateText) stateText.textContent = checkbox.checked ? "제출" : "미제출";
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      showError(`제출 상태를 저장하지 못했습니다: ${error.message}`);
    } finally {
      checkbox.disabled = false;
    }
  }

  async function removeChecklist(checklistId) {
    const checklist = checklists.find((item) => item.id === checklistId);
    if (!confirm(`“${checklist?.title || "이 체크리스트"}” 항목을 삭제할까요?`)) return;
    try {
      await deleteDoc(doc(db, "submissionChecklists", checklistId));
    } catch (error) {
      showError(`체크리스트를 삭제하지 못했습니다: ${error.message}`);
    }
  }

  function showError(message) {
    status.textContent = message;
    status.classList.add("error");
  }
});
