export function getConfiguredBackendUrl() {
  if (typeof process === "undefined") {
    return "";
  }

  const rawUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }

  return rawUrl.trim().replace(/\/+$/, "");
}

export function getBackendApiUrl(path = "") {
  const backendUrl = getConfiguredBackendUrl();

  if (!backendUrl) {
    throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${backendUrl}${normalizedPath}`;
}

export function getBackendUrlStatus() {
  const backendUrl = getConfiguredBackendUrl();

  if (!backendUrl) {
    return {
      configured: false,
      url: "",
      error:
        "NEXT_PUBLIC_BACKEND_URL is missing. Set it in Vercel or your local environment.",
    };
  }

  return {
    configured: true,
    url: backendUrl,
    error: null,
  };
}
