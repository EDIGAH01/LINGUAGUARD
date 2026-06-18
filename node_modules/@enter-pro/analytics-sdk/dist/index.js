// src/constants.ts
var SDK_VERSION = "0.0.8";
var SCHEMA_VERSION = "1.0.0";
var ENV_KEYS = {
  enabled: "VITE_ENTER_ANALYTICS_ENABLED",
  endpoint: "VITE_ENTER_ANALYTICS_ENDPOINT",
  token: "VITE_ENTER_ANALYTICS_TOKEN",
  projectId: "VITE_ENTER_PROJECT_ID",
  debug: "VITE_ENTER_ANALYTICS_DEBUG"
};
var DEFAULT_TRACK_ENDPOINT_BASE = "https://api.enter.pro";
var TRACK_ENDPOINT_PATH = "/code/api/v1/track";
var STORAGE_KEYS = {
  visitorId: "enter.analytics.visitor_id",
  visitorFirstSeenAt: "enter.analytics.visitor_first_seen_at",
  session: "enter.analytics.session",
  outbox: "enter.analytics.outbox"
};
var DEFAULT_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1e3;
var DEFAULT_OUTBOX_MAX_ITEMS = 500;
var DEFAULT_BATCH_SIZE = 20;
var DEFAULT_FLUSH_INTERVAL_MS = 5e3;
var DEFAULT_MAX_RETRIES = 7;
var DEFAULT_MAX_EVENT_AGE_MS = 72 * 60 * 60 * 1e3;
var DEFAULT_RETRY_DELAY_MS = 2e3;

// src/schema.ts
function buildEvent(params) {
  const includeScreenResolution = params.eventName === "page_view" || params.eventName === "session_start";
  const deviceContext = {};
  if (params.device?.device_type !== void 0) deviceContext.device_type = params.device.device_type;
  if (params.device?.browser !== void 0) deviceContext.browser = params.device.browser;
  if (params.device?.os !== void 0) deviceContext.os = params.device.os;
  if (params.device?.language !== void 0) deviceContext.language = params.device.language;
  if (includeScreenResolution && params.device?.screen_resolution !== void 0) {
    deviceContext.screen_resolution = params.device.screen_resolution;
  }
  const context = {
    ...deviceContext,
    ...params.options?.context ?? {}
  };
  return {
    event_id: params.eventId,
    event_name: params.eventName,
    event_type: params.eventType,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    schema_version: SCHEMA_VERSION,
    sdk_version: SDK_VERSION,
    enter_pid: params.projectId,
    visitor_id: params.identity.visitor_id,
    session_id: params.identity.session_id,
    is_new_visitor: params.isNewVisitor,
    page_url: params.page.url || void 0,
    page_path: params.page.path || void 0,
    page_title: params.page.title,
    referrer: params.page.referrer,
    utm_source: params.acquisition?.utm_source,
    utm_medium: params.acquisition?.utm_medium,
    utm_campaign: params.acquisition?.utm_campaign,
    utm_content: params.acquisition?.utm_content,
    utm_term: params.acquisition?.utm_term,
    context,
    properties: params.options?.properties ?? {}
  };
}

// src/identity/visitor-id.ts
function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function readLocalStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
  }
}
function readCookie(name) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}
function writeCookie(name, value) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}
function getOrCreateVisitorIdentity(now = Date.now()) {
  const storedVisitorId = readLocalStorage(STORAGE_KEYS.visitorId) ?? readCookie(STORAGE_KEYS.visitorId);
  const existingVisitorId = storedVisitorId && storedVisitorId.trim() ? storedVisitorId : null;
  const existingFirstSeenAt = Number(
    readLocalStorage(STORAGE_KEYS.visitorFirstSeenAt) ?? readCookie(STORAGE_KEYS.visitorFirstSeenAt)
  );
  if (existingVisitorId && Number.isFinite(existingFirstSeenAt) && existingFirstSeenAt > 0) {
    writeLocalStorage(STORAGE_KEYS.visitorId, existingVisitorId);
    writeLocalStorage(STORAGE_KEYS.visitorFirstSeenAt, String(existingFirstSeenAt));
    writeCookie(STORAGE_KEYS.visitorId, existingVisitorId);
    writeCookie(STORAGE_KEYS.visitorFirstSeenAt, String(existingFirstSeenAt));
    return {
      visitorId: existingVisitorId,
      firstSeenAt: existingFirstSeenAt,
      isNewVisitor: false
    };
  }
  const visitorId = existingVisitorId ?? createUuid();
  writeLocalStorage(STORAGE_KEYS.visitorId, visitorId);
  writeLocalStorage(STORAGE_KEYS.visitorFirstSeenAt, String(now));
  writeCookie(STORAGE_KEYS.visitorId, visitorId);
  writeCookie(STORAGE_KEYS.visitorFirstSeenAt, String(now));
  return {
    visitorId,
    firstSeenAt: now,
    isNewVisitor: true
  };
}

