import "server-only";
import path from "node:path";

const isProd = process.env.NODE_ENV === "production";

function appSecret(): string {
  const value = process.env.APP_SECRET;
  if (value && value.length >= 32) return value;
  if (isProd) {
    throw new Error(
      "APP_SECRET is missing or shorter than 32 characters. Run install.sh or set it in the environment file.",
    );
  }
  return "development-only-secret-do-not-use-in-production";
}

/** Server-side configuration. Values are read lazily so builds work without them. */
export const env = {
  get isProd() {
    return isProd;
  },
  /** Public origin of the site, e.g. https://chat.example.com (no trailing slash). */
  get appUrl(): string {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get appOrigin(): string {
    return new URL(this.appUrl).origin;
  },
  get isHttps(): boolean {
    return this.appUrl.startsWith("https://");
  },
  get dataDir(): string {
    return process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
  },
  /** Secret used to pseudonymise IP addresses before they are stored. */
  get appSecret(): string {
    return appSecret();
  },
  /** True when the app runs behind a trusted reverse proxy that sets X-Forwarded-For. */
  get trustProxy(): boolean {
    return process.env.TRUST_PROXY === "1";
  },
  get aiKeyConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
};
