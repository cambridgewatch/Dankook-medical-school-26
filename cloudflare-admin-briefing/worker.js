let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

const KST_TIME_ZONE = "Asia/Seoul";
const DEFAULT_DAYS = 7;
const MAX_DAYS = 7;
const MAX_COLLECTION_DOCUMENTS = 500;
const RESPONSE_CACHE_SECONDS = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 20;

const memoryRateLimit = new Map();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

function base64Url(value) {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function privateKeyBytes(pem) {
  const body = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function serviceAccessToken(serviceAccount) {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt) {
    return cachedAccessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
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
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
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
  if (!response.ok || !result.access_token) {
    throw new Error("Firebase 서비스 계정 인증에 실패했습니다.");
  }

  cachedAccessToken = result.access_token;
  cachedAccessTokenExpiresAt =
    Date.now() + Math.max(60, Number(result.expires_in || 3600) - 120) * 1000;
  return cachedAccessToken;
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    difference |= (left[i] || 0) ^ (right[i] || 0);
  }
  return difference === 0;
}

function authenticateAction(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return !!match && constantTimeEqual(match[1], env.ACTION_AUTH_TOKEN);
}

function clientKey(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")
    || "unknown";
}

async function enforceRateLimit(request, env) {
  const key = `admin-briefing:${clientKey(request)}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RATE_LIMIT_WINDOW_SECONDS);

  if (env.RATE_LIMIT) {
    const stored = await env.RATE_LIMIT.get(key, "json");
    const state = stored && stored.windowStart === windowStart
      ? stored
      : { windowStart, count: 0 };
    state.count += 1;
    await env.RATE_LIMIT.put(key, JSON.stringify(state), {
      expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 10,
    });
    if (state.count > RATE_LIMIT_MAX_REQUESTS) {
      throw Object.assign(new Error("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."), {
        status: 429,
      });
    }
    return;
  }

  const state = memoryRateLimit.get(key);
  if (!state || state.windowStart !== windowStart) {
    memoryRateLimit.set(key, { windowStart, count: 1 });
    return;
  }
  state.count += 1;
  if (state.count > RATE_LIMIT_MAX_REQUESTS) {
    throw Object.assign(new Error("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."), {
      status: 429,
    });
  }
}

function firestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(firestoreValue);
  }
  if ("mapValue" in value) {
    return firestoreFields(value.mapValue.fields || {});
  }
  return null;
}

function firestoreFields(fields = {}) {
  const output = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = firestoreValue(value);
  }
  return output;
}

function documentId(name = "") {
  return name.split("/").pop() || "";
}

async function listCollection({
  accessToken,
  projectId,
  path,
  maxDocuments = MAX_COLLECTION_DOCUMENTS,
}) {
  const documents = [];
  let pageToken = "";
  while (documents.length < maxDocuments) {
    const pageSize = Math.min(100, maxDocuments - documents.length);
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
      `/databases/(default)/documents/${path}`,
    );
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 404) return [];
    const result = await response.json();
    if (!response.ok) {
      throw new Error(`Firestore 컬렉션 조회 실패: ${path}`);
    }

    for (const document of result.documents || []) {
      documents.push({
        id: documentId(document.name),
        data: firestoreFields(document.fields || {}),
        createTime: document.createTime || null,
        updateTime: document.updateTime || null,
      });
    }
    pageToken = result.nextPageToken || "";
    if (!pageToken) break;
  }
  return documents;
}

function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function kstDateKey(date = new Date()) {
  const parts = kstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateKeyToUtcNoon(dateKey) {
  return new Date(`${dateKey}T03:00:00.000Z`);
}

function addDays(dateKey, days) {
  const date = dateKeyToUtcNoon(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareDateKeys(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function eventTouchesRange(event, startDate, endDate) {
  if (!validDateKey(event.date)) return false;
  const eventEnd = validDateKey(event.endDate) ? event.endDate : event.date;
  return compareDateKeys(event.date, endDate) <= 0
    && compareDateKeys(eventEnd, startDate) >= 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createTextSanitizer(memberDocuments, extraTerms = "") {
  const terms = [
    ...memberDocuments.map((document) => document.data?.name),
    ...String(extraTerms || "").split(/[\n,]/),
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => value.length >= 2)
    .sort((a, b) => b.length - a.length);
  const uniqueTerms = [...new Set(terms)];

  return (value, maxLength = 2000) => {
    let output = String(value || "").trim();
    output = output
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
      .replace(/u[0-9a-f]{8,}@dkumed26\.com/gi, "[계정]");
    for (const term of uniqueTerms) {
      output = output.replace(new RegExp(escapeRegExp(term), "gu"), "[이름]");
    }
    return output.slice(0, maxLength);
  };
}

function attachmentCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function timestampToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeCalendar(document, scope, sanitizeText) {
  const value = document.data;
  if (value.kind === "migrationMarker" || value.hidden === true) return null;
  if (!validDateKey(value.date)) return null;
  return {
    scope,
    date: value.date,
    endDate: validDateKey(value.endDate) ? value.endDate : null,
    title: sanitizeText(value.text, 300),
    detail: sanitizeText(value.detail, 2500),
    category: sanitizeText(value.type || "etc", 40),
    attachmentCount: attachmentCount(value.attachments),
    updatedAt: timestampToIso(value.updatedAt || document.updateTime),
  };
}

function normalizeNotice(document, sanitizeText) {
  const value = document.data;
  return {
    title: sanitizeText(value.title, 300),
    detail: sanitizeText(value.detail, 3000),
    category: sanitizeText(value.tag || "notice", 40),
    pinned: value.pinned === true,
    attachmentCount: attachmentCount(value.attachments),
    createdAt: timestampToIso(value.createdAt || document.createTime),
    updatedAt: timestampToIso(value.updatedAt || document.updateTime),
  };
}

function normalizeAlert(document, sanitizeText) {
  const value = document.data;
  return {
    type: sanitizeText(value.type, 40),
    title: sanitizeText(value.title || value.text, 300),
    detail: sanitizeText(value.detail, 2500),
    date: validDateKey(value.date) ? value.date : null,
    createdAt: timestampToIso(value.createdAt || document.createTime),
    updatedAt: timestampToIso(value.updatedAt || document.updateTime),
  };
}

function normalizePoll(document, participantCount, sanitizeText) {
  const value = document.data;
  const options = Array.isArray(value.options)
    ? value.options.map((option) => ({
      label: sanitizeText(option?.text, 200),
    })).filter((option) => option.label)
    : [];
  return {
    title: sanitizeText(value.title, 300),
    description: sanitizeText(value.description, 2500),
    options,
    closed: value.closed === true,
    allowVoteChange: value.allowVoteChange === true,
    allowOptionAdd: value.allowOptionAdd === true,
    showResultsBeforeClose: value.showResultsBeforeClose === true,
    participantCount,
    createdAt: timestampToIso(value.createdAt || document.createTime),
    updatedAt: timestampToIso(value.updatedAt || document.updateTime),
    closedAt: timestampToIso(value.closedAt),
  };
}

function timestampInDateRange(timestamp, startDate, endDate) {
  const iso = timestampToIso(timestamp);
  if (!iso) return false;
  const key = kstDateKey(new Date(iso));
  return compareDateKeys(key, startDate) >= 0
    && compareDateKeys(key, endDate) <= 0;
}

function sortCalendar(a, b) {
  return compareDateKeys(a.date, b.date)
    || String(a.title).localeCompare(String(b.title), "ko");
}

function classifyBriefing({ calendar, notices, alerts, polls, today, endDate }) {
  const todayItems = calendar.filter((item) => eventTouchesRange(item, today, today));
  const upcomingByDate = {};
  for (let offset = 0; offset < MAX_DAYS; offset += 1) {
    const date = addDays(today, offset);
    if (compareDateKeys(date, endDate) > 0) break;
    upcomingByDate[date] = calendar.filter((item) => eventTouchesRange(item, date, date));
  }

  const urgent = calendar.filter((item) => {
    if (!["assignment", "exam", "todo", "acad", "event"].includes(item.category)) return false;
    return eventTouchesRange(item, today, addDays(today, 2));
  });

  const activePolls = polls.filter((poll) => !poll.closed);
  const pinnedNotices = notices.filter((notice) => notice.pinned);
  const recentAlerts = alerts.filter((alert) => {
    if (alert.date && compareDateKeys(alert.date, today) >= 0
      && compareDateKeys(alert.date, endDate) <= 0) {
      return true;
    }
    return timestampInDateRange(alert.createdAt, addDays(today, -2), endDate);
  });

  return {
    todayItems,
    upcomingByDate,
    urgentItems: urgent,
    activePolls,
    pinnedNotices,
    recentAlerts,
  };
}

async function buildBriefing(env, days) {
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const projectId = serviceAccount.project_id;
  if (!projectId) throw new Error("서비스 계정에 project_id가 없습니다.");
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_PROJECT_ID !== projectId) {
    throw new Error("FIREBASE_PROJECT_ID와 서비스 계정 프로젝트가 일치하지 않습니다.");
  }

  const accessToken = await serviceAccessToken(serviceAccount);
  const today = kstDateKey();
  const endDate = addDays(today, days - 1);

  const [
    globalCalendarDocs,
    personalCalendarDocs,
    noticeDocs,
    alertDocs,
    pollDocs,
    memberDocs,
  ] = await Promise.all([
    listCollection({ accessToken, projectId, path: "calendarEvents" }),
    listCollection({
      accessToken,
      projectId,
      path: `calendarPersonal/${encodeURIComponent(env.ADMIN_UID)}/events`,
    }),
    listCollection({ accessToken, projectId, path: "notices" }),
    listCollection({ accessToken, projectId, path: "alerts" }),
    listCollection({ accessToken, projectId, path: "polls" }),
    listCollection({ accessToken, projectId, path: "members", maxDocuments: 100 }),
  ]);

  const sanitizeText = createTextSanitizer(memberDocs, env.REDACT_TERMS);

  const calendar = [
    ...globalCalendarDocs.map((doc) => normalizeCalendar(doc, "global", sanitizeText)),
    ...personalCalendarDocs.map((doc) => normalizeCalendar(doc, "personal", sanitizeText)),
  ].filter(Boolean)
    .filter((event) => eventTouchesRange(event, today, endDate))
    .sort(sortCalendar);

  const notices = noticeDocs.map((doc) => normalizeNotice(doc, sanitizeText))
    .filter((notice) => notice.pinned
      || timestampInDateRange(notice.createdAt, addDays(today, -7), endDate))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned)
      || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const alerts = alertDocs.map((doc) => normalizeAlert(doc, sanitizeText))
    .filter((alert) => {
      if (alert.date) {
        return compareDateKeys(alert.date, addDays(today, -2)) >= 0
          && compareDateKeys(alert.date, endDate) <= 0;
      }
      return timestampInDateRange(alert.createdAt, addDays(today, -2), endDate);
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const pollResults = await Promise.all(pollDocs.map(async (pollDocument) => {
    const value = pollDocument.data;
    const recentlyClosed = value.closed === true
      && timestampInDateRange(value.closedAt || value.updatedAt, addDays(today, -7), endDate);
    if (value.closed === true && !recentlyClosed) return null;

    const voteDocuments = await listCollection({
      accessToken,
      projectId,
      path: `polls/${encodeURIComponent(pollDocument.id)}/votes`,
      maxDocuments: 1000,
    });
    return normalizePoll(pollDocument, voteDocuments.length, sanitizeText);
  }));
  const polls = pollResults.filter(Boolean)
    .sort((a, b) => Number(a.closed) - Number(b.closed)
      || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const briefing = classifyBriefing({
    calendar,
    notices,
    alerts,
    polls,
    today,
    endDate,
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    timeZone: KST_TIME_ZONE,
    range: { startDate: today, endDate, days },
    summary: {
      todayItemCount: briefing.todayItems.length,
      upcomingItemCount: calendar.length,
      urgentItemCount: briefing.urgentItems.length,
      activePollCount: briefing.activePolls.length,
      pinnedNoticeCount: briefing.pinnedNotices.length,
      recentAlertCount: briefing.recentAlerts.length,
    },
    briefing,
    data: {
      calendar,
      notices,
      alerts,
      polls,
    },
    privacy: {
      directIdentityFieldsExcluded: true,
      knownMemberNamesRedacted: true,
      emailPatternsRedacted: true,
      uidFieldsExcluded: true,
      passwordFieldsExcluded: true,
      attachmentContentIncluded: false,
      pollParticipantIdentityIncluded: false,
    },
  };
}

function parseDays(requestUrl) {
  const raw = new URL(requestUrl).searchParams.get("days");
  if (raw === null || raw === "") return DEFAULT_DAYS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_DAYS) {
    throw Object.assign(new Error("days는 1 이상 7 이하의 정수여야 합니다."), {
      status: 400,
    });
  }
  return value;
}

async function cachedBriefing(request, env, days) {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = `?days=${days}&schema=1`;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      status: cached.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Worker-Cache": "HIT",
      },
    });
  }

  const result = await buildBriefing(env, days);
  const body = JSON.stringify(result);
  const cacheResponse = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `max-age=${RESPONSE_CACHE_SECONDS}`,
    },
  });
  await cache.put(cacheKey, cacheResponse);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Worker-Cache": "MISS",
    },
  });
}

function validateEnvironment(env) {
  const required = [
    "ACTION_AUTH_TOKEN",
    "FIREBASE_SERVICE_ACCOUNT",
    "FIREBASE_PROJECT_ID",
    "ADMIN_UID",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Worker 설정이 누락되었습니다: ${missing.join(", ")}`);
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname !== "/api/admin-briefing"
        && url.pathname !== "/api/admin-briefing/") {
        return json({ message: "찾을 수 없는 경로입니다." }, 404);
      }
      if (request.method !== "GET") {
        return json({ message: "읽기 전용 GET 요청만 지원합니다." }, 405, {
          Allow: "GET",
        });
      }

      validateEnvironment(env);
      if (!authenticateAction(request, env)) {
        return json({ message: "인증에 실패했습니다." }, 401, {
          "WWW-Authenticate": "Bearer",
        });
      }

      await enforceRateLimit(request, env);
      const days = parseDays(request.url);
      return await cachedBriefing(request, env, days);
    } catch (error) {
      const status = Number(error?.status) || 500;
      return json({
        message: status >= 500
          ? "브리핑 데이터를 불러오지 못했습니다."
          : (error.message || "요청을 처리하지 못했습니다."),
      }, status);
    }
  },
};
