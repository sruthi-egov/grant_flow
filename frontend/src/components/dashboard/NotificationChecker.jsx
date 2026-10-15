import { useEffect } from "react";
import { format } from "date-fns";
import { api } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";

/**
 * Nudges the backend to run today's notification pass.
 *
 * On Base44 this component walked every milestone and deadline **in the
 * browser** and called SendEmail directly, because there was no dependable
 * server-side scheduler. That design could send duplicates (every admin who
 * opened the dashboard ran it) and its de-duplication relied on a client-side
 * cache.
 *
 * The standalone backend owns this now: a cron job runs the same six rules
 * daily at 09:00 Asia/Kolkata, and a unique index on
 * (rule, item, recipient, date) makes a send physically impossible to repeat.
 * This component therefore just asks the backend to run the pass when an admin
 * opens the dashboard, which keeps the original "it catches up when someone
 * uses the app" behaviour without any of the duplicate risk.
 *
 * It renders nothing and never blocks the dashboard.
 */
export default function NotificationChecker() {
  const { user } = useAuth();

  useEffect(() => {
    // Only admins may trigger a run; everyone else is a no-op.
    if (!user || user.role !== "admin") return;

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const storageKey = "grantos_notif_last_trigger";

    let lastTrigger = null;
    try {
      lastTrigger = localStorage.getItem(storageKey);
    } catch {
      // Private browsing: fall through and let the backend de-duplicate.
    }
    if (lastTrigger === todayStr) return;

    let cancelled = false;

    (async () => {
      try {
        const settings = await api.entities.AppSettings.list();
        if (!settings.length || !settings[0].notifications_enabled) {
          try { localStorage.setItem(storageKey, todayStr); } catch { /* ignore */ }
          return;
        }

        const res = await api.functions.invoke("sendNotifications", {});
        if (cancelled) return;

        try { localStorage.setItem(storageKey, todayStr); } catch { /* ignore */ }

        if (res?.data) {
          console.info(
            `[GrantOS] Notification pass for ${res.data.date}: ` +
            `${res.data.sent} sent, ${res.data.failed} failed, ${res.data.skipped} already sent.`
          );
        }
      } catch (error) {
        // Never surface this to the user: the scheduled job is the primary
        // path, and this trigger is only an optimisation.
        console.warn("[GrantOS] Could not trigger the notification run:", error?.message);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return null;
}
