const PLAYER_ID_HEADER = "x-player-id";
const PLAYER_ID_COOKIE = "pixel-player-id";
const PLAYER_ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;

export type UnauthorizedError = {
  code: "UNAUTHORIZED";
  message: string;
};

export function buildUnauthorizedError(
  message: string = "Missing or invalid player identifier.",
): UnauthorizedError {
  return {
    code: "UNAUTHORIZED",
    message,
  };
}

export function readPlayerId(request: Request): string | null {
  const headerValue = request.headers.get(PLAYER_ID_HEADER);
  const normalizedHeaderValue = normalizePlayerId(headerValue);

  if (normalizedHeaderValue) {
    return normalizedHeaderValue;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookieValue = readCookieValue(cookieHeader, PLAYER_ID_COOKIE);
  return normalizePlayerId(cookieValue);
}

function normalizePlayerId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!PLAYER_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function readCookieValue(cookieHeader: string, key: string): string | null {
  const chunks = cookieHeader.split(";");

  for (const chunk of chunks) {
    const [rawName, ...rest] = chunk.split("=");
    if (!rawName || rest.length === 0) {
      continue;
    }

    if (rawName.trim() !== key) {
      continue;
    }

    const value = rest.join("=").trim();
    if (!value) {
      return null;
    }

    return decodeURIComponent(value);
  }

  return null;
}
