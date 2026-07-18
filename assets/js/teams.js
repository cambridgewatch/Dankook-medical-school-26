/* 미니게임: 균형 팀 나누기 */
window.addEventListener("DOMContentLoaded", () => {
  const memberCountInput = document.querySelector("#teamMemberCount");
  const teamCountInput = document.querySelector("#teamCount");
  const nameInputs = document.querySelector("#teamNameInputs");
  const separateInput = document.querySelector("#teamSeparateNames");
  const divideButton = document.querySelector("#teamDivideBtn");
  const message = document.querySelector("#teamMessage");
  const results = document.querySelector("#teamResults");
  if (!memberCountInput || !teamCountInput || !nameInputs || !divideButton) return;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || min));
  const normalize = (value) => String(value || "").trim().normalize("NFC");
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

  function shuffle(values) {
    const copy = values.slice();
    for (let index = copy.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function currentNames() {
    return [...nameInputs.querySelectorAll("input")].map((input) => input.value);
  }

  function updateTeamLimit() {
    const memberCount = clamp(memberCountInput.value, 2, 44);
    memberCountInput.value = memberCount;
    teamCountInput.max = memberCount;
    teamCountInput.value = clamp(teamCountInput.value, 2, memberCount);
  }

  function renderNameInputs() {
    const previous = currentNames();
    updateTeamLimit();
    const count = Number(memberCountInput.value);
    nameInputs.innerHTML = Array.from({ length: count }, (_, index) => `
      <label><span>${index + 1}</span><input type="text" maxlength="12" value="${escapeHtml(previous[index] || "")}" placeholder="이름" aria-label="${index + 1}번 참가자 이름" /></label>
    `).join("");
    results.innerHTML = "";
    message.textContent = "";
    divideButton.textContent = "팀 나누기";
  }

  function parseSeparatedNames() {
    const values = String(separateInput.value || "")
      .split(/[\n,]+/)
      .map(normalize)
      .filter(Boolean);
    return [...new Set(values)];
  }

  function showError(text) {
    message.className = "team-message error";
    message.textContent = text;
    results.innerHTML = "";
  }

  function divideTeams() {
    updateTeamLimit();
    const teamCount = Number(teamCountInput.value);
    const names = currentNames().map(normalize);
    if (names.some((name) => !name)) return showError("모든 참가자의 이름을 입력해 주세요.");
    if (new Set(names).size !== names.length) return showError("같은 이름이 중복되어 있습니다. 참가자 이름을 서로 다르게 입력해 주세요.");

    const separated = parseSeparatedNames();
    if (separated.length > teamCount) {
      return showError(`서로 다른 팀에 배치할 사람은 최대 ${teamCount}명까지 지정할 수 있습니다.`);
    }
    const nameSet = new Set(names);
    const missing = separated.filter((name) => !nameSet.has(name));
    if (missing.length) return showError(`참가자 명단에 없는 이름이 있습니다: ${missing.join(", ")}`);

    const baseSize = Math.floor(names.length / teamCount);
    const extraCount = names.length % teamCount;
    const capacities = shuffle([
      ...Array(extraCount).fill(baseSize + 1),
      ...Array(teamCount - extraCount).fill(baseSize),
    ]);
    const teams = capacities.map((capacity, index) => ({ index, capacity, members: [] }));
    const separatedSet = new Set(separated);

    const seededTeams = shuffle(teams.map((_, index) => index)).slice(0, separated.length);
    shuffle(separated).forEach((name, index) => teams[seededTeams[index]].members.push(name));

    const remaining = shuffle(names.filter((name) => !separatedSet.has(name)));
    const openSlots = shuffle(teams.flatMap((team, index) =>
      Array(team.capacity - team.members.length).fill(index)
    ));
    remaining.forEach((name, index) => teams[openSlots[index]].members.push(name));
    teams.forEach((team) => { team.members = shuffle(team.members); });

    results.innerHTML = teams.map((team) => `
      <section class="team-result-card">
        <header><strong>${team.index + 1}팀</strong><span>${team.members.length}명</span></header>
        <ol>${team.members.map((name) => `
          <li><span>${escapeHtml(name)}</span>${separatedSet.has(name) ? '<small>분산 지정</small>' : ""}</li>
        `).join("")}</ol>
      </section>
    `).join("");
    message.className = "team-message success";
    message.textContent = `총 ${names.length}명을 ${teamCount}팀으로 나눴습니다 · 팀별 ${teams.map((team) => team.members.length).join(" · ")}명`;
    divideButton.textContent = "다시 나누기";
  }

  memberCountInput.addEventListener("change", renderNameInputs);
  teamCountInput.addEventListener("change", () => {
    updateTeamLimit();
    results.innerHTML = "";
    message.textContent = "";
    divideButton.textContent = "팀 나누기";
  });
  divideButton.addEventListener("click", divideTeams);
  renderNameInputs();
});
