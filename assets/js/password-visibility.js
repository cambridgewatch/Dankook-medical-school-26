window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-password-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordTarget || "");
      if (!input) return;
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.textContent = visible ? "비밀번호 숨기기" : "비밀번호 표시";
      button.setAttribute("aria-pressed", String(visible));
    });
  });
});
