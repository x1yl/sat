
import fs from "node:fs";
import path from "node:path";

const source = path.resolve(process.cwd(), "/image");
const destination = path.resolve(process.cwd(), "dist/image");

if (!fs.existsSync(source)) {
  throw new Error(`Image folder not found: ${source}`);
}

fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });

console.log("Images copied to dist/image");