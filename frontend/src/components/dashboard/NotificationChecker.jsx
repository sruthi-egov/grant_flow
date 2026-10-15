import { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { differenceInDays, parseISO, format } from "date-fns";

export default function NotificationChecker({ grants, milestones, deadlines, sows = [], msas = [], mous = [] }) {
  useEffect(() => {
    if (!grants.length) return;

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const lastCheck = localStorage.getItem("notif_last_check");
    if (lastCheck === todayStr) return;

    runCheck(todayStr);
  }, [grants, milestones, deadlines, sows, msas, mous]);

  const runCheck = async (todayStr) => {
    const settingsList = await base44.entities.AppSettings.list();
    if (!settingsList.length || !settingsList[0].notifications_enabled) {
      localStorage.setItem("notif_last_check", todayStr);
      return;
    }

    const settings = settingsList[0];
    const daysBefore = settings.days_before || 7;
    const alertEmails = settings.alert_emails || [];
    const today = new Date(todayStr);

    const logs = await base44.entities.NotificationLog.list("-created_date", 500);
    const sentKeys = new Set(logs.map(l => `${l.item_id}-${l.due_date}`));

    const itemsToNotify = [];

    // Existing: milestones & reporting deadlines
    milestones.filter(m => m.status === "pending" && m.due_date).forEach(m => {
      const diff = differenceInDays(parseISO(m.due_date), today);
      if (diff === daysBefore && !sentKeys.has(`${m.id}-${m.due_date}`)) {
        itemsToNotify.push({ ...m, item_type: "milestone" });
      }
    });

    deadlines.filter(d => d.status === "upcoming" && d.due_date).forEach(d => {
      const diff = differenceInDays(parseISO(d.due_date), today);
      if (diff === daysBefore && !sentKeys.has(`${d.id}-${d.due_date}`)) {
        itemsToNotify.push({ ...d, item_type: "deadline" });
      }
    });

    // New: contract end dates (14 days before)
    const CONTRACT_DAYS = 14;
    const contractItems = [
      ...grants.filter(g => !g.archived && g.end_date).map(g => ({ id: g.id, label: g.title || g.grant_name, type: "Grant", end_date: g.end_date })),
      ...sows.filter(s => !s.archived && s.end_date).map(s => ({ id: s.id, label: s.title, type: "SOW", end_date: s.end_date })),
      ...msas.filter(m => !m.archived && m.end_date).map(m => ({ id: m.id, label: m.title, type: "MSA", end_date: m.end_date })),
      ...mous.filter(m => !m.archived && m.end_date).map(m => ({ id: m.id, label: m.title, type: "MOU", end_date: m.end_date })),
    ];

    for (const c of contractItems) {
      const diff = differenceInDays(parseISO(c.end_date), today);
      const key = `contract-${c.id}-${c.end_date}`;
      if (diff === CONTRACT_DAYS && !sentKeys.has(key) && alertEmails.length > 0) {
        const formattedDate = format(parseISO(c.end_date), "MMMM d, yyyy");
        const subject = `Alert: ${c.type} "${c.label}" expires in ${CONTRACT_DAYS} days`;
        const body = `Hello,

This is an automated alert that the following contract is expiring in ${CONTRACT_DAYS} days:

Type: ${c.type}
Name: ${c.label}
Expiry Date: ${formattedDate}

Please take action to renew or wind down this agreement as appropriate.

This is an automated message from GrantTrack.`;

        for (const email of alertEmails) {
          await base44.integrations.Core.SendEmail({ to: email, subject, body });
        }

        await base44.entities.NotificationLog.create({
          item_id: key,
          item_type: "milestone",
          due_date: c.end_date,
          sent_date: todayStr,
          grant_name: c.type,
          item_title: c.label,
        });
      }
    }

    // Send milestone/deadline emails to grant contacts
    for (const item of itemsToNotify) {
      const grant = grants.find(g => g.id === item.grant_id);
      if (!grant) continue;

      const contacts = (grant.contacts || []).filter(c => c.email);
      const recipients = [...new Set([...contacts.map(c => c.email), ...alertEmails])];
      if (!recipients.length) continue;

      const isM = item.item_type === "milestone";
      const itemName = isM ? item.title : item.report_type;
      const formattedDate = format(parseISO(item.due_date), "MMMM d, yyyy");

      const subject = `Reminder: "${itemName}" is due in ${daysBefore} days — ${grant.title || grant.grant_name}`;
      const body = `Hello,

This is an automated reminder that the following ${isM ? "milestone payment" : "reporting deadline"} is due in ${daysBefore} days:

Grant: ${grant.title || grant.grant_name}
${isM ? "Milestone" : "Report"}: ${itemName}
Due Date: ${formattedDate}${isM && item.amount ? `\nAmount: $${item.amount.toLocaleString()}` : ""}${item.notes ? `\nNotes: ${item.notes}` : ""}

Please ensure all necessary preparations are made ahead of the due date.

This is an automated message from GrantTrack.`;

      for (const email of recipients) {
        await base44.integrations.Core.SendEmail({ to: email, subject, body });
      }

      await base44.entities.NotificationLog.create({
        item_id: item.id,
        item_type: item.item_type,
        due_date: item.due_date,
        sent_date: todayStr,
        grant_name: grant.title || grant.grant_name,
        item_title: itemName,
      });
    }

    localStorage.setItem("notif_last_check", todayStr);
  };

  return null;
}