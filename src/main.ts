import { APP_NAME } from "./appInfo";

const root = document.getElementById("app");
if (!root) throw new Error("index.html is missing the #app element");
root.textContent = APP_NAME;
