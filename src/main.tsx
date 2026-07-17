import { createRoot } from "react-dom/client";
import "./i18n/config";
import { bootstrapGeneratedSiteAnalytics } from "./analytics";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "next-themes";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

bootstrapGeneratedSiteAnalytics();

createRoot(container).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <App />
  </ThemeProvider>
);
