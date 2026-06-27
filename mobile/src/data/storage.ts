import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "../types";
import { initialAppState } from "./mockData";

const STORAGE_KEY = "@norfood:rider-app";
const TENANT_KEY = "@norfood:active-tenant";

export async function loadAppState(): Promise<AppState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return initialAppState;
    return { ...initialAppState, ...JSON.parse(raw) };
  } catch {
    return initialAppState;
  }
}

export async function saveAppState(state: AppState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadActiveTenantId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
}

export async function saveActiveTenantId(tenantId: string | null) {
  if (!tenantId) {
    await AsyncStorage.removeItem(TENANT_KEY);
    return;
  }
  await AsyncStorage.setItem(TENANT_KEY, tenantId);
}
