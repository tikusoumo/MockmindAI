"use client";

import { useState, useEffect, useCallback } from "react";
import { InterviewTemplate, interviewTemplates as defaultTemplates } from "@/data/mockData";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Shape adapter: backend returns snake_case / different type names, frontend uses camelCase
function adaptTemplate(t: any): InterviewTemplate {
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    duration: t.duration || "45 min",
    difficulty: (t.difficulty as any) || "Medium",
    icon: t.icon || "Brain",
    color: t.color || "bg-blue-500",
    type: (t.type as any) || "Custom",
    questions: t.questions || [],
    mode: t.mode,
    persona: t.persona,
  };
}

export function useTemplates() {
  const [templates, setTemplates] = useState<InterviewTemplate[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await apiFetch<any[]>("/api/interview-templates");
      setTemplates((data || []).map(adaptTemplate));
    } catch {
      // Backend unreachable — use defaults
      setTemplates(defaultTemplates);
      setError("offline");
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const addTemplate = useCallback(async (template: InterviewTemplate) => {
    try {
      const created = await apiFetch<any>("/api/interview-templates", {
        method: "POST",
        body: JSON.stringify(template),
      });
      setTemplates((prev) => [...prev, adaptTemplate(created)]);
      return adaptTemplate(created);
    } catch {
      // Offline fallback
      setTemplates((prev) => [...prev, template]);
      return template;
    }
  }, []);

  const updateTemplate = useCallback(async (id: string, updates: Partial<InterviewTemplate>) => {
    try {
      const updated = await apiFetch<any>(`/api/interview-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      setTemplates((prev) => prev.map((t) => (t.id === id ? adaptTemplate(updated) : t)));
    } catch {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    }
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    // Optimistic update
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    try {
      await apiFetch<void>(`/api/interview-templates/${id}`, { method: "DELETE" });
    } catch {
      // Already removed from UI; could restore on failure but keep simple
    }
  }, []);

  const resetTemplates = useCallback(() => {
    setTemplates(defaultTemplates);
  }, []);

  return {
    templates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    resetTemplates,
    isLoaded,
    error,
    refetch: fetchTemplates,
  };
}
