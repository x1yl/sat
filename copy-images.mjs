import fs from "node:fs";

fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist/images", { recursive: true });

fs.cpSync("src", "dist", {
  recursive: true,
  filter: (source) =>
    !source.split(/[\\/]/).includes("node_modules")
});

fs.cpSync("images", "dist/images", { recursive: true });

console.log("Website and images copied to dist/");