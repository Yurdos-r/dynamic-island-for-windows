export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    text?: string;
    attributes?: Record<string, string>;
    dataset?: Record<string, string>;
  } = {}
) {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  Object.entries(options.attributes ?? {}).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  Object.entries(options.dataset ?? {}).forEach(([key, value]) => {
    element.dataset[key] = value;
  });

  return element;
}

export function createIcon(name: string, label: string) {
  const fragment = document.createDocumentFragment();
  const icon = createElement("i", {
    attributes: {
      "data-lucide": name,
      "aria-hidden": "true"
    }
  });
  const srOnly = createElement("span", {
    className: "sr-only",
    text: label
  });

  fragment.append(icon, srOnly);
  return fragment;
}
