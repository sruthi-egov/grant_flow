import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Returns the current authenticated user's live permissions from the User entity.
 * Uses service role to bypass RLS so regular users can read their own record.
 *
 * Response shape:
 * {
 *   can_upload_pdf: boolean,
 *   allowed_modules: string[] | null,  // null = all modules
 *   role: "admin" | "user",
 *   is_enabled: boolean,
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Authenticate the caller — unauthenticated requests fail here
    const sessionUser = await base44.auth.me();
    if (!sessionUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role to read the live User entity record (gets custom fields like
    // can_upload_pdf, allowed_modules, is_enabled, disabled which are not on the auth token)
    const users = await base44.asServiceRole.entities.User.filter({ email: sessionUser.email });
    const liveRecord = users?.[0];

    // Normalize role — supports "Admin", "admin", "User", "user"
    const rawRole = liveRecord?.role || sessionUser.role || sessionUser._app_role || '';
    const role = String(rawRole).trim().toLowerCase();

    // Check if user account is enabled
    const isEnabled = (() => {
      if (!liveRecord) return true; // auth succeeded, assume enabled
      if (liveRecord.disabled === true) return false;
      if (liveRecord.is_enabled === false) return false;
      if (liveRecord.is_active === false) return false;
      return true;
    })();

    // Disabled users get no permissions
    if (!isEnabled) {
      return Response.json({
        can_upload_pdf: false,
        allowed_modules: [],
        role: role || 'user',
        is_enabled: false,
      });
    }

    // Admins always have all permissions
    if (role === 'admin') {
      return Response.json({
        can_upload_pdf: true,
        allowed_modules: null, // null = all modules
        role: 'admin',
        is_enabled: true,
      });
    }

    // Normal users: return live values from app-level user record
    return Response.json({
      can_upload_pdf: liveRecord?.can_upload_pdf === true,
      allowed_modules: liveRecord?.allowed_modules ?? null,
      role: 'user',
      is_enabled: true,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});