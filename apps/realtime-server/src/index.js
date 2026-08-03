// 실시간 게임 서버 골격 (docs/05-realtime-multiplayer.md)
// 아키텍처 대안 확정(ORCHESTRATOR.md 3번 항목) 후 본격 구현 예정.
// 현재는 헬스체크용 최소 WebSocket 서버만 제공.
import { WebSocketServer } from "ws";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "hello", serverTime: Date.now() }));
  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
    }
  });
});

console.log(`[realtime-server] listening on ws://localhost:${PORT}`);
