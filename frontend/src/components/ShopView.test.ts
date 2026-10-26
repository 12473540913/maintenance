import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Machine, ShopSetting } from "@maintenance/shared";
import { ShopView } from "./ShopView";

const machines: Machine[] = [
  { id: "core", code: "Core", type: "Car", shopOrder: 2 },
  { id: "extra", code: "Accessory", type: "Tool", extra: true, shopOrder: 0 },
  { id: "first", code: "First", type: "Car", extra: false, shopOrder: 1 }
];
const render = (shops: ShopSetting[]) => renderToStaticMarkup(createElement(ShopView, {
  machines, shops, selectedShopId: "shop-1", onSelectShop: () => {},
  onSaved: async () => {}, onReorder: async () => {}
}));

describe("shop extras", () => {
  it("keeps legacy items in the main grid with no extras section by default", () => {
    const html = render([{ id: "shop-1", enabled: true }]);
    expect(html).toContain("Open Core form");
    expect(html).toContain("Open First form");
    expect(html).not.toContain("Accessory");
    expect(html).not.toContain('aria-label="Extras"');
    expect(html.match(/class="shop-grid"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Add new item"');
  });

  it("renders extras after the main grid and its add card, using the same card style", () => {
    const html = render([{ id: "shop-1", enabled: true, extras: true }]);
    const [main, extras] = html.split('<section class="shop-extras"');
    expect(main.indexOf("Open First form")).toBeLessThan(main.indexOf("Open Core form"));
    expect(main).not.toContain("Accessory");
    expect(main).toContain('aria-label="Add new item"');
    expect(extras).toContain("<h2>Extras</h2>");
    expect(extras).toContain('class="shop-card"');
    expect(extras).toContain("Open Accessory form");
    expect(extras).toContain('aria-label="Add new extra item"');
    expect(html.match(/class="shop-grid"/g)).toHaveLength(2);
  });

  it("uses only the selected shop's Extras setting and shows an empty extras add card", () => {
    const html = render([
      { id: "shop-1", enabled: true, extras: false },
      { id: "shop-2", enabled: true, extras: true }
    ]);
    expect(html).not.toContain("<h2>Extras</h2>");
    const empty = renderToStaticMarkup(createElement(ShopView, {
      machines: [], shops: [{ id: "shop-1", enabled: true, extras: true }],
      selectedShopId: "shop-1", onSelectShop: () => {},
      onSaved: async () => {}, onReorder: async () => {}
    }));
    expect(empty).toContain("<h2>Extras</h2>");
    expect(empty).toContain('aria-label="Add new extra item"');
  });
});
