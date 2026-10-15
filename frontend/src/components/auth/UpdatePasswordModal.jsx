import { useState } from "react";
import { api } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

function PasswordInput({ id, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setShow(s => !s)}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function UpdatePasswordModal({ user, open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // GrantOS uses email + password accounts only; there is no external identity
  // provider any more. Retained as a constant so the surrounding markup, which
  // branches on it, keeps working unchanged.
  const isGoogleUser = false;

  const handleClose = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess(false);
    onClose();
  };

  const validate = () => {
    if (!currentPassword) return "Current password is required.";
    if (!newPassword) return "New password is required.";
    if (!confirmPassword) return "Please confirm your new password.";
    if (newPassword !== confirmPassword) return "New password and confirm password do not match.";
    if (!PASSWORD_REGEX.test(newPassword)) return "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";
    if (newPassword === currentPassword) return "New password must be different from current password.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      await api.auth.changePassword({
        userId: user.id,
        currentPassword,
        newPassword,
      });
      setSuccess(true);
      toast.success("Password updated successfully.");
    } catch (err) {
      const msg = err?.message || err?.data?.message || "";
      if (msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("wrong") || msg.toLowerCase().includes("invalid")) {
        setError("Current password is incorrect.");
      } else if (msg.toLowerCase().includes("google") || msg.toLowerCase().includes("provider")) {
        setError("You are signed in with Google. Password update is only available for email/password login accounts.");
      } else {
        setError("Unable to update password. Please try again.");
      }
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" /> Update Password
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="font-semibold text-lg">Password updated successfully.</p>
            <p className="text-sm text-muted-foreground">Use your new password the next time you log in.</p>
            <Button className="mt-2 w-full" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <p className="text-xs text-muted-foreground">
              This is for email/password accounts only. If you log in with Google, password update is not applicable.
            </p>

            <div>
              <Label htmlFor="current-pw" className="mb-1 block">Current Password</Label>
              <PasswordInput
                id="current-pw"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
              />
            </div>

            <div>
              <Label htmlFor="new-pw" className="mb-1 block">New Password</Label>
              <PasswordInput
                id="new-pw"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Min 8 chars · uppercase · lowercase · number · special character
              </p>
            </div>

            <div>
              <Label htmlFor="confirm-pw" className="mb-1 block">Confirm New Password</Label>
              <PasswordInput
                id="confirm-pw"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}