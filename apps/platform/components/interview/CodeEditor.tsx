"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import {
  Loader2, Code2, Play, ChevronDown, ChevronUp,
  RotateCcw, Copy, Check, Settings2, Terminal, AlertCircle,
  CheckCircle2, Clock, MemoryStick, WrapText,
  MinusSquare, PlusSquare,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Judge0 Language Registry ─────────────────────────────────────────────────
const LANGUAGES = [
  {
    id: "javascript",
    label: "JavaScript",
    judge0Id: 102,     // Node.js 22
    monacoLang: "javascript",
    ext: "js",
    starter: `// JavaScript (Node.js 22)
function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) return [map.get(complement), i];
    map.set(nums[i], i);
  }
  return [];
}

console.log(twoSum([2, 7, 11, 15], 9)); // [0, 1]
`,
  },
  {
    id: "typescript",
    label: "TypeScript",
    judge0Id: 101,     // TypeScript 5.6
    monacoLang: "typescript",
    ext: "ts",
    starter: `// TypeScript 5.6
function twoSum(nums: number[], target: number): number[] {
  const map = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) return [map.get(complement)!, i];
    map.set(nums[i], i);
  }
  return [];
}

console.log(twoSum([2, 7, 11, 15], 9));
`,
  },
  {
    id: "python",
    label: "Python",
    judge0Id: 109,     // Python 3.13
    monacoLang: "python",
    ext: "py",
    starter: `# Python 3.13
from typing import List

def two_sum(nums: List[int], target: int) -> List[int]:
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []

print(two_sum([2, 7, 11, 15], 9))  # [0, 1]
`,
  },
  {
    id: "java",
    label: "Java",
    judge0Id: 91,       // Java JDK 17
    monacoLang: "java",
    ext: "java",
    starter: `// Java 17
import java.util.*;

public class Main {
    public static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[]{map.get(complement), i};
            }
            map.put(nums[i], i);
        }
        return new int[]{};
    }

    public static void main(String[] args) {
        System.out.println(Arrays.toString(twoSum(new int[]{2, 7, 11, 15}, 9)));
    }
}
`,
  },
  {
    id: "cpp",
    label: "C++",
    judge0Id: 105,      // C++ GCC 14
    monacoLang: "cpp",
    ext: "cpp",
    starter: `// C++ (GCC 14)
#include <bits/stdc++.h>
using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> m;
    for (int i = 0; i < nums.size(); i++) {
        int complement = target - nums[i];
        if (m.count(complement)) return {m[complement], i};
        m[nums[i]] = i;
    }
    return {};
}

int main() {
    vector<int> nums = {2, 7, 11, 15};
    auto res = twoSum(nums, 9);
    cout << "[" << res[0] << ", " << res[1] << "]" << endl;
    return 0;
}
`,
  },
  {
    id: "c",
    label: "C",
    judge0Id: 103,      // C GCC 14
    monacoLang: "c",
    ext: "c",
    starter: `// C (GCC 14)
#include <stdio.h>
#include <stdlib.h>

int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    int* result = (int*)malloc(2 * sizeof(int));
    *returnSize = 2;
    for (int i = 0; i < numsSize; i++) {
        for (int j = i + 1; j < numsSize; j++) {
            if (nums[i] + nums[j] == target) {
                result[0] = i;
                result[1] = j;
                return result;
            }
        }
    }
    return result;
}

int main() {
    int nums[] = {2, 7, 11, 15};
    int returnSize;
    int* res = twoSum(nums, 4, 9, &returnSize);
    printf("[%d, %d]\\n", res[0], res[1]);
    free(res);
    return 0;
}
`,
  },
  {
    id: "rust",
    label: "Rust",
    judge0Id: 108,      // Rust 1.85
    monacoLang: "rust",
    ext: "rs",
    starter: `// Rust 1.85
use std::collections::HashMap;

fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {
    let mut map: HashMap<i32, i32> = HashMap::new();
    for (i, &num) in nums.iter().enumerate() {
        let complement = target - num;
        if let Some(&j) = map.get(&complement) {
            return vec![j, i as i32];
        }
        map.insert(num, i as i32);
    }
    vec![]
}

fn main() {
    println!("{:?}", two_sum(vec![2, 7, 11, 15], 9));
}
`,
  },
  {
    id: "go",
    label: "Go",
    judge0Id: 107,      // Go 1.23
    monacoLang: "go",
    ext: "go",
    starter: `// Go 1.23
package main

import "fmt"

func twoSum(nums []int, target int) []int {
    m := make(map[int]int)
    for i, num := range nums {
        complement := target - num
        if j, ok := m[complement]; ok {
            return []int{j, i}
        }
        m[num] = i
    }
    return nil
}

func main() {
    fmt.Println(twoSum([]int{2, 7, 11, 15}, 9))
}
`,
  },
  {
    id: "csharp",
    label: "C#",
    judge0Id: 51,       // C# Mono
    monacoLang: "csharp",
    ext: "cs",
    starter: `// C# (Mono 6.6)
using System;
using System.Collections.Generic;

class Solution {
    public static int[] TwoSum(int[] nums, int target) {
        var map = new Dictionary<int, int>();
        for (int i = 0; i < nums.Length; i++) {
            int complement = target - nums[i];
            if (map.ContainsKey(complement))
                return new int[] { map[complement], i };
            map[nums[i]] = i;
        }
        return new int[]{};
    }

    static void Main() {
        var result = TwoSum(new int[]{2, 7, 11, 15}, 9);
        Console.WriteLine($"[{result[0]}, {result[1]}]");
    }
}
`,
  },
  {
    id: "kotlin",
    label: "Kotlin",
    judge0Id: 111,      // Kotlin 2.1
    monacoLang: "kotlin",
    ext: "kt",
    starter: `// Kotlin 2.1
fun twoSum(nums: IntArray, target: Int): IntArray {
    val map = HashMap<Int, Int>()
    for ((i, num) in nums.withIndex()) {
        val complement = target - num
        if (map.containsKey(complement)) return intArrayOf(map[complement]!!, i)
        map[num] = i
    }
    return intArrayOf()
}

fun main() {
    println(twoSum(intArrayOf(2, 7, 11, 15), 9).contentToString())
}
`,
  },
  {
    id: "swift",
    label: "Swift",
    judge0Id: 83,
    monacoLang: "swift",
    ext: "swift",
    starter: `// Swift 5.2
func twoSum(_ nums: [Int], _ target: Int) -> [Int] {
    var map = [Int: Int]()
    for (i, num) in nums.enumerated() {
        let complement = target - num
        if let j = map[complement] { return [j, i] }
        map[num] = i
    }
    return []
}

print(twoSum([2, 7, 11, 15], 9))
`,
  },
  {
    id: "ruby",
    label: "Ruby",
    judge0Id: 72,
    monacoLang: "ruby",
    ext: "rb",
    starter: `# Ruby 2.7
def two_sum(nums, target)
  map = {}
  nums.each_with_index do |num, i|
    complement = target - num
    return [map[complement], i] if map.key?(complement)
    map[num] = i
  end
  []
end

p two_sum([2, 7, 11, 15], 9)
`,
  },
  {
    id: "sql",
    label: "SQL",
    judge0Id: 82,
    monacoLang: "sql",
    ext: "sql",
    starter: `-- SQL (SQLite 3.27)
CREATE TABLE employees (id INTEGER, name TEXT, salary REAL);
INSERT INTO employees VALUES (1, 'Alice', 90000);
INSERT INTO employees VALUES (2, 'Bob', 75000);
INSERT INTO employees VALUES (3, 'Carol', 95000);

SELECT name, salary
FROM employees
WHERE salary > 80000
ORDER BY salary DESC;
`,
  },
];

