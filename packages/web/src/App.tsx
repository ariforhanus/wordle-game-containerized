import { Outlet } from "react-router-dom";
import Header from "./components/Header";
import "./App.css";

export default function App() {
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-nav">
        Skip to content
      </a>
      <Header />
      <main id="main-content" className="app-main" role="main">
        <Outlet />
      </main>
    </div>
  );
}
