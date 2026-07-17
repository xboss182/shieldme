import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";

export default defineConfig({
  extensionApi: "chrome",
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    name: "ShieldMe Alias Manager",
    description: "Create and manage ShieldMe email aliases directly from your browser",
    version: "1.0.0",
    permissions: ["storage", "clipboardWrite", "activeTab"],
    host_permissions: ["https://api.shieldme.cc/*"],
    action: {
      default_popup: "popup.html",
      default_title: "ShieldMe Aliases",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "128": "icon/128.png",
      },
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png",
    },
  },
});
