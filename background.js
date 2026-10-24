const NVIDIA_MODEL = "meta/llama-3.2-11b-vision-instruct";
const GEMINI_MODEL = "gemini-2.5-flash";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
let lastCallTime = 0;

const send = (tabId, message) => new Promise((resolve) => chrome.tabs.sendMessage(tabId, message, () => resolve(!chrome.runtime.lastError)));
async function inject(tabId) { try { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); } catch (error) { console.warn(error); } }
async function settings() {
  const data = await chrome.storage.sync.get(["nvidiaApiKeys", "geminiApiKeys", "provider", "extensionEnabled"]);
  return { nvidiaKeys: Array.isArray(data.nvidiaApiKeys) ? data.nvidiaApiKeys.filter(Boolean) : [], geminiKeys: Array.isArray(data.geminiApiKeys) ? data.geminiApiKeys.filter(Boolean) : [], provider: data.provider || "auto", enabled: data.extensionEnabled !== false };
}

chrome.commands.onCommand.addListener((command) => { if (command === "solve-question") solve(); if (command === "toggle-answer") toggleAnswer(); });
chrome.runtime.onMessage.addListener((request, sender, reply) => {
  if (request.action === "saveSettings") { chrome.storage.sync.set(request.settings, () => reply({ success: true })); return true; }
  if (request.action === "getSettings") { settings().then(reply); return true; }
  if (request.action === "solveQuestion") { solve(); reply({ success: true }); }
  if (request.action === "toggleAnswer") { toggleAnswer(); reply({ success: true }); }
  if (request.action === "processed_data") handleImage(request, sender.tab && sender.tab.id);
});

async function solve() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const config = await settings();
  if (!tab || !tab.id || !config.enabled || Date.now() - lastCallTime < 1500) return;
  if (!config.nvidiaKeys.length && !config.geminiKeys.length) return show(tab.id, "Add an API key", "error");
  lastCallTime = Date.now(); await show(tab.id, "Reading question...", "loading");
  try {
    const image = (await chrome.tabs.captureVisibleTab(null, { format: "png" })).split(",")[1];
    await inject(tab.id); await send(tab.id, { action: "process_image", base64: image });
  } catch (error) { console.error(error); show(tab.id, "Cannot read this page", "error"); }
}
async function handleImage(message, tabId) {
  if (!tabId || !(await settings()).enabled) return;
  const answer = await analyze(message.image, message.pageText || "", await settings());
  await show(tabId, answer || "Could not verify answer", answer ? "success" : "error");
  if (answer) chrome.storage.local.set({ lastAnswer: answer });
}
function prompt(pageText) {
  return "Choose the correct answer for this multiple-choice question. Use the page text as the source of truth, and use the screenshot only to confirm layout. Do not repeat a selected wrong answer. Reply ONLY: ANSWER: LETTER | FIRSTWORD.\n\nPAGE TEXT:\n" + pageText;
}
async function analyze(image, pageText, config) {
  const order = config.provider === "auto" ? ["nvidia", "gemini"] : [config.provider];
  for (const provider of order) {
    const keys = provider === "nvidia" ? config.nvidiaKeys : config.geminiKeys;
    for (const key of keys) {
      try {
        const output = provider === "nvidia" ? await askNvidia(image, pageText, key) : await askGemini(image, pageText, key);
        const answer = clean(output); if (answer) return answer;
      } catch (error) { console.warn(provider + " key failed; trying next.", error); }
    }
  }
  return null;
}
async function askNvidia(image, pageText, key) {
  const response = await fetch(NVIDIA_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify({ model: NVIDIA_MODEL, temperature: 0, max_tokens: 32, messages: [{ role: "user", content: [{ type: "text", text: prompt(pageText) }, { type: "image_url", image_url: { url: "data:image/png;base64," + image } }] }] }) });
  if (!response.ok) throw new Error("NVIDIA " + response.status);
  return (await response.json()).choices?.[0]?.message?.content;
}
async function askGemini(image, pageText, key) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + encodeURIComponent(key);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationConfig: { temperature: 0, maxOutputTokens: 32 }, contents: [{ parts: [{ text: prompt(pageText) }, { inline_data: { mime_type: "image/png", data: image } }] }] }) });
  if (!response.ok) throw new Error("Gemini " + response.status);
  return (await response.json()).candidates?.[0]?.content?.parts?.[0]?.text;
}
function clean(text) {
  const value = String(text || "").replace(/[`*]/g, "").trim();
  const patterns = [
    /(?:answer|correct answer)\s*[:=-]?\s*([A-D])\s*(?:[|.)-]|\s)+\s*([A-Za-z0-9][A-Za-z0-9'-]*)/i,
    /(?:^|\n)\s*(?:[-*]\s*)?([A-D])\s*(?:[|.)-]|\s)+\s*([A-Za-z0-9][A-Za-z0-9'-]*)/im,
    /\{\s*["']?(?:answer|option)["']?\s*:\s*["']?([A-D])["']?[^}]*?(?:word|text)["']?\s*:\s*["']?([A-Za-z0-9][A-Za-z0-9'-]*)/i
  ];
  for (const pattern of patterns) { const match = value.match(pattern); if (match) return match[1].toUpperCase() + " - " + match[2]; }
  console.warn("Unrecognised AI response:", value.slice(0, 300));
  return null;
}
async function show(tabId, text, type) { await inject(tabId); await send(tabId, { action: "show_overlay", text, type }); }
async function toggleAnswer() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (tab && tab.id) { await inject(tab.id); await send(tab.id, { action: "toggle_overlay" }); } }
