// Server-side (Node.js with Express and ws)
const WebSocket = require("ws");
const pty = require("node-pty");
const os = require("os");
const readline = require("readline");

const ws = new WebSocket("ws://localhost:8787");

const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
const sharedTerm = pty.spawn(shell, [], {
  name: "xterm-color",
  cols: 80,
  rows: 24,
  cwd: process.env.HOME,
  env: process.env,
  encoding: null,
});

function send(data) {
  ws.send(JSON.stringify(data));
}

sharedTerm.on("data", (data) => {
  process.stdout.write(data.toString());
  send({ type: "output", data: data.toString() });
});

// Set up readline interface for server-side input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("line", (input) => {
  sharedTerm.write(input + "\n");
});

// Handle WebSocket connections
ws.on("open", (ws) => {
  console.log("Connected to server");
  send({
    type: "output",
    data: "\r\nConnected to the shared terminal.\r\n",
  });
});
ws.on("message", (message) => {
  const msg = JSON.parse(message);
  switch (msg.type) {
    case "input":
      sharedTerm.write(msg.data);
      break;
    case "resize":
      sharedTerm.resize(msg.cols, msg.rows);
      send({ type: "resize", cols: msg.cols, rows: msg.rows });
      break;
  }
});

// Handle server shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  sharedTerm.kill();
  rl.close();
  process.exit(0);
});
