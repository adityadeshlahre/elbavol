import http from "http";
import { parse } from "url";

const SSE_PORT = 3001;
const SSE_HOST = "0.0.0.0";

interface SSEClient {
  id: string;
  res: http.ServerResponse;
}

let sseServer: http.Server | null = null;
const clients = new Map<string, SSEClient>();

export function startSSEServer(): string {
  if (sseServer) {
    return `http://localhost:${SSE_PORT}/sse`;
  }

  sseServer = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
      });
      res.end();
      return;
    }

    const { pathname, query } = parse(req.url || "", true);

    if (pathname === "/sse" && req.method === "GET") {
      const clientId = query.id as string;

      if (!clientId) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing client ID");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      });

      res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

      const client: SSEClient = { id: clientId, res };
      clients.set(clientId, client);

      req.on("close", () => {
        clients.delete(clientId);
      });

      req.on("error", () => {
        clients.delete(clientId);
      });
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  sseServer.listen(SSE_PORT, SSE_HOST, () => {
    console.log(`SSE server started on http://${SSE_HOST}:${SSE_PORT}`);
  });

  return `http://localhost:${SSE_PORT}/sse`;
}

export function sendSSEMessage(clientId: string, data: any): boolean {
  const client = clients.get(clientId);
  if (!client) {
    return false;
  }

  try {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    clients.delete(clientId);
    return false;
  }
}

export function closeSSEConnection(clientId: string): void {
  const client = clients.get(clientId);
  if (client) {
    client.res.end();
    clients.delete(clientId);
  }
}

export function getSSEUrl(clientId: string): string {
  return `http://localhost:${SSE_PORT}/sse?id=${clientId}`;
}

process.on("SIGINT", () => {
  if (sseServer) {
    sseServer.close();
    console.log("SSE server closed");
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (sseServer) {
    sseServer.close();
    console.log("SSE server closed");
  }
  process.exit(0);
});
