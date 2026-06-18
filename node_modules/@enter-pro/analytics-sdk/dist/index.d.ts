type EnterEventType = 'traffic' | 'custom' | 'conversion';
interface PageContext {
    url: string;
    path: string;
    title?: string;
    referrer?: string;
    page_instance_id: string;
}
interface AcquisitionContext {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
}
interface DeviceContext {
    device_type?: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
    browser?: string;
    os?: string;
    language?: string;
    screen_resolution?: string;
}
interface IdentityContext {
    visitor_id: string;
    session_id: string;
}
interface EnterAnalyticsEvent {
    event_id: string;
    event_name: string;
    event_type: EnterEventType;
    timestamp: string;
    schema_version: string;
    sdk_version: string;
    enter_pid?: string;
    visitor_id: string;
    session_id: string;
    is_new_visitor?: boolean;
    page_url?: string;
    page_path?: string;
    page_title?: string;
    referrer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    /**
     * Free-form context bag. Auto-collected device fields (`device_type`,
     * `browser`, `os`, `language`, `screen_resolution`) are nested here at emit
     * time to match the backend `/v1/track` schema. User-provided
     * `TrackEventOptions.context` is merged on top with higher precedence.
     */
    context?: Record<string, unknown>;
    properties?: Record<string, unknown>;
}
interface EventDefinitionTrigger {
    kind: 'manual' | 'click' | 'submit' | 'custom';
    selector?: string;
}
type PropertyBinding = {
    type: 'constant';
    value?: string | number | boolean;
} | {
    type: 'textContent';
    selector?: string;
} | {
    type: 'attribute';
    attribute: string;
    selector?: string;
} | {
    type: 'dataset';
    key: string;
    selector?: string;
} | {
    type: 'closestAttribute';
    selector: string;
    attribute: string;
} | {
    type: 'formField';
    field: string;
    valueType?: 'value' | 'checked';
} | {
    type: 'formFields';
    fields?: string[];
    includeAll?: boolean;
    valueType?: 'value' | 'checked';
};
interface EventDefinition {
    event_name: string;
    event_type: Exclude<EnterEventType, 'traffic'>;
    trigger: EventDefinitionTrigger;
    property_bindings?: Record<string, PropertyBinding>;
    properties?: Record<string, unknown>;
    context?: Record<string, unknown>;
    definition_version: string;
    enabled?: boolean;
}
interface AnalyticsEnvConfig {
    enabled: boolean;
    endpoint?: string;
    token?: string;
    projectId?: string;
    debug: boolean;
}
interface SessionEnsureResult {
    sessionId: string;
    started: boolean;
    reason: 'first_visit' | 'continued' | 'expired';
}
interface AnalyticsHealth {
    initialized: boolean;
    enabled: boolean;
    visitorId?: string;
    sessionId?: string;
    outboxSize: number;
    endpoint?: string;
    lastFlushAt?: number;
    lastError?: string;
}
interface TrackEventOptions {
    eventType?: Exclude<EnterEventType, 'traffic'>;
    context?: Record<string, unknown>;
    properties?: Record<string, unknown>;
}
interface BootstrapOptions {
    /** Inactivity timeout before a session expires. Default: 30 minutes. */
    inactivityTimeoutMs?: number;
    /** Skip the one-shot enter_verify ping fired right after bootstrap. */
    disableVerifyPing?: boolean;
    /**
     * Treat `location.hash` as part of the logical route when computing
     * `page_path` and auto-emitting `page_view` events.
     */
    hashRouting?: boolean;
    /**
     * If provided, the SDK will GET this URL after bootstrap and call
     * replaceEventDefinitions() with the response. Accepts either a raw array
     * or a `{ data: { definitions: [...] } }` envelope.
     */
    eventDefinitionsUrl?: string;
    /** Optional fetch implementation override (useful for SSR / proxy / auth). */
    eventDefinitionsFetcher?: typeof fetch;
}

/**
 * bootstrap 是 runtime 的唯一入口：初始化 identity、session、collector 和 transport。
 */
declare function bootstrapEnterAnalytics(options?: BootstrapOptions): void;
/**
 * 从远端拉取 EventDefinition 列表，并替换本地注册表。
 * 用于打通"用户在 Enter 后台/Agent 定义事件 → 运行时 SDK 自动绑定 DOM"的闭环。
 */
declare function loadEventDefinitionsFromUrl(url: string, fetcher?: typeof fetch): Promise<EventDefinition[]>;
declare function registerEventDefinition(definition: EventDefinition): void;
declare function registerEventDefinitions(definitions: EventDefinition[]): void;
declare function replaceEventDefinitions(definitions: EventDefinition[]): void;
declare function unregisterEventDefinition(eventName: string): void;
declare function clearEventDefinitions(): void;
declare function emitDefinedEvent(eventName: string, target?: Element | null): void;
declare function trackEvent(eventName: string, options?: TrackEventOptions): void;
declare function flush(): Promise<void>;
declare function destroy(): void;
declare function getAnalyticsHealth(): AnalyticsHealth;

/**
 * 核心事件构造器：所有流量事件和用户定义事件都必须走同一套 envelope。
 *
 * Device context fields (`device_type`, `browser`, `os`, `language`,
 * `screen_resolution`) are nested inside `context` to match the backend
 * `/v1/track` schema — the backend only accepts a fixed top-level field list
 * and silently drops any extra root-level keys.
 *
 * `screen_resolution` is only attached on `page_view` and `session_start`
 * (matching the analytics design spec) to keep payloads small.
 *
 * User-provided `options.context` wins over device defaults so callers can
 * override any auto-detected field if needed.
 */
declare function buildEvent(params: {
    eventId: string;
    eventName: string;
    eventType: EnterAnalyticsEvent['event_type'];
    identity: IdentityContext;
    projectId?: string;
    isNewVisitor?: boolean;
    page: PageContext;
    acquisition?: AcquisitionContext;
    device?: DeviceContext;
    options?: TrackEventOptions;
}): EnterAnalyticsEvent;

declare class SessionManager {
    private inactivityTimeoutMs;
    private session;
    constructor(inactivityTimeoutMs?: number);
    ensureActiveSession(now?: number): SessionEnsureResult;
    touch(now?: number): void;
    getCurrentSessionId(): string | undefined;
    endCurrentSession(): string | undefined;
    hasExpired(now?: number): boolean;
    private createSession;
}

interface VisitorIdentity {
    visitorId: string;
    firstSeenAt: number;
    isNewVisitor: boolean;
}
/**
 * visitor_id 使用 cookie + localStorage 双保险，避免单一存储丢失导致访客漂移。
 */
declare function getOrCreateVisitorIdentity(now?: number): VisitorIdentity;

export { type AnalyticsEnvConfig, type AnalyticsHealth, type BootstrapOptions, type EnterAnalyticsEvent, type EventDefinition, SessionManager, type TrackEventOptions, bootstrapEnterAnalytics, buildEvent, clearEventDefinitions, destroy, emitDefinedEvent, flush, getAnalyticsHealth, getOrCreateVisitorIdentity, loadEventDefinitionsFromUrl, registerEventDefinition, registerEventDefinitions, replaceEventDefinitions, trackEvent, unregisterEventDefinition };
