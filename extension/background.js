chrome.runtime.onInstalled.addListener(() => {
  console.log("Overture installed. Redirect URI:", chrome.identity.getRedirectURL());
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "PING":
      sendResponse({ ok: true, redirectUri: chrome.identity.getRedirectURL() });
      break;
    case "CONNECT_SPOTIFY":
      sendResponse({ ok: false, error: "Not implemented yet (Phase 2)" });
      break;
  }
  // In Phase 2, async handlers must `return true;` here,
  // or Chrome closes the channel before you respond.
});