// ─── Judge0 Executor ──────────────────────────────────────────────────────────
const JUDGE0_BASE = "https://ce.judge0.com";

type RunStatus = "idle" | "running" | "success" | "error" | "tle";

interface RunResult {
  stdout: string;
  stderr: string;
  compileOutput: string;
  status: RunStatus;
  time: string | null;
  memory: number | null;
  statusDesc: string;
}

export interface CodeExecutionEvent {
  status: RunStatus;
  statusDesc: string;
  language: string;
  time: string | null;
  memory: number | null;
  stdin: string;
  stdoutPreview: string;
  stderrPreview: string;
  compileOutputPreview: string;
  codeSize: number;
  timestamp: number;
  source?: "candidate" | "ai";
  testCaseLabel?: string;
}

export interface RemoteExecutionRequest {
  id: string;
  source?: "candidate" | "ai";
  stdin?: string;
  testCases?: Array<string | { label?: string; stdin?: string }>;
}

async function executeCode(
  sourceCode: string,
  languageId: number,
  stdin: string = ""
): Promise<RunResult> {
  // Submit
  const submitRes = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=false&wait=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: sourceCode,
      language_id: languageId,
      stdin,
    }),
  });

  if (!submitRes.ok) throw new Error(`Submission failed: ${submitRes.status}`);
  const { token } = await submitRes.json();

  // Poll until done (max 15s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const pollRes = await fetch(
      `${JUDGE0_BASE}/submissions/${token}?base64_encoded=false&fields=status,stdout,stderr,compile_output,time,memory`,
      { headers: { "Content-Type": "application/json" } }
    );
    const data = await pollRes.json();
    const sid = data.status?.id;
    // 1=queued 2=processing — still running
    if (sid === 1 || sid === 2) continue;

    const statusDesc = data.status?.description || "Unknown";
    let runStatus: RunStatus = "idle";
    if (sid === 3) runStatus = "success";
    else if (sid === 5) runStatus = "tle";
    else runStatus = "error";

    return {
      stdout: data.stdout || "",
      stderr: data.stderr || "",
      compileOutput: data.compile_output || "",
      status: runStatus,
      time: data.time ?? null,
      memory: data.memory ?? null,
      statusDesc,
    };
  }

  throw new Error("Execution timed out");
}

