setInterval(() => {
  process.stdout.write(
    JSON.stringify({
      title: "Custom source heartbeat",
      blocks: [
        {
          type: "markdown",
          text: "Your own process can emit typed JSONL and Verbum will render it beside Claude Code, Codex, and terminals."
        },
        {
          type: "status-list",
          items: [
            { label: "Mode", value: "JSONL" },
            { label: "Status", value: "streaming" }
          ]
        }
      ]
    }) + "\n"
  );
}, 5000);

