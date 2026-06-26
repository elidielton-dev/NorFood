import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "../types";
import { initialAppState } from "./mockData";

const STORAGE_KEY = "@abelha-mel:rider-app";

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
