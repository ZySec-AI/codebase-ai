import { createServer } from "node:http";
import { handleRoute } from "./routes.js";

export function startServer(root: string, port: number): void {
  const server = createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const route = await handleRoute(req.url || "/", req.method || "GET", root);
      res.writeHead(route.status);
      res.end(JSON.stringify(route.body, null, 2));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  server.listen(port, () => {
    console.log(`codebase server running on http://localhost:${port}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /health              Health check`);
    console.log(`  GET  /codebase            Full manifest`);
    console.log(`  GET  /codebase/:category  Single category`);
    console.log(`  GET  /codebase/query?path=stack.languages`);
    console.log(`  POST /codebase/scan       Trigger re-scan`);
  });

  process.on("SIGINT", () => {
    server.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    server.close();
    process.exit(0);
  });
}
