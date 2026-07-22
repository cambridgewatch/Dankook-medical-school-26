let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

const json = (data, status = 200, origin = "") => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  },
});

const allowedOrigin = (origin, env) => {
  const configured = String(env.ALLOWED_ORIGINS || "https://dkumed26.com,https://www.dkumed26.com")
    .split(",").map((item) => item.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : "";
};

const decodeTokenPayload = (token) => {
  const part = token.split(".")[1];
  if (!part) throw new Error("관리자 인증 토큰 형식이 올바르지 않습니다.");
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(atob(normalized));
};

const base64Url = (value) => {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const privateKeyBytes = (pem) => {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function serviceAccessToken(serviceAccount) {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt) return cachedAccessToken;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Firebase 관리자 인증에 실패했습니다.");
  cachedAccessToken = result.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Math.max(60, Number(result.expires_in || 3600) - 120) * 1000;
  return cachedAccessToken;
}

async function verifyAdministrator(idToken, env) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const result = await response.json();
  const caller = result.users?.[0];
  if (!response.ok || !caller || caller.email !== env.ADMIN_EMAIL) throw new Error("관리자 권한을 확인할 수 없습니다.");
  const payload = decodeTokenPayload(idToken);
  const now = Math.floor(Date.now() / 1000);
  if (!payload.auth_time || now - Number(payload.auth_time) > 300) {
    throw new Error("관리자 본인 확인 시간이 만료되었습니다. 현재 비밀번호를 다시 입력해 주세요.");
  }
}

async function findApprovedMember(targetEmail, accessToken, projectId) {
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:lookup`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: [targetEmail] }),
  });
  const lookupResult = await lookup.json();
  const account = lookupResult.users?.[0];
  if (!lookup.ok || !account) throw new Error("해당 이름의 회원 계정을 찾을 수 없습니다.");

  const member = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(account.localId)}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  const memberResult = await member.json();
  if (!member.ok || memberResult.fields?.status?.stringValue !== "approved") {
    throw new Error("승인된 동기 계정만 비밀번호를 재설정할 수 있습니다.");
  }
  return account;
}

async function resetPassword(account, newPassword, accessToken, projectId) {
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:update", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      localId: account.localId,
      password: newPassword,
      targetProjectId: projectId,
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error?.message || "Firebase에서 비밀번호를 재설정하지 못했습니다.");
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = allowedOrigin(origin, env);
    if (!corsOrigin) return json({ message: "허용되지 않은 요청 출처입니다." }, 403, "null");
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      },
    });
    if (request.method !== "POST") return json({ message: "지원하지 않는 요청입니다." }, 405, corsOrigin);

    try {
      const text = await request.text();
      if (text.length > 12000) return json({ message: "요청 크기가 너무 큽니다." }, 413, corsOrigin);
      const { idToken, targetEmail, newPassword } = JSON.parse(text);
      if (typeof idToken !== "string" || idToken.length < 100) throw new Error("관리자 로그인이 필요합니다.");
      if (!/^[a-z0-9]+@dkumed26\.com$/.test(String(targetEmail || ""))) throw new Error("회원 계정 형식이 올바르지 않습니다.");
      if (targetEmail === env.ADMIN_EMAIL) throw new Error("관리자 계정은 이 기능으로 재설정할 수 없습니다.");
      if (typeof newPassword !== "string" || newPassword.length < 7 || newPassword.length > 128) {
        throw new Error("임시 비밀번호는 7자 이상 128자 이하여야 합니다.");
      }
      if (!env.FIREBASE_SERVICE_ACCOUNT || !env.FIREBASE_WEB_API_KEY || !env.ADMIN_EMAIL) {
        throw new Error("비밀번호 재설정 서버 설정이 완료되지 않았습니다.");
      }

      await verifyAdministrator(idToken, env);
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      const projectId = serviceAccount.project_id;
      const accessToken = await serviceAccessToken(serviceAccount);
      const account = await findApprovedMember(targetEmail, accessToken, projectId);
      await resetPassword(account, newPassword, accessToken, projectId);
      return json({ ok: true, uid: account.localId, email: account.email }, 200, corsOrigin);
    } catch (error) {
      return json({ message: error.message || "비밀번호 재설정에 실패했습니다." }, 400, corsOrigin);
    }
  },
};
