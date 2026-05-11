
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { AppErrorBoundary } from "./shared/ui/error-boundary";
import { NotificationHost } from "./shared/ui/notifications";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
    <NotificationHost />
  </AppErrorBoundary>,
);
