import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Attendance session photos are hosted on Cloudinary.
    remotePatterns: [new URL("https://res.cloudinary.com/**")],
  },
};

export default nextConfig;
