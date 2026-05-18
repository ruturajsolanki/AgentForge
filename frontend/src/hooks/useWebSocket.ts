import { useEffect, useRef, useState, useCallback } from "react";
import type { WSEvent } from "../types";
import { browserLLM } from "../services/browserLLM";

export function useWebSocket(onEvent: (event: WSEvent) => void) {
  const ws = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  onEventRef.current = onEvent;

  const handleLLMRequest = useCallback(
    async (request: { request_id: string; prompt: string; system?: string }, socket: WebSocket) => {
      try {
        const sys = request.system ?? "";
        let agent = "Agent";
        if (sys.includes("Project Manager")) agent = "Project Manager";
        else if (sys.includes("Frontend Developer")) agent = "Frontend Dev";
        else if (sys.includes("Backend Developer")) agent = "Backend Dev";
        else if (sys.includes("DevOps")) agent = "DevOps";
        else if (sys.includes("QA")) agent = "QA Tester";
        else if (sys.includes("Documentation")) agent = "Docs Writer";
        browserLLM.setCurrentAgent(agent);

        const content = await browserLLM.generate(request.prompt, request.system);
        socket.send(
          JSON.stringify({
            type: "llm.response",
            request_id: request.request_id,
            content,
          }),
        );
      } catch (err) {
        socket.send(
          JSON.stringify({
            type: "llm.response",
            request_id: request.request_id,
            content: "",
            error: String(err),
          }),
        );
      }
    },
    [],
  );

  // Use refs (not state) for the reconnect timer + cancel flag so React
  // StrictMode's double-mount in dev doesn't create duplicate sockets.
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    const open = () => {
      // Don't open a second socket if one is already alive / connecting.
      if (
        ws.current &&
        (ws.current.readyState === WebSocket.OPEN ||
          ws.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const socket = new WebSocket(`${proto}://${host}/ws`);
      ws.current = socket;

      socket.onopen = () => {
        if (cancelled.current) {
          socket.close();
          return;
        }
        setConnected(true);
      };

      socket.onclose = () => {
        setConnected(false);
        // Only auto-reconnect if this socket is the one we still own and the
        // effect hasn't been torn down. Prevents StrictMode + onclose from
        // spawning a second socket every 3s.
        if (cancelled.current) return;
        if (ws.current !== socket) return;
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => {
          if (!cancelled.current) open();
        }, 3000);
      };

      socket.onerror = () => socket.close();

      socket.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          if (event.type === "llm.request") {
            if (browserLLM.hasModel) {
              handleLLMRequest(event, socket);
            } else {
              socket.send(JSON.stringify({
                type: "llm.response",
                request_id: event.request_id,
                content: "",
                error: `No browser LLM loaded. Open Settings and load a model first. (status=${browserLLM.status})`,
              }));
            }
            return;
          }

          onEventRef.current(event);
        } catch {
          /* ignore parse errors */
        }
      };
    };

    open();

    return () => {
      cancelled.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      const sock = ws.current;
      ws.current = null;
      if (sock) {
        // Drop the handlers so the closing socket doesn't try to reconnect.
        sock.onclose = null;
        sock.onerror = null;
        sock.onmessage = null;
        sock.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected, wsRef: ws };
}
