import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root — there are other lockfiles higher up the tree.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
