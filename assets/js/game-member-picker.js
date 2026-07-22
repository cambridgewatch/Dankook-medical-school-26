import { auth, db, ADMIN_NAME } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.addEventListener("DOMContentLoaded", () => {
  const pickers = [...document.querySelectorAll(".member-picker[data-picker-kind]")];
  if (!pickers.length) return;

  let roster = [];
  const normalize = (value) => String(value || "").trim().normalize("NFC");
  const parseList = (value) => String(value || "").split(/[\n,]+/).map(normalize).filter(Boolean);

  pickers.forEach((picker) => renderLoading(picker, "명단을 불러오는 중…"));

  onAuthStateChanged(auth, async (user) => {
    if (!user) return pickers.forEach((picker) => renderLoading(picker, "로그인 후 사용할 수 있어요."));
    try {
      const snapshot = await getDocs(collection(db, "members"));
      const names = snapshot.docs.map((doc) => normalize(doc.data().name)).filter(Boolean);
      names.push(normalize(ADMIN_NAME));
      roster = [...new Set(names)].sort((a, b) => a.localeCompare(b, "ko"));
      pickers.forEach(setupPicker);
    } catch (error) {
      pickers.forEach((picker) => renderLoading(picker, `명단을 불러오지 못했어요: ${error.message}`));
    }
  });

  function renderLoading(picker, text) {
    const mount = picker.querySelector(".member-picker-mount");
    if (mount) mount.innerHTML = `<p class="member-picker-state">${escapeHtml(text)}</p>`;
  }

  function setupPicker(picker) {
    const kind = picker.dataset.pickerKind;
    const mount = picker.querySelector(".member-picker-mount");
    mount.innerHTML = `
      <div class="member-picker-toolbar">
        <label><input type="search" placeholder="이름 검색" aria-label="동기 이름 검색" autocomplete="off" /></label>
        <button type="button" class="member-picker-reset">명단 초기화</button>
      </div>
      <p class="member-picker-guide">${kind === "wheel" ? "이름을 누를 때마다 룰렛에 한 칸씩 추가됩니다." : "이름을 누르면 참가자 입력칸에 바로 반영됩니다."}</p>
      <div class="member-picker-list" role="list"></div>
      <p class="member-picker-status" aria-live="polite"></p>
    `;

    const search = mount.querySelector('input[type="search"]');
    const list = mount.querySelector(".member-picker-list");
    const status = mount.querySelector(".member-picker-status");
    search.addEventListener("input", render);
    mount.querySelector(".member-picker-reset").addEventListener("click", () => resetNames(kind, status));
    list.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-name]");
      if (!button) return;
      const name = button.dataset.name;
      if (kind === "wheel" && button.dataset.action === "remove") removeWheelName(name);
      else if (kind === "wheel") addWheelName(name);
      else toggleUniqueName(kind, name, status);
      render();
    });

    document.addEventListener("input", (event) => {
      if (isTargetInput(kind, event.target)) render();
    });
    document.addEventListener("change", (event) => {
      if (isTargetInput(kind, event.target)) render();
    });
    render();

    function render() {
      const query = normalize(search.value).toLocaleLowerCase("ko");
      const visible = roster.filter((name) => name.toLocaleLowerCase("ko").includes(query));
      const values = currentValues(kind);
      const counts = values.reduce((map, name) => map.set(name, (map.get(name) || 0) + 1), new Map());
      list.innerHTML = "";

      visible.forEach((name) => {
        const count = counts.get(name) || 0;
        const item = document.createElement("div");
        item.className = `member-picker-person${count ? " selected" : ""}`;
        item.setAttribute("role", "listitem");

        if (kind === "wheel" && count) {
          item.appendChild(makeButton(name, "remove", "−", `${name} 한 번 빼기`, "member-picker-minus"));
        }
        const add = makeButton(name, kind === "wheel" ? "add" : "toggle", name, kind === "wheel" ? `${name} 추가` : `${name} 선택 전환`, "member-picker-name");
        add.setAttribute("aria-pressed", count ? "true" : "false");
        if (kind === "wheel") {
          const badge = document.createElement("span");
          badge.textContent = count ? `×${count}` : "+";
          add.appendChild(badge);
        } else if (count) {
          const check = document.createElement("span");
          check.textContent = "✓";
          add.appendChild(check);
        }
        item.appendChild(add);
        list.appendChild(item);
      });

      if (!visible.length) list.innerHTML = '<p class="member-picker-empty">검색 결과가 없어요.</p>';
      const rosterSelections = values.filter((name) => roster.includes(name)).length;
      status.textContent = kind === "wheel"
        ? `현재 ${values.length}칸 · 명단에서 ${rosterSelections}번 추가`
        : `현재 참가자 ${values.filter(Boolean).length}명 선택`;
    }
  }

  function makeButton(name, action, text, label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.name = name;
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.append(document.createTextNode(text));
    return button;
  }

  function currentValues(kind) {
    if (kind === "wheel") return parseList(document.querySelector("#wheelNames")?.value);
    const selector = kind === "ladder" ? "#ladderInputs .ladder-name" : "#teamNameInputs input";
    return [...document.querySelectorAll(selector)].map((input) => normalize(input.value)).filter(Boolean);
  }

  function isTargetInput(kind, target) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
    if (kind === "wheel") return target.id === "wheelNames";
    if (kind === "ladder") return target.matches("#ladderInputs .ladder-name, #ladderCount");
    return target.matches("#teamNameInputs input, #teamMemberCount");
  }

  function updateWheel(values) {
    const input = document.querySelector("#wheelNames");
    input.value = values.join("\n");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function addWheelName(name) {
    updateWheel([...currentValues("wheel"), name]);
  }

  function removeWheelName(name) {
    const values = currentValues("wheel");
    const index = values.lastIndexOf(name);
    if (index >= 0) values.splice(index, 1);
    updateWheel(values);
  }

  function toggleUniqueName(kind, name, status) {
    const values = currentValues(kind);
    const existing = values.indexOf(name);
    if (existing >= 0) values.splice(existing, 1);
    else {
      const max = kind === "ladder" ? 20 : 44;
      if (values.length >= max) {
        status.textContent = `최대 ${max}명까지 선택할 수 있어요.`;
        return;
      }
      values.push(name);
    }
    applyUniqueValues(kind, values);
  }

  function applyUniqueValues(kind, values) {
    const countInput = document.querySelector(kind === "ladder" ? "#ladderCount" : "#teamMemberCount");
    const selector = kind === "ladder" ? "#ladderInputs .ladder-name" : "#teamNameInputs input";
    countInput.value = Math.max(2, values.length);
    countInput.dispatchEvent(new Event("change", { bubbles: true }));
    [...document.querySelectorAll(selector)].forEach((input, index) => {
      input.value = values[index] || "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function resetNames(kind, status) {
    if (kind === "wheel") updateWheel([]);
    else applyUniqueValues(kind, []);
    status.textContent = "입력된 명단을 모두 초기화했어요.";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }
});
