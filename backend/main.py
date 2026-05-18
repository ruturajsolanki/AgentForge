"""AgentForge — FastAPI application entry point."""

from __future__ import annotations

import asyncio
import json
import os
import uuid

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel

from config import PROJECTS_DIR, PROVIDER_PRESETS, settings
from database import Database
from file_manager import FileManager
from llm_bridge import llm_bridge
from llm_client import LLMClient
from memory import MemoryEngine
from chat_handler import ChatHandler
from orchestrator import Orchestrator
from project_runner import ProjectRunner
from vector_store import create_vector_store
from ws_manager import ConnectionManager

_BASE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(_BASE, "static")

class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """Prevent browsers from caching static assets (JS/CSS) so code updates take effect immediately."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/assets/") or path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app = FastAPI(title="AgentForge", version="2.0.0")

app.add_middleware(NoCacheStaticMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ws_manager = ConnectionManager()
llm_bridge.bind(ws_manager)
database = Database()
project_runner = ProjectRunner(ws_manager)
orchestrator = Orchestrator(ws_manager, database, project_runner)

file_manager = FileManager(ws_manager)
vector_store = create_vector_store()
llm_client = LLMClient()
memory_engine = MemoryEngine(database, vector_store, llm_client)
chat_handler = ChatHandler(database, llm_client, memory_engine, file_manager)


class ProjectCreate(BaseModel):
    prompt: str


class ChatMessage(BaseModel):
    message: str


class FileCreate(BaseModel):
    path: str
    content: str = ""


class FileRename(BaseModel):
    old_path: str
    new_path: str


# ── API routes ───────────────────────────────────────

@app.get("/api/health")
async def health():
    llm = LLMClient()
    connected = await llm.check_health()
    models = await llm.list_models() if connected else []
    return {
        "status": "ok",
        "provider": settings.llm_provider,
        "provider_connected": connected,
        "available_models": models,
        "demo_mode": settings.demo_mode,
    }


@app.get("/api/settings")
async def get_settings():
    llm = LLMClient()
    connected = await llm.check_health()
    models = await llm.list_models() if connected else []
    return {
        **settings.to_dict(),
        "available_models": models,
        "provider_connected": connected,
        "provider_presets": PROVIDER_PRESETS,
    }


@app.put("/api/settings")
async def update_settings(body: dict):
    settings.update(body)
    llm = LLMClient()
    connected = await llm.check_health()
    models = await llm.list_models() if connected else []
    return {
        **settings.to_dict(),
        "saved": True,
        "provider_connected": connected,
        "available_models": models,
        "provider_presets": PROVIDER_PRESETS,
    }


@app.get("/api/agents")
async def get_agents():
    return orchestrator.get_agents_state()


@app.post("/api/projects")
async def create_project(body: ProjectCreate):
    project_id = uuid.uuid4().hex[:8]
    database.create_project(project_id, body.prompt)
    await orchestrator.reset_agents()
    asyncio.create_task(orchestrator.execute_project(project_id, body.prompt))
    return {"project_id": project_id, "status": "started"}


@app.get("/api/projects")
async def list_projects():
    return database.list_projects()


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    project = database.get_project(project_id)
    if not project:
        return {"error": "Project not found"}

    _skip = {"node_modules", ".vite", "dist", ".git", "__pycache__", ".next", ".nuxt"}
    output_files: list[dict] = []
    op = project.get("output_path")
    if op and os.path.exists(op):
        for root, dirs, files in os.walk(op):
            dirs[:] = [d for d in dirs if d not in _skip]
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, op)
                try:
                    with open(full) as fh:
                        output_files.append({"path": rel, "content": fh.read()})
                except Exception:
                    output_files.append({"path": rel, "content": "[binary]"})
    project["files"] = output_files
    return project


# ── File CRUD ────────────────────────────────────────

@app.get("/api/projects/{project_id}/files")
async def list_files(project_id: str):
    return file_manager.list_tree(project_id)


@app.get("/api/projects/{project_id}/files/{file_path:path}")
async def read_file(project_id: str, file_path: str):
    try:
        content = file_manager.read_file(project_id, file_path)
        return {"path": file_path, "content": content}
    except FileNotFoundError:
        return PlainTextResponse("File not found", status_code=404)


@app.put("/api/projects/{project_id}/files/{file_path:path}")
async def write_file(project_id: str, file_path: str, body: dict):
    content = body.get("content", "")
    await file_manager.write_file(project_id, file_path, content)
    asyncio.create_task(memory_engine.index_file(project_id, file_path, content))
    return {"saved": True, "path": file_path}


@app.post("/api/projects/{project_id}/files")
async def create_file(project_id: str, body: FileCreate):
    await file_manager.write_file(project_id, body.path, body.content)
    asyncio.create_task(memory_engine.index_file(project_id, body.path, body.content))
    return {"created": True, "path": body.path}


@app.delete("/api/projects/{project_id}/files/{file_path:path}")
async def delete_file(project_id: str, file_path: str):
    try:
        await file_manager.delete_file(project_id, file_path)
        return {"deleted": True, "path": file_path}
    except FileNotFoundError:
        return PlainTextResponse("File not found", status_code=404)


@app.post("/api/projects/{project_id}/files/rename")
async def rename_file(project_id: str, body: FileRename):
    try:
        await file_manager.rename_file(project_id, body.old_path, body.new_path)
        return {"renamed": True, "old_path": body.old_path, "new_path": body.new_path}
    except FileNotFoundError:
        return PlainTextResponse("File not found", status_code=404)


# ── Chat API ─────────────────────────────────────────

@app.post("/api/projects/{project_id}/chat")
async def chat(project_id: str, body: ChatMessage):
    result = await chat_handler.handle_message(project_id, body.message)
    return result


@app.get("/api/projects/{project_id}/chat")
async def get_chat_history(project_id: str):
    return chat_handler.get_history(project_id)


class PrepareRequest(BaseModel):
    message: str

class CompleteRequest(BaseModel):
    message: str
    llm_response: str


@app.post("/api/projects/{project_id}/chat/prepare")
async def chat_prepare(project_id: str, body: PrepareRequest):
    """Return the built prompt so the frontend can call the browser LLM directly."""
    return chat_handler.prepare_prompt(project_id, body.message)


@app.post("/api/projects/{project_id}/chat/complete")
async def chat_complete(project_id: str, body: CompleteRequest):
    """Accept an LLM response from the frontend and apply file edits."""
    result = await chat_handler.complete_with_response(
        project_id, body.message, body.llm_response
    )
    return result


# ── Project Runner (dev server) ───────────────────────

@app.post("/api/projects/{project_id}/server/start")
async def start_server(project_id: str):
    try:
        port = await project_runner.start(project_id)
        return {"running": True, "port": port, "url": f"http://localhost:{port}"}
    except FileNotFoundError as e:
        return PlainTextResponse(str(e), status_code=404)
    except RuntimeError as e:
        return PlainTextResponse(str(e), status_code=503)


@app.post("/api/projects/{project_id}/server/stop")
async def stop_server(project_id: str):
    await project_runner.stop(project_id)
    return {"running": False}


@app.post("/api/projects/{project_id}/server/restart")
async def restart_server(project_id: str):
    try:
        port = await project_runner.restart(project_id)
        return {"running": True, "port": port, "url": f"http://localhost:{port}"}
    except FileNotFoundError as e:
        return PlainTextResponse(str(e), status_code=404)
    except RuntimeError as e:
        return PlainTextResponse(str(e), status_code=503)


@app.get("/api/projects/{project_id}/server/status")
async def server_status(project_id: str):
    return project_runner.get_status(project_id)


# ── Dev server proxy (same-origin preview) ───────────

@app.api_route("/devserver/{project_id}/{file_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_dev_server(project_id: str, file_path: str, request: Request):
    """Reverse-proxy requests to the project's Vite dev server so the preview
    iframe can load from the same origin (avoids cross-origin iframe issues)."""
    status = project_runner.get_status(project_id)
    if not status["running"] or not status["url"]:
        return PlainTextResponse("Dev server not running", status_code=503)

    target_url = f"{status['url']}/{file_path}"
    qs = str(request.query_params)
    if qs:
        target_url += f"?{qs}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            body = await request.body()
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers={k: v for k, v in request.headers.items() if k.lower() not in ("host", "connection")},
                content=body if body else None,
            )
            excluded = {"content-encoding", "transfer-encoding", "connection"}
            headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
            return Response(content=resp.content, status_code=resp.status_code, headers=headers)
        except (httpx.ConnectError, httpx.ReadTimeout):
            return PlainTextResponse("Dev server not ready yet", status_code=503)


# ── Project preview (serves generated files) ─────────

@app.get("/preview/{project_id}/{file_path:path}")
async def preview_project_file(project_id: str, file_path: str):
    """Serve a generated project file for live preview."""
    project_dir = os.path.join(PROJECTS_DIR, project_id)
    full_path = os.path.join(project_dir, file_path)
    if not os.path.isfile(full_path):
        index_path = os.path.join(project_dir, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path, media_type="text/html")
        for root, _, files in os.walk(project_dir):
            for f in files:
                if f.endswith(".html"):
                    return FileResponse(os.path.join(root, f), media_type="text/html")
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
    return FileResponse(full_path)


# ── WebSocket ────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    await ws.send_json({
        "type": "init",
        "agents": orchestrator.get_agents_state(),
        "demo_mode": settings.demo_mode,
    })
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                msg_type = msg.get("type", "")

                if msg_type == "llm.response":
                    llm_bridge.resolve(
                        msg.get("request_id", ""),
                        msg.get("content", ""),
                        msg.get("error"),
                    )

                elif msg_type == "terminal.exec":
                    asyncio.create_task(
                        _handle_terminal(ws, msg.get("command", ""), msg.get("project_id", ""), msg.get("request_id", ""))
                    )

            except (json.JSONDecodeError, Exception):
                pass
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)


async def _handle_terminal(ws: WebSocket, command: str, project_id: str, request_id: str) -> None:
    """Execute a shell command in the project directory and stream output back."""
    if not command.strip():
        return
    cwd = os.path.join(PROJECTS_DIR, project_id) if project_id else PROJECTS_DIR
    os.makedirs(cwd, exist_ok=True)
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=cwd,
        )
        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            try:
                await ws.send_json({
                    "type": "terminal.output",
                    "request_id": request_id,
                    "data": line.decode(errors="replace"),
                })
            except Exception:
                break
        exit_code = await proc.wait()
        try:
            await ws.send_json({
                "type": "terminal.exit",
                "request_id": request_id,
                "exit_code": exit_code,
            })
        except Exception:
            pass
    except Exception as exc:
        try:
            await ws.send_json({
                "type": "terminal.output",
                "request_id": request_id,
                "data": f"Error: {exc}\n",
            })
            await ws.send_json({
                "type": "terminal.exit",
                "request_id": request_id,
                "exit_code": 1,
            })
        except Exception:
            pass


# ── Serve frontend (production build) ────────────────

os.makedirs(PROJECTS_DIR, exist_ok=True)

if os.path.isdir(STATIC_DIR):

    @app.get("/assets/{file_path:path}")
    async def serve_asset(file_path: str):
        """Serve static assets with no-cache headers to prevent stale JS/CSS."""
        full = os.path.join(STATIC_DIR, "assets", file_path)
        if os.path.isfile(full):
            return FileResponse(
                full,
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        return PlainTextResponse("Not found", status_code=404)

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the React SPA — all non-API routes fall through to index.html."""
        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(
                file_path,
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        return FileResponse(
            os.path.join(STATIC_DIR, "index.html"),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
