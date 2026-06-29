import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary deps must not be bundled by the server compiler — load them at runtime.
  serverExternalPackages: [
    "sharp",
    "ffmpeg-static",
    "@ffprobe-installer/ffprobe",
    "postgres",
  ],
  // Ensure the bundled fonts ship with server functions (ffmpegTextOverlay needs them;
  // without fontconfig on serverless, Pango hangs if the TTF isn't present).
  outputFileTracingIncludes: {
    "/**": ["./lib/fonts/**"],
  },
};

export default nextConfig;
