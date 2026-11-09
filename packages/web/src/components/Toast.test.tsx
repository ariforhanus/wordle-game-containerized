import { describe, expect, it } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { useEffect } from "react";
import { ToastProvider, useToast } from "./Toast";
describe("toast context", () => {
 it("does not restart effects when showing a notification", () => {
  let runs = 0;
  function Consumer() {
   const toast = useToast();
   useEffect(() => { runs++; }, [toast]);
   return <button onClick={() => toast.warning("test notification")}>Notify</button>;
  }
  render(<ToastProvider><Consumer /></ToastProvider>);
  fireEvent.click(screen.getByText("Notify"));
  expect(runs).toBe(1); cleanup();
 });
});