// src/session/session-manager.ts
function createUuid2() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function readStoredSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEYS.session);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.sessionId || !parsed.startedAt || !parsed.lastActivityAt) return null;
    return parsed;
  } catch {
    return null;
  }
}
function persistSession(session) {
  try {
    if (!session) {
      window.sessionStorage.removeItem(STORAGE_KEYS.session);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  } catch {
  }
}
var SessionManager = class {
  constructor(inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS) {
    this.session = null;
    this.inactivityTimeoutMs = inactivityTimeoutMs;
    this.session = typeof window !== "undefined" ? readStoredSession() : null;
  }
  ensureActiveSession(now = Date.now()) {
    const current = this.session ?? readStoredSession();
    if (!current) {
      const session = this.createSession(now);
      return {
        sessionId: session.sessionId,
        started: true,
        reason: "first_visit"
      };
    }
    if (now - current.lastActivityAt > this.inactivityTimeoutMs) {
      const session = this.createSession(now);
      return {
        sessionId: session.sessionId,
        started: true,
        reason: "expired"
      };
    }
    current.lastActivityAt = now;
    this.session = current;
    persistSession(current);
    return {
      sessionId: current.sessionId,
      started: false,
      reason: "continued"
    };
  }
  touch(now = Date.now()) {
    if (!this.session) {
      this.ensureActiveSession(now);
      return;
    }
    this.session.lastActivityAt = now;
    persistSession(this.session);
  }
  getCurrentSessionId() {
    return this.session?.sessionId ?? readStoredSession()?.sessionId;
  }
  endCurrentSession() {
    const sessionId = this.session?.sessionId ?? readStoredSession()?.sessionId;
    this.session = null;
    if (typeof window !== "undefined") {
      persistSession(null);
    }
    return sessionId;
  }
  hasExpired(now = Date.now()) {
    const current = this.session ?? readStoredSession();
    if (!current) return false;
    return now - current.lastActivityAt > this.inactivityTimeoutMs;
  }
  createSession(now) {
    const session = {
      sessionId: createUuid2(),
      startedAt: now,
      lastActivityAt: now
    };
    this.session = session;
    if (typeof window !== "undefined") {
      persistSession(session);
    }
    return session;
  }
};

// src/normalize/utm.ts
function getAcquisitionContext(url = typeof window !== "undefined" ? window.location.href : "") {
  if (!url) return {};
  let searchParams;
  try {
    searchParams = new URL(url).searchParams;
  } catch {
    return {};
  }
  const acquisition = {};
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) {
      acquisition[key] = value;
    }
  }
  return acquisition;
}

// src/normalize/device-info.ts
function getDeviceContext() {
  if (typeof navigator === "undefined") {
    return {};
  }
  const ua = navigator.userAgent;
  const language = navigator.language;
  const width = typeof screen !== "undefined" ? screen.width : void 0;
  const height = typeof screen !== "undefined" ? screen.height : void 0;
  return {
    device_type: detectDeviceType(ua),
    browser: detectBrowser(ua),
    os: detectOs(ua),
    language,
    screen_resolution: width && height ? `${width}x${height}` : void 0
  };
}
function detectDeviceType(ua) {
  if (/bot|crawler|spider/i.test(ua)) return "bot";
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}
function detectBrowser(ua) {
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return "Safari";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  return "Unknown";
}
function detectOs(ua) {
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os|macintosh/i.test(ua)) return "macOS";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ios/i.test(ua)) return "iOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Unknown";
}

// src/normalize/page-path.ts
function joinPathnameAndHash(pathname, hash) {
  if (!hash) return pathname;
  if (pathname) return `${pathname}${hash}`;
  return `/${hash}`;
}
function getPagePath(location, hashRouting = false) {
  const pathname = location.pathname || "";
  if (!hashRouting) return pathname;
  return joinPathnameAndHash(pathname, location.hash || "");
}
function getRouteKey(location, hashRouting = false) {
  const pathname = location.pathname || "";
  const search = location.search || "";
  if (!hashRouting) return `${pathname}${search}`;
  const hash = location.hash || "";
  if (pathname || search) {
    return `${pathname}${search}${hash}`;
  }
  return hash ? `/${hash}` : "";
}

// src/normalize/default-properties.ts
function createPageInstanceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function getPageContext(pageInstanceId = createPageInstanceId(), hashRouting = false) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      url: "",
      path: "",
      page_instance_id: pageInstanceId
    };
  }
  return {
    url: window.location.href,
    path: getPagePath(window.location, hashRouting),
    title: document.title || void 0,
    referrer: document.referrer || void 0,
    page_instance_id: pageInstanceId
  };
}
function buildDefaultContexts(pageInstanceId, hashRouting = false) {
  const page = getPageContext(pageInstanceId, hashRouting);
  return {
    page,
    acquisition: getAcquisitionContext(page.url),
    device: getDeviceContext()
  };
}

// src/normalize/sanitize.ts
var SENSITIVE_KEYS = ["password", "token", "cookie", "authorization", "auth", "email", "phone"];
function sanitizeEvent(event) {
  return {
    ...event,
    properties: sanitizeRecord(event.properties ?? {}),
    context: sanitizeRecord(event.context ?? {})
  };
}
function sanitizeRecord(record) {
  const output = {};
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_KEYS.some((needle) => key.toLowerCase().includes(needle))) {
      continue;
    }
    if (typeof value === "string") {
      output[key] = value.slice(0, 256);
      continue;
    }
    output[key] = value;
  }
  return output;
}

// src/transport/ack-types.ts
function isPermanentFailure(code) {
  return ["INVALID_SCHEMA", "UNAUTHORIZED", "FORBIDDEN", "BAD_REQUEST"].includes(code);
}
function isPermanentFailureReason(reason) {
  const normalized = reason.toLowerCase();
  return [
    "required",
    "invalid",
    "not registered",
    "unauthorized",
    "forbidden",
    "disabled",
    "origin",
    "missing"
  ].some((token) => normalized.includes(token));
}

// src/transport/backoff.ts
function getRetryDelayMs(retryCount, baseDelayMs = DEFAULT_RETRY_DELAY_MS) {
  const jitter = Math.floor(Math.random() * 250);
  return baseDelayMs * Math.pow(2, retryCount) + jitter;
}

