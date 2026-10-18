import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { TaskLedger } from "@maintenance/shared";
import { moveLedgerRow, placeLedgerRow } from "./ledger";

type DropTarget = { sectionId: string; beforeRowId?: string };

export function taskDragScrollSpeed(y: number, height: number): number {
  const edge = Math.min(80, height / 4);
  if (y < 0 || y > height) return 0;
  if (y < edge) return -900 * (1 - y / edge);
  if (y > height - edge) return 900 * (1 - (height - y) / edge);
  return 0;
}

export function useTaskRowDrag(ledger: TaskLedger, onChange: (next: TaskLedger) => void) {
  const rootRef = useRef<HTMLElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [draggedRowId, setDraggedRowId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<DropTarget>();
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => () => cleanupRef.current?.(), []);

  const focusRow = (rowId: string) => {
    // A cross-section move remounts the row, so restore focus after React commits.
    requestAnimationFrame(() => {
      const row = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-task-row]") ?? []).find((entry) => entry.dataset.taskRow === rowId);
      row?.querySelector<HTMLButtonElement>(".task-row-drag-handle")?.focus({ preventScroll: true });
    });
  };
  const moveByKeyboard = (sectionId: string, rowId: string, offset: -1 | 1) => {
    if (cleanupRef.current) return;
    const next = moveLedgerRow(ledger, sectionId, rowId, offset);
    if (next !== ledger) {
      onChange(next);
      setAnnouncement(`Task moved ${offset === -1 ? "up" : "down"}. Save changes to keep this order.`);
      focusRow(rowId);
    } else setAnnouncement("Task is already at the item's boundary.");
  };

  const start = (event: ReactPointerEvent<HTMLButtonElement>, sectionId: string, rowId: string) => {
    if (event.button !== 0 || !event.isPrimary || cleanupRef.current) return;
    const root = rootRef.current;
    const handle = event.currentTarget;
    const row = handle.closest("tr");
    if (!root || !row) return;
    event.preventDefault();
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    const pointerId = event.pointerId;
    const rect = row.getBoundingClientRect();
    const startY = event.clientY;
    let x = event.clientX;
    let y = startY;
    let active = false;
    let target: DropTarget | undefined;
    let preview: HTMLDivElement | undefined;
    let frame = 0;
    let lastTime = performance.now();

    const findTarget = (): DropTarget | undefined => {
      const bounds = root.getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < 0 || y > window.innerHeight) return;
      for (const section of root.querySelectorAll<HTMLElement>("[data-task-section]")) {
        const bounds = section.getBoundingClientRect();
        if (y < bounds.top || y > bounds.bottom) continue;
        const sectionId = section.dataset.taskSection!;
        for (const candidate of section.querySelectorAll<HTMLTableRowElement>("tr[data-task-row]")) {
          if (candidate.dataset.taskRow === rowId) continue;
          const bounds = candidate.getBoundingClientRect();
          if (y < bounds.top + bounds.height / 2) return { sectionId, beforeRowId: candidate.dataset.taskRow };
        }
        return { sectionId };
      }
    };
    const updateTarget = () => {
      target = findTarget();
      setDropTarget((current) => current?.sectionId === target?.sectionId && current?.beforeRowId === target?.beforeRowId ? current : target);
    };
    const tick = (time: number) => {
      const elapsed = Math.min(time - lastTime, 32);
      lastTime = time;
      const bounds = root.getBoundingClientRect();
      if (x >= bounds.left && x <= bounds.right) {
        window.scrollBy({ top: taskDragScrollSpeed(y, window.innerHeight) * elapsed / 1000, behavior: "instant" });
      }
      if (preview) preview.style.transform = `translateY(${y - startY}px)`;
      updateTarget();
      frame = requestAnimationFrame(tick);
    };
    const activate = () => {
      active = true;
      preview = document.createElement("div");
      preview.className = "item-ledger editing task-drag-preview";
      preview.setAttribute("aria-hidden", "true");
      preview.inert = true;
      Object.assign(preview.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px` });
      const table = document.createElement("table");
      table.className = "ledger-table";
      const body = table.createTBody();
      const copy = row.cloneNode(true) as HTMLTableRowElement;
      Array.from(copy.cells).forEach((cell, index) => { cell.style.width = `${row.cells[index].getBoundingClientRect().width}px`; });
      // Select values are live properties, not attributes copied by cloneNode.
      copy.querySelectorAll("select").forEach((select, index) => { select.value = row.querySelectorAll("select")[index].value; });
      body.append(copy);
      const fields = document.createElement("div");
      fields.className = "ledger-fields";
      fields.append(table);
      preview.append(fields);
      document.body.append(preview);
      setDraggedRowId(rowId);
      setAnnouncement("Task picked up. Drag to a new position; Escape cancels.");
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      x = event.clientX;
      y = event.clientY;
      if (!active && Math.abs(y - startY) >= 4) activate();
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      preview?.remove();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("blur", cancel);
      handle.removeEventListener("lostpointercapture", cancelPointer);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      setDraggedRowId(undefined);
      setDropTarget(undefined);
      cleanupRef.current = null;
    };
    const cancel = () => {
      cleanup();
      if (active) setAnnouncement("Task move cancelled.");
    };
    const cancelPointer = (event: PointerEvent) => { if (event.pointerId === pointerId) cancel(); };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      x = event.clientX;
      y = event.clientY;
      target = active ? findTarget() : undefined;
      cleanup();
      if (!active) return;
      const next = target ? placeLedgerRow(ledger, sectionId, rowId, target.sectionId, target.beforeRowId) : ledger;
      if (next !== ledger) {
        onChange(next);
        setAnnouncement("Task moved. Save changes to keep this order.");
        focusRow(rowId);
      } else setAnnouncement("Task order unchanged.");
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancel(); }
    };
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("keydown", keydown);
    window.addEventListener("blur", cancel);
    handle.addEventListener("lostpointercapture", cancelPointer);
  };

  return { rootRef, draggedRowId, dropTarget, announcement, start, moveByKeyboard };
}
