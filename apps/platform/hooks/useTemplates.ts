"use client";

import { useState, useEffect } from "react";
import { InterviewTemplate, interviewTemplates as defaultTemplates } from "@/data/mockData";

const STORAGE_KEY = "interview_templates_v1";

export function useTemplates() {
  const [templates, setTemplates] = useState<InterviewTemplate[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setTemplates(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored templates", e);
        setTemplates(defaultTemplates);
      }
    } else {
      setTemplates(defaultTemplates);
    }
    setIsLoaded(true);
  }, []);

  const saveTemplates = (newTemplates: InterviewTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newTemplates));
  };

  const addTemplate = (template: InterviewTemplate) => {
    const newTemplates = [...templates, template];
    saveTemplates(newTemplates);
  };

  const updateTemplate = (id: string, updates: Partial<InterviewTemplate>) => {
    const newTemplates = templates.map((t) =>
      t.id === id ? { ...t, ...updates } : t
    );
    saveTemplates(newTemplates);
  };

  const deleteTemplate = (id: string) => {
    const newTemplates = templates.filter((t) => t.id !== id);
    saveTemplates(newTemplates);
  };

  const resetTemplates = () => {
    saveTemplates(defaultTemplates);
  };

  return {
    templates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    resetTemplates,
    isLoaded,
  };
}
