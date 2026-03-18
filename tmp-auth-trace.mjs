const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createTarget() {
  const response = await fetch("http://127.0.0.1:9222/json/new?http://localhost:3000/login", {
    method: "PUT",
  });

  const body = await response.text();
  return JSON.parse(body);
}

async function main() {
  const target = await createTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let nextId = 0;
  const pending = new Map();

  const send = (method, params = {}) => {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout for ${method}`));
        }
      }, 15000);
    });
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "CDP error"));
      else resolve(message.result);
      return;
    }

    if (message.method === "Runtime.consoleAPICalled") {
      const args = (message.params?.args || []).map((arg) => arg.value ?? arg.description ?? arg.type);
      console.log("[BROWSER_CONSOLE]", ...args);
    }

    if (message.method === "Runtime.exceptionThrown") {
      console.log("[BROWSER_EXCEPTION]", message.params?.exceptionDetails?.text || "Exception");
    }

    if (message.method === "Network.responseReceived") {
      const url = message.params?.response?.url || "";
      if (url.includes("/api/auth/") || url.includes("/api/dashboard") || url.includes("/api/notifications")) {
        console.log("[NETWORK_RESPONSE]", message.params.response.status, url);
      }
    }

    if (message.method === "Page.frameNavigated") {
      const url = message.params?.frame?.url;
      if (url) console.log("[NAVIGATED]", url);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");

  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    return result.result?.value;
  };

  console.log("[TRACE] Opened login page target");
  await sleep(2500);

  const initial = await evaluate(`(() => ({
    href: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 200),
    emailExists: !!document.querySelector('input[type="email"]'),
    passwordExists: !!document.querySelector('input[type="password"]'),
    authStorage: localStorage.getItem('auth-storage')
  }))()`);
  console.log("[TRACE] Initial state", JSON.stringify(initial));

  let foundForm = false;
  for (let index = 0; index < 15; index += 1) {
    const probe = await evaluate(`(() => ({
      href: location.href,
      email: !!document.querySelector('input[type="email"]'),
      password: !!document.querySelector('input[type="password"]'),
      text: document.body.innerText.slice(0, 120)
    }))()`);
    console.log("[TRACE] Probe", index, JSON.stringify(probe));
    if (probe?.email && probe?.password) {
      foundForm = true;
      break;
    }
    await sleep(1000);
  }

  if (!foundForm) {
    console.log("[TRACE] Login form not found.");
    process.exit(0);
  }

  const submitResult = await evaluate(`(() => {
    const email = document.querySelector('input[type="email"]');
    const pass = document.querySelector('input[type="password"]');
    if (!email || !pass) return { submitted: false, reason: 'missing-fields' };

    email.focus();
    email.value = 'authtest1773788290@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));

    pass.focus();
    pass.value = 'testpass123';
    pass.dispatchEvent(new Event('input', { bubbles: true }));

    const form = document.querySelector('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    return { submitted: true, href: location.href };
  })()`);
  console.log("[TRACE] Submit result", JSON.stringify(submitResult));

  for (let index = 0; index < 20; index += 1) {
    await sleep(1000);
    const state = await evaluate(`(() => ({
      href: location.href,
      bodyText: document.body.innerText.slice(0, 220),
      authStorage: localStorage.getItem('auth-storage')
    }))()`);
    console.log("[TRACE] Post-login", index, JSON.stringify(state));
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("[TRACE_ERROR]", error);
  process.exit(1);
});
