import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The public Introducciones service is now presented as Matchmaking.
      // The old page stays in the code; internal routes (/introduction,
      // /member) are unchanged. Temporary until the release is approved, so
      // it can be reverted without browsers caching it.
      { source: "/introducciones", destination: "/matchmaking", permanent: false },
    ];
  },
};

export default nextConfig;
