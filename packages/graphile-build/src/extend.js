// @flow

const aExtendedB = new WeakMap();

export default function extend<Obj1: *, Obj2: *>(
  base: Obj1,
  extra: Obj2,
  hint?: string
): Obj1 & Obj2 {
  const keysA = Object.keys(base);
  const keysB = Object.keys(extra);
  const hints = Object.create(null);
  for (const key of keysB) {
    const newValue = extra[key];
    const oldValue = base[key];
    if (aExtendedB.get(newValue) !== oldValue && keysA.indexOf(key) >= 0) {
      throw new Error(`Overwriting key '${key}' is not allowed! ${hint || ""}`);
    }
    const hintKey = `_source__${key}`;
    hints[hintKey] = extra[hintKey] || base[hintKey] || hint;
  }
  const obj = Object.assign({}, base, extra);
  aExtendedB.set(obj, base);
  for (const hintKey in hints) {
    Object.defineProperty(obj, hintKey, {
      configurable: false,
      enumerable: false,
      value: hints[hintKey],
      writable: false,
    });
  }
  return obj;
}
