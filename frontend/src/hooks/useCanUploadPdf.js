/**
 * Permission helpers for upload/create operations.
 *
 * All role comparisons are case-insensitive — supports "Admin", "admin", "User", "user".
 * Module comparisons use a normalized alias map — supports all known spellings.
 *
 * Primary export: usePermissions() + canUploadPDF(permissions, moduleName)
 */
import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";

// ─── Module alias map ──────────────────────────────────────────────────────────
const MODULE_ALIASES = {
  sow:                     "sow",
  sows:                    "sow",
  "statement of work":     "sow",
  statement_of_work:       "sow",
  msa:                     "msa",
  msas:                    "msa",
  "master service agreement": "msa",
  master_service_agreement:"msa",
  mou:                     "mou",
  mous:                    "mou",
  "memorandum of understanding": "mou",
  memorandum_of_understanding: "mou",
  grant:                   "grants",
  grants:                  "grants",
};

function normalizeModuleName(value) {
  const s = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return MODULE_ALIASES[s] || s;
}

// ─── Core helpers (exported for use in any component) ─────────────────────────

/**
 * Check if a user has access to a specific module.
 * @param {object|null} permissions - result from usePermissions()
 * @param {string} moduleName - e.g. "SOWs", "MSAs", "MOUs", "Grants"
 */
export function hasModuleAccess(permissions, moduleName) {
  if (!permissions) return false;
  const role = (permissions.role || "").toLowerCase();
  if (role === "admin") return true;

  // null allowed_modules means all modules
  if (!permissions.allowed_modules || permissions.allowed_modules.length === 0) return true;

  const target = normalizeModuleName(moduleName);
  return permissions.allowed_modules.some(m => normalizeModuleName(m) === target);
}

/**
 * Main gate: can the user upload/create PDF-derived records in this module?
 * @param {object|null} permissions - result from usePermissions()
 * @param {string|null} moduleName - e.g. "SOWs". Pass null to skip module check.
 */
export function canUploadPDF(permissions, moduleName) {
  if (!permissions) return false;

  // Disabled users are always blocked (backend also sets is_enabled: false)
  if (permissions.is_enabled === false) return false;

  const role = (permissions.role || "").toLowerCase();

  // Admins bypass all checks
  if (role === "admin") return true;

  // Normal users must have can_upload_pdf
  if (permissions.can_upload_pdf !== true) return false;

  // If no specific module check requested, just verify can_upload_pdf
  if (!moduleName) return true;

  return hasModuleAccess(permissions, moduleName);
}

/**
 * Hook that returns live permissions from the backend getMyPermissions function.
 * Returns { permissions, checkingPermission }
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState(null);
  const [checkingPermission, setCheckingPermission] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.functions.invoke("getMyPermissions", {});
        if (!cancelled && res?.data) {
          setPermissions(res.data);
        }
      } catch {
        // Safe default — no permissions on error
        if (!cancelled) {
          setPermissions({ can_upload_pdf: false, allowed_modules: [], role: "user", is_enabled: true });
        }
      } finally {
        if (!cancelled) setCheckingPermission(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { permissions, checkingPermission };
}

/**
 * Legacy hook kept for backward compatibility.
 * New code should use usePermissions() + canUploadPDF() directly.
 */
export function useCanUploadPdf() {
  const { permissions, checkingPermission } = usePermissions();
  return {
    canUpload: permissions ? canUploadPDF(permissions, null) : false,
    checkingPermission,
    permissions,
  };
}