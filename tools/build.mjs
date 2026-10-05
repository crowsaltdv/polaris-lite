// Builds the deployable site into dist/: only the files a visitor needs, so server code, chat data, node_modules, tools
// and notes never get published, whatever else sits in this folder. Files are hard-linked (not copied) when possible,
// so a full build takes seconds and uses no extra disk space.
//
//   node tools/build.mjs                        every game library      (Netlify, Vercel)
//   node tools/build.mjs --libs html,gn-math    only those libraries    (GitHub Pages: sites are limited to 1 GB)
//   node tools/build.mjs --out some/folder      build somewhere other than dist/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARK = ".polaris-lite-build"; // written into every output folder, so we only ever wipe folders we made ourselves

const args = process.argv.slice(2);
const opt = (name) => {
	const i = args.indexOf(name);
	if (i < 0) return undefined;
	if (!args[i + 1] || args[i + 1].startsWith("--")) {
		console.error(`${name} needs a value.`);
		process.exit(1);
	}
	return args[i + 1];
};
const out = path.resolve(ROOT, opt("--out") || "dist");

// ---- the library list comes from games.js ----
const GAMES = new Function(fs.readFileSync(path.join(ROOT, "games.js"), "utf8") + ";return GAMES")();
const available = fs.readdirSync(path.join(ROOT, "games"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const libs = opt("--libs") ? opt("--libs").split(",").map((s) => s.trim()).filter(Boolean) : available;
const unknown = libs.filter((l) => !available.includes(l));
if (!libs.length || unknown.length) {
	console.error(`Unknown library: ${unknown.join(", ") || "(none given)"}. Available: ${available.join(", ")}`);
	process.exit(1);
}

// ---- refuse to wipe anything that is not an old build of ours ----
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
if (inside(ROOT, out) || ["games", "vendor", "tools", "node_modules", ".git"].some((d) => inside(out, path.join(ROOT, d)))) {
	console.error(`Refusing to build into ${out}: pick a folder outside the site's own files.`);
	process.exit(1);
}
if (fs.existsSync(out)) {
	if (fs.readdirSync(out).length && !fs.existsSync(path.join(out, MARK))) {
		console.error(`${out} already exists and was not made by this tool. Choose another folder with --out.`);
		process.exit(1);
	}
	fs.rmSync(out, { recursive: true, force: true });
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, MARK), "");

// ---- put files in place ----
let linking = true;
let files = 0;
let bytes = 0;
function put(src, dest) {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	if (linking) {
		try {
			fs.linkSync(src, dest);
		} catch {
			linking = false; // other drive or a file system without hard links: copy instead
		}
	}
	if (!linking) fs.copyFileSync(src, dest);
	files++;
	bytes += fs.statSync(dest).size;
}
function tree(srcDir, destDir, skip = () => false) {
	for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
		const s = path.join(srcDir, e.name);
		const rel = path.relative(ROOT, s).split(path.sep).join("/");
		if (skip(rel)) continue;
		if (e.isDirectory()) tree(s, path.join(destDir, e.name), skip);
		else if (e.isFile()) put(s, path.join(destDir, e.name));
	}
}

const keep = GAMES.filter((g) => libs.includes(g.id.split("/")[0]));
const dropped = new Set(available.filter((l) => !libs.includes(l)));

for (const f of ["index.html", "robots.txt"]) put(path.join(ROOT, f), path.join(out, f));
fs.writeFileSync(path.join(out, ".nojekyll"), ""); // GitHub Pages: serve files as they are (no Jekyll, so folders starting with _ survive)
fs.writeFileSync(path.join(out, "games.js"), "var GAMES=" + JSON.stringify(keep));
files++;
// Netlify rewrites the emulator games' root-level /emulatorjs/ path; those games live in the Selenite library
if (libs.includes("selenite") && fs.existsSync(path.join(ROOT, "_redirects"))) put(path.join(ROOT, "_redirects"), path.join(out, "_redirects"));

tree(path.join(ROOT, "vendor"), path.join(out, "vendor"), (rel) => rel === "vendor/guard.js" || (rel.startsWith("vendor/thumbs/") && dropped.has(rel.split("/")[2])));
for (const lib of libs) tree(path.join(ROOT, "games", lib), path.join(out, "games", lib));

// ---- self-check: every listed game must exist in the output ----
const missing = keep.filter((g) => !fs.existsSync(path.join(out, "games", g.id, "index.html")));
const gb = bytes / 1073741824;
console.log(`Built ${out}`);
console.log(`  libraries: ${libs.join(", ")}  |  ${keep.length} games  |  ${files.toLocaleString()} files  |  ${gb >= 1 ? gb.toFixed(2) + " GB" : (bytes / 1048576).toFixed(0) + " MB"}  |  ${linking ? "hard-linked" : "copied"}`);
if (missing.length) {
	console.error(`  PROBLEM: ${missing.length} listed games have no index.html: ${missing.slice(0, 5).map((g) => g.id).join(", ")}`);
	process.exit(1);
}
if (gb > 1) console.log("  note: over 1 GB, which is more than GitHub Pages allows for a published site. Use --libs for that.");
if (files > 14000) console.log(`  note: ${files.toLocaleString()} files. Vercel's CLI upload limit is 15,000 files, so deploy through Git, not 'vercel deploy'.`);
