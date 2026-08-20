const MODEL = "gemini-2.5-flash";
const MIN_CALL_INTERVAL = 12000;

let lastCallTime = 0;

// 🔥 SAFE MESSAGE
function safeSend(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, () => {
      if (chrome.runtime.lastError) {
        console.warn("Send failed:", chrome.runtime.lastError.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// 🔥 FORCE CONTENT INJECTION
async function injectContent(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (e) {
    console.warn("Injection:", e.message);
  }
}

// 🔥 COMMAND
chrome.commands.onCommand.addListener((command) => {
  if (command === "solve-question") solve();
});

// 🔥 SINGLE MESSAGE HANDLER (IMPORTANT)
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {

  // from popup
  if (req.action === "solveQuestion") {
    solve();
  }

  // save API key
  if (req.action === "saveApiKey") {
    chrome.storage.sync.set({ geminiApiKey: req.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // 🔥 receive processed image
  if (req.action === "processed_data") {
    handleProcessed(req, sender);
  }
});

// 🔥 MAIN SOLVER
async function solve() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const now = Date.now();
  if (now - lastCallTime < MIN_CALL_INTERVAL) return;
  lastCallTime = now;

  await injectContent(tab.id);

  show(tab.id, "...", "loading");

  const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");
  if (!geminiApiKey) return show(tab.id, "KEY!", "error");

  const screenshot = await chrome.tabs.captureVisibleTab(null, { format: "png" });
  const base64 = screenshot.split(",")[1];

  // send to content
  const sent = await safeSend(tab.id, {
    action: "process_image",
    base64
  });

  // retry once if failed
  if (!sent) {
    await injectContent(tab.id);
    await safeSend(tab.id, {
      action: "process_image",
      base64
    });
  }
}

// 🔥 HANDLE RESPONSE
async function handleProcessed(msg, sender) {
  const tabId = sender.tab.id;

  const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");

  let answer = await analyzeImage(msg.image, geminiApiKey);

  show(tabId, answer || "?", "success");

  await chrome.storage.local.set({ lastAnswer: answer });
}

// 🔥 GEMINI CALL
async function analyzeImage(base64, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Return ONLY A/B/C/D or number." },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64
            }
          }
        ]
      }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (res.status === 429) return "WAIT";

  const data = await res.json();

  if (data.error) {
    console.error(data.error);
    return null;
  }

  return clean(data?.candidates?.[0]?.content?.parts?.[0]?.text);
}

// 🔥 CLEAN OUTPUT
function clean(text) {
  if (!text) return null;

  const t = text.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  if (!/^[A-D0-9]+$/.test(t)) return null;

  return t.substring(0, 5);
}

// 🔥 SHOW OVERLAY
async function show(tabId, text, type) {
  await injectContent(tabId);

  await safeSend(tabId, {
    action: "show_overlay",
    text,
    type
  });
}