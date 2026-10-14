import { describe, expect, it } from "vitest";
import { moveItem, sameOrder, validateNoteForm } from "./note-forms";

const valid = { name: "  Ámbar   gris ", type: "base", description: "", imageUrl: "", isActive: true };

describe("note form", () => {
  it("normalizes the name and keeps the strict flags", () => {
    expect(validateNoteForm(valid)).toEqual({ ok: true, value: { name: "Ámbar gris", type: "base", description: "", imageUrl: "", isActive: true } });
    expect(validateNoteForm({ ...valid, isActive: "on" })).toMatchObject({ ok: true, value: { isActive: false } });
  });
  it.each([
    ["a one-letter name", { ...valid, name: "A" }],
    ["a name without letters", { ...valid, name: "!!" }],
    ["an oversized name", { ...valid, name: "x".repeat(61) }],
    ["an unknown type", { ...valid, type: "middle" }],
    ["an oversized description", { ...valid, description: "x".repeat(301) }],
    ["an http image", { ...valid, imageUrl: "http://example.com/a.png" }],
    ["a javascript image", { ...valid, imageUrl: "javascript:alert(1)" }],
    ["an image with credentials", { ...valid, imageUrl: "https://user:pw@example.com/a.png" }],
  ])("rejects %s", (_name, input) => {
    expect(validateNoteForm(input).ok).toBe(false);
  });
  it("accepts an https image", () => {
    expect(validateNoteForm({ ...valid, imageUrl: "https://res.cloudinary.com/x/a.png" }).ok).toBe(true);
  });
});

describe("up/down order", () => {
  const list = ["a", "b", "c"];
  it("moves one place", () => {
    expect(moveItem(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 1, 1)).toEqual(["a", "c", "b"]);
  });
  it("does not move past the ends and never mutates the input", () => {
    expect(moveItem(list, 0, -1)).toEqual(list);
    expect(moveItem(list, 2, 1)).toEqual(list);
    expect(moveItem(list, 5, 1)).toEqual(list);
    expect(list).toEqual(["a", "b", "c"]);
  });
  it("compares orders", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
  });
});
