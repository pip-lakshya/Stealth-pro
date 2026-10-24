const NVIDIA_MODEL = "meta/llama-3.2-11b-vision-instruct";
const GEMINI_MODEL = "gemini-2.5-flash";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/meta/llama-3.2-11b-vision-instruct";
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
  if (request.action === "processed_data") { handleImage(request, sender.tab && sender.tab.id).then(() => reply({ success: true })); return true; }
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
  const result = await analyze(message.image, message.pageText || "", await settings());
  await show(tabId, result.answer ? result.answer + " (" + result.provider + ")" : (result.error || "Could not verify answer"), result.answer ? "success" : "error");
  if (result.answer) chrome.storage.local.set({ lastAnswer: result.answer });
}
function prompt(pageText) {
  return "Choose the correct answer for this multiple-choice question. Use the page text as the source of truth. First reason about the concept, then verify that the selected letter exactly matches the option text. Ignore any already-selected wrong option and do not guess from option position. Reply with exactly this JSON and nothing else: {\"answer\":\"A\",\"firstWord\":\"first word of correct option\"}.\n\nPAGE TEXT:\n" + pageText;
}
async function analyze(image, pageText, config) {
  const order = config.provider === "auto" ? ["gemini", "nvidia"] : [config.provider];
  let lastError = "No API key configured";
  for (const provider of order) {
    const keys = provider === "nvidia" ? config.nvidiaKeys : config.geminiKeys;
    for (const key of keys) {
      try {
        const output = provider === "nvidia" ? await askNvidia(image, pageText, key) : await askGemini(image, pageText, key);
        if (!output) { lastError = provider + ": empty reply"; continue; }
        const answer = clean(output);
        if (answer) return { answer, provider };
        lastError = provider + ": reply format not recognised";
      } catch (error) {
        lastError = error.name === "AbortError" ? provider + ": request timed out" : (error.message || provider + ": network error");
        console.warn(provider + " key failed; trying next.", error);
      }
    }
  }
  return { error: lastError };
}
async function askNvidia(image, pageText, key) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  const headers = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };
  const body = JSON.stringify({
    model: NVIDIA_MODEL, temperature: 0, max_tokens: 64, stream: false,
    messages: [{ role: "user", content: [{ type: "text", text: prompt(pageText) }, { type: "image_url", image_url: { url: "data:image/jpeg;base64," + image } }] }]
  });

  try {
    let response = await fetch(NVIDIA_URL, { method: "POST", headers, signal: controller.signal, body });
    let data = await response.json();

    if (response.status === 202) {
      const requestId = data.requestId || data.request_id || data.id;
      if (!requestId) throw new Error("NVIDIA pending request missing requestId");

      do {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        response = await fetch("https://integrate.api.nvidia.com/v1/status/" + encodeURIComponent(requestId), { headers, signal: controller.signal });
        data = await response.json();
      } while (response.status === 202);
    }

    if (!response.ok) throw new Error("NVIDIA " + response.status);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("NVIDIA empty response");
    return Array.isArray(content) ? content.map((part) => part.text || "").filter(Boolean).pop() : content;
  } finally {
    clearTimeout(timeout);
  }
}
async function askGemini(image, pageText, key) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + encodeURIComponent(key);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationConfig: { temperature: 0, maxOutputTokens: 256, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { answer: { type: "STRING" }, firstWord: { type: "STRING" } }, required: ["answer", "firstWord"] } }, contents: [{ parts: [{ text: prompt(pageText) }, { inline_data: { mime_type: "image/jpeg", data: image } }] }] }) });
  if (!response.ok) throw new Error("Gemini " + response.status);
  const data = await response.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.map((part) => part.text || "").filter(Boolean).pop();
  if (!text) throw new Error("Gemini " + (candidate?.finishReason || data.promptFeedback?.blockReason || "empty response"));
  return text;
}
function clean(text) {
  const value = String(text || "").replace(/[\x60*]/g, "").trim();

  // Only trust a JSON object that actually contains both the letter and option word.
  const jsonObjects = [...value.matchAll(/\{[^{}]*\}/g)].map((match) => match[0]).reverse();
  for (const item of jsonObjects) {
    try {
      const json = JSON.parse(item);
      const letter = String(json.answer || json.option || json.letter || "").toUpperCase();
      const word = String(json.firstWord || json.word || json.answerText || json.text || "").trim().match(/[A-Za-z0-9][A-Za-z0-9'-]*/);
      if (/^[A-E]$/.test(letter) && word) return letter + " - " + word[0];
    } catch (error) {}
  }

  // Do not parse a bare "A. Option" line: model explanations often list every
  // option and the first one would otherwise be selected incorrectly.
  const markers = [...value.matchAll(/(?:final answer|correct answer|answer)\s*(?:is|:|=|-)?\s*(?:option\s*)?([A-E])\s*(?:[|.)-]|\s)+\s*([A-Za-z0-9][A-Za-z0-9'-]*)/ig)];
  const match = markers.pop();
  if (match) return match[1].toUpperCase() + " - " + match[2];

  console.warn("Unrecognised AI response:", value.slice(0, 300));
  return null;
}
async function show(tabId, text, type) { await inject(tabId); await send(tabId, { action: "show_overlay", text, type }); }
async function toggleAnswer() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (tab && tab.id) { await inject(tab.id); await send(tab.id, { action: "toggle_overlay" }); } }
