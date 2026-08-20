document.addEventListener("DOMContentLoaded", async () => {
  const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");
  if (geminiApiKey) {
    document.getElementById("apiKey").value = geminiApiKey;
  }
});

document.getElementById("saveBtn").addEventListener("click", async () => {
  const key = document.getElementById("apiKey").value.trim();
  if (!key) return alert("Enter API key");

  await chrome.runtime.sendMessage({
    action: "saveApiKey",
    apiKey: key
  });

  alert("Saved");
});

document.getElementById("solveBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "solveQuestion" });
});