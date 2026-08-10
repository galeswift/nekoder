import type { DesktopApi } from "./ipc/api";

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export {};
