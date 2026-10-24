if (!window.__STEALTH_LOADED__) {
  window.__STEALTH_LOADED__ = true;
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "process_image") chrome.runtime.sendMessage({ action: "processed_data", image: request.base64, pageText: document.body ? document.body.innerText.slice(0, 14000) : "" });
    if (request.action === "show_overlay") show(request.text, request.type);
    if (request.action === "toggle_overlay") toggle();
    if (request.action === "hide_overlay") { const root = document.getElementById("stealth-root"); if (root) root.remove(); }
  });
}
function getBox() {
  let root = document.getElementById("stealth-root");
  if (root) return root.shadowRoot.querySelector("#box");
  root = document.createElement("div"); root.id = "stealth-root"; root.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none"; document.documentElement.append(root);
  const shadow = root.attachShadow({ mode: "open" }), style = document.createElement("style"), box = document.createElement("div");
  style.textContent = "#box{position:fixed;max-width:min(300px,calc(100vw - 28px));padding:10px 13px;border:1px solid #54d8c1;border-radius:9px;background:#071014f0;color:#6fffe6;font:700 15px/1.25 system-ui;box-shadow:0 8px 28px #0008}#box.loading{color:#ffe76a;border-color:#ffe76a}#box.error{color:#ff9999;border-color:#ff9999}#box.hidden{opacity:0;visibility:hidden}";
  box.id = "box"; shadow.append(style, box); return box;
}
function show(text, type) { const box = getBox(); box.textContent = text; box.className = type || "success"; box.dataset.visible = "true"; requestAnimationFrame(() => place(box)); }
function toggle() { const box = getBox(), visible = box.dataset.visible !== "false"; box.dataset.visible = String(!visible); box.classList.toggle("hidden", visible); if (!visible) requestAnimationFrame(() => place(box)); }
function place(box) { const m=14,w=box.offsetWidth,h=box.offsetHeight,points=[[m,m],[innerWidth-w-m,m],[m,innerHeight-h-m],[innerWidth-w-m,innerHeight-h-m]]; let best=points[0],score=Infinity; for(const p of points){const x=Math.max(m,p[0]),y=Math.max(m,p[1]),el=document.elementFromPoint(x+4,y+4),s=el&&(getComputedStyle(el).position==="fixed"||getComputedStyle(el).position==="sticky")?1:0;if(s<score){best=p;score=s;}} box.style.left=Math.max(m,best[0])+"px";box.style.top=Math.max(m,best[1])+"px"; }
