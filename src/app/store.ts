// Minimal observable store: one state object, shallow-merged updates, change listeners.
// Listeners get (next, previous) so components can skip work when their slice is unchanged.
export type Listener<State> = (next: State, previous: State) => void;

export interface Store<State> {
  getState(): State;
  setState(changes: Partial<State>): void;
  subscribe(listener: Listener<State>): () => void;
}

export function createStore<State extends object>(initial: State): Store<State> {
  let state = initial;
  const listeners = new Set<Listener<State>>();
  return {
    getState: () => state,
    setState(changes) {
      const changed = (Object.keys(changes) as (keyof State)[]).some((key) => !Object.is(changes[key], state[key]));
      if (!changed) return;
      const previous = state;
      state = { ...state, ...changes };
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Renders now, then again whenever any value `select` returns changes (compared with
 * Object.is, item by item). Each component declares what it reads in one place, so the
 * change check can't drift from the render function.
 */
export function watch<State extends object>(
  store: Store<State>,
  select: (state: State) => readonly unknown[],
  render: (state: State) => void,
): void {
  let selected = select(store.getState());
  render(store.getState());
  store.subscribe((next) => {
    const nextSelected = select(next);
    const changed = nextSelected.length !== selected.length || nextSelected.some((value, index) => !Object.is(value, selected[index]));
    if (!changed) return;
    selected = nextSelected;
    render(next);
  });
}
