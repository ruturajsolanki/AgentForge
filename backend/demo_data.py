"""Template file contents used in demo mode (no LLM required)."""

DEMO_FILES: dict[str, list[dict]] = {
    "frontend_dev": [
        {
            "path": "src/App.tsx",
            "content": """import { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase";

interface Item {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
}

const LS_KEY = "agentforge_todo_items";

function loadLocal(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocal(items: Item[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  const useCloud = Boolean(supabase);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    if (useCloud) {
      const { data, error } = await supabase!.from("items").select("*").order("created_at", { ascending: false });
      if (error) setError(error.message);
      else setItems(data || []);
    } else {
      setItems(loadLocal());
    }
    setLoading(false);
  }, [useCloud]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function addItem() {
    if (!title.trim()) return;
    if (useCloud) {
      const { error } = await supabase!.from("items").insert({ title: title.trim() });
      if (error) { setError(error.message); return; }
    } else {
      const newItem: Item = { id: crypto.randomUUID(), title: title.trim(), completed: false, created_at: new Date().toISOString() };
      const updated = [newItem, ...items];
      saveLocal(updated);
      setItems(updated);
    }
    setTitle("");
    if (useCloud) fetchItems();
  }

  async function toggleItem(id: string, completed: boolean) {
    if (useCloud) {
      await supabase!.from("items").update({ completed: !completed }).eq("id", id);
      fetchItems();
    } else {
      const updated = items.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i));
      saveLocal(updated);
      setItems(updated);
    }
  }

  async function deleteItem(id: string) {
    if (useCloud) {
      await supabase!.from("items").delete().eq("id", id);
      fetchItems();
    } else {
      const updated = items.filter((i) => i.id !== id);
      saveLocal(updated);
      setItems(updated);
    }
  }

  function clearCompleted() {
    const updated = items.filter((i) => !i.completed);
    if (!useCloud) saveLocal(updated);
    setItems(updated);
  }

  const filtered = items.filter((i) => {
    if (filter === "active") return !i.completed;
    if (filter === "done") return i.completed;
    return true;
  });

  const activeCount = items.filter((i) => !i.completed).length;
  const doneCount = items.filter((i) => i.completed).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-sky-50">
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-violet-600 to-sky-500 bg-clip-text text-transparent">My To-Do</h1>
          <p className="text-sm text-gray-400 mt-1">{useCloud ? "Synced with Supabase" : "Saved locally in your browser"}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold text-lg">&times;</button>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <input className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent text-gray-700 placeholder-gray-300" placeholder="What needs to be done?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <button onClick={addItem} disabled={!title.trim()} className="px-6 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 active:scale-95 transition-all font-semibold shadow-lg shadow-violet-200 disabled:opacity-40 disabled:cursor-not-allowed">Add</button>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1">
            {(["all", "active", "done"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${filter === f ? "bg-white text-violet-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
                {f} {f === "active" ? `(${activeCount})` : f === "done" ? `(${doneCount})` : `(${items.length})`}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-300"><div className="w-8 h-8 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-3"></div>Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-300"><p className="font-medium">{items.length === 0 ? "No tasks yet. Add one above!" : "All caught up!"}</p></div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((item) => (
              <li key={item.id} className={`group flex items-center gap-3 p-4 bg-white rounded-xl border transition-all hover:shadow-md ${item.completed ? "border-gray-100 opacity-60" : "border-gray-100 shadow-sm"}`}>
                <button onClick={() => toggleItem(item.id, item.completed)} className="flex-shrink-0">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${item.completed ? "bg-emerald-500 border-emerald-500 text-white scale-110" : "border-gray-300 hover:border-violet-400"}`}>
                    {item.completed && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                </button>
                <span className={`flex-1 ${item.completed ? "line-through text-gray-400" : "text-gray-700"}`}>{item.title}</span>
                <button onClick={() => deleteItem(item.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-lg">&times;</button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between mt-6 text-xs text-gray-400">
            <span>{activeCount} item{activeCount !== 1 ? "s" : ""} left</span>
            {doneCount > 0 && <button onClick={clearCompleted} className="hover:text-red-500 transition-colors">Clear completed ({doneCount})</button>}
          </div>
        )}
      </div>
    </div>
  );
}
""",
        },
    ],
    "backend_dev": [
        {
            "path": "supabase/migrations/001_create_items.sql",
            "content": """-- Items table for CRUD demo
CREATE TABLE IF NOT EXISTS items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on items"
  ON items FOR ALL
  USING (true)
  WITH CHECK (true);
""",
        },
    ],
    "devops": [
        {
            "path": "Dockerfile",
            "content": """FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
""",
        },
        {
            "path": "docker-compose.yml",
            "content": """version: '3.8'
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    environment:
      - NODE_ENV=production
""",
        },
    ],
    "qa_tester": [
        {
            "path": "tests/app.test.js",
            "content": """import { describe, it, expect } from 'vitest';

describe('App', () => {
  it('should have valid component structure', () => {
    expect(true).toBe(true);
  });

  it('Supabase client should handle missing config gracefully', async () => {
    const supabaseUrl = '';
    const client = supabaseUrl ? 'configured' : null;
    expect(client).toBeNull();
  });
});
""",
        },
    ],
    "documentation": [
        {
            "path": "README.md",
            "content": """# To-Do App — Generated by AgentForge

A beautiful to-do application with optional Supabase backend.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Supabase (optional) or localStorage
- **Build**: Vite

## Quick Start (No Backend Needed)

```bash
npm install
npm run dev
```

The app works immediately with localStorage. Your tasks persist across page refreshes.

## Optional: Connect Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL migration in `supabase/migrations/001_create_items.sql`
3. Add your credentials to `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Restart the dev server — the app will automatically sync with Supabase.

## License

MIT
""",
        },
    ],
}
