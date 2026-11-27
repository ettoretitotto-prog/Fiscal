import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { SessionProvider } from "./lib/session";

export function mount(el: HTMLElement) {
  createRoot(el).render(
    <StrictMode>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
