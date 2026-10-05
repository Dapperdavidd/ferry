import { getActiveNetworkConfig } from "@/utils/network";

export const PRODUCTION_BACKEND_URL =
  "https://api-production-bc03d.up.railway.app";

export function resolveBackendUrl(
  configured: string | undefined,
  development: boolean
): string {
  const explicit = configured?.trim();
  return (
    explicit || (development ? "http://localhost:8000" : PRODUCTION_BACKEND_URL)
  ).replace(/\/$/, "");
}

export const getBackendUrl = () => getActiveNetworkConfig().backendUrl;