// src/transport/outbox.ts
var Outbox = class {
  constructor(maxItems = DEFAULT_OUTBOX_MAX_ITEMS, maxRetries = DEFAULT_MAX_RETRIES, maxAgeMs = DEFAULT_MAX_EVENT_AGE_MS) {
    this.maxItems = maxItems;
    this.maxRetries = maxRetries;
    this.maxAgeMs = maxAgeMs;
  }
  enqueue(event, now = Date.now()) {
    const records = this.readRecords();
    const next = {
      event,
      status: "queued",
      retryCount: 0,
      nextRetryAt: now,
      createdAt: now
    };
    records.push(next);
    while (records.length > this.maxItems) {
      records.shift();
    }
    this.writeRecords(records);
  }
  getDueRecords(limit, now = Date.now()) {
    return this.readRecords().filter((record) => record.status === "queued" || record.status === "retryable_failed" && record.nextRetryAt <= now).filter((record) => now - record.createdAt <= this.maxAgeMs).slice(0, limit);
  }
  acknowledge(eventIds) {
    const accepted = new Set(eventIds);
    this.writeRecords(this.readRecords().filter((record) => !accepted.has(record.event.event_id)));
  }
  markRetryable(eventIds, lastError, retryDelayMs, now = Date.now()) {
    const ids = new Set(eventIds);
    const updated = this.readRecords().flatMap((record) => {
      if (!ids.has(record.event.event_id)) return [record];
      const retryCount = record.retryCount + 1;
      if (retryCount > this.maxRetries) return [];
      const resolvedRetryDelayMs = typeof retryDelayMs === "function" ? retryDelayMs(retryCount, record) : retryDelayMs;
      return [
        {
          ...record,
          status: "retryable_failed",
          retryCount,
          nextRetryAt: now + resolvedRetryDelayMs,
          lastError
        }
      ];
    });
    this.writeRecords(updated);
  }
  markPermanentFailed(eventIds) {
    const ids = new Set(eventIds);
    this.writeRecords(
      this.readRecords().map(
        (record) => ids.has(record.event.event_id) ? { ...record, status: "permanent_failed" } : record
      )
    );
  }
  size() {
    return this.readRecords().length;
  }
  readRecords() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.outbox);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  writeRecords(records) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.outbox, JSON.stringify(records));
    } catch {
    }
  }
};

