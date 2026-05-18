#!/usr/bin/env python3
"""End-to-end test for the Browser LLM WebSocket bridge.

This script simulates exactly what the browser does:
  1. Connects via WebSocket to the backend
  2. Intercepts `llm.request` messages
  3. Generates smart template responses (no real LLM needed)
  4. Sends `llm.response` messages back

This tests the EXACT same code path that the real browser uses,
including the LLMBridge, Orchestrator sequential execution, and
all agent file/JSON parsers.

Usage:
    # Start the backend first:
    #   cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
    # Then run:
    python3 test_e2e.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
import httpx
import websockets

BASE = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws"

PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
INFO = "\033[94m→\033[0m"
WARN = "\033[93m⚠\033[0m"

request_count = 0
response_count = 0
agent_events: list[dict] = []
project_completed = asyncio.Event()
project_id: str | None = None


# ── Smart Response Generator ─────────────────────────

def generate_response(prompt: str, system: str) -> str:
    """Generate a smart template response based on what the agent is asking for."""
    global request_count
    request_count += 1
    p = prompt.lower()
    s = system.lower()

    # Project Manager — return a valid JSON task plan
    if "decompose" in p or "project manager" in s or "decompose this into tasks" in p:
        return json.dumps({
            "project_name": "todo-app",
            "description": "A simple todo application with CRUD operations",
            "tasks": [
                {"id": "t1", "title": "Create database schema", "description": "SQL migration for todos table", "agent": "backend_dev", "dependencies": [], "priority": 1},
                {"id": "t2", "title": "Build main UI", "description": "React todo list with add/edit/delete", "agent": "frontend_dev", "dependencies": ["t1"], "priority": 2},
                {"id": "t3", "title": "Docker configuration", "description": "Dockerfile and docker-compose", "agent": "devops", "dependencies": [], "priority": 1},
                {"id": "t4", "title": "Write tests", "description": "Unit tests for components", "agent": "qa_tester", "dependencies": ["t2"], "priority": 3},
                {"id": "t5", "title": "Write documentation", "description": "README with setup instructions", "agent": "documentation", "dependencies": ["t2", "t3"], "priority": 4},
            ],
        })

    # Backend Developer — return SQL migration
    if "backend developer" in s or "supabase" in s or "sql" in s or "database" in p or "schema" in p:
        return """===FILE: supabase/migrations/001_create_todos.sql===
CREATE TABLE IF NOT EXISTS todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations" ON todos FOR ALL USING (true);
===END FILE==="""

    # Frontend Developer — return React component
    if "frontend developer" in s or "react" in s or "component" in p or "ui" in p:
        return '''===FILE: src/App.tsx===
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase";

interface Todo {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  created_at: string;
}

const LS_KEY = "agentforge_todos";
function loadLocal(): Todo[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveLocal(items: Todo[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [useLocal, setUseLocal] = useState(false);

  const fetchTodos = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("todos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setTodos(data || []);
    } catch {
      setUseLocal(true);
      setTodos(loadLocal());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  useEffect(() => { if (useLocal) saveLocal(todos); }, [todos, useLocal]);

  const addTodo = async () => {
    if (!input.trim()) return;
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      title: input.trim(),
      description: "",
      completed: false,
      created_at: new Date().toISOString(),
    };
    if (!useLocal) {
      try {
        const { error } = await supabase.from("todos").insert(newTodo);
        if (error) throw error;
      } catch { setUseLocal(true); }
    }
    setTodos((prev) => [newTodo, ...prev]);
    setInput("");
  };

  const toggleTodo = async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    const updated = !todo.completed;
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: updated } : t)));
    if (!useLocal) {
      await supabase.from("todos").update({ completed: updated }).eq("id", id);
    }
  };

  const deleteTodo = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (!useLocal) {
      await supabase.from("todos").delete().eq("id", id);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Todo App</h1>
        {useLocal && (
          <p className="text-amber-400 text-xs text-center mb-4">Using local storage (Supabase not configured)</p>
        )}
        <div className="flex gap-2 mb-6">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTodo()}
            placeholder="Add a todo..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          />
          <button onClick={addTodo} className="bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg font-medium">Add</button>
        </div>
        <div className="space-y-2">
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
              <input type="checkbox" checked={todo.completed} onChange={() => toggleTodo(todo.id)} className="w-4 h-4" />
              <span className={`flex-1 ${todo.completed ? "line-through text-gray-500" : ""}`}>{todo.title}</span>
              <button onClick={() => deleteTodo(todo.id)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
            </div>
          ))}
          {todos.length === 0 && <p className="text-center text-gray-500 py-8">No todos yet. Add one above!</p>}
        </div>
      </div>
    </div>
  );
}
===END FILE==='''

    # DevOps — return Docker configs
    if "devops" in s or "docker" in p or "infrastructure" in s or "deployment" in p:
        return """===FILE: Dockerfile===
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
===END FILE===

