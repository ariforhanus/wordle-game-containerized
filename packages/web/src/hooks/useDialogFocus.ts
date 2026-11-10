import { useEffect, useRef } from "react";

export function useDialogFocus(open: boolean, onClose?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const hidden: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          hidden.push({ element: sibling, inert: sibling.hasAttribute("inert") });
          sibling.setAttribute("inert", "");
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'));
    (focusable()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      // Keep game/window shortcuts from consuming dialog input and native activation.
      event.stopPropagation();
      if (event.key === "Escape" && close.current) { event.preventDefault(); close.current(); }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0] ?? dialog;
        const last = elements[elements.length - 1] ?? dialog;
        if (!elements.length || (!event.shiftKey && document.activeElement === last) ||
            (event.shiftKey && (document.activeElement === first || document.activeElement === dialog))) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      for (const item of hidden) if (!item.inert) item.element.removeAttribute("inert");
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return ref;
}
