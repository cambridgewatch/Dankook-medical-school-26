/* 갤러리: 사진 목록 불러오기 + 업로드 (gallery.html 전용)
   - 로그인/데이터: Firebase (무료)
   - 사진 파일 저장: ImgBB (무료, 카드 불필요) */

import { auth, db, isConfigured, IMGBB_API_KEY, imgbbReady } from "./firebase-init.js";
import {
  onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
let currentUser = null;

window.addEventListener("DOMContentLoaded", () => {
  const grid = $("#galleryGrid");
  const authBar = $("#galleryAuthBar");
  const uploadBox = $("#uploadBox");

  if (!isConfigured) {
    authBar.innerHTML =
      '⚠️ 사진 공유 기능을 쓰려면 Firebase 설정이 필요합니다. (firebase-설정안내.md 참고)';
    renderGrid();
    return;
  }

  /* 로그인 상태에 따라 업로드 영역 표시 */
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      authBar.innerHTML =
        `👤 <strong>${user.displayName || "동기"}</strong> 님으로 로그인됨 ` +
        `<button id="logoutBtn" class="btn-mini">로그아웃</button>`;
      uploadBox.style.display = "block";
      $("#logoutBtn").addEventListener("click", () => signOut(auth));
    } else {
      authBar.innerHTML =
        '사진을 올리려면 <a href="login.html"><strong>로그인</strong></a>이 필요합니다.';
      uploadBox.style.display = "none";
    }
    renderGrid();
  });

  /* 실시간 사진 목록 */
  let photos = [];
  const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderGrid();
  }, (err) => {
    authBar.innerHTML = "사진 목록을 불러오지 못했습니다: " + err.message;
  });

  function renderGrid() {
    /* 고정 사진(의대과잠) + 업로드된 사진들 */
    let html = `
      <figure>
        <img src="assets/img/photo1.png" alt="의대과잠" loading="lazy" />
        <figcaption>📸 의대과잠</figcaption>
      </figure>`;
    photos.forEach((p) => {
      const mine = currentUser && currentUser.uid === p.uid;
      const cap = p.caption ? p.caption + " · " : "";
      html += `
        <figure data-id="${p.id}">
          <img src="${p.url}" alt="${cap}${p.uploader}" loading="lazy" />
          <figcaption>${cap}🙋 ${p.uploader || "익명"}
            ${mine ? '<button class="del-btn" title="삭제">🗑</button>' : ""}
          </figcaption>
        </figure>`;
    });
    grid.innerHTML = html;

    /* 라이트박스 */
    const lb = $(".lightbox");
    grid.querySelectorAll("img").forEach((img) => {
      img.addEventListener("click", () => {
        lb.querySelector("img").src = img.src;
        lb.classList.add("open");
      });
    });
    /* 내 사진 삭제 (목록에서 제거) */
    grid.querySelectorAll(".del-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const fig = btn.closest("figure");
        if (!confirm("이 사진을 삭제할까요?")) return;
        try {
          await deleteDoc(doc(db, "photos", fig.dataset.id));
        } catch (err) {
          alert("삭제 실패: " + err.message);
        }
      });
    });
  }

  /* 업로드 */
  $("#uploadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return alert("로그인이 필요합니다.");
    if (!imgbbReady)
      return alert("⚠️ ImgBB API 키가 아직 설정되지 않았습니다. (firebase-설정안내.md 참고)");
    const file = $("#photoFile").files[0];
    const caption = $("#photoCaption").value.trim();
    if (!file) return alert("사진 파일을 선택해 주세요.");
    if (!file.type.startsWith("image/")) return alert("이미지 파일만 올릴 수 있습니다.");
    if (file.size > 32 * 1024 * 1024) return alert("32MB 이하 사진만 올릴 수 있습니다.");

    const btn = $("#uploadBtn");
    btn.disabled = true;
    btn.textContent = "업로드 중…";
    try {
      /* 1) ImgBB에 사진 파일 업로드 → 이미지 URL 받기 */
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || "이미지 업로드 실패");
      const url = data.data.display_url || data.data.url;

      /* 2) Firebase(데이터베이스)에 URL + 올린 사람 정보 저장 → 모두에게 공유 */
      await addDoc(collection(db, "photos"), {
        url,
        deleteUrl: data.data.delete_url || "",
        caption,
        uploader: currentUser.displayName || "동기",
        uid: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      $("#uploadForm").reset();
    } catch (err) {
      alert("업로드 실패: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "사진 올리기";
    }
  });
});
