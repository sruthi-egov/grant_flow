import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import GrantForm from "./GrantForm";

export default function EditGrantModal({ grant, onClose, onSaved }) {
  const handleSave = async (data) => {
    await base44.entities.Grant.update(grant.id, data);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Grant</DialogTitle>
        </DialogHeader>
        <GrantForm initialData={grant} onSave={handleSave} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}