===FILE: docker-compose.yml===
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:80"
    environment:
      - VITE_SUPABASE_URL=${SUPABASE_URL}
      - VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
===END FILE==="""

    # QA Tester — return test file
    if "qa" in s or "test" in s or "review" in p or "validate" in p:
        return """===FILE: tests/app.test.ts===
import { describe, it, expect } from "vitest";

describe("Todo App", () => {
  it("should render without crashing", () => {
    expect(true).toBe(true);
  });

  it("should have CRUD operations", () => {
    const operations = ["create", "read", "update", "delete"];
    expect(operations.length).toBe(4);
  });

  it("should handle empty state", () => {
    const todos: unknown[] = [];
    expect(todos.length).toBe(0);
  });
});
===END FILE==="""

    # Documentation — return README
    if "documentation" in s or "readme" in p or "docs" in p:
        return """===FILE: README.md===
# Todo App

A modern todo application built with React, TypeScript, and Supabase.

## Features
- Create, read, update, and delete todos
- Real-time sync with Supabase
- Offline support with localStorage fallback
- Beautiful dark theme UI

## Setup
1. Install dependencies: `npm install`
2. Set up Supabase and add credentials to `.env`
3. Run: `npm run dev`

## Tech Stack
- React 18 + TypeScript
- Vite
- Supabase (PostgreSQL)
- Tailwind CSS
===END FILE==="""

    # Fallback for any unrecognized request
    return """===FILE: src/components/Generated.tsx===
