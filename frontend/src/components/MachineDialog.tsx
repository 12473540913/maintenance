import { Fragment, useEffect, useRef, useState } from "react";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MachineImageSchema, type ImageCrop, type Machine } from "@maintenance/shared";
import { api } from "../lib/api";
import { ImageCropDialog } from "./ImageCropDialog";
import { DEFAULT_IMAGE_CROP } from "../lib/imageCrop";

const fields = [
  ["code", "ID"], ["type", "Type"], ["name", "Name"],
  ["year", "Year"], ["make", "Make"], ["model", "Model"], ["spec1", "Spec 1"],
  ["spec2", "Spec 2"], ["acquiredDate", "Acquired date"],
  ["currentOdometer", "Current ODO miles"], ["currentOdometerDate", "Current ODO miles date"],
  ["status", "Status"], ["vinOrSerial", "VIN / SN / ID"], ["modelId", "Model ID"],
  ["licenseId", "License ID"]
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
  const data = MachineImageSchema.parse(result);
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load image. Please choose another file."));
    image.src = data;
  });
  return data;
}

export function MachineDialog({ machine, shopId, onClose, onSaved }: {
  machine?: Machine;
  shopId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(([key]) => [key, String(machine?.[key] ?? "")])));
  const [saving, setSaving] = useState(false);
  const [itemAction, setItemAction] = useState<"archive" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File>();
  const [imageData, setImageData] = useState<string>();
  const [imageCrop, setImageCrop] = useState(machine?.imageCrop ?? DEFAULT_IMAGE_CROP);
  const [cropDraft, setCropDraft] = useState<{ source: string; crop: ImageCrop; file?: File; data?: string } | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const imageReadVersion = useRef(0);
  const [removeImage, setRemoveImage] = useState(false);
  const hasImage = Boolean(imageFile || (!removeImage && (machine?.imageData || machine?.imageUrl)));
  const imageSource = imageData || (!removeImage && (machine?.imageData || (machine?.imageUrl && /^https?:\/\//i.test(machine.imageUrl) ? machine.imageUrl : undefined)));
  const imageInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => { imageReadVersion.current += 1; };
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
      if (imageLoading || cropDraft) return;
      setSaving(true);
      setError("");
      try {
        const payload: Omit<Machine, "id"> = { ...values, shopId: machine?.shopId ?? shopId, code: values.code.trim(), type: values.type.trim(), status: values.status };
        if (imageData) {
          payload.imageData = imageData;
          payload.imageUrl = "";
        } else if (removeImage) {
          payload.imageData = "";
          payload.imageUrl = "";
        }
        if (hasImage || removeImage) payload.imageCrop = removeImage ? { ...DEFAULT_IMAGE_CROP } : imageCrop;
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
            <label htmlFor="item-image">Image</label>
            <div className="image-picker">
              <div className="image-picker-select">
                <input id="item-image" ref={imageInput} type="file" accept={IMAGE_TYPES.join(",")} onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  const version = ++imageReadVersion.current;
                  setImageLoading(true);
                  setError("");
                  try {
                    const data = await readImage(file);
                    if (version !== imageReadVersion.current) return;
                    setCropDraft({ source: data, crop: { ...DEFAULT_IMAGE_CROP }, file, data });
                  } catch (reason) {
                    if (version !== imageReadVersion.current) return;
                    setError(reason instanceof Error ? reason.message : "Could not read image.");
                    if (imageInput.current) imageInput.current.value = "";
                  } finally {
                    if (version === imageReadVersion.current) setImageLoading(false);
                  }
                }} />
                <span className="image-picker-content" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></svg>
                  <span>{hasImage ? "Change image" : "Choose file"}</span>
                  {imageFile && <span className="image-picker-filename">{imageFile.name}</span>}
                  {!imageFile && hasImage && <span className="image-picker-filename">Image attached</span>}
                </span>
              </div>
              {imageSource && <button type="button" className="text-button image-edit-button" disabled={imageLoading} onClick={() => setCropDraft({ source: imageSource, crop: imageCrop })}>Edit image</button>}
              {hasImage && <button type="button" className="image-picker-remove" aria-label="Remove image" title="Remove image" onClick={() => {
                imageReadVersion.current += 1;
                setImageLoading(false);
                setImageFile(undefined);
                setImageData(undefined);
                setImageCrop({ ...DEFAULT_IMAGE_CROP });
                setRemoveImage(true);
                if (imageInput.current) imageInput.current.value = "";
              }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>}
            </div>
            {imageLoading && <p role="status">Reading image...</p>}
          </div>}
        </Fragment>)}
      </fieldset>
      <div className="form-actions">
        {machine?.id && <div className="item-management-actions">
          <button type="button" className="button danger-button" onClick={archiveMachine} disabled={saving}>{itemAction === "archive" ? "Archiving..." : "Archive item"}</button>
          <button type="button" className="button danger-button" onClick={deleteMachine} disabled={saving}>{itemAction === "delete" ? "Deleting..." : "Delete item"}</button>
        </div>}
        <div className="item-save-actions">
          <button type="button" className="button subtle" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="button primary" disabled={saving || imageLoading}>{saving ? "Saving..." : "Save item"}</button>
        </div>
      </div>
    </form>
    {cropDraft && <ImageCropDialog source={cropDraft.source} crop={cropDraft.crop} onCancel={() => setCropDraft(null)} onSubmit={(crop) => {
      setImageCrop(crop);
      if (cropDraft.file && cropDraft.data) {
        setImageFile(cropDraft.file);
        setImageData(cropDraft.data);
        setRemoveImage(false);
      }
      setCropDraft(null);
    }} />}
  </dialog>;
}
