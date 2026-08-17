import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import { JinshaExperience } from "./JinshaExperience";

const root = document.getElementById("root");

if (!root) throw new Error("Missing application root element.");

createRoot(root).render(
  <StrictMode>
    <JinshaExperience />
  </StrictMode>,
);
