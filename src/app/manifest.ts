import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Student Diary",
    short_name: "Diary",
    description: "Your lessons, homework, marks and attendance in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#2f4fb5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
