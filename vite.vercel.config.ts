import react from "@vitejs/plugin-react";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const outputDirectory = resolve("dist-vercel");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "exclude-model-source-backups",
      apply: "build",
      async closeBundle() {
        await Promise.all([
          rm(resolve(outputDirectory, "models/jinsha"), { recursive: true, force: true }),
          rm(resolve(outputDirectory, "models/xiyu.glb"), { force: true }),
        ]);
      },
    },
  ],
  build: {
    target: "es2018",
    cssTarget: "safari13",
    outDir: outputDirectory,
    emptyOutDir: true,
  },
});
