// CDP 验证脚本：连接运行中的 Electron 主窗口渲染进程，
// 读取 #app dataset、模拟点击系统胶囊、观察 mode 与 suppressNextClick 变化。
// 用法: node scripts/cdp-probe.js <step>
//   step=info       列出目标
//   step=snapshot   读当前 #app dataset
//   step=click      在系统胶囊上派发真实点击，前后打印状态
const http = require("http");

const CDP_HOST = "127.0.0.1";
const CDP_PORT = 9222;

function httpJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: CDP_HOST, port: CDP_PORT, path }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("bad json: " + data.slice(0, 200)));
        }
      });
    }).on("error", reject);
  });
}

async function pickMainTarget() {
  const targets = await httpJson("/json");
  // 主窗口加载 index.html（非 system.html、非 devtools）
  const page = targets.find(
    (t) => t.type === "page" && /\/index\.html|\/$|127\.0\.0\.1:5173\/?$/.test(t.url) && !t.url.includes("system.html")
  ) || targets.find((t) => t.type === "page" && !t.url.includes("system.html") && !t.url.startsWith("devtools"));
  if (!page) throw new Error("no main page target; targets=" + JSON.stringify(targets.map((t) => t.url)));
  return page;
}

function cdpEval(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params) =>
      new Promise((res) => {
        const mid = ++id;
        pending.set(mid, res);
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    ws.onopen = async () => {
      await send("Runtime.enable", {});
      const r = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      // CDP 响应包两层：{id, result: {result: {type, value}, exceptionDetails?}}
      const evalResult = (r && r.result) || {};
      // 等一拍再 close，避免多次 evaluate 时 close 抢在响应前面
      await new Promise((res) => setTimeout(res, 50));
      ws.close();
      if (evalResult.exceptionDetails) {
        reject(new Error(JSON.stringify(evalResult.exceptionDetails)));
      } else {
        resolve(evalResult.result && evalResult.result.value);
      }
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    ws.onerror = (e) => reject(new Error("ws error: " + (e.message || e)));
  });
}

const SNAPSHOT_EXPR = `(() => {
  const app = document.querySelector('#app');
  const cap = document.querySelector('.system-capsule-layer');
  const card = document.querySelector('.system-card-layer');
  const cs = cap && getComputedStyle(cap);
  return {
    mode: app && app.dataset.mode,
    layout: app && app.dataset.layout,
    idleSystem: app && app.dataset.idleSystem,
    systemMonitor: app && app.dataset.systemMonitor,
    capsulePointerEvents: cs && cs.pointerEvents,
    capsuleOpacity: cs && cs.opacity,
    capsuleAction: cap && cap.dataset.action,
    winHeight: window.innerHeight
  };
})()`;

// 在系统胶囊中心派发一次完整的指针+点击事件序列（尽量贴近真实点击）
const CLICK_EXPR = `(() => {
  const cap = document.querySelector('.system-capsule-layer');
  if (!cap) return { error: 'no capsule' };
  const r = cap.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window, pointerId: 1, isPrimary: true };
  const elAt = document.elementFromPoint(cx, cy);
  cap.dispatchEvent(new PointerEvent('pointerdown', opts));
  cap.dispatchEvent(new MouseEvent('mousedown', opts));
  cap.dispatchEvent(new PointerEvent('pointerup', opts));
  cap.dispatchEvent(new MouseEvent('mouseup', opts));
  cap.dispatchEvent(new MouseEvent('click', opts));
  const app = document.querySelector('#app');
  return { dispatchedOn: 'system-capsule-layer', elementFromPoint: elAt && (elAt.className||elAt.tagName), modeAfter: app && app.dataset.mode };
})()`;

(async () => {
  const step = process.argv[2] || "snapshot";
  const page = await pickMainTarget();
  const ws = page.webSocketDebuggerUrl;
  if (step === "info") {
    console.log(JSON.stringify({ url: page.url, ws }, null, 2));
    return;
  }
  if (step === "snapshot") {
    console.log(JSON.stringify(await cdpEval(ws, SNAPSHOT_EXPR)));
    return;
  }
  if (step === "click") {
    console.log("BEFORE:", JSON.stringify(await cdpEval(ws, SNAPSHOT_EXPR)));
    console.log("CLICK :", JSON.stringify(await cdpEval(ws, CLICK_EXPR)));
    await new Promise((r) => setTimeout(r, 400));
    console.log("AFTER :", JSON.stringify(await cdpEval(ws, SNAPSHOT_EXPR)));
    return;
  }
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
