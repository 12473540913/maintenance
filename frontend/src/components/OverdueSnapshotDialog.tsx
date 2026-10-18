import { useEffect, useId, useRef, useState } from "react";
import type { Machine, TaskLedger } from "@maintenance/shared";
import { redEntryCount, timelineColor } from "../lib/ledger";
import { itemName } from "./ShopView";

export function snapshotSections(ledger: TaskLedger, color: "red" | "orange") {
  let nextNumber = 1;
  return ledger.sections.map((section) => {
    const rows = section.rows.flatMap((row) => {
      if (color === "orange" && redEntryCount(row) > 0) return [];
      const entry = row.timeline.find((entry) => timelineColor(entry) === color);
      return entry ? [{ ...row, due: entry.value }] : [];
    });
    const start = nextNumber;
    nextNumber += rows.length;
    return { ...section, rows, start };
  }).filter((section) => section.rows.length > 0);
}

function SnapshotSections({ sections, color }: {
  sections: ReturnType<typeof snapshotSections>;
  color: "red" | "orange";
}) {
  return <>{sections.map((section) => <section className="overdue-snapshot-section" key={section.id}>
    <h3>{section.name || <span className="not-set">Untitled section</span>}</h3>
    <ol start={section.start}>
      {section.rows.map((row) => <li key={row.id}>
        <div className="overdue-snapshot-task">
          <span className="overdue-snapshot-code" aria-label="Task ID">{row.code || <span className="not-set">—</span>}</span>
          <span>{row.description || <span className="not-set">—</span>}</span>
          <span className="overdue-snapshot-due" aria-label="Due">{row.due || <span className="not-set">—</span>}</span>
          <span className={`overdue-snapshot-${color}-marker`} role="img" aria-label={`Task has ${color} timeline entries`} title={`Task has ${color} timeline entries`} />
        </div>
      </li>)}
    </ol>
  </section>)}</>;
}

export function OverdueSnapshotDialog({ machine, ledger, onClose }: {
  machine: Machine;
  ledger: TaskLedger;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const groups = snapshotSections(ledger, "red");
  const upcoming = snapshotSections(ledger, "orange");
  const totalReds = groups.reduce((total, section) => total + section.rows.reduce((count, row) => count + redEntryCount(row), 0), 0);
  const countLabel = `${totalReds} red timeline ${totalReds === 1 ? "entry" : "entries"}`;
  const currentDate = new Date();
  const currentMonthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(currentDate);
  const odometer = machine.currentOdometer;
  const odometerValue = typeof odometer === "number"
    ? `${odometer.toLocaleString("en-US")} mi`
    : odometer?.trim()
      ? `${Number.isFinite(Number(odometer)) ? Number(odometer).toLocaleString("en-US") : odometer} mi`
      : "—";

  useEffect(() => { dialog.current?.showModal(); }, []);

  return <dialog ref={dialog} className="overdue-snapshot-dialog" aria-labelledby={titleId} onCancel={(event) => {
    event.preventDefault();
    onClose();
  }}>
    <div className="overdue-snapshot-header">
      <div className="overdue-snapshot-title-row">
        <div className="overdue-snapshot-actions">
          <button type="button" className="button subtle annual-inspection-trigger" aria-pressed={includeUpcoming} onClick={() => setIncludeUpcoming(!includeUpcoming)}>{includeUpcoming ? "Remove upcoming" : "Include upcoming"}</button>
          <button type="button" className="button subtle annual-inspection-trigger" onClick={() => window.print()}>Print</button>
        </div>
        <h2 id={titleId}>Overdue Snapshot - {itemName(machine)}</h2>
        <div className="overdue-snapshot-summary">
          <div className="overdue-snapshot-meta">
            <span aria-label="Current odometer">{odometerValue}</span>
            <time dateTime={currentDate.toISOString()}>{currentMonthYear}</time>
          </div>
          {totalReds > 0 && <span className="overdue-snapshot-red-count" aria-label={countLabel} title={countLabel}>{totalReds}</span>}
        </div>
      </div>
      <button type="button" className="icon-button" aria-label="Close overdue snapshot" onClick={onClose} autoFocus>×</button>
    </div>
    <div className="overdue-snapshot-content">
      {!groups.length && <p className="section-empty">No overdue tasks.</p>}
      <SnapshotSections sections={groups} color="red" />
      {includeUpcoming && <>
        <hr className="overdue-snapshot-divider" />
        {!upcoming.length && <p className="section-empty">No upcoming tasks.</p>}
        <SnapshotSections sections={upcoming} color="orange" />
      </>}
    </div>
  </dialog>;
}
