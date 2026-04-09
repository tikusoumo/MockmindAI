"use client";

import * as React from "react";

const DEFAULT_BACKEND_URL = "http://localhost:8000";

const LOCAL_BACKEND_FALLBACKS: Array<[string, string]> = [
  ["http://localhost:3001", "http://localhost:8000"],
  ["http://127.0.0.1:3001", "http://127.0.0.1:8000"],
  ["http://localhost:8000", "http://localhost:3001"],
  ["http://127.0.0.1:8000", "http://127.0.0.1:3001"],
];

export function getBackendUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_BACKEND_URL
  );
}

function getBackendCandidates(primary: string): string[] {
  const candidates = [primary];

  for (const [from, to] of LOCAL_BACKEND_FALLBACKS) {
    if (primary.startsWith(from)) {
      candidates.push(primary.replace(from, to));
    }
  }

  return Array.from(new Set(candidates));
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const pathPart = normalizePath(path);

  const token = typeof window !== 'undefined' ? localStorage.getItem("auth_token") : null;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  };

  let res: Response | null = null;
  let networkError: unknown;

  for (const backendUrl of getBackendCandidates(getBackendUrl())) {
    try {
      res = await fetch(`${backendUrl}${pathPart}`, {
        ...init,
        headers,
      });
      break;
    } catch (err) {
      networkError = err;
    }
  }

  if (!res) {
    if (networkError instanceof Error) {
      throw networkError;
    }
    throw new Error("Network request failed");
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      message = body?.message ?? message;
    } catch {
      // non-JSON body — keep default message
    }
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  return (await res.json()) as T;
}

export async function backendGet<T>(path: string): Promise<T> {
  return fetchJson<T>(path);
}

export function useBackendData<T>(path: string, fallback: T): T {
  const [data, setData] = React.useState<T>(fallback);

  React.useEffect(() => {
    let cancelled = false;

    fetchJson<T>(path)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        // keep fallback
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return data;
}

export function useBackendDataState<T>(path: string, fallback: T): { data: T; isLoading: boolean } {
  const [data, setData] = React.useState<T>(fallback);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchJson<T>(path)
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, isLoading };
}

export async function backendPost<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function backendPut<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function backendPostFormData<T>(path: string, formData: FormData): Promise<T> {
  const pathPart = normalizePath(path);
  
  const token = typeof window !== 'undefined' ? localStorage.getItem("auth_token") : null;
  const headers: HeadersInit = {
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  let res: Response | null = null;
  let networkError: unknown;

  for (const backendUrl of getBackendCandidates(getBackendUrl())) {
    try {
      res = await fetch(`${backendUrl}${pathPart}`, {
        method: "POST",
        headers,
        body: formData,
      });
      break;
    } catch (err) {
      networkError = err;
    }
  }

  if (!res) {
    if (networkError instanceof Error) {
      throw networkError;
    }
    throw new Error("Network request failed");
  }
  
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`FormData API Error: ${res.status} ${err}`);
  }
  return res.json();
}
