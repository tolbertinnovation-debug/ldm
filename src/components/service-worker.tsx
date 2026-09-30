"use client";

import { useEffect, useState } from "react";

/** Registers the offline service worker and shows a banner when offline. */
export function ServiceWorker() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[90] bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning-fg shadow">
      You are offline. Pages you visited are still available — orders will need a connection.
    </div>
  );
}
