import { readFileSync } from "node:fs";
import withSerwistInit from "@serwist/next";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  images: {
    unoptimized: true,
  },
}

export default withSerwist(nextConfig)
