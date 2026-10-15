/**
 * Shared audit logging utility.
 * Call logAudit() from anywhere to create an AuditLog record.
 * Non-blocking — failures are silently swallowed.
 */
import { base44 } from "@/api/base44Client";

export async function logAudit({ action_type, entity_type, entity_id, entity_name, grant_id, description, old_value, new_value, status = "success" }) {
  try {
    const user = await base44.auth.me().catch(() => null);
    await base44.entities.AuditLog.create({
      action_type,
      entity_type: entity_type || "",
      entity_id: entity_id || "",
      entity_name: entity_name || "",
      grant_id: grant_id || "",
      user_email: user?.email || "",
      user_name: user?.full_name || "",
      old_value: old_value || "",
      new_value: new_value || "",
      description: description || "",
      status,
    });
  } catch {
    // Non-blocking
  }
}