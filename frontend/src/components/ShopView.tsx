import { useState } from "react";
import type { Machine } from "@maintenance/shared";
import { MachineDialog } from "./MachineDialog";

export function itemName(machine: Machine): string { return machine.name || machine.code; }

function ItemImage({ machine }: { machine: Machine }) {
  const [failed, setFailed] = useState(false);
  const source = machine.imageData || (machine.imageUrl && /^https?:\/\//i.test(machine.imageUrl) ? machine.imageUrl : undefined);
  return source && !failed
    ? <img src={source} alt={itemName(machine)} onError={() => setFailed(true)} />
    : <div className="item-placeholder"><span>{machine.type || "Item"}</span><small>{failed || machine.imageUrl ? "Image unavailable" : "No image"}</small></div>;
}

export function ShopView({ machines, onSaved }: { machines: Machine[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Machine | "new" | null>(null);
  return <main className="shop-page">
    <div className="shop-grid">
      {machines.map((machine) => <button className="shop-card" key={machine.id} onClick={() => setForm(machine)} aria-label={`Open ${itemName(machine)}`}>
        <div className="shop-card-heading"><h3>{itemName(machine)}</h3><span>{machine.code}</span></div>
        <ItemImage key={`${machine.id}-${machine.imageData || machine.imageUrl}`} machine={machine} />
        <p>{[machine.year, machine.make, machine.model].filter(Boolean).join(" ") || machine.type}</p>
      </button>)}
      <button className="shop-card add-card" onClick={() => setForm("new")} aria-label="Add new item"><span aria-hidden="true">+</span></button>
    </div>
    {form && <MachineDialog machine={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={onSaved} />}
  </main>;
}
