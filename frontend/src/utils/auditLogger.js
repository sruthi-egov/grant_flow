/**
 * Shared audit logging utility.
 * Call logAudit() from anywhere to create an AuditLog record.
 * Non-blocking — failures are silently swallowed.
 */
import { api } from "@/api/apiClient";

export async function logAudit({ action_type, entity_type, entity_id, entity_name, grant_id, description, old_value, new_value, status = "success" }) {
  try {
    const user = await api.auth.me().catch(() => null);
    await api.entities.AuditLog.create({
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