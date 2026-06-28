fetch("http://127.0.0.1:11434/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: "qwen3:4b",
    messages: [{ role: "user", content: "hello" }],
    stream: false
  })
}).then(r => r.json()).then(console.log).catch(console.error);
