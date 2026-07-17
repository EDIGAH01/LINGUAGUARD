import { useCallback, useEffect, useState } from "react";
import {
  platforms as defaultPlatforms,
  filterRules as defaultRules,
  type Platform,
  type FilterRule,
} from "./data";
import { planLimits, type PlanTier } from "./plan";

const PLATFORMS_KEY = "linguaguard-platforms";
const RULES_KEY = "linguaguard-rules";

type StoreKey = typeof PLATFORMS_KEY | typeof RULES_KEY;

const changeEvent = (key: StoreKey) => `${key}-changed`;

function load<T>(key: StoreKey, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // corrupt storage — fall back to defaults
  }
  return fallback;
}

function save<T>(key: StoreKey, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(changeEvent(key)));
}

/**
 * localStorage-backed state shared across pages. Components on the same
 * screen stay in sync via a custom event; other tabs via the storage event.
 */
function useStored<T>(
  key: StoreKey,
  fallback: T
): [T, (updater: (prev: T) => T) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback));

  useEffect(() => {
    const sync = () => setValue(load(key, fallback));
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) sync();
    };
    window.addEventListener(changeEvent(key), sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(changeEvent(key), sync);
      window.removeEventListener("storage", onStorage);
    };
    // fallback is a module-level constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (updater: (prev: T) => T) => {
      save(key, updater(load(key, fallback)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  return [value, update];
}

export const usePlatforms = () =>
  useStored<Platform[]>(PLATFORMS_KEY, defaultPlatforms);

export const useRules = () => useStored<FilterRule[]>(RULES_KEY, defaultRules);

export const loadPlatforms = (): Platform[] =>
  load(PLATFORMS_KEY, defaultPlatforms);

/**
 * Bring connected platforms in line with the given plan: AI agents are
 * disconnected on plans without AI access, and when more platforms are
 * connected than the plan allows, the least active ones are disconnected.
 * Returns the names of the platforms that were disconnected.
 */
export function enforcePlanLimits(plan: PlanTier): string[] {
  const limits = planLimits[plan];
  const disconnectedNames: string[] = [];
  let platforms = loadPlatforms();

  const disconnect = (p: Platform): Platform => {
    disconnectedNames.push(p.name);
    return { ...p, status: "disconnected", accounts: [], filteredToday: 0 };
  };

  platforms = platforms.map((p) =>
    p.category === "ai" && !limits.aiAgents && p.status === "connected"
      ? disconnect(p)
      : p
  );

  const connected = [...platforms]
    .filter((p) => p.status === "connected")
    .sort((a, b) => b.filteredToday - a.filteredToday);
  if (connected.length > limits.maxPlatforms) {
    const keep = new Set(
      connected.slice(0, limits.maxPlatforms).map((p) => p.id)
    );
    platforms = platforms.map((p) =>
      p.status === "connected" && !keep.has(p.id) ? disconnect(p) : p
    );
  }

  if (disconnectedNames.length > 0) save(PLATFORMS_KEY, platforms);
  return disconnectedNames;
}
