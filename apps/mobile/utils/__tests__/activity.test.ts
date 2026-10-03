import { formatActivityTime } from "../activity";

// Local-time instants, so the labels do not depend on the machine's zone.
const at = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe("formatActivityTime", () => {
  const now = new Date(2026, 9, 4, 17, 30);

  it("names today and yesterday with the time", () => {
    expect(formatActivityTime(at(2026, 10, 4, 13, 7), now)).toBe(
      "Today, 13:07"
    );
    expect(formatActivityTime(at(2026, 10, 3, 9, 12), now)).toBe(
      "Yesterday, 09:12"
    );
  });

  it("dates older rows this year, and years older ones", () => {
    expect(formatActivityTime(at(2026, 9, 30, 14, 2), now)).toBe(
      "Sep 30, 14:02"
    );
    expect(formatActivityTime(at(2025, 12, 31, 23, 59), now)).toBe(
      "Dec 31, 2025"
    );
  });

  it("is empty for an unreadable timestamp", () => {
    expect(formatActivityTime("not a date", now)).toBe("");
  });
});
