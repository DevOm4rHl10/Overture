const status = document.getElementById("status");
const connectBtn = document.getElementById("connect");
const disconnectBtn = document.getElementById("disconnect");

const send = (type) => chrome.runtime.sendMessage({ type });

function render(res) {
  if (!res?.ok) {
    status.textContent = `Error: ${res?.error ?? "no response"}`;
    connectBtn.hidden = false;
    return;
  }
  connectBtn.hidden = res.loggedIn;
  disconnectBtn.hidden = !res.loggedIn;
  status.textContent = res.loggedIn ? `Connected as ${res.name}` : "Not connected";
}

connectBtn.addEventListener("click", async () => {
  status.textContent = "Opening Spotify…";
  render(await send("CONNECT_SPOTIFY"));
});

disconnectBtn.addEventListener("click", async () => {
  render(await send("DISCONNECT"));
});

send("STATUS").then(render);