const lines = (value) => [...new Set(value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))];
const nvidia = document.getElementById("nvidia");
const gemini = document.getElementById("gemini");
const provider = document.getElementById("provider");
const geminiModel = document.getElementById("geminiModel");
const modelInfo = document.getElementById("modelInfo");
const enabled = document.getElementById("enabled");
const status = document.getElementById("status");

const MODEL_INFO = {
  "gemini-2.5-flash": "Recommended: strong balance of screenshot understanding, accuracy, and speed.",
  "gemini-3.5-flash-lite": "Fastest: low-latency, low-cost multimodal model for high-volume use.",
  "gemini-2.5-flash-lite": "Fast / economical: good for simple MCQs; availability may be limited for newer projects.",
  "gemini-3-flash-preview": "Higher capability: preview model with stronger reasoning; may have tighter quota.",
  "gemini-3.1-flash-lite": "Efficient: fast multimodal choice for straightforward questions at scale.",
  "gemini-3.6-flash": "Balanced: multimodal everyday-task model with a speed/quality trade-off.",
  "gemini-3.8-flash": "Highest capability: most capable Flash option; use when accuracy matters more than latency."
};

const setStatus = (text, error = false) => {
  status.textContent = text;
  status.style.color = error ? "#a12b2b" : "#087b6e";
};
const updateModelInfo = () => {
  modelInfo.textContent = MODEL_INFO[geminiModel.value] || "Select a Gemini text-output model.";
};

async function load() {
  const data = await chrome.runtime.sendMessage({ action: "getSettings" });
  nvidia.value = data.nvidiaKeys.join("\n");
  gemini.value = data.geminiKeys.join("\n");
  provider.value = data.provider;
  geminiModel.value = MODEL_INFO[data.geminiModel] ? data.geminiModel : "gemini-2.5-flash";
  updateModelInfo();
  enabled.textContent = data.enabled ? "Disable extension" : "Enable extension";
  enabled.className = data.enabled ? "off" : "";
}

document.addEventListener("DOMContentLoaded", load);
geminiModel.addEventListener("change", updateModelInfo);

document.getElementById("save").onclick = async () => {
  const settings = {
    nvidiaApiKeys: lines(nvidia.value),
    geminiApiKeys: lines(gemini.value),
    provider: provider.value,
    geminiModel: geminiModel.value
  };
  await chrome.runtime.sendMessage({ action: "saveSettings", settings });
  setStatus("Settings saved");
};
document.getElementById("solve").onclick = () => chrome.runtime.sendMessage({ action: "solveQuestion" });
document.getElementById("toggle").onclick = () => chrome.runtime.sendMessage({ action: "toggleAnswer" });
enabled.onclick = async () => {
  const data = await chrome.runtime.sendMessage({ action: "getSettings" });
  const next = !data.enabled;
  await chrome.runtime.sendMessage({ action: "saveSettings", settings: { extensionEnabled: next } });
  if (!next) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { action: "hide_overlay" });
  }
  setStatus(next ? "Extension enabled" : "Extension disabled");
  load();
};