// ─── Component ────────────────────────────────────────────────────────────────
interface CodeEditorProps {
  defaultLanguage?: string;
  language?: string;
  value?: string;
  onChange?: (value: string) => void;
  onLanguageChange?: (language: string) => void;
  className?: string;
  /** Called whenever code or language changes — lets AI read current state */
  onCodeSnapshot?: (code: string, language: string) => void;
  /** Called when the user executes code from the editor run button */
  onExecution?: (event: CodeExecutionEvent) => void;
  /** Remote request to execute code and optional test cases (used by AI assistant actions) */
  executionRequest?: RemoteExecutionRequest | null;
  /** Signals that a remote execution request has completed */
  onExecutionRequestComplete?: (requestId: string) => void;
}

export function CodeEditor({
  defaultLanguage = "javascript",
  language: controlledLanguage,
  value,
  onChange,
  onLanguageChange,
  className,
  onCodeSnapshot,
  onExecution,
  executionRequest,
  onExecutionRequestComplete,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();

  const initialLanguageId = controlledLanguage || defaultLanguage;
  const langDef = LANGUAGES.find((l) => l.id === initialLanguageId) ?? LANGUAGES[0];
  const [languageState, setLanguageState] = useState(langDef);
  const [internalCode, setInternalCode] = useState(value ?? langDef.starter);
  const language =
    (controlledLanguage
      ? LANGUAGES.find((l) => l.id === controlledLanguage)
      : languageState) ?? languageState;
  const code = typeof value === "string" ? value : internalCode;
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [outputOpen, setOutputOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const codeByLanguageRef = useRef<Record<string, string>>({
    [langDef.id]: value ?? langDef.starter,
  });
  const handledExecutionRequestIdsRef = useRef<Set<string>>(new Set());
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  // When language changes preserve per-language drafts and fall back to starter templates.
  const handleLanguageChange = (langId: string) => {
    codeByLanguageRef.current[language.id] = code;

    const def = LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];
    const nextCode = codeByLanguageRef.current[def.id] ?? def.starter;

    if (!controlledLanguage) {
      setLanguageState(def);
    }
    setInternalCode(nextCode);
    setResult(null);
    setRunStatus("idle");

    codeByLanguageRef.current[def.id] = nextCode;
    onChange?.(nextCode);
    onLanguageChange?.(def.id);
    onCodeSnapshot?.(nextCode, def.id);
  };

  const handleCodeChange = (val: string | undefined) => {
    const v = val ?? "";
    setInternalCode(v);
    codeByLanguageRef.current[language.id] = v;
    onChange?.(v);
  };

  // Expose snapshot whenever code changes (so AI can read it)
  useEffect(() => {
    onCodeSnapshot?.(code, language.id);
  }, [code, language.id]); // eslint-disable-line

  useEffect(() => {
    codeByLanguageRef.current[language.id] = code;
  }, [code, language.id]);

  const handleRun = useCallback(async (
    options?: {
      stdinOverride?: string;
      source?: "candidate" | "ai";
      testCaseLabel?: string;
    },
  ) => {
    const truncateOutput = (value: string, maxChars: number = 240): string => {
      if (!value) {
        return "";
      }
      return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
    };

    const effectiveStdin = options?.stdinOverride ?? stdin;
    const source = options?.source ?? "candidate";
    const testCaseLabel = options?.testCaseLabel;

    setRunStatus("running");
    setOutputOpen(true);
    setResult(null);
    try {
      const res = await executeCode(code, language.judge0Id, effectiveStdin);
      setResult(res);
      setRunStatus(res.status);
      onExecution?.({
        status: res.status,
        statusDesc: res.statusDesc,
        language: language.id,
        time: res.time,
        memory: res.memory,
        stdin: effectiveStdin,
        stdoutPreview: truncateOutput(res.stdout),
        stderrPreview: truncateOutput(res.stderr),
        compileOutputPreview: truncateOutput(res.compileOutput),
        codeSize: code.length,
        timestamp: Date.now(),
        source,
        testCaseLabel,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Execution failed";
      setResult({
        stdout: "",
        stderr: errorMessage,
        compileOutput: "",
        status: "error",
        time: null,
        memory: null,
        statusDesc: "Error",
      });
      setRunStatus("error");
      onExecution?.({
        status: "error",
        statusDesc: "Error",
        language: language.id,
        time: null,
        memory: null,
        stdin: effectiveStdin,
        stdoutPreview: "",
        stderrPreview: truncateOutput(errorMessage),
        compileOutputPreview: "",
        codeSize: code.length,
        timestamp: Date.now(),
        source,
        testCaseLabel,
      });
    }
  }, [code, language, onExecution, stdin]);

  useEffect(() => {
    if (!executionRequest || !executionRequest.id) {
      return;
    }

    if (handledExecutionRequestIdsRef.current.has(executionRequest.id)) {
      return;
    }

    handledExecutionRequestIdsRef.current.add(executionRequest.id);

    const runRemoteExecution = async () => {
      const source = executionRequest.source === "candidate" ? "candidate" : "ai";
      const rawCases = Array.isArray(executionRequest.testCases) ? executionRequest.testCases : [];
      const normalizedCases = rawCases
        .slice(0, 8)
        .map((item, index) => {
          if (typeof item === "string") {
            return {
              label: `Case ${index + 1}`,
              stdin: item,
            };
          }
          return {
            label: item?.label || `Case ${index + 1}`,
            stdin: item?.stdin || "",
          };
        });

      if (normalizedCases.length > 0) {
        for (const testCase of normalizedCases) {
          await handleRun({
            stdinOverride: testCase.stdin,
            source,
            testCaseLabel: testCase.label,
          });
        }
      } else {
        await handleRun({
          stdinOverride: executionRequest.stdin,
          source,
        });
      }

      onExecutionRequestComplete?.(executionRequest.id);
    };

    void runRemoteExecution();
  }, [executionRequest, handleRun, onExecutionRequestComplete]);

  // Ctrl+Enter / Cmd+Enter to run
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRun]);

  const handleReset = () => {
    setInternalCode(language.starter);
    codeByLanguageRef.current[language.id] = language.starter;
    setResult(null);
    setRunStatus("idle");
    onChange?.(language.starter);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.updateOptions({
      minimap: { enabled: false },
      fontSize,
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      scrollbar: {
        alwaysConsumeMouseWheel: false,
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      wordWrap: wordWrap ? "on" : "off",
      lineNumbers: "on",
      folding: true,
      bracketPairColorization: { enabled: true },
      renderLineHighlight: "all",
    });
  };

  // Sync fontSize and wordWrap into editor
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize, wordWrap: wordWrap ? "on" : "off" });
  }, [fontSize, wordWrap]);

  const monacoTheme = resolvedTheme === "light" ? "light" : "vs-dark";

  const statusColor = {
    idle: "",
    running: "text-yellow-400",
    success: "text-green-400",
    error: "text-red-400",
    tle: "text-orange-400",
  }[runStatus];

  const StatusIcon = {
    idle: null,
    running: () => <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    success: () => <CheckCircle2 className="h-3.5 w-3.5" />,
    error: () => <AlertCircle className="h-3.5 w-3.5" />,
    tle: () => <Clock className="h-3.5 w-3.5" />,
  }[runStatus];

  const outputContent =
    result?.compileOutput || result?.stderr
      ? (result.compileOutput || "") + (result.stderr || "")
      : result?.stdout || "";
  const isError = !!(result?.compileOutput || result?.stderr);

  return (
    <div className={cn("h-full w-full flex flex-col overflow-hidden rounded-md border border-border bg-[#1e1e1e] dark:bg-[#1e1e1e]", className)}
      style={{ fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace" }}
    >
      {/* ── Top Toolbar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#2d2d2d] shrink-0">
        <div className="flex items-center gap-2">
          <Code2 className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-zinc-400">Editor</span>
          <span className="text-zinc-600 text-xs">·</span>
          <span className="text-[11px] text-zinc-500">{language.ext}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Language Select */}
          <Select value={language.id} onValueChange={handleLanguageChange}>
            <SelectTrigger className="h-7 w-[130px] bg-[#3c3c3c] border-none text-xs text-zinc-200 hover:bg-[#444] focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2d2d2d] border-white/10 text-zinc-200">
              {LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id} className="text-xs hover:bg-white/10 focus:bg-white/10">{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Settings */}
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
            onClick={() => setShowSettings((s) => !s)}
            title="Editor settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>

          {/* Word Wrap */}
          <Button
            variant="ghost" size="icon"
            className={cn("h-7 w-7 hover:bg-white/10", wordWrap ? "text-indigo-400" : "text-zinc-400")}
            onClick={() => setWordWrap((w) => !w)}
            title="Toggle word wrap"
          >
            <WrapText className="h-3.5 w-3.5" />
          </Button>

          {/* Copy */}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-white/10" onClick={handleCopy} title="Copy code">
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>

          {/* Reset */}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-white/10" onClick={handleReset} title="Reset to starter">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>

          {/* Run Button */}
          <Button
            size="sm"
            className={cn(
              "h-7 px-3 text-xs font-semibold gap-1.5 transition-all",
              runStatus === "running"
                ? "bg-zinc-700 text-zinc-300 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-500 text-white"
            )}
            onClick={handleRun}
            disabled={runStatus === "running"}
            title="Run code (Ctrl+Enter)"
          >
            {runStatus === "running"
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
              : <><Play className="h-3 w-3 fill-current" /> Run</>
            }
          </Button>
        </div>
      </div>

      {/* ── Settings Bar (collapsible) ── */}
      {showSettings && (
        <div className="flex items-center gap-4 px-4 py-2 bg-[#252526] border-b border-white/10 shrink-0">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide">Font Size</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-zinc-200" onClick={() => setFontSize((s) => Math.max(10, s - 1))}>
              <MinusSquare className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-zinc-300 w-5 text-center">{fontSize}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-zinc-200" onClick={() => setFontSize((s) => Math.min(24, s + 1))}>
              <PlusSquare className="h-3.5 w-3.5" />
            </Button>
          </div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wide ml-4">Stdin</span>
          <Button
            variant="ghost" size="sm"
            className={cn("h-6 text-xs", showStdin ? "text-indigo-400" : "text-zinc-400")}
            onClick={() => setShowStdin((s) => !s)}
          >
            {showStdin ? "Hide" : "Show"} Input
          </Button>
          <span className="ml-auto text-[10px] text-zinc-600">Ctrl+Enter to run</span>
        </div>
      )}

      {/* ── Stdin panel ── */}
      {showStdin && (
        <div className="px-3 pt-2 pb-1 bg-[#1e1e1e] border-b border-white/10 shrink-0">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1 block">Standard Input (stdin)</label>
          <textarea
            className="w-full h-14 bg-[#2d2d2d] text-zinc-300 text-xs font-mono rounded px-2 py-1.5 resize-none border border-white/10 focus:outline-none focus:border-indigo-500/50"
            placeholder="Enter input for your program…"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
          />
        </div>
      )}

      {/* ── Monaco Editor ── */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={language.monacoLang}
          value={code}
          onChange={handleCodeChange}
          theme={monacoTheme}
          loading={
            <div className="h-full w-full flex items-center justify-center bg-[#1e1e1e]">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <span className="text-xs text-zinc-500">Loading editor…</span>
              </div>
            </div>
          }
          onMount={handleMount}
          options={{
            fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            cursorBlinking: "smooth",
            smoothScrolling: true,
            tabSize: 2,
            insertSpaces: true,
            autoIndent: "full",
            formatOnPaste: true,
            formatOnType: true,
            suggestOnTriggerCharacters: true,
            parameterHints: { enabled: true },
            quickSuggestions: { other: true, comments: false, strings: false },
            acceptSuggestionOnEnter: "smart",
          }}
        />
      </div>

      {/* ── Output Panel ── */}
      <div className="shrink-0 border-t border-white/10">
        {/* Output header — always visible */}
        <button
          className="w-full flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] hover:bg-[#333] transition-colors"
          onClick={() => setOutputOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[11px] font-semibold tracking-widest uppercase text-zinc-400">Output</span>
            {result && (
              <Badge
                variant="outline"
                className={cn("text-[10px] h-4 px-1.5 border-0 font-mono", statusColor,
                  runStatus === "success" ? "bg-green-500/10" :
                  runStatus === "error" || runStatus === "tle" ? "bg-red-500/10" : ""
                )}
              >
                {StatusIcon && <StatusIcon />}
                <span className="ml-1">{result.statusDesc}</span>
              </Badge>
            )}
            {result?.time && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />{result.time}s
              </span>
            )}
            {result?.memory && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                <MemoryStick className="h-3 w-3" />{(result.memory / 1024).toFixed(1)}MB
              </span>
            )}
          </div>
          {outputOpen
            ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            : <ChevronUp className="h-3.5 w-3.5 text-zinc-500" />
          }
        </button>

        {/* Output body */}
        {outputOpen && (
          <div className={cn(
            "h-36 overflow-auto bg-[#0d0d0d] font-mono text-xs p-3 whitespace-pre-wrap leading-relaxed",
            isError ? "text-red-400" : "text-green-300"
          )}>
            {runStatus === "running" ? (
              <div className="flex items-center gap-2 text-yellow-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Compiling and running {language.label}…</span>
              </div>
            ) : result ? (
              outputContent
                ? outputContent
                : <span className="text-zinc-600 italic">No output</span>
            ) : (
              <span className="text-zinc-700 italic">Run your code to see output here  (Ctrl+Enter)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
