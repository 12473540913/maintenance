import { useState } from "react";
import type { Machine } from "@maintenance/shared";
import { MachineDialog } from "./MachineDialog";

export function itemName(machine: Machine): string { return machine.name || machine.code; }

function ItemImage({ machine }: { machine: Machine }) {
  const [failed, setFailed] = useState(false);
  const source = machine.imageData || (machine.imageUrl && /^https?:\/\//i.test(machine.imageUrl) ? machine.imageUrl : undefined);
  return source && !failed
    ? <img src={source} alt={itemName(machine)} onError={() => setFailed(true)} />
    : <div className="item-placeholder" role="img" aria-label={failed || machine.imageUrl ? "Image unavailable" : "No image"} />;
}

export function ShopView({ machines, onSaved }: { machines: Machine[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Machine | "new" | null>(null);
  return <main className="shop-page">
    <div className="shop-grid">
      {machines.map((machine) => <button className="shop-card" key={machine.id} onClick={() => setForm(machine)} aria-label={`Open ${itemName(machine)}`}>
        <h3 title={itemName(machine)}>{itemName(machine)}</h3>
        <ItemImage key={`${machine.id}-${machine.imageData || machine.imageUrl}`} machine={machine} />
      </button>)}
      <button className="shop-card add-card" onClick={() => setForm("new")} aria-label="Add new item"><span aria-hidden="true">+</span></button>
    </div>
    {form && <MachineDialog machine={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={onSaved} />}
  </main>;
}
