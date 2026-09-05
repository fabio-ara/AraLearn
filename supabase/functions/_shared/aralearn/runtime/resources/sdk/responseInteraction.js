const bindings = new WeakMap();

export function bindPackageResponseControls(root, selector, eventName, listener) {
  root.querySelectorAll(selector).forEach((node) => {
    const key = `${selector}:${eventName}`;
    const bound = bindings.get(node) || new Set();
    if (bound.has(key)) return;
    bound.add(key);
    bindings.set(node, bound);
    node.addEventListener(eventName, (event) => listener(node, event));
  });
}
