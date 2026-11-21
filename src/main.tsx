import { createRoot } from "react-dom/client";
import { localGame } from "./composition/local";
import { App } from "./presentation/App";
import "./presentation/styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<App game={localGame} />);
