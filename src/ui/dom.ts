// Tiny helpers for building DOM and SVG without a framework.
type AttributeValue = string | number | boolean | null | undefined;
type Attributes = Record<string, AttributeValue>;
type Child = Node | string;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function el<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Attributes = {},
  children: Child[] = [],
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  setAttributes(node, attributes);
  node.append(...children);
  return node;
}

export function svgEl<Tag extends keyof SVGElementTagNameMap>(
  tag: Tag,
  attributes: Attributes = {},
  children: Child[] = [],
): SVGElementTagNameMap[Tag] {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  setAttributes(node, attributes);
  node.append(...children);
  return node;
}

/** false, null and undefined remove the attribute; true sets it empty. */
export function setAttributes(node: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) node.removeAttribute(name);
    else node.setAttribute(name, value === true ? "" : String(value));
  }
}

/** Sets an input's value unless the user is typing in it. */
export function syncInputValue(input: HTMLInputElement, value: string): void {
  if (document.activeElement !== input && input.value !== value) input.value = value;
}

export function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const found = parent.querySelector<T>(selector);
  if (!found) throw new Error(`missing element ${selector}`);
  return found;
}
