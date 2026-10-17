import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, CheckSquare, Loader2, UserPlus, Pencil, RefreshCw, Mail, Info, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";

const MODULES = ["Grants", "SOWs", "MSAs", "MOUs"];

export default function UserAdmin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [filter, setFilter] = useState("all");

  // Invite
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteModules, setInviteModules] = useState([...MODULES]);
  const [inviteCanUploadPdf, setInviteCanUploadPdf] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Edit name
  const [editUser, setEditUser] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Pending invitations (people who have not accepted yet, so have no account)
  const [invitations, setInvitations] = useState([]);
  const [resending, setResending] = useState({});
  const [revoking, setRevoking] = useState({});

  // Disable/Enable confirmation
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'disable'|'enable', user }
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [allUsers, me] = await Promise.all([
      api.entities.User.list(),
      api.auth.me(),
    ]);
    setUsers(allUsers);
    setCurrentUser(me);
    await loadInvitations();
    setLoading(false);
  };

  const loadInvitations = async () => {
    try {
      const all = await api.invitations.list();
      // Only invitations still awaiting action are actionable here.
      setInvitations(all.filter(i => i.status === "pending" || i.status === "expired"));
    } catch {
      // Non-fatal: the user list is still usable without this panel.
      setInvitations([]);
    }
  };

  // is_active missing => treat as true
  const isUserActive = (user) => user.is_active !== false;

  const isPending = (user) => !user.full_name || user.full_name.trim() === "";

  // Filtered users
  const filteredUsers = users.filter(u => {
    if (filter === "active") return isUserActive(u);
    if (filter === "disabled") return !isUserActive(u);
    if (filter === "admin") return u.role === "admin";
    if (filter === "user") return u.role !== "admin";
    return true;
  });

  const toggleModule = (userId, module) => {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const current = u.allowed_modules || MODULES;
      const isAllowed = current.includes(module);
      const updated = isAllowed ? current.filter(m => m !== module) : [...current, module];
      return { ...u, allowed_modules: updated };
    }));
  };

  const selectAll = (userId) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, allowed_modules: [...MODULES] } : u));
  };

  const isModuleAllowed = (user, module) => {
    if (!user.allowed_modules || user.allowed_modules.length === 0) return true;
    return user.allowed_modules.includes(module);
  };

  const toggleInviteModule = (module) => {
    setInviteModules(prev => prev.includes(module) ? prev.filter(m => m !== module) : [...prev, module]);
  };

  /**
   * Sends an invitation.
   *
   * Permissions travel with the invitation and are applied when it is
   * accepted. The previous implementation created the account first and then
   * polled for it to patch permissions on, which left a window where the new
   * user had unrestricted module access.
   */
  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      toast.error("Enter an email address.");
      return;
    }

    setInviting(true);
    try {
      const result = await api.users.inviteUser(email, inviteRole, {
        allowed_modules: inviteRole === "admin" ? [] : inviteModules,
        can_upload_pdf: inviteRole === "admin" ? true : inviteCanUploadPdf,
      });

      if (result?.email_status === "sent") {
        // "Submitted", not "sent": the provider accepted the message, which is
        // not the same as it reaching an inbox. It may still be filtered.
        toast.success(
          result.resent
            ? `Invitation for ${email} submitted to the email provider. The previous link no longer works.`
            : `Invitation for ${email} submitted to the email provider.`,
          {
            description: "Inbox delivery is not confirmed — ask the recipient to check spam if it does not arrive.",
            duration: 10000,
          },
        );
      } else {
        // The invitation exists; only delivery failed. Say so, with the
        // backend's reason, rather than claiming success.
        toast.warning(
          result?.email_error
            ? `Invitation created for ${email}, but the email was not sent. ${result.email_error}`
            : `Invitation created for ${email}, but the email could not be delivered ` +
              `(${result?.email_status ?? "unknown"}). Check the mail settings, then use Resend.`,
          { duration: 12000 },
        );
      }

      await loadInvitations();
      setInviteEmail("");
      setInviteRole("user");
      setInviteModules([...MODULES]);
      setInviteCanUploadPdf(false);
      setShowInvite(false);
    } catch (err) {
      // Surface the backend's reason instead of leaving the dialog stuck.
      toast.error(err?.message || "Could not send the invitation. Please try again.");
    } finally {
      setInviting(false);
    }
  };

  const openEditUser = (user) => {
    setEditUser(user);
    setEditName(user.display_name || user.full_name || "");
  };

  /**
   * Issues a new token for a pending invitation and emails it again.
   * The previous link stops working, so a forwarded old email cannot be used.
   */
  const handleResendInvite = async (invitation) => {
    setResending(s => ({ ...s, [invitation.id]: true }));
    try {
      const result = await api.invitations.resend(invitation.id);
      if (result?.email_status === "sent") {
        toast.success(
          `New invitation link for ${invitation.email} submitted to the email provider. The previous link no longer works.`,
          {
            description: "Inbox delivery is not confirmed — ask the recipient to check spam if it does not arrive.",
            duration: 10000,
          },
        );
      } else {
        toast.warning(
          result?.email_error
            ? `New link created for ${invitation.email}, but the email was not sent. ${result.email_error}`
            : `New link created for ${invitation.email}, but the email could not be delivered ` +
              `(${result?.email_status ?? "unknown"}).`,
          { duration: 12000 },
        );
      }
      await loadInvitations();
    } catch (err) {
      toast.error(err?.message || "Unable to resend the invitation. Please try again.");
    } finally {
      setResending(s => ({ ...s, [invitation.id]: false }));
    }
  };

  const handleRevokeInvite = async (invitation) => {
    setRevoking(s => ({ ...s, [invitation.id]: true }));
    try {
      await api.invitations.revoke(invitation.id);
      toast.success(`Invitation for ${invitation.email} cancelled. The link no longer works.`);
      await loadInvitations();
    } catch (err) {
      toast.error(err?.message || "Unable to cancel the invitation.");
    } finally {
      setRevoking(s => ({ ...s, [invitation.id]: false }));
    }
  };

  const saveEditUser = async () => {
    setEditSaving(true);
    await api.entities.User.update(editUser.id, { display_name: editName });
    setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, display_name: editName } : u));
    toast.success("Name updated successfully");
    setEditUser(null);
    setEditSaving(false);
  };

  const toggleCanUploadPdf = (userId) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, can_upload_pdf: !u.can_upload_pdf } : u));
  };

  const saveUser = async (user) => {
    setSaving(s => ({ ...s, [user.id]: true }));
    try {
      await api.entities.User.update(user.id, {
        allowed_modules: user.allowed_modules,
        can_upload_pdf: user.can_upload_pdf ?? false,
      });
      toast.success("User permissions updated successfully.");
    } catch {
      toast.error("Unable to update user permissions. Please try again.");
    }
    setSaving(s => ({ ...s, [user.id]: false }));
  };

  // --- Disable / Enable logic ---
  const requestDisable = (user) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot disable your own account.");
      return;
    }
    // Check last active admin guard
    if (user.role === "admin") {
      const activeAdmins = users.filter(u => u.role === "admin" && isUserActive(u));
      if (activeAdmins.length <= 1) {
        toast.error("At least one active Admin account is required.");
        return;
      }
    }
    setConfirmAction({ type: "disable", user });
  };

  const requestEnable = (user) => {
    setConfirmAction({ type: "enable", user });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, user } = confirmAction;
    setActionLoading(true);

    try {
      const newIsActive = type === "enable";
      await api.entities.User.update(user.id, { is_active: newIsActive });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newIsActive } : u));

      // Audit log
      try {
        await api.entities.AuditLog.create({
          action_type: type === "disable" ? "user_disabled" : "user_enabled",
          entity_type: "User",
          entity_id: user.id,
          entity_name: user.display_name || user.full_name || user.email,
          user_email: currentUser?.email,
          user_name: currentUser?.full_name || currentUser?.email,
          old_value: type === "disable" ? "active" : "disabled",
          new_value: type === "disable" ? "disabled" : "active",
          description: `Admin ${type === "disable" ? "disabled" : "enabled"} user ${user.email}.`,
          status: "success",
        });
      } catch {
        // Audit log failure should not block the action
      }

      toast.success(type === "disable" ? "User disabled successfully." : "User enabled successfully.");
    } catch {
      toast.error(type === "disable"
        ? "Unable to disable user. Please try again."
        : "Unable to enable user. Please try again."
      );
    }

    setActionLoading(false);
    setConfirmAction(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Users className="w-8 h-8" /> User Administration
        </h1>
        <p className="text-muted-foreground mt-1">
          Invite users, manage module access, control PDF upload permissions, and enable/disable accounts.
        </p>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <div>
          <p className="font-medium">How user invitation works</p>
          <p className="text-blue-700 mt-0.5">
            An invited person receives an email containing a single-use link. Opening it lets them choose
            their own password and activates their account with the role and module access you set here —
            they cannot change those themselves. The link expires, and no account exists until they accept.
          </p>
        </div>
      </div>

      {invitations.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-amber-600" />
              <h2 className="font-semibold">Pending invitations ({invitations.length})</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              These people have been invited but have not created their account yet. No user account
              exists for them until they accept.
            </p>
            <div className="space-y-2">
              {invitations.map(inv => {
                const expired = inv.status === "expired";
                return (
                  <div
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-background border border-border rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{inv.email}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Badge className="bg-muted text-muted-foreground">{inv.role}</Badge>
                        {expired ? (
                          <Badge className="bg-red-100 text-red-700 border border-red-200">Expired</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border border-amber-200">
                            Awaiting acceptance
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {expired ? "expired" : "expires"} {new Date(inv.expires_at).toLocaleDateString()}
                          {inv.sent_count > 1 ? ` · sent ${inv.sent_count}×` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleResendInvite(inv)}
                        disabled={resending[inv.id] || revoking[inv.id]}
                      >
                        {resending[inv.id]
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <RefreshCw className="w-3 h-3" />}
                        Resend
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRevokeInvite(inv)}
                        disabled={resending[inv.id] || revoking[inv.id]}
                      >
                        {revoking[inv.id]
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <UserX className="w-3 h-3" />}
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button onClick={() => setShowInvite(true)} className="gap-2">
          <UserPlus className="w-4 h-4" /> Invite User
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="user">Normal Users</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Edit User Name Dialog */}
      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Name</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="mb-1 block">Display Name</Label>
              <Input
                placeholder="Enter name..."
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">This overrides the name from their login provider.</p>
            </div>
            <Button className="w-full" onClick={saveEditUser} disabled={editSaving || !editName.trim()}>
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Name"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-2 bg-muted/50 rounded-md px-3 py-2 text-xs text-muted-foreground">
              <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>They will receive a single-use link to choose their own password. The role and module access you set below are applied when they accept and cannot be changed by them.</span>
            </div>
            <div>
              <Label className="mb-1 block">Email address</Label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">Role</Label>
              <Select value={inviteRole} onValueChange={v => { setInviteRole(v); if (v === "admin") setInviteModules([...MODULES]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteRole === "user" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Module Access</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setInviteModules(inviteModules.length === MODULES.length ? [] : [...MODULES])}
                  >
                    {inviteModules.length === MODULES.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {MODULES.map(m => (
                    <div key={m} className="flex items-center gap-2">
                      <Checkbox
                        id={`invite-module-${m}`}
                        checked={inviteModules.includes(m)}
                        onCheckedChange={() => toggleInviteModule(m)}
                      />
                      <Label htmlFor={`invite-module-${m}`} className="font-normal cursor-pointer">{m}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between border rounded-lg px-3 py-2.5 bg-muted/30">
              <div>
                <Label className="font-medium text-sm">Allow PDF Upload</Label>
                <p className="text-xs text-muted-foreground mt-0.5">User can upload PDF documents to modules</p>
              </div>
              <Checkbox
                checked={inviteCanUploadPdf}
                onCheckedChange={checked => setInviteCanUploadPdf(!!checked)}
              />
            </div>
            <Button className="w-full" onClick={handleInvite} disabled={inviting || !inviteEmail}>
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Invite"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable/Enable Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={open => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "disable" ? "Disable User?" : "Enable User?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "disable"
                ? `Are you sure you want to disable ${confirmAction?.user?.display_name || confirmAction?.user?.full_name || confirmAction?.user?.email}? The user will no longer be able to access the application.`
                : `Are you sure you want to enable ${confirmAction?.user?.display_name || confirmAction?.user?.full_name || confirmAction?.user?.email}? The user will be able to access the application again.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={actionLoading}
              className={confirmAction?.type === "disable" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}
            >
              {actionLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : confirmAction?.type === "disable" ? "Disable User" : "Enable User"
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading ? (
        <div className="text-muted-foreground text-center py-16">Loading users...</div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="hidden lg:grid lg:grid-cols-[1fr_repeat(4,_72px)_90px_180px] gap-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div>User / Status</div>
            {MODULES.map(m => <div key={m} className="text-center">{m}</div>)}
            <div className="text-center">PDF Upload</div>
            <div></div>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center text-muted-foreground py-12">No users match the selected filter.</div>
          )}

          {filteredUsers.map(user => {
            const active = isUserActive(user);
            return (
              <Card key={user.id} className={!active ? "opacity-70 border-red-200" : ""}>
                <CardContent className="p-4">
                  <div className="flex flex-col lg:grid lg:grid-cols-[1fr_repeat(4,_72px)_90px_180px] gap-3 items-start lg:items-center">
                    {/* User info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{user.display_name || user.full_name || user.email}</p>
                        <button onClick={() => openEditUser(user)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge className={user.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
                          {user.role}
                        </Badge>
                        {!active ? (
                          <Badge className="bg-red-100 text-red-700 border border-red-200">Disabled</Badge>
                        ) : isPending(user) ? (
                          <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Pending</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 border border-green-200">Active</Badge>
                        )}
                      </div>
                      {/* Invitations are managed in the Pending invitations
                          panel above; a user row here already has an account. */}
                    </div>

                    {/* Module checkboxes */}
                    {user.role === "admin" ? (
                      <div className="lg:col-span-5 flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckSquare className="w-4 h-4 text-primary" />
                        Admin has full access to all modules and PDF upload
                      </div>
                    ) : (
                      <>
                        {MODULES.map(module => (
                          <div key={module} className="flex items-center gap-2 lg:justify-center">
                            <Label className="lg:hidden text-xs text-muted-foreground w-20">{module}</Label>
                            <Checkbox
                              checked={isModuleAllowed(user, module)}
                              onCheckedChange={() => toggleModule(user.id, module)}
                              disabled={!active}
                            />
                          </div>
                        ))}
                        <div className="flex items-center gap-2 lg:justify-center">
                          <Label className="lg:hidden text-xs text-muted-foreground w-20">PDF Upload</Label>
                          <Checkbox
                            checked={!!user.can_upload_pdf}
                            onCheckedChange={() => toggleCanUploadPdf(user.id)}
                            disabled={!active}
                          />
                        </div>
                      </>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 items-center flex-wrap pt-2 lg:pt-0 border-t lg:border-t-0 mt-2 lg:mt-0">
                      {user.role !== "admin" && active && (
                        <>
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => selectAll(user.id)}>All</Button>
                          <Button size="sm" onClick={() => saveUser(user)} disabled={saving[user.id]}>
                            {saving[user.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                          </Button>
                        </>
                      )}
                      {user.id !== currentUser?.id && (
                        active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 gap-1"
                            onClick={() => requestDisable(user)}
                          >
                            <UserX className="w-3 h-3" /> Disable
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs text-green-700 border-green-200 hover:bg-green-50 gap-1"
                            onClick={() => requestEnable(user)}
                          >
                            <UserCheck className="w-3 h-3" /> Enable
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}