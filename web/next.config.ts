import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The extract route reads the sample PDFs from disk; make sure they ship with the serverless function.
  outputFileTracingIncludes: { "/api/extract": ["./public/samples/**"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
