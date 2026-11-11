import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./components/Header";
import "./App.css";

export default function App() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  const main = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (previous.current !== pathname) {
      const target = main.current?.querySelector<HTMLElement>("h1") ?? main.current;
      if (target) { target.tabIndex = -1; target.focus(); }
      previous.current = pathname;
    }
  }, [pathname]);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-nav">
        {t("a11y.skip")}
      </a>
      <Header />
      <main ref={main} tabIndex={-1} id="main-content" className="app-main" role="main">
        <Outlet />
      </main>
    </div>
  );
}
