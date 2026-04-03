"use client";

import React, { useState, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { Loader2, Code2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CodeEditorProps {
  defaultLanguage?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  className?: string;
}

const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
];

export function CodeEditor({
  defaultLanguage = "javascript",
  value = "// Start coding here...",
  onChange,
  className,
}: CodeEditorProps) {
  const { theme } = useTheme();
  const [language, setLanguage] = useState(defaultLanguage);

  // Sync external language prop changes if any
  useEffect(() => {
    setLanguage(defaultLanguage);
  }, [defaultLanguage]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editor.updateOptions({
      minimap: { enabled: false },
      fontSize: 14,
      scrollBeyondLastLine: false,
      padding: { top: 16, bottom: 16 },
      scrollbar: {
        alwaysConsumeMouseWheel: false,
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
    });
  };

  return (
    <div className={`h-full w-full flex flex-col overflow-hidden rounded-md border border-border bg-card ${className}`}>
      
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-secondary border-b border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
            <Code2 className="h-4 w-4" />
            <span className="text-xs font-semibold tracking-wider uppercase">Code Editor</span>
        </div>
        
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-[140px] h-8 bg-card border-border text-xs">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value} className="text-xs">
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={language}
          defaultValue={value}
          value={value}
          onChange={onChange}
          theme={theme === "light" ? "light" : "vs-dark"}
          loading={
            <div className="h-full w-full flex items-center justify-center absolute inset-0 bg-background/50 backdrop-blur-sm z-50">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
          onMount={handleEditorDidMount}
          options={{
            fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            cursorBlinking: "smooth",
            smoothScrolling: true,
          }}
        />
      </div>
    </div>
  );
}
