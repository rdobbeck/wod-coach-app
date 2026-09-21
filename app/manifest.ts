import type { MetadataRoute } from "next"

// Lets clients "Add to Home Screen" and open WOD Coach full-screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WOD Coach",
    short_name: "WOD",
    description: "Your training from your coach",
    start_url: "/client",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#0284c7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }
}
