import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function kaizenPwa() {
  return {
    name: "kaizen-pwa",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const generatedFiles = Object.values(bundle)
        .map((output) => output.fileName)
        .filter((fileName) => !fileName.endsWith(".map"));
      const precacheFiles = [
        ".",
        "index.html",
        "manifest.webmanifest",
        "kaizen-icon.svg",
        ...generatedFiles,
      ];
      const uniquePrecacheFiles = [...new Set(precacheFiles)];
      const fingerprint = createHash("sha256")
        .update(
          Object.values(bundle)
            .map((output) =>
              output.type === "chunk"
                ? `${output.fileName}:${output.code}`
                : `${output.fileName}:${String(output.source)}`,
            )
            .join("|"),
        )
        .digest("hex")
        .slice(0, 12);
      const template = readFileSync(
        new URL("./src/kaizen-sw.js", import.meta.url),
        "utf8",
      );
      const source = template
        .replace("__KAIZEN_CACHE_VERSION__", fingerprint)
        .replace("__KAIZEN_PRECACHE_MANIFEST__", JSON.stringify(uniquePrecacheFiles));

      this.emitFile({
        type: "asset",
        fileName: "kaizen-sw.js",
        source,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), kaizenPwa()],
});
