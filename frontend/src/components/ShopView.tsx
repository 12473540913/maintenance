import { useRef, useState } from "react";
import { shopName, type Machine, type ShopSetting } from "@maintenance/shared";
import { MachineDialog } from "./MachineDialog";
import { ImageViewDialog } from "./ImageViewDialog";
import { imageCropStyle } from "../lib/imageCrop";
import { machineGallery, type GalleryEntry } from "../lib/gallery";

export function itemName(machine: Machine): string { return machine.name || machine.code; }

function ItemImage({ machine, onViewImage }: { machine: Machine; onViewImage: (images: GalleryEntry[]) => void }) {
  const [failed, setFailed] = useState(false);
  const images = machineGallery(machine);
  const source = images[0]?.source;
  return source && !failed
    ? <button type="button" className="shop-card-image-button" aria-label={`View ${itemName(machine)} cover image`} onClick={(event) => {
      event.stopPropagation();
      onViewImage(images);
    }}><div className="item-image-frame"><img src={source} alt="" style={imageCropStyle(images[0].crop)} draggable={false} onError={() => setFailed(true)} /></div></button>
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

export function ShopView({ machines, shops, selectedShopId, onSelectShop, onSaved, onReorder, onMove }: {
  machines: Machine[];
  shops: ShopSetting[];
  selectedShopId: string;
  onSelectShop: (shopId: string) => void;
  onSaved: () => Promise<void>;
  onReorder: (machineIds: string[], shopId: string) => Promise<void>;
  onMove: (machineId: string, shopId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<Machine | "new" | "new-extra" | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [dropShopId, setDropShopId] = useState<string | null>(null);
  const [viewImage, setViewImage] = useState<GalleryEntry[] | null>(null);
  const draggedId = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const saving = useRef(false);
  const orderedMachines = orderMachines(machines);
  const extrasEnabled = shops.find(({ id }) => id === selectedShopId)?.extras ?? false;

  const openImage = (images: GalleryEntry[]) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setViewImage(images);
  };

  const moveMachine = async (targetId: string) => {
    if (saving.current) return;
    const sourceId = draggedId.current;
    draggedId.current = null;
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    const next = [...orderedMachines];
    const sourceIndex = next.findIndex(({ id }) => id === sourceId);
    const targetIndex = next.findIndex(({ id }) => id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    if (Boolean(next[sourceIndex].extra) !== Boolean(next[targetIndex].extra)) return;
    next.splice(targetIndex, 0, ...next.splice(sourceIndex, 1));
    saving.current = true;
    setSavingOrder(true);
    setOrderError("");
    try {
      await onReorder(next.map(({ id }) => id).filter((id): id is string => Boolean(id)), selectedShopId);
    } catch (reason) {
      setOrderError(reason instanceof Error ? reason.message : "Could not save machine order.");
    } finally {
      saving.current = false;
      setSavingOrder(false);
    }
  };

  const canDropInShop = (shop: ShopSetting) => {
    const machine = orderedMachines.find(({ id }) => id === draggedId.current);
    return !saving.current && Boolean(machine) && shop.enabled && shop.id !== selectedShopId && (!machine?.extra || shop.extras === true);
  };
  const moveToShop = async (shop: ShopSetting) => {
    if (!canDropInShop(shop)) return;
    const machine = orderedMachines.find(({ id }) => id === draggedId.current);
    if (!machine?.id) return;
    const machineId = machine.id;
    draggedId.current = null;
    setDraggingId(null);
    setDropShopId(null);
    saving.current = true;
    setSavingOrder(true);
    setOrderError("");
    try {
      await onMove(machineId, shop.id);
    } catch (reason) {
      setOrderError(reason instanceof Error ? reason.message : "Could not move item to another shop.");
    } finally {
      saving.current = false;
      setSavingOrder(false);
    }
  };

  const availableShops = shops.filter((shop) => shop.enabled);
  return <main className="shop-page">
    {orderError && <div className="alert" role="alert">{orderError}</div>}
    <div className="shop-layout">
    {[false, ...(extrasEnabled ? [true] : [])].map((extra) => <section className={extra ? "shop-extras" : undefined} key={String(extra)} aria-label={extra ? "Extras" : "Main items"}>
    {extra && <h2>Extras</h2>}
    <div className="shop-grid">
      {orderedMachines.filter((machine) => Boolean(machine.extra) === extra).map((machine) => <div
        className={`shop-card${draggingId === machine.id ? " is-dragging" : ""}`}
        key={machine.id}
        draggable={!savingOrder}
        onDragStart={(event) => {
          if (saving.current || !machine.id) {
            event.preventDefault();
            return;
          }
          draggedId.current = machine.id;
          suppressClick.current = true;
          setDraggingId(machine.id);
          setOrderError("");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", machine.id);
        }}
        onDragOver={(event) => {
          if (draggedId.current && Boolean(orderedMachines.find(({ id }) => id === draggedId.current)?.extra) === extra) {
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
          setDropShopId(null);
          window.setTimeout(() => { suppressClick.current = false; }, 500);
        }}
      >
        <button type="button" className="shop-card-form-button" aria-label={`Open ${itemName(machine)} form. Drag to reorder or move to another shop.`} onClick={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            suppressClick.current = false;
            return;
          }
          setForm(machine);
        }} />
        <h3 title={itemName(machine)}>{itemName(machine)}</h3>
        <ItemImage key={`${machine.id}-${machineGallery(machine)[0]?.source}`} machine={machine} onViewImage={openImage} />
      </div>)}
      <button className="shop-card add-card" onClick={() => setForm(extra ? "new-extra" : "new")} aria-label={extra ? "Add new extra item" : "Add new item"}><span aria-hidden="true">+</span></button>
    </div>
    </section>)}
    </div>
    {availableShops.length > 1 && <nav className="shop-switcher" aria-label="Choose shop">
      {availableShops.map((shop) => <button
        key={shop.id}
        className={`${selectedShopId === shop.id ? "selected" : ""}${dropShopId === shop.id ? " is-drop-target" : ""}`}
        aria-current={selectedShopId === shop.id ? "page" : undefined}
        title={draggingId && selectedShopId !== shop.id
          ? canDropInShop(shop) ? `Drop to move item to ${shopName(shop)}` : "Enable Extras in this shop to move an Extra here."
          : undefined}
        onDragEnter={(event) => {
          if (!canDropInShop(shop)) return;
          event.preventDefault();
          setDropShopId(shop.id);
        }}
        onDragOver={(event) => {
          if (!canDropInShop(shop)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropShopId(shop.id);
        }}
        onDragLeave={() => setDropShopId((current) => current === shop.id ? null : current)}
        onDrop={(event) => {
          event.preventDefault();
          void moveToShop(shop);
        }}
        onClick={() => { if (!saving.current) onSelectShop(shop.id); }}
      >{shopName(shop)}</button>)}
    </nav>}
    {form && <MachineDialog machine={typeof form === "string" ? undefined : form} shopId={selectedShopId} extra={form === "new-extra"} onClose={() => setForm(null)} onSaved={onSaved} />}
    {viewImage && <ImageViewDialog images={viewImage} onClose={() => setViewImage(null)} />}
  </main>;
}
