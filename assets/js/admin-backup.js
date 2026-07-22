import { auth, db, ADMIN_EMAIL } from "./firebase-init.js?v=12";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, Timestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const BACKUP_FORMAT = "dku-med26-admin-backup";
const BACKUP_VERSION = 1;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const COLLECTIONS = [
  "notices",
  "calendarEvents",
  "alerts",
  "polls",
  "submissionChecklists",
  "submissionAlerts",
  "timetableGlobal",
];

const $ = (selector) => document.querySelector(selector);
const panel = $("#adminBackupPanel");
const downloadButton = $("#downloadAdminBackupBtn");
const chooseButton = $("#chooseAdminBackupBtn");
const restoreButton = $("#restoreAdminBackupBtn");
const fileInput = $("#adminBackupFile");
const fileName = $("#adminBackupFileName");
const status = $("#adminBackupStatus");
let selectedBackup = null;

function showStatus(message, success = false) {
  status.textContent = message;
  status.className = `admin-backup-status${success ? " success" : ""}`;
}

function serialize(value) {
  if (value instanceof Timestamp) {
    return { __dkuType: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function deserialize(value) {
  if (Array.isArray(value)) return value.map(deserialize);
  if (value && typeof value === "object") {
    if (value.__dkuType === "timestamp"
      && Number.isFinite(value.seconds)
      && Number.isFinite(value.nanoseconds)) {
      return new Timestamp(value.seconds, value.nanoseconds);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deserialize(item)]));
  }
  return value;
}

function validDocument(item) {
  return item && typeof item === "object"
    && typeof item.id === "string"
    && item.id.length > 0
    && item.id.length <= 1500
    && item.data && typeof item.data === "object"
    && !Array.isArray(item.data);
}

function validateBackup(data) {
  if (!data || data.format !== BACKUP_FORMAT || data.version !== BACKUP_VERSION) {
    throw new Error("이 홈페이지에서 만든 백업 파일이 아닙니다.");
  }
  if (!data.collections || typeof data.collections !== "object") {
    throw new Error("백업 파일에 데이터가 없습니다.");
  }
  let total = 0;
  for (const name of COLLECTIONS) {
    const documents = data.collections[name] ?? [];
    if (!Array.isArray(documents) || documents.some((item) => !validDocument(item))) {
      throw new Error(`${name} 데이터 형식이 올바르지 않습니다.`);
    }
    total += documents.length;
  }
  if (total > 5000) throw new Error("복원 가능한 문서 수를 초과했습니다.");
  return total;
}

async function createBackup() {
  if (auth.currentUser?.email !== ADMIN_EMAIL) throw new Error("관리자만 백업할 수 있습니다.");
  const collections = {};
  let total = 0;
  for (const name of COLLECTIONS) {
    const snapshot = await getDocs(collection(db, name));
    collections[name] = snapshot.docs.map((item) => ({ id: item.id, data: serialize(item.data()) }));
    total += snapshot.size;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    documentCount: total,
    collections,
  };
}

async function restoreBackup(backup) {
  if (auth.currentUser?.email !== ADMIN_EMAIL) throw new Error("관리자만 복원할 수 있습니다.");
  const writes = [];
  for (const name of COLLECTIONS) {
    for (const item of backup.collections[name] ?? []) {
      const reference = doc(db, name, item.id);
      const data = deserialize(item.data);
      if (name === "polls" && !(await getDoc(reference)).exists()) {
        data.creatorUid = auth.currentUser.uid;
      }
      writes.push({ reference, data });
    }
  }
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = writeBatch(db);
    writes.slice(offset, offset + 400).forEach((item) => batch.set(item.reference, item.data, { merge: true }));
    await batch.commit();
  }
  return writes.length;
}

downloadButton?.addEventListener("click", async () => {
  downloadButton.disabled = true;
  showStatus("백업 파일을 만드는 중입니다.");
  try {
    const backup = await createBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    link.href = url;
    link.download = `dkumed26-backup-${date}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus(`${backup.documentCount}개 문서를 백업했습니다.`, true);
  } catch (error) {
    showStatus(`백업하지 못했습니다. ${error.message || error}`);
  } finally {
    downloadButton.disabled = false;
  }
});

chooseButton?.addEventListener("click", () => fileInput?.click());

fileInput?.addEventListener("change", async () => {
  selectedBackup = null;
  restoreButton.disabled = true;
  const file = fileInput.files?.[0];
  if (!file) {
    fileName.textContent = "선택된 파일 없음";
    showStatus("");
    return;
  }
  fileName.textContent = file.name;
  try {
    if (file.size > MAX_FILE_SIZE) throw new Error("백업 파일은 10MB 이하여야 합니다.");
    const parsed = JSON.parse(await file.text());
    const total = validateBackup(parsed);
    selectedBackup = parsed;
    restoreButton.disabled = false;
    showStatus(`${total}개 문서를 복원할 수 있는 정상적인 백업 파일입니다.`, true);
  } catch (error) {
    showStatus(`파일을 사용할 수 없습니다. ${error.message || error}`);
  }
});

restoreButton?.addEventListener("click", async () => {
  if (!selectedBackup) return;
  const total = validateBackup(selectedBackup);
  if (!(await window.dkuConfirm(`${total}개 문서를 복원할까요?\n\n같은 문서가 있으면 백업 내용으로 병합되며, 현재 자료는 일괄 삭제되지 않습니다.`, {
    title: "백업 복원",
    confirmText: "복원",
    danger: true,
  }))) return;
  restoreButton.disabled = true;
  chooseButton.disabled = true;
  showStatus("데이터를 복원하는 중입니다. 이 화면을 닫지 마세요.");
  try {
    const restored = await restoreBackup(selectedBackup);
    showStatus(`${restored}개 문서의 복원이 완료되었습니다.`, true);
  } catch (error) {
    showStatus(`복원 중 문제가 발생했습니다. ${error.message || error}`);
  } finally {
    restoreButton.disabled = false;
    chooseButton.disabled = false;
  }
});

onAuthStateChanged(auth, (user) => {
  if (panel) panel.hidden = user?.email !== ADMIN_EMAIL;
});
