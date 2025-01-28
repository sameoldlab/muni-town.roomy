import type {
  Doc,
  DocHandle,
  DocHandleChangePayload,
} from "@automerge/automerge-repo";
import { writable } from "svelte/store";

type ChangeFn<T> = (changer: Parameters<DocHandle<T>["change"]>[0]) => void;
type WithChangeFn<T> = { change: ChangeFn<T> };

export type ReactiveDoc<T> = SvelteStore<Doc<T>> & WithChangeFn<T>;

/** Returns a reactive store for the given automerge document handle. */
export function reactiveDoc<T>(handle: DocHandle<T>): ReactiveDoc<T> {
  const { set, subscribe } = writable<Doc<T>>(handle.docSync(), () => {
    const onchange = (change: DocHandleChangePayload<T>) => set(change.doc);
    handle.addListener("change", onchange);
    return () => {
      handle.removeListener("change", onchange);
    };
  });

  return {
    subscribe,
    change: (fn) => {
      handle.change(fn);
    },
  };
}
