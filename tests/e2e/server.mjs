import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const server = createServer((request, response) => {
  const raw = request.url === "/" ? "/non-elementor.html" : (request.url ?? "/non-elementor.html");
  const decoded = decodeURIComponent(raw.split("?")[0]);
  const file = path.resolve(root, `.${decoded}`);
  if (!file.startsWith(`${root}${path.sep}`) || !file.endsWith(".html")) {
    response.writeHead(400).end("Invalid fixture path");
    return;
  }
  try {
    const size = statSync(file).size;
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": size,
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("Fixture not found");
  }
});
server.listen(4173, "127.0.0.1");
