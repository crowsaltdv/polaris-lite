// Local preview server for Polaris Lite. The site itself is plain static files and needs no server in production;
// this exists because browsers won't run the page from file:// (module imports, game iframes).
//   node tools/serve.mjs            -> http://localhost:3031
//   PORT=8080 HOST=0.0.0.0 node tools/serve.mjs   (HOST=0.0.0.0 lets phones on your network open it)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 3031;
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
	".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
	".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
	".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
	".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".webm": "video/webm",
	".wasm": "application/wasm", ".map": "application/json",
};

// Some emulator games load the shared EmulatorJS files from /emulatorjs/ at the site root; hosts do the same with _redirects / vercel.json
const REWRITES = [["/emulatorjs/", "/games/selenite/emulatorjs/"]];

const send = (res, code, text) => res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" }).end(text);

http
	.createServer((req, res) => {
		if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
		let rel;
		try {
			rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
		} catch {
			return send(res, 400, "Bad request");
		}
		for (const [from, to] of REWRITES) if (rel.startsWith(from)) rel = to + rel.slice(from.length);
		let file = path.join(ROOT, rel);
		if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, "Forbidden");
		fs.stat(file, (err, st) => {
			if (!err && st.isDirectory()) {
				if (!rel.endsWith("/")) return res.writeHead(301, { Location: rel + "/" }).end();
				file = path.join(file, "index.html");
				return fs.stat(file, (e2, s2) => (e2 ? send(res, 404, "Not found") : serve(req, res, file, s2)));
			}
			if (err) return send(res, 404, "Not found");
			serve(req, res, file, st);
		});
	})
	.listen(PORT, HOST, () => console.log(`Polaris Lite: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}  (Ctrl+C to stop)`));

function serve(req, res, file, st) {
	const headers = {
		"Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
		"Accept-Ranges": "bytes",
		"Cache-Control": "no-cache",
	};
	// media players ask for byte ranges
	const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
	let start = 0;
	let end = st.size - 1;
	let code = 200;
	if (m && (m[1] || m[2])) {
		start = m[1] ? Number(m[1]) : st.size - Number(m[2]);
		end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
		if (start > end || start >= st.size) return res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end();
		code = 206;
		headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
	}
	headers["Content-Length"] = end - start + 1;
	res.writeHead(code, headers);
	if (req.method === "HEAD") return res.end();
	fs.createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
}
