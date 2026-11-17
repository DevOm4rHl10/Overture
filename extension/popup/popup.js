const status = document.getElementById("status");
const button = document.getElementById("connect");

chrome.runtime.sendMessage({ type: "PING" }, (res) => {
  status.textContent = res?.ok ? "Background connected ✓" : "Background not responding";
  console.log("Redirect URI:", res?.redirectUri);
});

button.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CONNECT_SPOTIFY" }, (res) => {
    status.textContent = res.ok ? "Connected!" : res.error;
  });
});