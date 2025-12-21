"use client";

import * as React from "react";

const DEFAULT_BACKEND_URL = "http://localhost:8000";

function getBackendUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
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
