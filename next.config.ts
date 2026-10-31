import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly and data files; load it from node_modules instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite"],
  // A package-lock.json in a parent folder would otherwise be taken as the workspace root.
  turbopack: { root: __dirname },
};

export default nextConfig;
