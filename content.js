// 🔥 PREVENT MULTIPLE LOAD
if (window.__STEALTH_LOADED__) {
  console.log("Already injected");
} else {
  window.__STEALTH_LOADED__ = true;

  if (!window.__STEALTH_TIMER__) {
    window.__STEALTH_TIMER__ = null;
  }

  chrome.runtime.onMessage.addListener(async (req) => {

    // 🔹 DIRECT IMAGE FOR AI (NO OCR)
    if (req.action === "process_image") {
      chrome.runtime.sendMessage({
        action: "processed_data",
        text: "", // skip OCR
        image: req.base64
      });
    }

    // 🔹 SHOW OVERLAY
    if (req.action === "show_overlay") {
      show(req.text, req.type);
    }
  });
}

// 🔹 OVERLAY
function show(text, type) {
  console.log("SHOW:", text);

  let root = document.getElementById("stealth-root");

  if (!root) {
    root = document.createElement("div");
    root.id = "stealth-root";

    root.style.position = "fixed";
    root.style.top = "0";
    root.style.left = "0";
    root.style.zIndex = "2147483647";
    root.style.pointerEvents = "none";

    document.documentElement.appendChild(root);

    const shadow = root.attachShadow({ mode: "open" });

    const style = document.createElement("style");
 style.textContent = `
  #box {
    position: fixed;
    top: 10px;
    left: 10px;
    transform: translateZ(9999px);
    background: rgba(0,0,0,0.85);
    color: #00ffcc;
    padding: 6px 10px;
    font-size: 14px;
    border-radius: 6px;
    font-family: monospace;
  }
`;

    const box = document.createElement("div");
    box.id = "box";

    shadow.appendChild(style);
    shadow.appendChild(box);
  }

  const box = root.shadowRoot.getElementById("box");
  box.innerText = text;

  clearTimeout(window.__STEALTH_TIMER__);

  window.__STEALTH_TIMER__ = setTimeout(() => {
    root.remove();
  }, 4000);
}