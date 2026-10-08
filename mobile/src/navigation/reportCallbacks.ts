// React Navigation serializes route params (needed for state persistence/deep
// linking) and warns — "Non-serializable values were found in the navigation
// state" — when a function ends up in them. ReportUserScreen's onBlocked/onDone
// are plain in-process callbacks the origin screen (Discovery/Chat) needs
// invoked once the report flow finishes; this registry holds the real
// functions outside navigation state, keyed by an opaque id that IS
// serializable, so only the id travels through route params.

type Callback = () => void;

const registry = new Map<string, Callback>();
let nextId = 0;

export function registerCallback(fn: Callback): string {
  const id = `cb_${++nextId}`;
  registry.set(id, fn);
  return id;
}

// One-shot: removes the entry so a callback can't accidentally fire twice.
export function consumeCallback(id: string | undefined): Callback | undefined {
  if (!id) return undefined;
  const fn = registry.get(id);
  registry.delete(id);
  return fn;
}

// Drops an entry without invoking it — call on unmount for whichever of
// onBlocked/onDone didn't end up firing, so an abandoned report flow (e.g. a
// back gesture before submitting) doesn't leak an entry forever.
export function releaseCallback(id: string | undefined): void {
  if (id) registry.delete(id);
}
