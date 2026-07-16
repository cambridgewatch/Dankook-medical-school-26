/* 사다리타기 전용 스크립트 — Firebase와 독립적으로 동작 */
window.addEventListener("DOMContentLoaded", function () {
  var countInput = document.querySelector("#ladderCount");
  var inputsBox = document.querySelector("#ladderInputs");
  var createButton = document.querySelector("#ladderCreate");
  var svg = document.querySelector("#ladderSvg");
  var stage = document.querySelector("#ladderStage");
  var scrollBox = document.querySelector("#ladderScroll");
  var playerSelect = document.querySelector("#ladderPlayer");
  var runButton = document.querySelector("#ladderRun");
  var resultBox = document.querySelector("#ladderResult");
  var tableToggle = document.querySelector("#ladderTableToggle");
  var tableWrap = document.querySelector("#ladderTableWrap");
  var tableBody = document.querySelector("#ladderTableBody");
  if (!countInput || !inputsBox || !svg) return;

  var names = [];
  var results = [];
  var bridges = [];
  var board = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char];
    });
  }

  function shortLabel(value) {
    return value.length > 7 ? value.slice(0, 7) + "…" : value;
  }

  function getCount() {
    var count = Number(countInput.value) || 2;
    return Math.max(2, Math.min(20, count));
  }

  function makeInput(className, value, label, placeholder, maxLength) {
    var input = document.createElement("input");
    input.className = className;
    input.value = value || "";
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.setAttribute("aria-label", label);
    return input;
  }

  function makeRow(className, values, count, fallback, maxLength) {
    var row = document.createElement("div");
    row.className = "ladder-input-row";
    row.style.gridTemplateColumns = "repeat(" + count + ", minmax(96px, 1fr))";
    for (var i = 0; i < count; i++) {
      row.appendChild(makeInput(className, values[i] || "", (i + 1) + "번 입력", fallback(i), maxLength));
    }
    return row;
  }

  function makeInputs() {
    var count = getCount();
    countInput.value = count;
    var oldNames = Array.from(inputsBox.querySelectorAll(".ladder-name")).map(function (el) { return el.value; });
    var oldResults = Array.from(inputsBox.querySelectorAll(".ladder-dest")).map(function (el) { return el.value; });
    inputsBox.innerHTML = "";
    inputsBox.style.minWidth = Math.max(520, count * 112) + "px";

    var nameLabel = document.createElement("div");
    nameLabel.className = "ladder-input-label";
    nameLabel.textContent = "참가자";
    inputsBox.appendChild(nameLabel);
    inputsBox.appendChild(makeRow("ladder-name", oldNames, count, function (i) { return "참가자 " + (i + 1); }, 12));

    var resultLabel = document.createElement("div");
    resultLabel.className = "ladder-input-label result-label";
    resultLabel.textContent = "도착 결과";
    inputsBox.appendChild(resultLabel);
    inputsBox.appendChild(makeRow("ladder-dest", oldResults, count, function (i) { return "결과 " + (i + 1); }, 16));

    stage.style.width = Math.max(600, count * 112) + "px";
    svg.setAttribute("viewBox", "0 0 600 240");
    svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#8a94a6" font-size="15">이름과 결과를 입력한 뒤 사다리 만들기를 눌러주세요</text>';
    playerSelect.innerHTML = "";
    resultBox.textContent = "";
    tableWrap.hidden = true;
    tableToggle.textContent = "결과표 보기";
    board = null;
  }

  function readValues() {
    names = Array.from(inputsBox.querySelectorAll(".ladder-name")).map(function (el, i) {
      return el.value.trim() || "참가자 " + (i + 1);
    });
    results = Array.from(inputsBox.querySelectorAll(".ladder-dest")).map(function (el, i) {
      return el.value.trim() || "결과 " + (i + 1);
    });
  }

  function generateBridges(count, levels) {
    var rows;
    do {
      rows = [];
      for (var level = 0; level < levels; level++) {
        var row = new Set();
        for (var col = 0; col < count - 1; col++) {
          if (!row.has(col - 1) && Math.random() < 0.38) {
            row.add(col);
            col++;
          }
        }
        rows.push(row);
      }
    } while (rows.reduce(function (sum, row) { return sum + row.size; }, 0) < count - 1);
    return rows;
  }

  function drawLadder() {
    readValues();
    var count = names.length;
    var spacing = 104;
    var side = 58;
    var width = side * 2 + (count - 1) * spacing;
    var height = 490;
    var topY = 62;
    var bottomY = 408;
    var levels = Math.max(12, Math.min(20, count + 8));
    var x = function (i) { return side + i * spacing; };
    var y = function (i) { return topY + ((i + 1) * (bottomY - topY)) / (levels + 1); };
    bridges = generateBridges(count, levels);
    var html = '<rect width="100%" height="100%" rx="18" fill="#fbfcff"/>';

    for (var i = 0; i < count; i++) {
      html += '<line x1="' + x(i) + '" y1="' + topY + '" x2="' + x(i) + '" y2="' + bottomY + '" class="ladder-line"/>';
      html += '<text x="' + x(i) + '" y="28" class="ladder-name-text">' + escapeHtml(shortLabel(names[i])) + '</text>';
      html += '<text x="' + x(i) + '" y="449" class="ladder-result-text">' + escapeHtml(shortLabel(results[i])) + '</text>';
      html += '<circle cx="' + x(i) + '" cy="' + topY + '" r="5" class="ladder-node"/>';
      html += '<circle cx="' + x(i) + '" cy="' + bottomY + '" r="5" class="ladder-node bottom"/>';
    }
    bridges.forEach(function (row, level) {
      row.forEach(function (col) {
        html += '<line x1="' + x(col) + '" y1="' + y(level) + '" x2="' + x(col + 1) + '" y2="' + y(level) + '" class="ladder-line bridge"/>';
      });
    });

    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    stage.style.width = Math.max(600, width) + "px";
    svg.innerHTML = html;
    board = { levels: levels, topY: topY, bottomY: bottomY, x: x, y: y };
    playerSelect.innerHTML = names.map(function (name, i) {
      return '<option value="' + i + '">' + escapeHtml(name) + '</option>';
    }).join("");
    resultBox.textContent = "참가자를 선택하고 결과 확인을 눌러주세요.";
    tableWrap.hidden = true;
    tableToggle.textContent = "결과표 보기";
  }

  function trace(start) {
    var col = start;
    var points = [[board.x(col), board.topY]];
    for (var level = 0; level < board.levels; level++) {
      var rowY = board.y(level);
      points.push([board.x(col), rowY]);
      if (bridges[level].has(col)) {
        col++;
        points.push([board.x(col), rowY]);
      } else if (bridges[level].has(col - 1)) {
        col--;
        points.push([board.x(col), rowY]);
      }
    }
    points.push([board.x(col), board.bottomY]);
    return { end: col, points: points };
  }

  var countTimer = null;
  countInput.addEventListener("input", function () {
    clearTimeout(countTimer);
    countTimer = setTimeout(makeInputs, 250);
  });
  countInput.addEventListener("change", makeInputs);
  createButton.addEventListener("click", drawLadder);
  runButton.addEventListener("click", function () {
    if (!board) {
      resultBox.textContent = "먼저 사다리를 만들어주세요.";
      return;
    }
    var start = Number(playerSelect.value);
    var traced = trace(start);
    svg.querySelectorAll(".ladder-path").forEach(function (el) { el.remove(); });
    var pointText = traced.points.map(function (point) { return point[0] + "," + point[1]; }).join(" ");
    svg.insertAdjacentHTML("beforeend", '<polyline points="' + pointText + '" class="ladder-path"/>');
    resultBox.innerHTML = "<strong>" + escapeHtml(names[start]) + "</strong> → <strong>" + escapeHtml(results[traced.end]) + "</strong>";
    scrollBox.scrollTo({ left: Math.max(0, board.x(start) - 80), behavior: "smooth" });
  });

  tableToggle.addEventListener("click", function () {
    if (!board) {
      resultBox.textContent = "먼저 사다리를 만들어주세요.";
      return;
    }
    if (!tableWrap.hidden) {
      tableWrap.hidden = true;
      tableToggle.textContent = "결과표 보기";
      return;
    }
    tableBody.innerHTML = names.map(function (name, index) {
      var destination = trace(index).end;
      return "<tr><td>" + (index + 1) + "</td><td>" + escapeHtml(name) + "</td><td>" + escapeHtml(results[destination]) + "</td></tr>";
    }).join("");
    tableWrap.hidden = false;
    tableToggle.textContent = "결과표 닫기";
    tableWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  makeInputs();
});
