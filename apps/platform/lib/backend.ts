"use client";

import * as React from "react";

const DEFAULT_BACKEND_URL = "http://localhost:8000";

function getBackendUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const token = typeof window !== 'undefined' ? localStorage.getItem("auth_token") : null;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  };

  const res = await fetch(url, {
    ...init,
    headers,
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
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  const url = `${backendUrl}${path.startsWith("/") ? path : `/${path}`}`;
  
  const token = typeof window !== 'undefined' ? localStorage.getItem("auth_token") : null;
  const headers: HeadersInit = {
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });
  
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`FormData API Error: ${res.status} ${err}`);
  }
  return res.json();
}
