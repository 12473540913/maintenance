import { Fragment, useEffect, useRef, useState } from "react";
import { type Machine } from "@maintenance/shared";
import { api } from "../lib/api";
import { GalleryDialog } from "./GalleryDialog";
import { machineGallery, saveGallery } from "../lib/gallery";

const fields = [
  ["code", "ID"], ["type", "Type"], ["name", "Name"],
  ["year", "Year"], ["make", "Make"], ["model", "Model"], ["spec1", "Spec 1"],
  ["spec2", "Spec 2"], ["acquiredDate", "Acquired date"],
  ["currentOdometer", "Current ODO miles"], ["currentOdometerDate", "Current ODO miles date"],
  ["status", "Status"], ["vinOrSerial", "VIN / SN / ID"], ["modelId", "Model ID"],
  ["licenseId", "License ID"]
] as const;

export function MachineDialog({ machine, shopId, extra = false, extrasEnabled = false, onClose, onSaved }: {
  machine?: Machine;
  shopId: string;
  extra?: boolean;
  extrasEnabled?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(([key]) => [key, String(machine?.[key] ?? "")])));
  const [saving, setSaving] = useState(false);
  const [itemAction, setItemAction] = useState<"archive" | "delete" | "section" | null>(null);
  const [error, setError] = useState("");
  const [gallery, setGallery] = useState(() => machineGallery(machine));
  const [editGallery, setEditGallery] = useState(false);
  const uploads = useRef(new Map<string, string>());
  useEffect(() => {
    dialog.current?.showModal();
    const element = dialog.current;
    return () => element?.close();
  }, []);

  const archiveMachine = async () => {
    if (!machine?.id) return;
    setSaving(true);
    setItemAction("archive");
    setError("");
    try {
      await api.archiveMachine(machine.id);
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not archive item.");
    } finally {
      setItemAction(null);
      setSaving(false);
    }
  };

  const toggleExtra = async () => {
    if (!machine?.id) return;
    setSaving(true);
    setItemAction("section");
    setError("");
    try {
      await api.updateMachine(machine.id, { code: machine.code, type: machine.type, extra: !machine.extra });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not make item ${machine.extra ? "core" : "extra"}.`);
    } finally {
      setItemAction(null);
      setSaving(false);
    }
  };

  const deleteMachine = async () => {
    if (!machine?.id || !window.confirm(`Permanently delete ${machine.name || machine.code} from your database? This cannot be undone.`)) return;
    setSaving(true);
    setItemAction("delete");
    setError("");
    try {
      await api.deleteMachine(machine.id);
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete item.");
    } finally {
      setItemAction(null);
      setSaving(false);
    }
  };

  return <dialog ref={dialog} className="item-dialog" aria-label={machine ? "Edit item" : "Add item"} onCancel={(event) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (!saving) onClose();
  }}>
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (editGallery) return;
      setSaving(true);
      setError("");
      try {
        const payload: Omit<Machine, "id"> = { ...values, shopId: machine?.shopId ?? shopId, extra: machine?.extra ?? extra, code: values.code.trim(), type: values.type.trim(), status: values.status };
        payload.gallery = await saveGallery(gallery, uploads.current);
        if (machine?.id) await api.updateMachine(machine.id, payload);
        else await api.createMachine(payload);
        await onSaved();
        onClose();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not save item.");
      } finally { setSaving(false); }
    }}>
      <div className="item-dialog-actions"><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="Close item form">×</button></div>
      {error && <div className="alert" role="alert">{error}</div>}
      <fieldset disabled={saving} className="form-grid">
        {fields.map(([key, label]) => <Fragment key={key}>
          <label>{label}<input type="text" value={values[key]} required={key === "code" || key === "type"} pattern={key === "code" || key === "type" ? ".*\\S.*" : undefined} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></label>
          {key === "name" && <div className="image-field">
            <span className="gallery-field-label">Gallery</span>
            <div className="image-picker">
              <button id="item-gallery" type="button" className="text-button gallery-edit-button" onClick={() => setEditGallery(true)}>Edit gallery</button>
            </div>
          </div>}
        </Fragment>)}
      </fieldset>
      <div className="form-actions">
        {machine?.id && <div className="item-management-actions">
          <button type="button" className="button danger-button" onClick={archiveMachine} disabled={saving}>{itemAction === "archive" ? "Archiving..." : "Archive item"}</button>
          <button type="button" className="button danger-button" onClick={deleteMachine} disabled={saving}>{itemAction === "delete" ? "Deleting..." : "Delete item"}</button>
          {(machine.extra || extrasEnabled) && <button type="button" className="button subtle" onClick={toggleExtra} disabled={saving}>
            {itemAction === "section" ? "Saving..." : machine.extra ? "Make Core" : "Make Extra"}
          </button>}
        </div>}
        <div className="item-save-actions">
          <button type="button" className="button subtle" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="button primary" disabled={saving}>{saving ? "Saving..." : "Save item"}</button>
        </div>
      </div>
    </form>
    {editGallery && <GalleryDialog images={gallery} onCancel={() => setEditGallery(false)} onSubmit={(images) => {
      setGallery(images);
      setEditGallery(false);
    }} />}
  </dialog>;
}
