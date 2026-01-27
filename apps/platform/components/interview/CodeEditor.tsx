"use client";

import React from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";

interface CodeEditorProps {
  language?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  className?: string;
}

export function CodeEditor({
  language = "javascript",
  value = "// Start coding here...",
  onChange,
  className,
}: CodeEditorProps) {
  const { theme } = useTheme();

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    // Optional: Configure editor settings here
    editor.updateOptions({
      minimap: { enabled: false },
      fontSize: 14,
      scrollBeyondLastLine: false,
      padding: { top: 16, bottom: 16 },
    });
  };

  return (
    <div className={`h-full w-full overflow-hidden rounded-md border bg-zinc-950 ${className}`}>
      <Editor
        height="100%"
        defaultLanguage={language}
        defaultValue={value}
        value={value}
        onChange={onChange}
        theme={theme === "light" ? "light" : "vs-dark"}
        loading={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
        onMount={handleEditorDidMount}
        options={{
          fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          cursorBlinking: "smooth",
          smoothScrolling: true,
        }}
      />
    </div>
  );
}
