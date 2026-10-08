import { decodeEventCursor, encodeEventCursor } from "./events.service";

describe("event cursors", () => {
  it("round-trips the timestamp and stable tie-breaker", () => {
    const cursor = {
      createdAt: new Date("2026-10-09T00:00:00.123Z"),
      id: "event_1",
    };
    expect(decodeEventCursor(encodeEventCursor(cursor))).toEqual(cursor);
  });

  it("fails closed at now for an invalid cursor", () => {
    const before = Date.now();
    const cursor = decodeEventCursor("not-a-cursor");
    expect(cursor.id).toBe("");
    expect(cursor.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
