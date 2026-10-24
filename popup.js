const lines = (value) => [...new Set(value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))];
const nvidia = document.getElementById("nvidia"), gemini = document.getElementById("gemini"), provider = document.getElementById("provider"), enabled = document.getElementById("enabled"), status = document.getElementById("status");
const setStatus = (text, error = false) => { status.textContent = text; status.style.color = error ? "#a12b2b" : "#087b6e"; };
async function load() { const data = await chrome.runtime.sendMessage({ action: "getSettings" }); nvidia.value=data.nvidiaKeys.join("\n"); gemini.value=data.geminiKeys.join("\n"); provider.value=data.provider; enabled.textContent=data.enabled ? "Disable extension" : "Enable extension"; enabled.className=data.enabled ? "off" : ""; }
document.addEventListener("DOMContentLoaded", load);
document.getElementById("save").onclick = async () => { const settings={ nvidiaApiKeys:lines(nvidia.value), geminiApiKeys:lines(gemini.value), provider:provider.value }; await chrome.runtime.sendMessage({ action:"saveSettings", settings }); setStatus("Settings saved"); };
document.getElementById("solve").onclick = () => chrome.runtime.sendMessage({ action:"solveQuestion" });
document.getElementById("toggle").onclick = () => chrome.runtime.sendMessage({ action:"toggleAnswer" });
enabled.onclick = async () => { const data=await chrome.runtime.sendMessage({action:"getSettings"}), next=!data.enabled; await chrome.runtime.sendMessage({action:"saveSettings",settings:{extensionEnabled:next}}); if(!next){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab&&tab.id)chrome.tabs.sendMessage(tab.id,{action:"hide_overlay"});} setStatus(next ? "Extension enabled" : "Extension disabled"); load(); };
