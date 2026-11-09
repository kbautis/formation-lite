import { describe, expect, it, vi } from "vitest";
import { createStore, watch } from "../../src/app/store";

describe("watch", () => {
  it("renders once immediately, then only when a selected value changes", () => {
    const store = createStore({ a: 1, b: "x", unrelated: 0 });
    const render = vi.fn();
    watch(store, (state) => [state.a, state.b], render);
    expect(render).toHaveBeenCalledTimes(1);
    store.setState({ unrelated: 5 });
    expect(render).toHaveBeenCalledTimes(1);
    store.setState({ a: 2 });
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith({ a: 2, b: "x", unrelated: 5 });
  });

  it("compares selected values by identity", () => {
    const list = [1, 2];
    const store = createStore({ list, other: 0 });
    const render = vi.fn();
    watch(store, (state) => [state.list], render);
    store.setState({ list: [1, 2] });
    expect(render).toHaveBeenCalledTimes(2);
  });
});
