import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount, useMonaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import EditorTabs, { type TabInfo } from "./EditorTabs";

interface Props {
  tabs: TabInfo[];
  activeTab: string | null;
  fileContents: Record<string, string>;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onSave: (path: string, content: string) => void;
  onContentChange: (path: string, content: string) => void;
}

const EXT_TO_LANG: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  py: "python",
  sh: "shell",
  bash: "shell",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  rs: "rust",
  go: "go",
  java: "java",
  rb: "ruby",
  php: "php",
  txt: "plaintext",
};

function getLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_LANG[ext] || "plaintext";
}

export default function CodeEditor({
  tabs,
  activeTab,
  fileContents,
  onSelectTab,
  onCloseTab,
  onSave,
  onContentChange,
}: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monaco = useMonaco();

  // Calm down Monaco's TS/JS checker — without `node_modules` or a proper
  // module-resolution model it flags every import as "Cannot find module".
  // Keep *syntax* validation on (real typos) and turn *semantic* errors off
  // (missing modules, unknown types). This matches what Lovable/Replit do.
  useEffect(() => {
    if (!monaco) return;
    // The monaco-editor v0.x typescript-services API is reachable at runtime
    // but Monaco's TS types now mark this namespace deprecated. Cast to keep
    // calling the established setCompilerOptions / setDiagnosticsOptions hooks.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ts: any = (monaco as any).languages?.typescript;
    if (!ts) return;
    // Numeric enum values match TypeScript's compiler constants exactly:
    //   ScriptTarget.ESNext = 99, ModuleKind.ESNext = 99,
    //   ModuleResolutionKind.NodeJs = 2, JsxEmit.Preserve = 1
    const compilerOptions = {
      target: 99,
      module: 99,
      moduleResolution: 2,
      jsx: 1,
      allowJs: true,
      allowNonTsExtensions: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      isolatedModules: true,
      skipLibCheck: true,
      strict: false,
    };
    const diagnosticsOptions = {
      noSemanticValidation: true,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
    };
    ts.typescriptDefaults?.setCompilerOptions(compilerOptions);
    ts.javascriptDefaults?.setCompilerOptions(compilerOptions);
    ts.typescriptDefaults?.setDiagnosticsOptions(diagnosticsOptions);
    ts.javascriptDefaults?.setDiagnosticsOptions(diagnosticsOptions);
  }, [monaco]);

  const handleMount: OnMount = useCallback((ed) => {
    editorRef.current = ed;
    ed.addCommand(
      // Ctrl/Cmd + S
      2097 /* KeyMod.CtrlCmd */ | 49 /* KeyCode.KeyS */,
      () => {
        /* handled by auto-save */
      }
    );
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!activeTab || value === undefined) return;
      onContentChange(activeTab, value);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave(activeTab, value);
      }, 800);
    },
    [activeTab, onSave, onContentChange],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const content = activeTab ? fileContents[activeTab] ?? "" : "";

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <EditorTabs
        tabs={tabs}
        activeTab={activeTab}
        onSelect={onSelectTab}
        onClose={onCloseTab}
      />
      {activeTab ? (
        <div className="flex-1 min-h-0">
          <Editor
            theme="vs-dark"
            language={getLang(activeTab)}
            value={content}
            onChange={handleChange}
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              wordWrap: "on",
              scrollBeyondLastLine: false,
              padding: { top: 8 },
              renderWhitespace: "selection",
              bracketPairColorization: { enabled: true },
              autoClosingBrackets: "always",
              tabSize: 2,
              smoothScrolling: true,
              cursorBlinking: "smooth",
            }}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          Select a file to edit
        </div>
      )}
    </div>
  );
}
