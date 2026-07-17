import { app } from "./firebase-init.js?v=11";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 5;

const storage = getStorage(app);
const blockedExtensions = new Set(["exe", "dll", "bat", "cmd", "msi", "apk", "ipa"]);

function safeFileName(name = "file") {
  return name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|#%{}\[\]]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "file";
}

function uniqueId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

export function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && item.path && item.name).map((item) => ({
    name: String(item.name),
    path: String(item.path),
    size: Number(item.size) || 0,
    type: String(item.type || "application/octet-stream"),
  }));
}

export function validateAttachmentFiles(fileList, existingCount = 0) {
  const files = [...(fileList || [])];
  if (existingCount + files.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`첨부파일은 게시물당 최대 ${MAX_ATTACHMENT_COUNT}개까지 올릴 수 있습니다.`);
  }
  files.forEach((file) => {
    if (file.size > MAX_ATTACHMENT_SIZE) throw new Error(`${file.name}: 파일 크기는 10MB 이하여야 합니다.`);
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (blockedExtensions.has(extension)) throw new Error(`${file.name}: 보안상 첨부할 수 없는 파일 형식입니다.`);
  });
  return files;
}

export async function uploadAttachmentFiles(fileList, user, section, existingCount = 0) {
  if (!user) throw new Error("로그인이 필요합니다.");
  const files = validateAttachmentFiles(fileList, existingCount);
  const uploaded = [];
  try {
    for (const file of files) {
      const name = safeFileName(file.name);
      const path = `attachments/${user.uid}/${section}/${uniqueId()}_${name}`;
      const target = ref(storage, path);
      await uploadBytes(target, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { originalName: name, uploaderUid: user.uid },
      });
      uploaded.push({ name, path, size: file.size, type: file.type || "application/octet-stream" });
    }
    return uploaded;
  } catch (error) {
    await deleteAttachmentFiles(uploaded);
    throw error;
  }
}

export async function deleteAttachmentFiles(attachments) {
  const items = normalizeAttachments(attachments);
  await Promise.allSettled(items.map((item) => deleteObject(ref(storage, item.path))));
}

export function formatAttachmentSize(bytes = 0) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function attachmentMarkup(attachments) {
  const items = normalizeAttachments(attachments);
  if (!items.length) return "";
  return `<div class="post-attachments" aria-label="첨부파일">${items.map((item) => `
    <button type="button" class="attachment-open" data-path="${escapeHtml(item.path)}">
      <span class="attachment-icon" aria-hidden="true">📎</span>
      <span class="attachment-name">${escapeHtml(item.name)}</span>
      ${item.size ? `<small>${formatAttachmentSize(item.size)}</small>` : ""}
    </button>`).join("")}</div>`;
}

export function attachmentEditorMarkup(attachments) {
  const items = normalizeAttachments(attachments);
  if (!items.length) return "";
  return items.map((item, index) => `
    <span class="attachment-edit-item">
      <span>📎 ${escapeHtml(item.name)}</span>
      <button type="button" data-attachment-index="${index}" aria-label="${escapeHtml(item.name)} 첨부 해제">&times;</button>
    </span>`).join("");
}

export function bindAttachmentOpen(container) {
  container?.querySelectorAll(".attachment-open").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const popup = window.open("", "_blank");
      try {
        button.disabled = true;
        const url = await getDownloadURL(ref(storage, button.dataset.path));
        if (popup) {
          popup.opener = null;
          popup.location.href = url;
        } else {
          window.location.href = url;
        }
      } catch (error) {
        popup?.close();
        alert(`첨부파일을 열지 못했습니다. ${error.message}`);
      } finally {
        button.disabled = false;
      }
    });
  });
}
