import { useEffect, useRef, useState } from "react";
import type { Machine } from "@maintenance/shared";
import { api } from "../lib/api";

const fields = [
  ["code", "ID"], ["type", "Type"], ["name", "Name"], ["imageUrl", "Image URL"],
  ["year", "Year"], ["make", "Make"], ["model", "Model"], ["spec1", "Spec 1"],
  ["spec2", "Spec 2"], ["acquiredDate", "Acquired date"], ["inServiceDate", "In-service date"],
  ["currentOdometer", "Current ODO miles"], ["currentOdometerDate", "Current ODO miles date"],
  ["status", "Status"], ["vinOrSerial", "VIN / SN / ID"], ["modelId", "Model ID"],
  ["licenseId", "License ID"], ["reminderMiles", "Reminder miles"], ["reminderYears", "Reminder years"]
] as const;

export function MachineDialog({ machine, onClose, onSaved }: {
  machine?: Machine;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(([key]) => [key, String(machine?.[key] ?? (key === "status" ? "Active" : ""))])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);

  return <dialog ref={dialog} className="item-dialog" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      setError("");
      try {
        const payload: Omit<Machine, "id"> = { ...values, code: values.code.trim(), type: values.type.trim(), status: values.status };
        if (machine?.id) await api.updateMachine(machine.id, payload);
        else await api.createMachine(payload);
        await onSaved();
        onClose();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not save item.");
      } finally { setSaving(false); }
    }}>
      <div className="section-heading"><div><p className="eyebrow">MY SHOP</p><h2>{machine ? "Edit item" : "Add item"}</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="Close item form">×</button></div>
      <p className="muted">Enter your own details. All fields are free text; only ID and type are required.</p>
      {error && <div className="alert" role="alert">{error}</div>}
      <fieldset disabled={saving} className="form-grid">
        {fields.map(([key, label]) => <label key={key}>{label}<input type="text" value={values[key]} required={key === "code" || key === "type"} pattern={key === "code" || key === "type" ? ".*\\S.*" : undefined} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
      </fieldset>
      <div className="form-actions"><button type="button" className="button subtle" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving..." : "Save item"}</button></div>
    </form>
  </dialog>;
}