// src/transport/http-transport.ts
function buildIdempotencyKey(records) {
  if (records.length === 0) return "";
  let hash = 2166136261;
  for (const record of records) {
    const id = record.event.event_id;
    for (let i = 0; i < id.length; i += 1) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 44;
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `idem_${records.length}_${records[0].event.event_id}_${hex}`;
}
var HttpTransport = class {
  constructor(options) {
    this.options = options;
    this.outbox = new Outbox();
    this.flushTimer = null;
    this.handlePageHide = () => {
      void this.flushBatch({ keepalive: true });
    };
    this.handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void this.flushBatch({ keepalive: true });
      }
    };
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  }
  start() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    window.addEventListener("pagehide", this.handlePageHide);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }
  stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    window.removeEventListener("pagehide", this.handlePageHide);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }
  enqueue(event) {
    this.outbox.enqueue(sanitizeEvent(event));
  }
  async flush() {
    await this.flushBatch();
  }
  getHealth() {
    return {
      outboxSize: this.outbox.size(),
      lastFlushAt: this.lastFlushAt,
      lastError: this.lastError
    };
  }
  async flushBatch(options = {}) {
    const records = this.outbox.getDueRecords(this.batchSize);
    if (records.length === 0) return;
    const idempotencyKey = buildIdempotencyKey(records);
    try {
      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.token}`,
          "X-Idempotency-Key": idempotencyKey
        },
        keepalive: options.keepalive === true,
        body: JSON.stringify({
          events: records.map((record) => record.event),
          idempotency_key: idempotencyKey
        })
      });
      if (!response.ok) {
        const message = `HTTP ${response.status}`;
        const eventIds = records.map((record) => record.event.event_id);
        if ([400, 401, 403].includes(response.status)) {
          this.outbox.markPermanentFailed(eventIds);
          this.lastError = message;
          return;
        }
        throw new Error(message);
      }
      const payload = await response.json();
      this.handleResponsePayload(records, payload);
      this.lastFlushAt = Date.now();
      this.lastError = void 0;
    } catch (error) {
      const eventIds = records.map((record) => record.event.event_id);
      this.lastError = error instanceof Error ? error.message : "Unknown error";
      this.outbox.markRetryable(eventIds, this.lastError, (retryCount) => getRetryDelayMs(retryCount));
    }
  }
  handleResponsePayload(records, payload) {
    if (Array.isArray(payload.accepted_ids) || Array.isArray(payload.rejected)) {
      const acceptedIds = payload.accepted_ids ?? records.map((record) => record.event.event_id);
      this.outbox.acknowledge(acceptedIds);
      const rejected = Array.isArray(payload.rejected) ? payload.rejected : [];
      if (rejected.length > 0) {
        const permanentIds = rejected.filter((item) => isPermanentFailure(item.code)).map((item) => item.event_id);
        const retryableIds = rejected.filter((item) => !isPermanentFailure(item.code)).map((item) => item.event_id);
        if (permanentIds.length > 0) {
          this.outbox.markPermanentFailed(permanentIds);
        }
        if (retryableIds.length > 0) {
          this.outbox.markRetryable(retryableIds, "Retryable reject", (retryCount) => getRetryDelayMs(retryCount));
        }
      }
      return;
    }
    if (typeof payload.accepted === "number" || Array.isArray(payload.errors)) {
      const pending = [...records];
      const permanentIds = [];
      const retryableIds = [];
      for (const error of payload.errors ?? []) {
        const index = pending.findIndex((record) => record.event.event_name === error.event_name);
        if (index === -1) continue;
        const [matched] = pending.splice(index, 1);
        if (isPermanentFailureReason(error.reason)) {
          permanentIds.push(matched.event.event_id);
        } else {
          retryableIds.push(matched.event.event_id);
        }
      }
      const acceptedCount = typeof payload.accepted === "number" ? payload.accepted : pending.length;
      const acceptedIds = pending.slice(0, acceptedCount).map((record) => record.event.event_id);
      const unresolvedIds = pending.slice(acceptedCount).map((record) => record.event.event_id);
      if (acceptedIds.length > 0) {
        this.outbox.acknowledge(acceptedIds);
      }
      if (permanentIds.length > 0) {
        this.outbox.markPermanentFailed(permanentIds);
      }
      if (retryableIds.length > 0) {
        this.outbox.markRetryable(retryableIds, "Retryable reject", (retryCount) => getRetryDelayMs(retryCount));
      }
      if (unresolvedIds.length > 0) {
        this.outbox.markRetryable(
          unresolvedIds,
          "Rejected without detailed error",
          (retryCount) => getRetryDelayMs(retryCount)
        );
      }
      return;
    }
    this.outbox.acknowledge(records.map((record) => record.event.event_id));
  }
};

// src/normalize/dedupe.ts
var DedupeWindow = class {
  constructor() {
    this.seen = /* @__PURE__ */ new Map();
  }
  shouldEmit(key, now = Date.now(), windowMs = 300) {
    const previous = this.seen.get(key);
    if (previous && now - previous < windowMs) {
      return false;
    }
    this.seen.set(key, now);
    return true;
  }
};

// src/collectors/page-view.ts
var PageViewCollector = class {
  constructor(onPageView, options = {}) {
    this.onPageView = onPageView;
    this.options = options;
    this.lastPath = "";
    this.dedupe = new DedupeWindow();
    this.emitIfChanged = () => {
      const nextPath = getRouteKey(window.location, this.options.hashRouting);
      if (nextPath === this.lastPath) return;
      if (!this.dedupe.shouldEmit(`page:${nextPath}`, Date.now(), 50)) return;
      this.lastPath = nextPath;
      this.onPageView();
    };
  }
  start() {
    this.emitIfChanged();
    this.patchHistory();
    window.addEventListener("popstate", this.emitIfChanged);
    if (this.options.hashRouting) {
      window.addEventListener("hashchange", this.emitIfChanged);
    }
  }
  stop() {
    this.cleanupHistoryPatch?.();
    window.removeEventListener("popstate", this.emitIfChanged);
    if (this.options.hashRouting) {
      window.removeEventListener("hashchange", this.emitIfChanged);
    }
  }
  patchHistory() {
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = (...args) => {
      originalPushState(...args);
      this.emitIfChanged();
    };
    history.replaceState = (...args) => {
      originalReplaceState(...args);
      this.emitIfChanged();
    };
    this.cleanupHistoryPatch = () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }
};

// src/collectors/session-lifecycle.ts
var SessionLifecycleCollector = class {
  constructor(onInactive, onActivity, timeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS, onIdleSuspend, onResume) {
    this.onInactive = onInactive;
    this.onActivity = onActivity;
    this.timeoutMs = timeoutMs;
    this.onIdleSuspend = onIdleSuspend;
    this.onResume = onResume;
    this.inactivityTimer = null;
    this.hiddenAt = null;
    this.handleActivity = () => {
      this.onActivity();
      this.resetTimer();
    };
    this.handleBeforeUnload = () => {
      this.onInactive("beforeunload");
    };
    this.handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        this.hiddenAt = Date.now();
        if (this.inactivityTimer) {
          clearTimeout(this.inactivityTimer);
          this.inactivityTimer = null;
        }
        this.onIdleSuspend?.();
        return;
      }
      if (document.visibilityState === "visible") {
        const hiddenAt = this.hiddenAt;
        this.hiddenAt = null;
        if (hiddenAt !== null) {
          const hiddenForMs = Math.max(0, Date.now() - hiddenAt);
          if (hiddenForMs >= this.timeoutMs) {
            this.onInactive("inactivity");
            return;
          }
          this.onResume?.(hiddenForMs);
        }
        this.handleActivity();
      }
    };
  }
  start() {
    this.resetTimer();
    window.addEventListener("click", this.handleActivity, true);
    window.addEventListener("keydown", this.handleActivity, true);
    window.addEventListener("scroll", this.handleActivity, true);
    window.addEventListener("beforeunload", this.handleBeforeUnload);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }
  stop() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    this.hiddenAt = null;
    window.removeEventListener("click", this.handleActivity, true);
    window.removeEventListener("keydown", this.handleActivity, true);
    window.removeEventListener("scroll", this.handleActivity, true);
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }
  resetTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.inactivityTimer = setTimeout(() => {
      this.onInactive("inactivity");
    }, this.timeoutMs);
  }
};

// src/normalize/noise-filter.ts
var MARKETING_NOISE_PATTERNS = [
  /facebook\.com\/(?:tr\/|privacy_sandbox\/)/i,
  /connect\.facebook\.net/i,
  /analytics\.twitter\.com/i,
  /googletagmanager\.com/i,
  /doubleclick\.net/i
];
function shouldDropErrorNoise(text) {
  if (!text) return false;
  return MARKETING_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

// src/collectors/error.ts
var ErrorCollector = class {
  constructor(onError) {
    this.onError = onError;
    this.boundError = this.handleError.bind(this);
    this.boundRejection = this.handleRejection.bind(this);
  }
  start() {
    window.addEventListener("error", this.boundError);
    window.addEventListener("unhandledrejection", this.boundRejection);
  }
  stop() {
    window.removeEventListener("error", this.boundError);
    window.removeEventListener("unhandledrejection", this.boundRejection);
  }
  handleError(event) {
    const message = event.error?.message ?? event.message;
    if (shouldDropErrorNoise(message)) return;
    this.onError(message, {
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  }
  handleRejection(event) {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    if (shouldDropErrorNoise(reason)) return;
    this.onError(reason, {
      error_type: "unhandledrejection"
    });
  }
};

// src/collectors/performance.ts
function getInjectedWebVitalsModule() {
  const candidate = globalThis.webVitals ?? globalThis.WebVitals;
  if (candidate?.onLCP && candidate.onFCP && candidate.onCLS && candidate.onTTFB && candidate.onINP) {
    return candidate;
  }
  return null;
}
var PerformanceCollector = class {
  constructor(onPerformance) {
    this.onPerformance = onPerformance;
    this.started = false;
    this.stopped = false;
    this.observers = [];
    this.accumulatedCls = 0;
    this.handleLoad = () => {
      if (this.stopped) return;
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav) return;
      this.onPerformance({
        dom_content_loaded_ms: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        load_event_ms: Math.round(nav.loadEventEnd - nav.startTime),
        ttfb_ms: Math.round(nav.responseStart - nav.requestStart)
      });
    };
    this.emitLargestContentfulPaint = () => {
    };
    this.handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden" || this.stopped) return;
      this.emitLargestContentfulPaint();
      if (this.accumulatedCls > 0) {
        this.onPerformance({
          metric_name: "CLS",
          metric_value: Number(this.accumulatedCls.toFixed(4)),
          metric_rating: "needs-improvement",
          metric_source: "performance_api_fallback"
        });
        this.accumulatedCls = 0;
      }
    };
    this.handleWebVital = (metric) => {
      if (this.stopped) return;
      this.onPerformance({
        metric_name: metric.name,
        metric_value: metric.value,
        metric_rating: metric.rating,
        metric_delta: metric.delta,
        metric_id: metric.id,
        navigation_type: metric.navigationType,
        metric_source: "web_vitals"
      });
    };
  }
  start() {
    if (typeof window === "undefined" || this.started) return;
    this.started = true;
    this.stopped = false;
    window.addEventListener("load", this.handleLoad, { once: true });
    void this.initWebVitals();
  }
  stop() {
    this.stopped = true;
    window.removeEventListener("load", this.handleLoad);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers = [];
  }
  async initWebVitals() {
    const webVitals = await this.waitForInjectedWebVitals();
    if (this.stopped) return;
    if (webVitals) {
      this.registerWebVitals(webVitals);
      return;
    }
    this.initNativePerformanceFallback();
  }
  // 业务方可能会稍晚把 web-vitals 以全局方式暴露出来，这里短暂等待后再决定是否回退到原生采集。
  async waitForInjectedWebVitals(timeoutMs = 1500, intervalMs = 100) {
    const existing = getInjectedWebVitalsModule();
    if (existing) return existing;
    const deadline = Date.now() + timeoutMs;
    while (!this.stopped && Date.now() < deadline) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, intervalMs);
      });
      const candidate = getInjectedWebVitalsModule();
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }
  registerWebVitals(webVitals) {
    webVitals.onLCP(this.handleWebVital);
    webVitals.onFCP(this.handleWebVital);
    webVitals.onCLS(this.handleWebVital);
    webVitals.onTTFB(this.handleWebVital);
    webVitals.onINP(this.handleWebVital);
  }
  initNativePerformanceFallback() {
    if (typeof PerformanceObserver === "undefined") return;
    this.observePaintMetrics();
    this.observeLargestContentfulPaint();
    this.observeLayoutShift();
  }
  observePaintMetrics() {
    try {
      const observer = new PerformanceObserver((list) => {
        if (this.stopped) return;
        for (const entry of list.getEntries()) {
          if (entry.name !== "first-contentful-paint") continue;
          this.onPerformance({
            metric_name: "FCP",
            metric_value: Math.round(entry.startTime),
            metric_rating: "needs-improvement",
            metric_source: "performance_api_fallback"
          });
        }
      });
      observer.observe({ type: "paint", buffered: true });
      this.observers.push(observer);
    } catch {
    }
  }
  observeLargestContentfulPaint() {
    try {
      let lastEntry;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        lastEntry = entries[entries.length - 1] ?? lastEntry;
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      this.observers.push(observer);
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.emitLargestContentfulPaint = () => {
        if (!lastEntry || this.stopped) return;
        this.onPerformance({
          metric_name: "LCP",
          metric_value: Math.round(lastEntry.startTime),
          metric_rating: "needs-improvement",
          metric_source: "performance_api_fallback"
        });
        lastEntry = void 0;
      };
    } catch {
    }
  }
  observeLayoutShift() {
    try {
      const observer = new PerformanceObserver((list) => {
        if (this.stopped) return;
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          this.accumulatedCls += entry.value ?? 0;
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
      this.observers.push(observer);
    } catch {
    }
  }
};

// src/custom-events/registry.ts
var EventRegistry = class {
  constructor() {
    this.definitions = /* @__PURE__ */ new Map();
  }
  register(definition) {
    this.definitions.set(definition.event_name, definition);
  }
  registerMany(definitions) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }
  replaceAll(definitions) {
    this.clear();
    this.registerMany(definitions);
  }
  get(eventName) {
    return this.definitions.get(eventName);
  }
  list() {
    return [...this.definitions.values()];
  }
  unregister(eventName) {
    this.definitions.delete(eventName);
  }
  clear() {
    this.definitions.clear();
  }
};

// src/custom-events/emitter.ts
function resolveDefinitionProperties(definition, target) {
  const properties = {};
  const bindings = definition.property_bindings ?? {};
  for (const [key, binding] of Object.entries(bindings)) {
    if (binding.type === "constant") {
      properties[key] = binding.value;
      continue;
    }
    if (!target) continue;
    if (binding.type === "textContent") {
      const source = resolveSourceElement(target, binding.selector);
      properties[key] = (source?.textContent ?? "").trim().slice(0, 256);
      continue;
    }
    if (binding.type === "attribute") {
      const source = resolveSourceElement(target, binding.selector);
      properties[key] = source?.getAttribute(binding.attribute) ?? void 0;
      continue;
    }
    if (binding.type === "dataset") {
      const source = resolveSourceElement(target, binding.selector);
      properties[key] = source?.dataset?.[binding.key] ?? void 0;
      continue;
    }
    if (binding.type === "closestAttribute") {
      const source = target.closest(binding.selector);
      properties[key] = source?.getAttribute(binding.attribute) ?? void 0;
      continue;
    }
    if (binding.type === "formField") {
      properties[key] = resolveFormField(target, binding.field, binding.valueType ?? "value");
      continue;
    }
    if (binding.type === "formFields") {
      properties[key] = resolveFormFields(
        target,
        binding.fields,
        binding.includeAll ?? false,
        binding.valueType ?? "value"
      );
    }
  }
  return properties;
}
function resolveSourceElement(target, selector) {
  if (!selector) return target;
  if (target.matches(selector)) return target;
  return target.closest(selector);
}
function resolveOwningForm(target) {
  if (target instanceof HTMLFormElement) return target;
  return target.closest("form");
}
function resolveFormField(target, field, valueType) {
  const form = resolveOwningForm(target);
  if (!form) return void 0;
  const escapedField = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(field) : field;
  const element = form.querySelector(`[name="${escapedField}"]`);
  if (!element) return void 0;
  if (valueType === "checked" && "checked" in element) {
    return element.checked;
  }
  return "value" in element ? element.value : void 0;
}
function resolveFormFields(target, fields, includeAll, valueType) {
  const form = resolveOwningForm(target);
  if (!form) return void 0;
  const collected = {};
  if (includeAll) {
    const elements = form.querySelectorAll("[name]");
    for (const element of elements) {
      const name = element.getAttribute("name");
      if (!name) continue;
      if (valueType === "checked" && "checked" in element) {
        collected[name] = element.checked;
      } else {
        collected[name] = "value" in element ? element.value : void 0;
      }
    }
    return collected;
  }
  for (const field of fields ?? []) {
    collected[field] = resolveFormField(target, field, valueType);
  }
  return collected;
}

// src/custom-events/manager.ts
var EventDefinitionManager = class {
  constructor(adapter) {
    this.adapter = adapter;
    this.boundClick = this.handleClick.bind(this);
    this.boundSubmit = this.handleSubmit.bind(this);
    this.started = false;
  }
  start() {
    if (this.started || typeof document === "undefined") return;
    this.started = true;
    document.addEventListener("click", this.boundClick, true);
    document.addEventListener("submit", this.boundSubmit, true);
  }
  stop() {
    if (!this.started || typeof document === "undefined") return;
    this.started = false;
    document.removeEventListener("click", this.boundClick, true);
    document.removeEventListener("submit", this.boundSubmit, true);
  }
  handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    for (const definition of this.adapter.getDefinitions()) {
      if (definition.enabled === false) continue;
      if (definition.trigger.kind !== "click" || !definition.trigger.selector) continue;
      const matched = target.closest(definition.trigger.selector);
      if (!matched) continue;
      this.adapter.emitDefinedEvent(definition.event_name, matched);
    }
  }
  handleSubmit(event) {
    const target = event.target instanceof HTMLFormElement ? event.target : null;
    if (!target) return;
    for (const definition of this.adapter.getDefinitions()) {
      if (definition.enabled === false) continue;
      if (definition.trigger.kind !== "submit" || !definition.trigger.selector) continue;
      const matched = target.matches(definition.trigger.selector) ? target : target.closest(definition.trigger.selector);
      if (!matched) continue;
      this.adapter.emitDefinedEvent(definition.event_name, matched);
    }
  }
};

// src/bootstrap.ts
var runtimeState = null;
function generateId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function readEnv() {
  const env = globalThis.__ENTER_ANALYTICS_ENV__ ?? import.meta.env ?? {};
  const enabledRaw = env[ENV_KEYS.enabled];
  const projectId = env[ENV_KEYS.projectId];
  return {
    // 默认开启，只有显式传入 false 才关闭，降低集成门槛。
    enabled: enabledRaw !== "false",
    endpoint: resolveTrackEndpoint(env[ENV_KEYS.endpoint]),
    token: env[ENV_KEYS.token],
    projectId,
    debug: env[ENV_KEYS.debug] === "true"
  };
}
function resolveTrackEndpoint(baseUrl = DEFAULT_TRACK_ENDPOINT_BASE) {
  try {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL(TRACK_ENDPOINT_PATH, normalizedBase).toString();
  } catch {
    return `${DEFAULT_TRACK_ENDPOINT_BASE}${TRACK_ENDPOINT_PATH}`;
  }
}
function bootstrapEnterAnalytics(options = {}) {
  if (typeof window === "undefined") {
    return;
  }
  if (runtimeState?.initialized) {
    return;
  }
  const config = readEnv();
  const visitor = getOrCreateVisitorIdentity();
  const sessionManager = new SessionManager(options.inactivityTimeoutMs);
  const pageInstanceId = generateId("page");
  const registry = new EventRegistry();
  const eventDefinitionManager = new EventDefinitionManager({
    getDefinitions: () => registry.list(),
    emitDefinedEvent: (eventName, target) => {
      emitDefinedEvent(eventName, target);
    }
  });
  runtimeState = {
    config,
    hashRouting: options.hashRouting === true,
    pageInstanceId,
    visitorId: visitor.visitorId,
    isNewVisitor: visitor.isNewVisitor,
    pageTiming: null,
    sessionManager,
    registry,
    eventDefinitionManager,
    initialized: false
  };
  if (!config.enabled || !config.endpoint || !config.token) {
    return;
  }
  const transport = new HttpTransport({
    endpoint: config.endpoint,
    token: config.token,
    debug: config.debug
  });
  runtimeState.transport = transport;
  const sessionInfo = sessionManager.ensureActiveSession();
  if (sessionInfo.started) {
    emitTrafficEvent("session_start", {
      properties: {
        session_reason: sessionInfo.reason
      }
    });
  }
  runtimeState.pageViewCollector = new PageViewCollector(() => {
    const previousPage = finishCurrentPageTiming("route_change");
    startCurrentPageTiming();
    touchActiveSession();
    emitTrafficEvent("page_view", {
      properties: buildPreviousPageProperties(previousPage)
    });
  }, { hashRouting: options.hashRouting === true });
  runtimeState.pageViewCollector.start();
  runtimeState.sessionCollector = new SessionLifecycleCollector(
    (reason) => {
      const pageLifecycle = finishCurrentPageTiming(reason);
      const sessionId = sessionManager.endCurrentSession();
      if (!sessionId) return;
      emitTrafficEvent("session_end", {
        properties: {
          ended_by: reason,
          ...pageLifecycle
        },
        overrideSessionId: sessionId
      });
    },
    () => {
      touchActiveSession();
    },
    options.inactivityTimeoutMs,
    () => {
      pauseCurrentPageTiming();
    },
    () => {
      resumeCurrentPageTiming();
    }
  );
  runtimeState.sessionCollector.start();
  runtimeState.errorCollector = new ErrorCollector((message, context) => {
    emitTrafficEvent("error", {
      eventType: "traffic",
      properties: {
        error_message: message,
        ...context
      }
    });
  });
  runtimeState.errorCollector.start();
  runtimeState.performanceCollector = new PerformanceCollector((payload) => {
    emitTrafficEvent("performance", {
      eventType: "traffic",
      properties: payload
    });
  });
  runtimeState.performanceCollector.start();
  runtimeState.eventDefinitionManager?.start();
  transport.start();
  runtimeState.initialized = true;
  if (options.disableVerifyPing !== true) {
    emitTrafficEvent("enter_verify", {
      properties: {
        bootstrap_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  if (options.eventDefinitionsUrl) {
    void loadRemoteEventDefinitions(options.eventDefinitionsUrl, options.eventDefinitionsFetcher);
  }
}
async function loadEventDefinitionsFromUrl(url, fetcher = typeof fetch === "function" ? fetch.bind(globalThis) : void 0) {
  return loadRemoteEventDefinitions(url, fetcher);
}
async function loadRemoteEventDefinitions(url, fetcher) {
  const fetchImpl = fetcher ?? (typeof fetch === "function" ? fetch.bind(globalThis) : void 0);
  if (!fetchImpl) {
    debugLogAnalytics("Skip loading remote event definitions because fetch is unavailable.");
    return [];
  }
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      credentials: "omit"
    });
    if (!response.ok) {
      debugLogAnalytics(`Failed to load remote event definitions: HTTP ${response.status}.`);
      return [];
    }
    const payload = await response.json();
    const definitions = Array.isArray(payload) ? payload : payload.definitions ?? payload.data?.definitions ?? [];
    replaceEventDefinitions(definitions);
    return definitions;
  } catch (error) {
    debugLogAnalytics("Failed to load remote event definitions.", error);
    return [];
  }
}
function registerEventDefinition(definition) {
  runtimeState?.registry.register(definition);
}
function registerEventDefinitions(definitions) {
  runtimeState?.registry.registerMany(definitions);
}
function replaceEventDefinitions(definitions) {
  runtimeState?.registry.replaceAll(definitions);
}
function unregisterEventDefinition(eventName) {
  runtimeState?.registry.unregister(eventName);
}
function clearEventDefinitions() {
  runtimeState?.registry.clear();
}
function emitDefinedEvent(eventName, target) {
  const definition = runtimeState?.registry.get(eventName);
  if (!definition) return;
  trackEvent(definition.event_name, {
    eventType: definition.event_type,
    context: definition.context,
    properties: {
      ...definition.properties ?? {},
      ...resolveDefinitionProperties(definition, target)
    }
  });
}
function trackEvent(eventName, options = {}) {
  if (!runtimeState?.initialized || !runtimeState.config.enabled) return;
  emitEvent(eventName, options.eventType ?? "custom", options);
}
async function flush() {
  await runtimeState?.transport?.flush();
}
function destroy() {
  runtimeState?.pageViewCollector?.stop();
  runtimeState?.sessionCollector?.stop();
  runtimeState?.errorCollector?.stop();
  runtimeState?.performanceCollector?.stop();
  runtimeState?.eventDefinitionManager?.stop();
  runtimeState?.transport?.stop();
  runtimeState = null;
}
function getAnalyticsHealth() {
  return {
    initialized: runtimeState?.initialized ?? false,
    enabled: runtimeState?.config.enabled ?? false,
    visitorId: runtimeState?.visitorId,
    sessionId: runtimeState?.sessionManager.getCurrentSessionId(),
    endpoint: runtimeState?.config.endpoint,
    outboxSize: runtimeState?.transport?.getHealth().outboxSize ?? 0,
    lastFlushAt: runtimeState?.transport?.getHealth().lastFlushAt,
    lastError: runtimeState?.transport?.getHealth().lastError
  };
}
function emitTrafficEvent(eventName, options = {}) {
  if (!runtimeState?.config.enabled) return;
  emitEvent(eventName, options.eventType ?? "traffic", options);
}
function emitEvent(eventName, eventType, options = {}) {
  if (!runtimeState?.transport) return;
  const { page, acquisition, device } = buildDefaultContexts(runtimeState.pageInstanceId, runtimeState.hashRouting);
  const event = buildEvent({
    eventId: generateId("evt"),
    eventName,
    eventType,
    identity: {
      visitor_id: runtimeState.visitorId,
      session_id: resolveSessionIdForEvent(eventName, options.overrideSessionId)
    },
    projectId: runtimeState.config.projectId,
    isNewVisitor: shouldAttachVisitorFreshness(eventName) ? runtimeState.isNewVisitor : void 0,
    page,
    acquisition,
    device,
    options
  });
  runtimeState.transport.enqueue(event);
}
function touchActiveSession() {
  if (!runtimeState) return;
  const sessionInfo = runtimeState.sessionManager.ensureActiveSession();
  if (sessionInfo.started) {
    emitSessionStart(sessionInfo.reason);
  }
  if (!runtimeState.pageTiming) {
    startCurrentPageTiming();
  }
  resumeCurrentPageTiming();
}
function startCurrentPageTiming(now = Date.now()) {
  if (!runtimeState) return;
  const { page } = buildDefaultContexts(runtimeState.pageInstanceId, runtimeState.hashRouting);
  runtimeState.pageTiming = {
    url: page.url,
    path: page.path,
    startedAt: now,
    visibleStartedAt: isDocumentVisible() ? now : void 0,
    visibleDurationMs: 0
  };
}
function finishCurrentPageTiming(reason, now = Date.now()) {
  if (!runtimeState?.pageTiming) return {};
  const timing = runtimeState.pageTiming;
  pauseCurrentPageTiming(now);
  runtimeState.pageTiming = null;
  return {
    lifecycle_reason: reason,
    page_duration_ms: Math.max(0, now - timing.startedAt),
    time_on_page_ms: timing.visibleDurationMs,
    exit_page: timing.url || void 0,
    exit_page_path: timing.path || void 0
  };
}
function buildPreviousPageProperties(pageLifecycle) {
  if (!pageLifecycle.page_duration_ms && pageLifecycle.page_duration_ms !== 0) {
    return {};
  }
  return {
    previous_page_duration_ms: pageLifecycle.page_duration_ms,
    previous_time_on_page_ms: pageLifecycle.time_on_page_ms,
    previous_page_url: pageLifecycle.exit_page,
    previous_page_path: pageLifecycle.exit_page_path
  };
}
function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}
function pauseCurrentPageTiming(now = Date.now()) {
  const timing = runtimeState?.pageTiming;
  if (!timing || timing.visibleStartedAt === void 0) {
    return;
  }
  timing.visibleDurationMs += Math.max(0, now - timing.visibleStartedAt);
  timing.visibleStartedAt = void 0;
}
function resumeCurrentPageTiming(now = Date.now()) {
  const timing = runtimeState?.pageTiming;
  if (!timing || timing.visibleStartedAt !== void 0 || !isDocumentVisible()) {
    return;
  }
  timing.visibleStartedAt = now;
}
function resolveSessionIdForEvent(eventName, overrideSessionId) {
  if (!runtimeState || overrideSessionId) {
    return overrideSessionId ?? "";
  }
  const sessionInfo = runtimeState.sessionManager.ensureActiveSession();
  if (sessionInfo.started && eventName !== "session_start") {
    emitSessionStart(sessionInfo.reason);
  }
  return sessionInfo.sessionId;
}
function emitSessionStart(reason) {
  emitTrafficEvent("session_start", {
    properties: {
      session_reason: reason
    }
  });
}
function debugLogAnalytics(message, details) {
  if (!runtimeState?.config.debug || typeof console === "undefined") {
    return;
  }
  if (details === void 0) {
    console.warn(`[enter-analytics] ${message}`);
    return;
  }
  console.warn(`[enter-analytics] ${message}`, details);
}
function shouldAttachVisitorFreshness(eventName) {
  return eventName === "session_start" || eventName === "page_view";
}

export { SessionManager, bootstrapEnterAnalytics, buildEvent, clearEventDefinitions, destroy, emitDefinedEvent, flush, getAnalyticsHealth, getOrCreateVisitorIdentity, loadEventDefinitionsFromUrl, registerEventDefinition, registerEventDefinitions, replaceEventDefinitions, trackEvent, unregisterEventDefinition };
