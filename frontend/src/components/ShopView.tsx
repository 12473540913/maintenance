import { useRef, useState } from "react";
import { shopName, type Machine, type ShopSetting } from "@maintenance/shared";
import { MachineDialog } from "./MachineDialog";
import { imageCropStyle } from "../lib/imageCrop";

export function itemName(machine: Machine): string { return machine.name || machine.code; }

function ItemImage({ machine }: { machine: Machine }) {
  const [failed, setFailed] = useState(false);
  const source = machine.imageData || (machine.imageUrl && /^https?:\/\//i.test(machine.imageUrl) ? machine.imageUrl : undefined);
  return source && !failed
    ? <div className="item-image-frame"><img src={source} alt={itemName(machine)} style={imageCropStyle(machine.imageCrop)} draggable={false} onError={() => setFailed(true)} /></div>
    : <div className="item-placeholder" role="img" aria-label={failed || machine.imageUrl ? "Image unavailable" : "No image"} />;
}

function orderMachines(machines: Machine[]): Machine[] {
  return machines
    .map((machine, index) => ({ machine, index }))
    .sort((a, b) => {
      const aOrder = a.machine.shopOrder;
      const bOrder = b.machine.shopOrder;
      if (aOrder === undefined && bOrder === undefined) return a.index - b.index;
      if (aOrder === undefined) return 1;
      if (bOrder === undefined) return -1;
      return aOrder - bOrder || a.index - b.index;
    })
    .map(({ machine }) => machine);
}

export function ShopView({ machines, shops, selectedShopId, onSelectShop, onSaved, onReorder }: {
  machines: Machine[];
  shops: ShopSetting[];
  selectedShopId: string;
  onSelectShop: (shopId: string) => void;
  onSaved: () => Promise<void>;
  onReorder: (machineIds: string[], shopId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<Machine | "new" | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const draggedId = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const orderedMachines = orderMachines(machines);

  const moveMachine = async (targetId: string) => {
    const sourceId = draggedId.current;
    draggedId.current = null;
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    const next = [...orderedMachines];
    const sourceIndex = next.findIndex(({ id }) => id === sourceId);
    const targetIndex = next.findIndex(({ id }) => id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    next.splice(targetIndex, 0, ...next.splice(sourceIndex, 1));
    setSavingOrder(true);
    setOrderError("");
    try {
      await onReorder(next.map(({ id }) => id).filter((id): id is string => Boolean(id)), selectedShopId);
    } catch (reason) {
      setOrderError(reason instanceof Error ? reason.message : "Could not save machine order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const availableShops = shops.filter((shop) => shop.enabled);
  return <main className="shop-page">
    {orderError && <div className="alert" role="alert">{orderError}</div>}
    <div className="shop-layout">
    <div className="shop-grid">
      {orderedMachines.map((machine) => <button
        className={`shop-card${draggingId === machine.id ? " is-dragging" : ""}`}
        key={machine.id}
        draggable={!savingOrder}
        onClick={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            suppressClick.current = false;
            return;
          }
          setForm(machine);
        }}
        onDragStart={(event) => {
          if (savingOrder || !machine.id) {
            event.preventDefault();
            return;
          }
          draggedId.current = machine.id;
          suppressClick.current = true;
          setDraggingId(machine.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", machine.id);
        }}
        onDragOver={(event) => {
          if (draggedId.current) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          void moveMachine(machine.id ?? "");
        }}
        onDragEnd={() => {
          draggedId.current = null;
          setDraggingId(null);
          window.setTimeout(() => { suppressClick.current = false; }, 500);
        }}
        aria-label={`Open ${itemName(machine)}. Drag to reorder.`}
      >
        <h3 title={itemName(machine)}>{itemName(machine)}</h3>
        <ItemImage key={`${machine.id}-${machine.imageData || machine.imageUrl}`} machine={machine} />
      </button>)}
      <button className="shop-card add-card" onClick={() => setForm("new")} aria-label="Add new item"><span aria-hidden="true">+</span></button>
    </div>
    {availableShops.length > 1 && <nav className="shop-switcher" aria-label="Choose shop">
      {availableShops.map((shop) => <button key={shop.id} className={selectedShopId === shop.id ? "selected" : ""} aria-current={selectedShopId === shop.id ? "page" : undefined} onClick={() => onSelectShop(shop.id)}>{shopName(shop)}</button>)}
    </nav>}
    </div>
    {form && <MachineDialog machine={form === "new" ? undefined : form} shopId={selectedShopId} onClose={() => setForm(null)} onSaved={onSaved} />}
  </main>;
}
