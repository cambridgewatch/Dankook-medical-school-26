import { IMGBB_API_KEY, imgbbReady } from "./firebase-init.js?v=12";

export const MAX_ATTACHMENT_SIZE = 32 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 5;

const imageExtensions = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif",
]);

function safeFileName(name = "image") {
  return name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|#%{}\[\]]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "image";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function safeImageUrl(value = "") {
  const url = String(value);
  return /^https:\/\//i.test(url) ? url : "";
}

export function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && item.name && safeImageUrl(item.url)).map((item) => ({
    name: String(item.name),
    url: safeImageUrl(item.url),
    thumbUrl: safeImageUrl(item.thumbUrl) || safeImageUrl(item.url),
    size: Number(item.size) || 0,
    type: String(item.type || "image/jpeg"),
    host: "imgbb",
  }));
}

export function validateAttachmentFiles(fileList, existingCount = 0) {
  const files = [...(fileList || [])];
  if (existingCount + files.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`첨부 사진은 게시물당 최대 ${MAX_ATTACHMENT_COUNT}장까지 올릴 수 있습니다.`);
  }
  files.forEach((file) => {
    if (file.size > MAX_ATTACHMENT_SIZE) throw new Error(`${file.name}: 사진 크기는 32MB 이하여야 합니다.`);
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!file.type.startsWith("image/") || !imageExtensions.has(extension)) {
      throw new Error(`${file.name}: 사진 파일만 첨부할 수 있습니다. PDF·Word·HWP 문서는 지원하지 않습니다.`);
    }
  });
  return files;
}

export async function uploadAttachmentFiles(fileList, user, section, existingCount = 0) {
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!imgbbReady) throw new Error("ImgBB API 키가 설정되지 않았습니다.");
  const files = validateAttachmentFiles(fileList, existingCount);
  const uploaded = [];
  for (const file of files) {
    const name = safeFileName(file.name);
    const formData = new FormData();
    formData.append("image", file);
    formData.append("name", `${section}_${user.uid}_${Date.now()}_${name.replace(/\.[^.]+$/, "")}`.slice(0, 100));
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error?.message || `${name} 이미지 업로드에 실패했습니다.`);
    }
    uploaded.push({
      name,
      url: data.data.display_url || data.data.url,
      thumbUrl: data.data.thumb?.url || data.data.display_url || data.data.url,
      size: file.size,
      type: file.type,
      host: "imgbb",
    });
  }
  return uploaded;
}

/* ImgBB 무료 API는 브라우저에서의 자동 삭제 API를 제공하지 않습니다.
   게시물에서 제거하면 Firestore의 연결 정보만 제거됩니다. */
export async function deleteAttachmentFiles() {}

export function formatAttachmentSize(bytes = 0) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function attachmentMarkup(attachments) {
  const items = normalizeAttachments(attachments);
  if (!items.length) return "";
  return `<div class="post-attachments post-image-attachments" aria-label="첨부 사진">${items.map((item) => `
    <a class="attachment-image" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeHtml(item.thumbUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />
      <span><strong>${escapeHtml(item.name)}</strong>${item.size ? `<small>${formatAttachmentSize(item.size)}</small>` : ""}</span>
    </a>`).join("")}</div>`;
}

export function attachmentEditorMarkup(attachments) {
  const items = normalizeAttachments(attachments);
  if (!items.length) return "";
  return items.map((item, index) => `
    <span class="attachment-edit-item">
      <span>🖼️ ${escapeHtml(item.name)}</span>
      <button type="button" data-attachment-index="${index}" aria-label="${escapeHtml(item.name)} 첨부 해제">&times;</button>
    </span>`).join("");
}

export function bindAttachmentOpen() {}
