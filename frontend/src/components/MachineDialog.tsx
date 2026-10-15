import { Fragment, useEffect, useRef, useState } from "react";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MachineImageSchema, type Machine } from "@maintenance/shared";
import { api } from "../lib/api";

const fields = [
  ["code", "ID"], ["type", "Type"], ["name", "Name"],
  ["year", "Year"], ["make", "Make"], ["model", "Model"], ["spec1", "Spec 1"],
  ["spec2", "Spec 2"], ["acquiredDate", "Acquired date"], ["inServiceDate", "In-service date"],
  ["currentOdometer", "Current ODO miles"], ["currentOdometerDate", "Current ODO miles date"],
  ["status", "Status"], ["vinOrSerial", "VIN / SN / ID"], ["modelId", "Model ID"],
  ["licenseId", "License ID"], ["reminderMiles", "Reminder miles"], ["reminderYears", "Reminder years"]
] as const;

async function readImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.some((type) => type === file.type)) throw new Error("Choose a JPEG, PNG, GIF, or WebP image.");
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error("Image must be nonempty and 5 MB or smaller.");
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image."));
    reader.onerror = () => reject(new Error("Could not read image. Please select the file again."));
    reader.onabort = () => reject(new Error("Image reading was cancelled."));
    reader.readAsDataURL(file);
  });
  return MachineImageSchema.parse(result);
}

export function MachineDialog({ machine, onClose, onSaved }: {
  machine?: Machine;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const visibleFields = machine ? fields : fields.filter(([key]) => key !== "reminderMiles" && key !== "reminderYears");
  const [values, setValues] = useState(() => Object.fromEntries(visibleFields.map(([key]) => [key, String(machine?.[key] ?? "")])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File>();
  const [removeImage, setRemoveImage] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  return <dialog ref={dialog} className="item-dialog" onCancel={(event) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (!saving) onClose();
  }}>
    <form onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      setError("");
      try {
        const payload: Omit<Machine, "id"> = { ...values, code: values.code.trim(), type: values.type.trim(), status: values.status };
        if (imageFile) {
          payload.imageData = await readImage(imageFile);
          payload.imageUrl = "";
        } else if (removeImage) {
          payload.imageData = "";
          payload.imageUrl = "";
        }
        if (machine?.id) await api.updateMachine(machine.id, payload);
        else await api.createMachine(payload);
        await onSaved();
        onClose();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not save item.");
      } finally { setSaving(false); }
    }}>
      <div className="section-heading"><div><p className="eyebrow">MY SHOP</p><h2>{machine ? "Edit item" : "Add item"}</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="Close item form">×</button></div>
      <p className="muted">Enter your own details and optionally select an image. Only ID and type are required.</p>
      {error && <div className="alert" role="alert">{error}</div>}
      <fieldset disabled={saving} className="form-grid">
        {visibleFields.map(([key, label]) => <Fragment key={key}>
          <label>{label}<input type="text" value={values[key]} required={key === "code" || key === "type"} pattern={key === "code" || key === "type" ? ".*\\S.*" : undefined} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></label>
          {key === "name" && <div className="image-field">
            <label htmlFor="item-image">Image</label>
            <div className="image-picker">
              <div className="image-picker-select">
                <input id="item-image" ref={imageInput} type="file" accept={IMAGE_TYPES.join(",")} onChange={(event) => {
                  setImageFile(event.target.files?.[0]);
                  setError("");
                }} />
                <span className="image-picker-content" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></svg>
                  <span>Choose file</span>
                  {imageFile && <span className="image-picker-filename">{imageFile.name}</span>}
                </span>
              </div>
              {(imageFile || (!removeImage && (machine?.imageData || machine?.imageUrl))) && <button type="button" className="image-picker-remove" aria-label="Remove image" title="Remove image" onClick={() => {
                setImageFile(undefined);
                setRemoveImage(true);
                if (imageInput.current) imageInput.current.value = "";
              }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>}
            </div>
          </div>}
        </Fragment>)}
      </fieldset>
      <div className="form-actions"><button type="button" className="button subtle" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving..." : "Save item"}</button></div>
    </form>
  </dialog>;
}