export default function Generated() {
  return <div className="p-4">Generated component</div>;
}
===END FILE==="""


# ── Test Runner ───────────────────────────────────────

async def run_test() -> bool:
    global project_id
    all_passed = True
    t0 = time.time()

    print("\n" + "=" * 60)
    print("  AgentForge — End-to-End Browser LLM Test")
    print("=" * 60 + "\n")

    # Step 1: Health check
    print(f"{INFO} Step 1: Health check...")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{BASE}/api/health")
            r.raise_for_status()
            health = r.json()
            print(f"  {PASS} Backend healthy (provider={health.get('provider')}, demo={health.get('demo_mode')})")
    except Exception as e:
        print(f"  {FAIL} Backend not reachable: {e}")
        print(f"\n  Start the backend first:")
        print(f"    cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000\n")
        return False

    # Step 2: Configure settings to browser mode
    print(f"\n{INFO} Step 2: Configure settings to browser mode...")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.put(
                f"{BASE}/api/settings",
                json={"llm_provider": "browser", "demo_mode": False},
            )
            r.raise_for_status()
            s = r.json()
            if s.get("llm_provider") == "browser" and not s.get("demo_mode"):
                print(f"  {PASS} Settings: provider=browser, demo=False")
            else:
                print(f"  {FAIL} Settings not applied correctly: {s}")
                all_passed = False
    except Exception as e:
        print(f"  {FAIL} Failed to update settings: {e}")
        return False

    # Step 3: Connect WebSocket
    print(f"\n{INFO} Step 3: Connect WebSocket...")
    try:
        ws = await websockets.connect(WS_URL)
        init_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
        if init_msg.get("type") == "init":
            agents = init_msg.get("agents", [])
            print(f"  {PASS} WebSocket connected, received init with {len(agents)} agents")
        else:
            print(f"  {WARN} Unexpected init message type: {init_msg.get('type')}")
    except Exception as e:
        print(f"  {FAIL} WebSocket connection failed: {e}")
        return False

    # Step 4: Create a project
    print(f"\n{INFO} Step 4: Create project 'Build a todo app'...")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(
                f"{BASE}/api/projects",
                json={"prompt": "Build a todo app with add, edit, delete functionality"},
            )
            r.raise_for_status()
            data = r.json()
            project_id = data.get("project_id")
            print(f"  {PASS} Project created: {project_id}")
    except Exception as e:
        print(f"  {FAIL} Failed to create project: {e}")
        await ws.close()
        return False

    # Step 5: Handle LLM requests and watch for completion
    print(f"\n{INFO} Step 5: Handling LLM requests (acting as browser LLM)...")
    completed = False
    error_occurred = False
    timeout_seconds = 120
    start = time.time()

    try:
        while time.time() - start < timeout_seconds:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
            except asyncio.TimeoutError:
                continue

            msg = json.loads(raw)
            msg_type = msg.get("type", "")

            if msg_type == "llm.request":
                req_id = msg.get("request_id", "")
                prompt = msg.get("prompt", "")
                system = msg.get("system", "")
                prompt_preview = prompt[:80].replace("\n", " ")
                print(f"    {INFO} llm.request [{req_id}]: {prompt_preview}...")

                response_text = generate_response(prompt, system)

                await ws.send(json.dumps({
                    "type": "llm.response",
                    "request_id": req_id,
                    "content": response_text,
                }))
                global response_count
                response_count += 1
                print(f"    {PASS} Sent llm.response [{req_id}] ({len(response_text)} chars)")

            elif msg_type == "agent.log":
                agent = msg.get("agent_name", "?")
                level = msg.get("level", "info")
                message = msg.get("message", "")
                icon = "⚠" if level == "warning" else "✗" if level == "error" else "·"
                print(f"      {icon} [{agent}] {message}")
                agent_events.append(msg)

                if "error" in level.lower() and "fallback" not in message.lower():
                    error_occurred = True

            elif msg_type == "agent.status":
                pass

            elif msg_type == "project.started":
                print(f"    {INFO} Project started")

            elif msg_type == "project.completed":
                completed = True
                files = msg.get("files", [])
                print(f"\n  {PASS} Project completed! ({len(files)} files generated)")
                break

            elif msg_type == "project.error":
                print(f"\n  {FAIL} Project error: {msg.get('message', 'unknown')}")
                error_occurred = True
                break

    except Exception as e:
        print(f"\n  {FAIL} WebSocket error during test: {e}")
        all_passed = False

    elapsed = time.time() - start

    if not completed:
        print(f"\n  {FAIL} Project did not complete within {timeout_seconds}s (elapsed: {elapsed:.1f}s)")
        all_passed = False

    await ws.close()

    # Step 6: Verify output files
    print(f"\n{INFO} Step 6: Verify output files...")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{BASE}/api/projects/{project_id}/files")
            r.raise_for_status()
            tree = r.json()

            def count_files(node: dict | list) -> list[str]:
                files = []
                if isinstance(node, list):
                    for item in node:
                        files.extend(count_files(item))
                elif isinstance(node, dict):
                    if node.get("type") == "file":
                        files.append(node.get("name", ""))
                    for child in node.get("children", []):
                        files.extend(count_files(child))
                return files

            file_list = count_files(tree)
            print(f"  {PASS} File tree has {len(file_list)} files: {', '.join(file_list[:10])}{'...' if len(file_list) > 10 else ''}")

            # Check for key files
            r2 = await client.get(f"{BASE}/api/projects/{project_id}")
            r2.raise_for_status()
            project_data = r2.json()
            output_files = project_data.get("files", [])
            file_paths = [f["path"] for f in output_files]
            print(f"  {INFO} All output paths: {file_paths}")

            key_files = ["src/App.tsx", "README.md"]
            for kf in key_files:
                found = any(kf in fp for fp in file_paths)
                if found:
                    print(f"  {PASS} Found: {kf}")
                else:
                    print(f"  {FAIL} Missing: {kf}")
                    all_passed = False

    except Exception as e:
        print(f"  {FAIL} Failed to verify files: {e}")
        all_passed = False

    # Summary
    total_time = time.time() - t0
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    print(f"  LLM requests handled:  {request_count}")
    print(f"  LLM responses sent:    {response_count}")
    print(f"  Agent log events:      {len(agent_events)}")
    print(f"  Project completed:     {'Yes' if completed else 'No'}")
    print(f"  Errors:                {'Yes' if error_occurred else 'None'}")
    print(f"  Total time:            {total_time:.1f}s")
    print(f"  Result:                {PASS if all_passed and completed else FAIL}")
    print("=" * 60 + "\n")

    return all_passed and completed


if __name__ == "__main__":
    success = asyncio.run(run_test())
    sys.exit(0 if success else 1)
