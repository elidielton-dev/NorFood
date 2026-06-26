const fs = require("fs");
const path = require("path");

const baseConfig = require("./app.json");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) return acc;

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      acc[key] = value;
      return acc;
    }, {});
}

const rootEnv = parseEnvFile(path.resolve(__dirname, "..", ".env"));
const mobileEnv = parseEnvFile(path.resolve(__dirname, ".env"));

const resolveEnv = (key, fallbackKeys = []) =>
  process.env[key] ||
  mobileEnv[key] ||
  fallbackKeys.map((fallbackKey) => process.env[fallbackKey] || mobileEnv[fallbackKey] || rootEnv[fallbackKey]).find(Boolean) ||
  rootEnv[key];

module.exports = () => ({
  ...baseConfig,
  expo: {
    ...baseConfig.expo,
    extra: {
      ...baseConfig.expo.extra,
      supabase: {
        url: resolveEnv("EXPO_PUBLIC_SUPABASE_URL", ["SUPABASE_URL", "VITE_SUPABASE_URL"]),
        publishableKey: resolveEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", [
          "SUPABASE_PUBLISHABLE_KEY",
          "VITE_SUPABASE_PUBLISHABLE_KEY",
        ]),
        projectId: resolveEnv("EXPO_PUBLIC_SUPABASE_PROJECT_ID", [
          "SUPABASE_PROJECT_ID",
          "VITE_SUPABASE_PROJECT_ID",
        ]),
      },
      demoSyncUrl: resolveEnv("EXPO_PUBLIC_DEMO_SYNC_URL", ["DEMO_SYNC_BASE_URL", "VITE_DEMO_SYNC_URL"]),
    },
  },
});
