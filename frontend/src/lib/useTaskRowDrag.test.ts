import { describe, expect, it } from "vitest";
import { taskDragScrollSpeed } from "./useTaskRowDrag";

describe("task row drag auto-scroll", () => {
  it("scrolls in either direction within 80 pixels of the viewport edge, faster closer to the edge", () => {
    expect(taskDragScrollSpeed(0, 800)).toBe(-900);
    expect(taskDragScrollSpeed(40, 800)).toBe(-450);
    expect(taskDragScrollSpeed(80, 800)).toBe(0);
    expect(taskDragScrollSpeed(400, 800)).toBe(0);
    expect(taskDragScrollSpeed(720, 800)).toBe(0);
    expect(taskDragScrollSpeed(760, 800)).toBe(450);
    expect(taskDragScrollSpeed(800, 800)).toBe(900);
  });
  it("stops outside the viewport and leaves a neutral zone on small screens", () => {
    expect(taskDragScrollSpeed(-1, 800)).toBe(0);
    expect(taskDragScrollSpeed(801, 800)).toBe(0);
    expect(taskDragScrollSpeed(50, 100)).toBe(0);
    expect(taskDragScrollSpeed(10, 100)).toBeLessThan(0);
    expect(taskDragScrollSpeed(90, 100)).toBeGreaterThan(0);
  });
});
