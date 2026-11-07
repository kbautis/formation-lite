import { describe, expect, it, vi } from "vitest";
import { createStore } from "../../src/app/store";

describe("createStore", () => {
  it("returns the initial state", () => {
    expect(createStore({ count: 1 }).getState()).toEqual({ count: 1 });
  });

  it("merges partial updates and notifies subscribers with the new and previous state", () => {
    const store = createStore({ count: 1, label: "a" });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ count: 2 });
    expect(store.getState()).toEqual({ count: 2, label: "a" });
    expect(listener).toHaveBeenCalledWith({ count: 2, label: "a" }, { count: 1, label: "a" });
  });

  it("stops notifying after unsubscribe", () => {
    const store = createStore({ count: 1 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setState({ count: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify when nothing changed", () => {
    const store = createStore({ count: 1 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ count: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});
