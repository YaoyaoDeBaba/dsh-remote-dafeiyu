window.__ModuleLoader__.load({
  id: "dsh-remote-dafeiyu",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/main.ts
var main_exports = {};
__export(main_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(main_exports);

// copy/zh-cn.json
var zh_cn_default = {
  _why: "\u7528\u6237\u53EF\u89C1\u4E2D\u6587\u6587\u6848\u7684**\u552F\u4E00\u4E8B\u5B9E\u6E90**\uFF08V3-PLAN \xA77 \u9636\u6BB5 F2\uFF1A\u6587\u6848\u53EF\u4EE5\u5171\u4EAB\u5B57\u9762\uFF0C\u8BBE\u8BA1 token \u4E0D\u884C \u2014\u2014 \u89C1 \xA79.13\uFF09\u3002\u4E24\u5904\u6D88\u8D39\u65B9\uFF1A\u5BBF\u4E3B\u63D2\u4EF6\uFF08\u76F4\u63A5 import\uFF09\u4E0E\u5FAE\u4FE1\u5C0F\u7A0B\u5E8F\uFF08\u7531 packages/client/scripts/gen-mp-copy.mjs \u751F\u6210 core/copy.js\uFF09\u3002",
  _rules: [
    "\u6BCF\u6761\u90FD\u5FC5\u987B\u6807 `ends`\uFF1A\u54EA\u51E0\u7AEF\u771F\u7684\u4F1A\u628A\u5B83\u8BF4\u51FA\u53E3\u3002\u5224\u636E\u6309\u8FD9\u4E2A\u5B57\u6BB5\u6838\u5BF9\u2014\u2014\u6807\u4E86 host \u7684\u4E0D\u8BB8\u51FA\u73B0\u5728\u5C0F\u7A0B\u5E8F\u6E90\u7801\u91CC\uFF0C\u53CD\u4E4B\u4EA6\u7136\uFF08\u9664\u975E\u4E24\u7AEF\u90FD\u8BF4\uFF09\u3002",
    "`both` \u7684\u6761\u76EE**\u5FC5\u987B\u9010\u5B57\u76F8\u540C**\uFF1A\u540C\u4E00\u8BED\u4E49\u5728\u4E24\u7AEF\u8BF4\u4E24\u5957\u8BDD\uFF0C\u7528\u6237\u4F1A\u4EE5\u4E3A\u5B83\u4EEC\u662F\u4E24\u4EF6\u4E8B\u30022026-10-08 \u6838\u51FA\u7684\u4E09\u5904\uFF1A\u5BBF\u4E3B\u300C\u8FDC\u7A0B\u672A\u8FDE\u63A5 / \u5DF2\u65AD\u5F00\u8FDE\u63A5 / \u8FDC\u7A0B\u672A\u542F\u52A8\u300D\u5BF9\u5C0F\u7A0B\u5E8F\u300C\u672A\u8FDE\u63A5 / \u5DF2\u65AD\u5F00 / \u79BB\u7EBF\u4E2D\u300D\u3002",
    "\u53EA\u8FDB\u8FD9\u5F20\u8868\u7684\u4E1C\u897F\uFF1A\u8BED\u4E49\u5728\u534F\u8BAE\u91CC\u5DF2\u7ECF\u51BB\u7ED3\u7684\uFF08\u914D\u5BF9\u72B6\u6001\u3001\u5BA1\u6279\u9009\u9879\u3001pair-fail \u539F\u56E0\uFF09\uFF0B\u4E24\u7AEF\u90FD\u5728\u8BF4\u7684\u8FDE\u63A5\u6001\u3002**\u5BBF\u4E3B/\u5C0F\u7A0B\u5E8F\u5404\u81EA\u72EC\u6709\u7684\u754C\u9762\u6587\u6848\u4E0D\u8FDB\u8FD9\u5F20\u8868**\uFF08\u5982\u5BBF\u4E3B\u7684\u300C\u5DF2\u5C31\u7EEA\u300D\u8BB2\u7684\u662F\u4E2D\u7EE7\u90A3\u6761\u5B50\u94FE\uFF0C\u5C0F\u7A0B\u5E8F\u6CA1\u6709\u8FD9\u4E00\u884C\uFF09\u3002",
    "\u6539\u8FD9\u91CC = \u6539\u4E24\u7AEF\u7684\u8138\u3002\u6539\u5B8C\u5FC5\u987B\u8DD1 `node packages/client/scripts/gen-mp-copy.mjs`\uFF08\u751F\u6210\u7269\uFF09\u4E0E `node e2e/shared-copy.test.mjs`\uFF08\u4E24\u7AEF\u662F\u5426\u771F\u7684\u5728\u7528\uFF09\u3002",
    "\u26A0\uFE0F \u8FD9\u5F20\u8868\u91CC\u6CA1\u6709\u3001\u4E5F\u4E0D\u8BB8\u6709\uFF1A\u51ED\u636E\u3001\u4E3B\u673A\u8DEF\u5F84\u3001\u4EE5\u53CA\u4EFB\u4F55\u8BBE\u8BA1 token \u7684\u503C\uFF08\u8BBE\u8BA1 token \u5728 packages/client/theme/tokens.mjs\uFF0C\u4E24\u7AEF**\u6545\u610F\u4E0D\u540C\u503C**\uFF09\u3002"
  ],
  version: 1,
  status: {
    online: {
      zh: "\u5DF2\u8FDE\u63A5",
      ends: "both"
    },
    connecting: {
      zh: "\u8FDE\u63A5\u4E2D",
      ends: "both"
    },
    offline: {
      zh: "\u5DF2\u65AD\u5F00",
      ends: "both"
    },
    notLinked: {
      zh: "\u672A\u8FDE\u63A5",
      ends: "both"
    },
    hostOffline: {
      zh: "\u7535\u8111\u79BB\u7EBF\uFF0C\u4EFB\u52A1\u53EF\u80FD\u4ECD\u5728\u8DD1",
      ends: "client"
    },
    pairing: {
      zh: "\u6B63\u5728\u914D\u5BF9",
      ends: "client"
    },
    needsPair: {
      zh: "\u9700\u8981\u91CD\u65B0\u914D\u5BF9\uFF0C\u8BF7\u626B\u63CF\u4E3B\u673A\u72B6\u6001\u680F\u90A3\u9897\u80F6\u56CA\u5F39\u51FA\u7684\u4E8C\u7EF4\u7801",
      ends: "client"
    },
    relayDown: {
      zh: "\u4E2D\u7EE7\u672A\u542F\u52A8",
      ends: "host"
    },
    phoneAway: {
      zh: "\u624B\u673A\u79BB\u7EBF",
      ends: "host"
    },
    relayReady: {
      zh: "\u5DF2\u5C31\u7EEA",
      ends: "both"
    },
    relayIdle: {
      zh: "\u672A\u542F\u52A8",
      ends: "host"
    },
    waiting: {
      zh: "\u7B49 {{n}} \u4EF6\u4E8B",
      ends: "host"
    },
    brand: {
      zh: "\u8FDC\u7A0B\u63A7\u5236",
      ends: "host"
    }
  },
  approval: {
    _why: "F10 \u51BB\u7ED3\uFF1A`id` \u662F\u884C\u4E3A\u5206\u652F\u6761\u4EF6\u4E0D\u80FD\u6539\uFF0C`label` \u662F\u7ED9\u7528\u6237\u770B\u7684\u5B57\u3002\u4E24\u7AEF\u66FE\u5404\u5199\u4E00\u4EFD\uFF08\u5BBF\u4E3B runtime.ts / \u5C0F\u7A0B\u5E8F demo.js\uFF09\uFF0C\u6539\u4E00\u5904\u5C31\u6F02\u3002",
    options: [
      {
        id: "approve",
        label: "\u5141\u8BB8\u4E00\u6B21"
      },
      {
        id: "approve-session",
        label: "\u59CB\u7EC8\u5141\u8BB8"
      },
      {
        id: "reject",
        label: "\u62D2\u7EDD"
      }
    ],
    scopeHint: "\u300C\u59CB\u7EC8\u5141\u8BB8\u300D\u4EC5\u9650\u672C\u6B21\u4F1A\u8BDD\u5185\u7684\u540C\u7C7B\u64CD\u4F5C\uFF0C\u4F1A\u8BDD\u7ED3\u675F\u5373\u5931\u6548"
  },
  pairFail: {
    _why: "F6 \u51BB\u7ED3\u7684\u56DB\u4E2A reason \u7684\u4E2D\u6587\u8BF4\u6CD5\u3002\u4E3B\u673A\u4FA7\u53EA\u628A\u5B83\u4EEC\u5199\u8FDB\u65E5\u5FD7\uFF08\u82F1\u6587 reason \u662F\u5224\u636E\u7684\u951A\uFF09\uFF0C\u8BF4\u7ED9\u7528\u6237\u542C\u7684\u662F\u5C0F\u7A0B\u5E8F\u8FD9\u4E00\u4EFD\u3002",
    invalid_or_expired: "\u8FD9\u5F20\u7801\u5DF2\u5931\u6548\uFF0C\u56DE\u7535\u8111\u4E0A\u70B9\u300C\u914D\u5BF9\u300D\u5237\u65B0\u540E\u91CD\u626B",
    already_used: "\u8FD9\u5F20\u7801\u7528\u8FC7\u4E86\uFF0C\u7535\u8111\u5DF2\u6362\u65B0\u7801\uFF0C\u91CD\u626B\u5373\u53EF",
    host_offline: "\u4E3B\u673A\u4E0D\u5728\u7EBF\uFF0C\u7A0D\u540E\u518D\u626B",
    bad_token: "\u4EE4\u724C\u9519\u8BEF\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801"
  }
};

// src/copy/zh.ts
var STATUS_ZH = zh_cn_default.status;
var APPROVAL_OPTIONS = zh_cn_default.approval.options;
var APPROVAL_SCOPE_HINT = zh_cn_default.approval.scopeHint;
var PAIR_FAIL_ZH = zh_cn_default.pairFail;
function statusText(id) {
  return STATUS_ZH[id]?.zh;
}
function waitingText(count) {
  const template = STATUS_ZH.waiting?.zh ?? "\u7B49 {{n}} \u4EF6\u4E8B";
  return template.replace("{{n}}", String(count));
}

// src/client/host-url.ts
function resolveHostUrl(path) {
  try {
    const transport = globalThis.__DSH_TRANSPORT__;
    const claimed = transport && typeof transport.streamBaseUrl === "string" ? transport.streamBaseUrl.trim() : "";
    const base = claimed !== "" ? claimed : typeof document !== "undefined" && typeof document.baseURI === "string" ? document.baseURI : "";
    if (base === "") return path;
    const origin = /^[A-Za-z][A-Za-z\d+.-]*:\/\/[^/]*/.exec(base)?.[0] ?? "";
    return origin === "" ? path : origin + path;
  } catch {
    return path;
  }
}

// src/client/pill.ts
var ZH = {
  online: statusText("online"),
  connecting: statusText("connecting"),
  offline: statusText("offline"),
  notLinked: statusText("notLinked"),
  relayDown: statusText("relayDown"),
  phoneAway: statusText("phoneAway"),
  brand: statusText("brand"),
  relayReady: statusText("relayReady"),
  relayIdle: statusText("relayIdle")
};
var STATUS_ROUTE = "/plugins/dsh-remote-control/status";
var NEW_ROUTE = "/plugins/dsh-remote-control/pairing/new";
var IMAGE_ROUTE = "/plugins/dsh-remote-control/pairing.png";
var UNPAIR_ROUTE = "/plugins/dsh-remote-control/unpair";
var SLOT_NAME = "conversation.composer.dock";
var PILL_ID = "dsh-remote-control";
var PILL_ORDER = 20;
var STYLE_ID = "dsh-remote-control/pill.css";
var PLUGIN_ID = "dsh-remote-control";
var POLL_MS = 2e3;
var FETCH_TIMEOUT_MS = 3e3;
function panelViewFor(answer, httpStatus) {
  if (!answer || typeof answer !== "object") return { kind: "failed", detail: `HTTP ${httpStatus}` };
  if (answer.state === "ready") {
    const token = typeof answer.token === "string" ? answer.token : "";
    const epoch = typeof answer.epoch === "string" ? answer.epoch : "";
    const expiresInMs = typeof answer.expiresInMs === "number" ? answer.expiresInMs : 0;
    if (token === "" || expiresInMs <= 0) return { kind: "failed", detail: "\u53D1\u7801\u56DE\u7B54\u91CC\u7684\u7801\u4E0D\u5B8C\u6574" };
    return { kind: "qr", token, expiresInMs, imageSrc: `${IMAGE_ROUTE}?e=${encodeURIComponent(epoch)}` };
  }
  if (answer.state === "unavailable") {
    return {
      kind: "unavailable",
      reason: answer.reason === "relay-offline" ? "\u4E2D\u7EE7\u8FD8\u6CA1\u8FDE\u4E0A\uFF0C\u6682\u65F6\u65E0\u6CD5\u914D\u5BF9\u3002" : "\u73B0\u5728\u53D1\u4E0D\u51FA\u914D\u5BF9\u7801\u3002"
    };
  }
  return {
    kind: "failed",
    // 把宿主说的那道守卫一起印出来：这条路由在浏览器里点，屏幕上的这句话就是唯一的现场。
    detail: typeof answer.error === "string" ? typeof answer.guard === "string" ? `${answer.error}\uFF08${answer.guard}\uFF09` : answer.error : `HTTP ${httpStatus}`
  };
}
var MP_CODE_LOADING_TEXT = "\u6B63\u5728\u83B7\u53D6\u5C0F\u7A0B\u5E8F\u7801";
var MP_CODE_FAILED_TEXT = "\u5C0F\u7A0B\u5E8F\u7801\u53D6\u4E0D\u5230";
var MP_CODE_FAILED_HINT = "\u70B9\u4E0A\u9762\u7684\u6309\u94AE\u91CD\u8BD5";
function createMpCodeImage(doc, onChange) {
  let current;
  const settle = (element, state) => {
    element.setAttribute("data-load", state);
    if (current && current.element === element) current.state = state;
    onChange();
  };
  return {
    element(src) {
      if (current && current.src === src) return current.element;
      const element = doc.createElement("img");
      element.className = "drc-qr";
      element.setAttribute("alt", "\u914D\u5BF9\u4E8C\u7EF4\u7801");
      element.setAttribute("data-load", "loading");
      element.addEventListener("load", () => settle(element, "ready"));
      element.addEventListener("error", () => settle(element, "failed"));
      element.src = src;
      current = { src, element, state: "loading" };
      return element;
    },
    state() {
      return current?.state ?? "loading";
    },
    invalidate() {
      if (current?.state === "failed") current = void 0;
    }
  };
}
function mpCodeLoadingBox(doc, state) {
  const box = doc.createElement("div");
  box.className = "drc-qr-loading";
  box.setAttribute("data-state", state);
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  if (state === "loading") {
    const spinner = doc.createElement("span");
    spinner.className = "drc-spinner";
    spinner.setAttribute("aria-hidden", "true");
    box.appendChild(spinner);
  }
  const label = doc.createElement("span");
  label.className = "drc-qr-loading-text";
  label.textContent = state === "failed" ? MP_CODE_FAILED_TEXT : MP_CODE_LOADING_TEXT;
  box.appendChild(label);
  if (state === "failed") {
    const hint = doc.createElement("span");
    hint.className = "drc-qr-loading-hint";
    hint.textContent = MP_CODE_FAILED_HINT;
    box.appendChild(hint);
  }
  return box;
}
function pillLabel(status) {
  const relay = status?.relay;
  if (relay === "idle") return { text: ZH.relayDown, tone: "off" };
  if (relay === "offline") return { text: ZH.offline, tone: "error" };
  if (relay === "connecting") return { text: ZH.connecting, tone: "wait" };
  if (relay !== "online") return { text: ZH.brand, tone: "off" };
  const paired = typeof status?.paired === "number" ? status.paired : 0;
  if (paired > 0) {
    const waiting = waitingCount(status);
    if (waiting > 0) return { text: waitingText(waiting), tone: "wait" };
    return { text: ZH.online, tone: "on" };
  }
  if (pairingCount(status) > 0) return { text: ZH.phoneAway, tone: "wait" };
  return { text: ZH.notLinked, tone: "off" };
}
function waitingCount(status) {
  const count = status?.waiting;
  return typeof count === "number" && count > 0 ? Math.min(Math.floor(count), 99) : 0;
}
function pairingCount(status) {
  const count = status?.pairings;
  return typeof count === "number" ? count : 0;
}
var GUIDE_LINE = "\u6253\u5F00\u5C0F\u7A0B\u5E8F\u626B\u8FD9\u4E2A\u7801 \u8FDC\u7A0B\u63A7\u5236\u8FD9\u53F0\u7535\u8111";
function humanDuration(sec) {
  const total = typeof sec === "number" && sec > 0 ? Math.floor(sec) : 0;
  if (total < 60) return `${total} \u79D2`;
  const minutes = Math.floor(total / 60);
  return minutes >= 10 ? `${minutes} \u5206` : `${minutes} \u5206 ${total % 60} \u79D2`;
}
function waitingRow(status) {
  const count = waitingCount(status);
  if (count === 0) return "";
  const oldest = typeof status?.waitingOldestSec === "number" ? status.waitingOldestSec : 0;
  return `${count} \u4EF6${oldest > 0 ? ` \u6700\u4E45 ${humanDuration(oldest)}` : ""}`.slice(0, 40);
}
function relayAddress(url) {
  if (typeof url !== "string" || url.trim() === "") return "";
  const withoutScheme = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = /^[^/?]*/.exec(withoutScheme)?.[0] ?? "";
  const host = authority.replace(/^[^@]*@/, "");
  return host.slice(0, 40);
}
function relayRow(status) {
  return relayAddress(status?.serverUrl);
}
function relayStateRow(status) {
  const relay = status?.relay;
  if (relay === "online") return ZH.relayReady;
  if (relay === "connecting") return "\u8FDE\u63A5\u4E2D";
  if (relay === "offline") return "\u5DF2\u65AD\u5F00";
  if (relay === "idle") return ZH.relayIdle;
  return "";
}
function versionRow(status) {
  const version = status?.version;
  return typeof version === "string" && version.trim() !== "" ? version.trim().slice(0, 24) : "";
}
function secondsText(ms) {
  const whole = Math.max(0, Math.round(ms / 1e3));
  if (whole < 60) return `${whole} \u79D2`;
  return `${Math.floor(whole / 60)} \u5206 ${whole % 60} \u79D2`;
}
var FALLBACK = {
  // 下面三个是 2026-08-09 重排设置页时补的：值取自宿主自己的设置分区
  // （`AgentPresetSection.module.css` 的真实 CSS——卡片 `border-l2` + `bg-layer-3`、
  // 焦点环 `brand-primary`）。照抄宿主的取值口径，不是随手挑的颜色。
  "border-l2": "rgba(0, 0, 0, 0.16)",
  "bg-layer-3": "#ffffff",
  "brand-primary": "#247bbf",
  /**
   * 主按钮的**填充与字色**（2026-10-09 加，用户报"按钮全白"之后）。
   *
   * ⚠️ 这一对**不能自己配**，必须各拿各的宿主令牌。主按钮的填充是
   * `--dsw-alias-button-primary-fill`，它等于 `--dsw-alias-brand-primary`，
   * 而**在深色主题下那是"近白"**（neutral-bluish-50）。当时我们给这个浅填充写死了
   * FIXED_WHITE 的白字 ⇒ 白底白字，整个按钮看不见（真屏幕截图，2026-10-09）。
   * 宿主自己的写法是 `.primary{background:var(--dsw-alias-button-primary-fill);
   * color:var(--dsw-alias-label-primary-foreground)}` —— 字色是**另一个令牌**，
   * 深色下是近黑（neutral-bluish-1000）。两个一起拿，明暗两套主题才都成立。
   *
   * 这两个兜底值只在"这代宿主没有这两个令牌"时生效（那时通常是浅色主题）：
   * 蓝底 + 白字，是这套设计里最不会出错的一组。
   */
  "button-primary-fill": "#247bbf",
  "label-primary-foreground": "#ffffff",
  "state-success-primary": "#52c41a",
  "state-warn-primary": "#faad14",
  "state-error-primary": "#ff4d4f",
  "label-primary": "#1f2329",
  "label-secondary": "#6b7280",
  "label-tertiary": "#9aa0a6",
  "label-dimmed": "#9aa0a6",
  "bg-layer-1": "#ffffff",
  "border-l1": "rgba(0, 0, 0, 0.1)",
  "interactive-bg-hover": "rgba(0, 0, 0, 0.04)"
};
var FIXED_WHITE = "#ffffff";
var hostVar = (key) => `var(--dsw-alias-${key}, ${FALLBACK[key]})`;
var CSS = `
.drc-pill { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 2px 8px;
  border: 0; border-radius: 999px; background: transparent; color: inherit; font: inherit;
  font-size: 12px; line-height: 18px; cursor: pointer;
  /* \u5BBF\u4E3B\u90A3\u4E00\u6392\u6324\u4E0D\u4E0B\u65F6\u4F1A\u81EA\u5DF1\u622A\u65AD\uFF08\u300C6 \u8F6E \u2026\u300D\u90A3\u79CD\uFF09\uFF0C\u6211\u4EEC\u4E5F\u8DDF\u8FD9\u4E2A\u5F62\u72B6\u8D70\uFF1A
     \u4E00\u884C\u5199\u5B8C\uFF0C\u5199\u4E0D\u4E0B\u5C31\u7701\u7565\u53F7\u3002**\u6CA1\u6709\u8FD9\u4E24\u6761**\u7684\u8BDD\uFF0Cflex \u9879\u4F1A\u88AB\u538B\u5230\u300C\u4E2D\u6587\u6700\u5C0F\u5185\u5BB9\u5BBD\u5EA6
     = \u4E00\u4E2A\u5B57\u300D\uFF0C\u4E8E\u662F\u300C\u5DF2\u8FDE 1 \u53F0\u300D\u7AD6\u7740\u6392\u6210\u56DB\u884C\uFF082026-10-03 \u771F\u5C4F\u5E55\u622A\u56FE\uFF09\u3002 */
  flex: 0 1 auto; white-space: nowrap; }
.drc-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.drc-pill:hover { background: ${hostVar("interactive-bg-hover")}; }
.drc-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: ${hostVar("label-dimmed")}; }
.drc-dot[data-tone="wait"] { background: ${hostVar("state-warn-primary")}; }
.drc-dot[data-tone="on"] { background: ${hostVar("state-success-primary")}; }
.drc-dot[data-tone="error"] { background: ${hostVar("state-error-primary")}; }
.drc-panel { position: absolute; bottom: calc(100% + 8px); right: 0; z-index: 30; width: 240px;
  padding: 10px 12px; border: 1px solid ${hostVar("border-l1")}; border-radius: 12px;
  background: var(--dsw-specific-tip, ${hostVar("bg-layer-1")});
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.06);
  color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; }
/* \u62AC\u5934\u4E00\u884C\uFF1A\u5DE6\u4FA7\u72B6\u6001\uFF0C\u53F3\u4FA7\u52A8\u4F5C\u3002\u4E24\u9897\u6309\u94AE\u90FD\u6536\u5728\u8FD9\u4E2A\u53F3\u4E0A\u89D2\uFF082026-10-03 \u91CD\u8BBE\u8BA1\u7684\u8981\u6C42\uFF09\u3002 */
.drc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.drc-head-label { font-weight: 600; }
.drc-head-label[data-tone="off"] { color: ${hostVar("label-secondary")}; }
.drc-head-label[data-tone="wait"] { color: ${hostVar("state-warn-primary")}; }
.drc-head-label[data-tone="on"] { color: ${hostVar("state-success-primary")}; }
.drc-head-label[data-tone="error"] { color: ${hostVar("state-error-primary")}; }
.drc-actions { display: flex; gap: 6px; flex: 0 0 auto; }
.drc-btn { padding: 2px 10px; border: 1px solid ${hostVar("border-l1")};
  border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer;
  white-space: nowrap; }
.drc-btn:hover { background: ${hostVar("interactive-bg-hover")}; }
/* \u6B63\u6587\u90A3\u4E09\u884C\uFF08\u4E2D\u7EE7 / \u72B6\u6001 / \u7248\u672C\uFF09\uFF1A\u952E\u5DE6\u503C\u53F3\uFF08space-between\uFF09\uFF0C\u503C\u88AB\u622A\u65AD\u65F6\u7701\u7565\u53F7\u2014\u2014
   \u548C\u90A3\u9897 pill \u540C\u4E00\u5957"\u6324\u4E0D\u4E0B\u5C31\u622A\u6587\u5B57\u4E0D\u6491\u5BB9\u5668"\u3002\u7B2C\u4E00\u884C\u5E26\u90A3\u6761\u5206\u9694\u7EBF\uFF0C\u540E\u4E24\u884C\u53EA\u7559\u884C\u8DDD\u3002 */
.drc-info { display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  white-space: nowrap; margin-top: 8px; padding-top: 6px;
  border-top: 1px solid ${hostVar("border-l1")}; }
.drc-info + .drc-info { margin-top: 2px; padding-top: 0; border-top: 0; }
.drc-key { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); }
.drc-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.drc-qr { display: block; width: 200px; height: 200px; margin: 8px auto 0; image-rendering: pixelated; }
.drc-count { margin: 8px 0 0; text-align: center; color: ${hostVar("label-secondary")};
    font-size: 12px; font-variant-numeric: tabular-nums; }
  .drc-count[data-kind="urgent"] { color: ${hostVar("state-warn-primary")}; font-weight: 600; }
  .drc-code { margin: 8px 0 0; text-align: center; font-weight: 600; font-size: 14px; letter-spacing: 2px; }
  /* \u5F15\u5BFC\u884C\uFF1A\u6BD4 note \u91CD\u4E00\u6863\uFF08\u7B2C\u4E00\u6B21\u7528\u7684\u4EBA\u8981\u770B\u6E05\uFF09\uFF0C\u4F46\u4E0D\u52A0\u56FE\u6807\u4E0D\u52A0\u5E95\u8272\u2014\u2014
     \u8FD9\u4E00\u5C4F\u7684\u4E3B\u89D2\u662F\u4E8C\u7EF4\u7801\uFF0C\u591A\u4E00\u4E2A\u8272\u5757\u5C31\u6210\u4E86\u63A8\u9500\u800C\u4E0D\u662F\u5F15\u5BFC\u3002 */
  .drc-guide { margin: 8px 0 0; text-align: center; color: ${hostVar("label-secondary")}; font-size: 12px; }
  .drc-note { margin: 4px 0 0; text-align: center; color: var(--dsw-alias-label-tertiary); }
.drc-note[data-kind="failed"] { color: ${hostVar("state-error-primary")}; }
  /* \u79BB\u7EBF\u90A3\u4E00\u5C4F\u7684\u7B2C\u4E00\u884C\u8BF4\u660E\u8981\u8DDF\u4E0A\u9762\u90A3\u884C\u62C9\u5F00\u4E00\u70B9\u3002**\u5FC5\u987B\u5199\u5728 .drc-note \u4E4B\u540E**\uFF1A
     \u4E24\u8005\u7279\u5F02\u5EA6\u76F8\u540C\uFF08\u90FD\u53EA\u4E00\u4E2A\u7C7B\uFF09\uFF0C\u540E\u6765\u7684\u8D62\u2014\u2014\u5199\u5728\u524D\u9762\u7684 margin-top \u4F1A\u88AB
     .drc-note \u7684 margin: 4px 0 0 \u6574\u6761\u8986\u76D6\u6210\u6B7B\u89C4\u5219\uFF082026-10-06 \u4FEE\uFF09\u3002 */
  .drc-note-block { margin-top: 10px; }

/* \u2500\u2500 \u8BBE\u7F6E\u9875\u90A3\u4E00\u9875\uFF08settings.section\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u53D6\u503C\u5168\u90E8\u7167\u6284\u5BBF\u4E3B\u81EA\u5DF1\u7684\u8BBE\u7F6E\u5206\u533A\uFF08dsh-client-ui-agent-preset \u90A3\u4EFD
   AgentPresetSection.module.css \u7684\u771F\u5B9E CSS\uFF0C2026-08-09 \u4ECE\u6B63\u5728\u8DD1\u7684\u90A3\u4EFD\u6A21\u5757\u91CC\u62A0\u51FA\u6765\u7684\uFF09\uFF1A
   title 18px 600\u3001\u5361\u7247\u8D70 border-l2 + bg-layer-3 + radius 12px\u3001\u884C\u95F4\u7EC6\u7EBF\u8D70 border-l1\u3002
   \u21D2 \u76EE\u7684\u4E0D\u662F"\u597D\u770B"\uFF0C\u662F**\u770B\u8D77\u6765\u50CF\u5BBF\u4E3B\u4EB2\u751F\u7684\u90A3\u4E00\u9875**\uFF1A\u6307\u5357\u91CC\u90A3\u6761
   "Choose the rendering surface before writing any view; later styling inside the wrong
   surface cannot recover consistency"\uFF0C\u53CD\u8FC7\u6765\u4E5F\u6210\u7ACB\u2014\u2014\u540C\u4E00\u4E2A\u9762\u91CC\u81EA\u5DF1\u53D1\u660E\u4E00\u5957\u5C31\u9732\u9985\u3002

   \u26A0\uFE0F\u26A0\uFE0F **\u8FD9\u91CC\u6BCF\u4E00\u4E2A\u53D6\u503C\u90FD\u5FC5\u987B\u5199\u6210\u63D2\u503C\u5F62\u6001**\uFF082026-10-09 \u4FEE\uFF09\u3002
   2026-08-09 \u90A3\u4E00\u7248\u6574\u6BB5\u628A\u5B83\u5199\u6210\u4E86**\u5B57\u9762\u6587\u672C**\uFF08\u5C11\u4E86\u4E00\u5BF9\u7F8E\u5143\u82B1\u62EC\u53F7\uFF09\uFF1A\u6D4F\u89C8\u5668\u8BA4\u4E0D\u51FA
   \u90A3\u4E2A\u503C\uFF0C**\u4E00\u6761\u58F0\u660E\u90FD\u4E0D\u751F\u6548**\u2014\u2014\u4E8E\u662F\u5361\u7247\u6CA1\u6709\u8FB9\u6846\u3001\u6CA1\u6709\u5E95\u8272\u3001\u6CA1\u6709\u5706\u89D2\uFF0C\u6807\u9898\u4E0E\u6309\u94AE
   \u4E5F\u5168\u65E0\u8272\u3002\u7ED3\u6784\u3001\u7C7B\u540D\u3001\u65AD\u8A00\u90FD\u5BF9\uFF0C\u5C4F\u5E55\u4E0A\u5C31\u662F\u4E00\u5217\u88F8\u6587\u672C\uFF08\u7528\u6237\u62A5\u7684"\u6392\u7248\u6BD4\u8F83\u4E71"\uFF09\u3002
   \u21D2 \u5224\u636E\u8865\u5728 e2e/design-tokens.test.mjs\uFF1ACSS \u6A21\u677F\u91CC\u51FA\u73B0\u672A\u63D2\u503C\u7684\u8C03\u7528\u4E00\u5F8B\u7EA2\u3002
   **\u8FD9\u4ED3\u88AB\u540C\u4E00\u5F62\u72B6\u7ECA\u8FC7\u4E94\u6B21\u4EE5\u4E0A\uFF1A\u5224\u636E\u8BFB\u7684\u662F"\u90A3\u6BB5\u6587\u5B57\u5728\u4E0D\u5728"\uFF0C\u800C\u6D4F\u89C8\u5668\u8BFB\u7684\u662F
   "\u90A3\u4E2A\u503C\u5408\u4E0D\u5408\u6CD5"\u3002**

   2026-10-09 \u7684\u53E6\u4E00\u6B21\u91CD\u6392\uFF1A\u539F\u6765\u662F\u4E00\u5217\u5782\u76F4\u7801\u653E\uFF08\u6807\u9898 / \u72B6\u6001 / \u4E8C\u7EF4\u7801\u5361 / \u56DB\u884C\u4E8B\u5B9E /
   \u4E00\u6392\u6309\u94AE\uFF09\uFF0C\u6BCF\u4E00\u5757\u90FD\u5360\u6EE1 720px \u800C\u5185\u5BB9\u53EA\u6709 200px \u5BBD\u2014\u2014\u5927\u7A7A\u95F4\u653E\u5C0F\u5185\u5BB9\uFF0C\u89C6\u7EBF\u65E0\u5904\u843D\u811A\u3002
   \u73B0\u5728\u6539\u6210**\u4E24\u680F\u5361\u7247**\uFF1A
     \u5DE6\u680F = \u8FD9\u53F0\u4E3B\u673A\uFF08\u914D\u5BF9\u5361 + \u8FDE\u63A5\u4E8B\u5B9E\uFF09\uFF0C\u53F3\u680F = \u624B\u673A\u7AEF\uFF08\u5C0F\u7A0B\u5E8F\u7801 + \u600E\u4E48\u7528\uFF09\u3002
   \u7A84\u5C4F\u81EA\u5DF1\u6298\u6210\u4E00\u5217\u3002
   \u26A0\uFE0F \u4E24\u680F\u7528 grid \u7684 auto-fit + minmax \u800C\u4E0D\u662F\u5A92\u4F53\u67E5\u8BE2\uFF1A\u8FD9\u4E00\u9875\u7684\u5BBD\u5EA6\u7531**\u5BBF\u4E3B\u7684\u5BB9\u5668**\u7ED9\uFF0C
   \u6211\u4EEC\u4E0D\u77E5\u9053\u7A97\u53E3\u591A\u5BBD\uFF0C\u5A92\u4F53\u67E5\u8BE2\u53EA\u80FD\u731C\u3002268px \u662F"200px \u7684\u7801 + \u5361\u7247\u5185\u8FB9\u8DDD"\u80FD\u5BB9\u4E0B\u7684\u4E0B\u9650\u3002
   \u26A0\uFE0F **\u5DF2\u7ECF\u914D\u5BF9**\u90A3\u4E00\u6001\u5DE6\u680F\u4F1A\u77ED\u4E00\u622A\uFF08\u914D\u5BF9\u5361\u53EA\u5269\u72B6\u6001 + \u4E00\u53E5\u8BF4\u660E + \u4E24\u9897\u6309\u94AE\uFF09\uFF0C
   \u5DE6\u680F\u4E0B\u65B9\u4E8E\u662F\u7559\u51FA\u4E00\u6BB5\u7A7A\u767D\u3002\u8FD9\u662F**\u5DF2\u77E5\u53D6\u820D**\uFF0C\u4E0D\u8981\u5728\u5DE6\u680F\u8865\u4E00\u5F20\u51D1\u9AD8\u5EA6\u7684\u5361\uFF1A
   \u914D\u5BF9\u662F\u8FD9\u4E00\u9875\u7684\u4E3B\u8981\u573A\u666F\uFF0C\u4E24\u680F\u7684\u9AD8\u5EA6\u662F\u6309\u90A3\u4E00\u6001\u914D\u5E73\u7684\uFF08\u5B9E\u6D4B 678 / 618\uFF09\uFF1B
   \u4E3A\u7A33\u6001\u7684\u7A7A\u767D\u53BB\u52A8\u4E3B\u8981\u573A\u666F\u7684\u7248\u9762\uFF0C\u662F\u672C\u672B\u5012\u7F6E\u3002
   \u26A0\uFE0F **\u8FD9\u4E00\u6574\u6BB5\u90FD\u5728\u6A21\u677F\u5B57\u7B26\u4E32\u91CC\uFF0C\u4E00\u4E2A\u53CD\u5F15\u53F7\u90FD\u4E0D\u80FD\u51FA\u73B0**\uFF08\u51FA\u73B0\u5373\u622A\u65AD CSS\uFF0C\u62A5\u9519\u957F\u5F97\u5F88\u83AB\u540D\u5176\u5999\uFF1A
   tsc \u4F1A\u6307\u7740\u67D0\u4E2A CSS \u9009\u62E9\u5668\u8BF4\u300C',' expected\u300D\uFF09\u30022026-10-09 \u8FD9\u4E00\u5929\u5DF2\u7ECF\u56E0\u6B64\u683D\u4E86**\u4E24\u6B21**\uFF0C
   \u4E24\u6B21\u90FD\u662F\u60F3\u5728\u6CE8\u91CA\u91CC\u5F15\u7528\u4E00\u4E2A CSS \u5C5E\u6027\u540D\u5C31\u987A\u624B\u6253\u4E86\u53CD\u5F15\u53F7\u3002\u21D2 \u5199\u5B8C\u626B\u4E00\u904D\uFF1A
   awk 'NR>=380 && NR<=560 && // {print NR}' packages/plugin/src/client/pill.ts  */
.drc-sec { display: flex; flex-direction: column; gap: 14px; max-width: 720px;
  color: ${hostVar("label-primary")}; }
/* \u62AC\u5934\uFF1A\u6807\u9898 + \u4E00\u53E5"\u8FD9\u4E00\u9875\u662F\u5E72\u4EC0\u4E48\u7684"\u3002\u526F\u6807\u9898\u4E0D\u662F\u88C5\u9970\u2014\u2014\u6CA1\u6709\u5B83\uFF0C\u7B2C\u4E00\u6B21\u8FDB\u6765\u7684\u4EBA
   \u770B\u5230\u7684\u662F\u4E00\u5F20\u6CA1\u6709\u4E0A\u4E0B\u6587\u7684\u4E8C\u7EF4\u7801\u3002 */
.drc-sec-header { display: flex; flex-direction: column; gap: 4px; }
.drc-sec-title { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.4; }
.drc-sec-sub { margin: 0; color: ${hostVar("label-secondary")}; font-size: 13px; line-height: 1.7; }
/* \u56DB\u5F20\u5361\u76F4\u63A5\u8FDB\u7F51\u683C = \u4E00\u4E2A 2\xD72 \u77E9\u9635\u3002
   \u26A0\uFE0F \u7B2C\u4E00\u7248\u662F\u300C\u4E24\u680F\u5404\u5957\u4E00\u4E2A flex \u5217\u300D\uFF0C\u4E24\u680F\u5404\u6392\u5404\u7684 \u21D2 \u7B2C\u4E8C\u884C\u4E24\u5F20\u5361\u7684\u9876\u8FB9\u5DEE\u4E86\u8FD1 300px\uFF0C
   \u6574\u5C4F\u770B\u8FC7\u53BB\u50CF\u4E24\u5F20\u4E0D\u76F8\u5E72\u7684\u5217\u8868\uFF082026-10-09 \u771F\u5C4F\u5E55\u622A\u56FE\uFF09\u3002
   \u26A0\uFE0F \u7B2C\u4E8C\u7248\u7528 align-items:start \u8BA9\u5404\u5361\u4FDD\u6301\u81EA\u7136\u9AD8\u5EA6 \u21D2 \u540C\u4E00\u884C\u91CC\u90A3\u5F20\u77EE\u7684\u5361\u4E0B\u9762\u7A7A\u51FA\u4E00\u5927\u5757\uFF0C
   \u53F3\u8FB9\u6574\u5217\u770B\u7740"\u6389\u4E86\u4E00\u5757"\u3002\u7528\u6237\u8981\u7684\u662F**\u540C\u884C\u7B49\u9AD8**\uFF08\u4E24\u680F\u4ECE\u9876\u5230\u4E00\u6837\u9F50\uFF09\uFF0C
   \u6240\u4EE5\u53BB\u6389 align-items:start\uFF08grid \u9ED8\u8BA4 stretch\uFF09\uFF1B\u591A\u51FA\u6765\u7684\u9AD8\u5EA6\u5206\u7ED9\u5185\u5BB9\u5C45\u4E2D\u7684\u90A3\u5F20\u5361\u3002
   \u26A0\uFE0F \u7B2C\u4E09\u7248\u8981\u7684\u662F\u4E00\u4E2A flex \u884C\u5BB9\u5668\u653E\u6807\u9898+\u52A8\u4F5C\uFF08\u7B2C\u4E00\u7248\u628A headrow \u5F53\u6210\u6807\u9898\u7684\u7C7B\u540D\u7528\u8FC7\uFF0C
   \u90A3\u4E2A flex \u884C\u6839\u672C\u6CA1\u5F62\u6210\uFF0C\u52A8\u4F5C\u53C8\u6389\u56DE\u5E95\u90E8\uFF09\u3002\u89C1 drc-sec-headrow\u3002 */
/**
 * \u4E3B\u533A\uFF1A\u9ED8\u8BA4\u5355\u5217\uFF1B\u5E26 data-two="1" \u65F6\u4E24\u680F**\u5404\u5360\u4E00\u534A\u3001\u5E95\u8FB9\u5BF9\u9F50**\u3002
 *
 * 3.2 \u8D77\u8BBE\u7F6E\u9875\u6052\u4E3A\u4E24\u5F20\u5361\uFF08\u914D\u5BF9 + \u8FDB\u9636\uFF09\uFF0C\u6240\u4EE5\u8FD9\u4E2A\u5C5E\u6027\u6052\u88AB\u8BBE\u4E0A\u2014\u2014\u5B83\u7559\u7740\u662F\u56E0\u4E3A
 * \u300C\u4E24\u5F20\u5E76\u6392\u300D\u8FD9\u4EF6\u4E8B\u5728 DOM \u4E0A\u53EF\u89C1\u3001\u53EF\u6D4B\uFF1B\u800C\u7A84\u5C4F\u4E0B\u5FC5\u987B\u80FD\u9000\u56DE\u5355\u5217\uFF08\u4E0B\u9762\u7684\u5A92\u4F53\u67E5\u8BE2\uFF09\uFF0C
 * \u5426\u5219\u5361\u7247\u4F1A\u88AB\u538B\u5230 180px \u5BBD\uFF0C6 \u4F4D\u7801\u4E0E\u8868\u5355\u5168\u7CCA\u5728\u4E00\u8D77\u3002
 */
.drc-sec-grid { display: grid; gap: 14px; }
/**
 * \u7A84\u680F\u9000\u6210\u4E00\u5217\u3002
 *
 * \u26A0\uFE0F **\u5FC5\u987B\u662F\u4E00\u4E2A\u72EC\u7ACB\u7684 @media \u800C\u4E0D\u662F\u7D27\u8DDF\u5176\u540E\u7684\u7B2C\u4E8C\u6761 \u300Cgrid-template-columns\u300D**\uFF1A
 * \u540C\u4E00\u6761\u89C4\u5219\u91CC\u540E\u5199\u7684\u58F0\u660E\u4F1A**\u9759\u9ED8\u8986\u76D6**\u524D\u4E00\u6761\uFF08CSS \u6CA1\u6709"\u4E24\u6761\u90FD\u751F\u6548"\u8FD9\u56DE\u4E8B\uFF09\uFF0C
 * \u800C\u4EFB\u4F55\u9759\u6001\u68C0\u67E5\u90FD\u770B\u4E0D\u51FA\u6765\uFF08\u4E24\u6761\u58F0\u660E\u90FD\u5408\u6CD5\uFF09\u3002
 *
 * \u26A0\uFE0F \u9009\u62E9\u5668\u8981\u5199\u5230 [data-two="1"] \u8FD9\u4E00\u6863\uFF1A\u53EA\u5199 .drc-sec-grid \u7684\u8BDD\u7279\u5F02\u6027\u4F4E\u4E8E
 * \u90A3\u6761\u4E24\u680F\u89C4\u5219\uFF0C\u7A84\u5C4F\u4E0B\u7167\u6837\u662F\u4E24\u680F\uFF082026-10-21 \u5B9E\u6D4B\uFF09\u3002
 */
@media (max-width: 620px) { .drc-sec-grid,
  .drc-sec-grid[data-two="1"] { grid-template-columns: minmax(0, 1fr); } }
/**
 * \u4E24\u680F\u5404\u5360\u4E00\u534A\uFF082026-10-21\uFF09\uFF1A\u53F3\u5217\u653E\u7684\u662F\u300C\u8FDB\u9636\u300D\u90A3\u5F20\u8868\u5355\uFF0C\u4E0D\u662F\u4E00\u5F20 148px \u7684\u56FE\u3002
 * align-items: stretch \u662F\u7528\u6237\u660E\u786E\u8981\u7684"\u7B49\u9AD8"\uFF1A\u4E24\u5F20\u5361\u5E95\u8FB9\u5BF9\u9F50\uFF0C\u9875\u9762\u4E0B\u534A\u622A\u4E0D\u518D\u662F\u952F\u9F7F\u3002
 */
.drc-sec-grid[data-two="1"] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch; }
/* \u5361\u7247\uFF1A\u5BBF\u4E3B\u7684\u5361\u7247\u662F\u4E00\u6761 1px \u8FB9 + \u4E00\u5C42\u5E95 + 12px \u5706\u89D2\uFF0C\u6211\u4EEC\u7167\u6284\u3002 */
.drc-sec-card { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 16px;
  border: 1px solid ${hostVar("border-l2")}; border-radius: 12px;
  background: ${hostVar("bg-layer-3")}; }
/* \u5361\u7247\u6807\u9898\u6BD4\u5206\u533A\u6807\u9898\u4F4E\u4E00\u6863\uFF1A\u5B83\u662F"\u8FD9\u5F20\u5361\u7684\u8EAB\u4EFD"\uFF0C\u4E0D\u662F"\u8FD9\u4E00\u9875\u7684\u8EAB\u4EFD"\u3002 */
.drc-sec-heading { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.4; }
/* \u72B6\u6001\u90A3\u4E00\u884C\uFF1A\u706F + \u7ED3\u8BBA\uFF0C\u6BD4\u5361\u7247\u6807\u9898\u4F4E\u4E00\u6863\u3001\u6BD4\u6B63\u6587\u7565\u6DE1\u3002 */
/* \u2500\u2500 \u72B6\u6001\u6761\uFF1A\u6574\u680F\u6700\u4E0A\u9762\u4E00\u884C\uFF0C\u7B2C\u4E00\u773C\u56DE\u7B54\u300C\u8FDE\u4E0A\u6CA1\u6709\u300D \u2500\u2500 */
.drc-sec-status { display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 14px; border: 1px solid ${hostVar("border-l1")};
  border-radius: 10px; background: ${hostVar("bg-layer-1")}; }
.drc-sec-statushead { display: flex; align-items: center; gap: 8px; min-width: 0; }
.drc-sec-statustext { font-size: 14px; font-weight: 600; }
.drc-sec-statushint { color: ${hostVar("label-secondary")}; font-size: 12px; }
.drc-sec-statushint:empty { display: none; }

/* \u2500\u2500 \u9875\u811A\uFF1A\u4E09\u6B65 + \u5143\u4FE1\u606F\uFF08\u7B2C\u4E09\u7B49\u5185\u5BB9\uFF0C\u4E0D\u8BE5\u5404\u5360\u4E00\u5F20\u5361\uFF09\u2500\u2500 */
.drc-sec-footer { display: flex; flex-direction: column; gap: 8px; }
.drc-sec-steps { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; padding: 0;
  list-style: none; counter-reset: drc-step; font-size: 13px;
  color: ${hostVar("label-secondary")}; }
.drc-sec-step { display: flex; align-items: center; gap: 6px; }
.drc-sec-step::before { counter-increment: drc-step; content: counter(drc-step);
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  background: ${hostVar("bg-layer-3")}; color: ${hostVar("label-secondary")};
  font-size: 11px; line-height: 1; }
.drc-sec-footnote { margin: 0; font-size: 12px; color: ${hostVar("label-tertiary")}; }
.drc-sec-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px;
  color: ${hostVar("label-tertiary")}; }
.drc-sec-meta:empty { display: none; }
.drc-sec-meta-item { display: inline-flex; gap: 6px; }
.drc-sec-meta-key { color: ${hostVar("label-secondary")}; }
/* \u26A0\uFE0F \u503C\u5FC5\u987B\u6BD4\u952E**\u6DF1**\uFF082026-10-09 \u6DF1\u5EA6 review \u7684 D2\uFF09\uFF1A\u8FD9\u4E00\u683C\u539F\u5148\u6CA1\u6709\u72EC\u7ACB\u89C4\u5219\uFF0C
   \u7EE7\u627F\u4E86 .drc-sec-meta \u7684 label-tertiary\uFF0C\u800C\u952E\u7528\u7684\u662F label-secondary \u2014\u2014
   \u4E8E\u662F\u503C\u6BD4\u952E\u8FD8\u6DE1\uFF0C\u8BFB\u8D77\u6765\u50CF\u300C\u6807\u7B7E\u662F\u5185\u5BB9\u3001\u503C\u662F\u6CE8\u91CA\u300D\u3002

   \u26A0\uFE0F **\u8FD9\u6BB5\u6CE8\u91CA\u91CC\u4E0D\u8BB8\u51FA\u73B0\u53CD\u5F15\u53F7**\uFF1ACSS \u6574\u4F53\u662F\u4E00\u4E2A JS \u6A21\u677F\u5B57\u7B26\u4E32\uFF0C\u53CD\u5F15\u53F7\u4F1A**\u63D0\u524D\u95ED\u5408\u5B83**
   \uFF08\u75C7\u72B6\u662F bundle \u5F53\u573A\u7F16\u8BD1\u5931\u8D25\uFF0C\u62A5\u9519\u8FD8\u6307\u5411\u51E0\u767E\u884C\u4E4B\u5916\u7684 textContent = CSS\uFF09\u3002
   \u4ECA\u665A\u5728\u8FD9\u4E0A\u9762\u683D\u4E86\u4E24\u6B21\u3002 */
.drc-sec-meta-value { color: ${hostVar("label-primary")}; }

/* \u5DF2\u914D\u5BF9\u90A3\u4E00\u652F\uFF1A\u4E00\u884C\u5B57\u5C31\u591F\uFF0C\u4E0D\u5360\u4E00\u6574\u5757 */
.drc-sec-done { display: flex; align-items: center; justify-content: center;
  min-height: 120px; font-size: 14px; }

/* \u914D\u5BF9\u4E8C\u7EF4\u7801\uFF1A**\u7EDD\u5BF9\u7684\u767D\u7EB8**\uFF08\u4E0E pill \u9762\u677F\u540C\u4E00\u4E2A\u7406\u7531\u2014\u2014\u6697\u8272\u4E3B\u9898\u4E0B\u7801\u5FC5\u987B\u8FD8\u662F\u9ED1\u538B\u767D\uFF0C
   \u8DDF\u7740\u4E3B\u9898\u8D70\u5C31\u662F\u4E00\u5F20\u626B\u4E0D\u51FA\u6765\u7684\u7801\uFF09\uFF0C\u56DB\u5468\u7559 8px \u9759\u9ED8\u533A\u3002 */
.drc-sec .drc-qr { display: block; width: 240px; height: 240px; margin: 0 auto; padding: 8px;
  background: ${FIXED_WHITE}; border-radius: 10px; image-rendering: pixelated; }
/* 6 \u4F4D\u7801\uFF1A\u626B\u4E0D\u51FA\u6765\u65F6\u5B83\u662F\u552F\u4E00\u9000\u8DEF\uFF0C\u6240\u4EE5\u5355\u5360\u4E00\u884C\u3001\u7B49\u5BBD\u6570\u5B57\u3001\u62C9\u5B57\u8DDD\u2014\u2014
   \u5B83\u662F\u4E00\u4E32"\u8981\u5FF5\u51FA\u6765\u6572\u8FDB\u53BB"\u7684\u6570\u5B57\uFF0C\u4E0D\u662F\u6B63\u6587\u91CC\u7684\u4E00\u4E2A\u8BCD\u3002 */
.drc-sec-code { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.drc-sec-code-label { color: ${hostVar("label-tertiary")}; font-size: 12px; }
.drc-sec .drc-code { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: 2px;
  text-align: center; font-variant-numeric: tabular-nums; }
.drc-sec .drc-count { margin: 0; text-align: center; color: ${hostVar("label-secondary")};
  font-size: 12px; font-variant-numeric: tabular-nums; }
.drc-sec .drc-count[data-kind="urgent"] { color: ${hostVar("state-warn-primary")}; font-weight: 600; }
/* \u5F15\u5BFC\u53E5\u4E0E\u72B6\u6001\u53E5\u5206\u4E24\u6863\uFF1A\u524D\u8005\u7B54"\u600E\u4E48\u7528"\uFF0C\u540E\u8005\u7B54"\u73B0\u5728\u4EC0\u4E48\u60C5\u51B5"\u3002
   \u5408\u6210\u4E00\u6863\u7684\u540E\u679C\u662F"\u53D1\u4E0D\u51FA\u914D\u5BF9\u7801"\u548C"\u7528\u5FAE\u4FE1\u626B\u8FD9\u5F20\u7801"\u957F\u5F97\u4E00\u6A21\u4E00\u6837\u3002 */
.drc-sec-guide { margin: 0; color: ${hostVar("label-tertiary")}; font-size: 13px; line-height: 1.7; }
.drc-sec-state { margin: 0; color: ${hostVar("label-secondary")}; font-size: 13px; line-height: 1.7; }
.drc-sec-state[data-kind="failed"] { color: ${hostVar("state-error-primary")}; }
/* \u624B\u673A\u7AEF\u90A3\u5F20\u5C0F\u7A0B\u5E8F\u7801\uFF1A\u4E0E\u914D\u5BF9\u4E8C\u7EF4\u7801\u540C\u4E00\u5F20\u767D\u7EB8\uFF0C\u4F46\u5C0F\u4E00\u53F7\u2014\u2014\u5B83\u7B54\u7684\u662F"\u53BB\u54EA\u513F\u88C5\u5BA2\u6237\u7AEF"\uFF0C
   \u4E0D\u662F\u8FD9\u4E00\u5C4F\u7684\u4E3B\u52A8\u4F5C\u3002\u4E24\u5F20\u7801\u540C\u65F6\u51FA\u73B0\uFF0C\u5C3A\u5BF8\u4E0E\u6807\u9898\u5FC5\u987B\u8BA9\u4EBA\u4E00\u773C\u5206\u5F97\u6E05\u54EA\u5F20\u662F\u54EA\u5F20\u3002 */
.drc-mp { display: block; width: 148px; height: 148px; margin: 0 auto; padding: 8px;
  background: ${FIXED_WHITE}; border-radius: 10px; object-fit: contain; }
/* \u540C\u884C\u7B49\u9AD8\u4E4B\u540E\uFF0C\u8FD9\u5F20\u5361\uFF08\u5185\u5BB9\u53EA\u6709\u4E00\u5F20\u5C0F\u56FE + \u4E24\u884C\u5B57\uFF09\u6BD4\u914D\u5BF9\u5361\u77EE\u4E00\u622A\u3002
   justify-content: center \u628A\u5185\u5BB9\u5C45\u4E2D\uFF0C\u591A\u51FA\u6765\u7684\u9AD8\u5EA6\u4E0A\u4E0B\u5206\u4E00\u534A\uFF0C
   \u800C\u4E0D\u662F\u5168\u5806\u5728\u4E0B\u9762\u53D8\u6210\u4E00\u5757\u7A7A\u767D\u3002 */
.drc-sec-card[data-layout="figure"] { justify-content: center; }
.drc-sec-caption { margin: 0; text-align: center; font-size: 13px; font-weight: 600;
  color: ${hostVar("label-primary")}; }
/* \u8FD9\u5F20\u5361\u91CC\u4E09\u6837\u90FD\u5C45\u4E2D\uFF08\u56FE\u3001\u540D\u5B57\u3001\u90A3\u53E5\u8BF4\u660E\uFF09\uFF1A\u56FE\u5C45\u4E2D\u800C\u8BF4\u660E\u5DE6\u5BF9\u9F50\u4F1A\u8BFB\u6210"\u4E24\u5757\u4E1C\u897F"\u3002
   \u8BF4\u660E\u53EA\u6709\u4E00\u4E24\u884C\uFF0C\u5C45\u4E2D\u4E0D\u5F71\u54CD\u626B\u8BFB\u2014\u2014\u957F\u6BB5\u843D\u624D\u9700\u8981\u5DE6\u5BF9\u9F50\u3002 */
.drc-sec-note { margin: 0; text-align: center; color: ${hostVar("label-tertiary")};
  font-size: 12px; line-height: 1.7; }
/* \u52A8\u4F5C\u6392\u5728\u672C\u533A\u5757**\u53F3\u4E0A\u89D2**\uFF082026-10-09 \u7528\u6237\u5B9A\u7684\uFF09\uFF1A\u4E0E\u72B6\u6001\u680F\u90A3\u9897 pill \u7684\u62AC\u5934\u540C\u4E00\u5F62\u72B6
   \uFF08\u90A3\u8FB9\u662F\u300C\u5DE6\u4FA7\u72B6\u6001 + \u53F3\u4FA7\u52A8\u4F5C\u300D\uFF09\uFF0C\u800C\u5361\u7247\u5E95\u90E8\u90A3\u4E00\u6392\u4F1A\u628A\u4E0B\u9762\u7684\u4E8B\u5B9E\u8868\u63A8\u5F97\u66F4\u8FDC\u3002
   margin-left: auto \u662F\u8BA9\u5B83\u4EEC\u8D34\u5230\u6807\u9898\u90A3\u4E00\u884C\u7684\u53F3\u8FB9\u2014\u2014\u5361\u7247\u662F flex \u5217\uFF0C\u6240\u4EE5\u9760\u8FD9\u6761\u63A8\u3002 */
.drc-sec-headrow { display: flex; align-items: flex-start; gap: 12px; }
.drc-sec-headrow .drc-sec-heading { min-width: 0; flex: 1 1 auto; }
.drc-sec-headrow .drc-sec-actions { flex: 0 0 auto; margin-left: auto; }
.drc-sec-btn { appearance: none; font: inherit; font-size: 13px; line-height: 20px;
  padding: 5px 14px; border: 1px solid ${hostVar("border-l1")}; border-radius: 8px;
  background: transparent; color: ${hostVar("label-primary")}; cursor: pointer; }
.drc-sec-btn:hover { background: ${hostVar("interactive-bg-hover")}; }
.drc-sec-btn:focus-visible { outline: 2px solid ${hostVar("brand-primary")}; outline-offset: 1px; }
/* \u4E3B\u52A8\u4F5C\u586B\u8272\uFF0C\u5B57\u7528\u7EDD\u5BF9\u767D\uFF1A\u4E0E\u4E8C\u7EF4\u7801\u90A3\u5F20\u7EB8\u540C\u4E00\u4E2A\u7406\u7531\u2014\u2014\u767D\u5B57\u538B\u54C1\u724C\u8272\u5728\u660E\u6697\u4E24\u5957\u4E3B\u9898\u91CC\u90FD\u6210\u7ACB\u3002
   \u26A0\uFE0F **\u5FC5\u987B\u628A :hover / :focus-visible \u4E00\u5E76\u5217\u51FA\u6765**\uFF082026-10-09 \u771F\u5C4F\u5E55\u622A\u56FE\u6293\u5230\u7684\u767D\u5E95\u767D\u5B57\uFF09\uFF1A
   \u5BBF\u4E3B\u6709\u4E00\u4EFD\u5168\u5C40 button{background:var(--dsw-alias-interactive-bg-hover-solid)} \u7684 reset\uFF0C
   \u800C\u6211\u4EEC\u7684 .drc-sec-btn:hover \u4E0E\u5B83**\u540C\u4E3A (0,2,0)**\uFF0C\u4E14\u90A3\u4EFD\u5BBF\u4E3B\u6837\u5F0F\u8868**\u540E\u52A0\u8F7D**
   \u21D2 \u6307\u9488\u505C\u5728\u6309\u94AE\u4E0A\u65F6\uFF0C\u4E3B\u52A8\u4F5C\u5E95\u8272\u88AB\u538B\u6210\u90A3\u5757\u6D45\u7070\u3001\u5B57\u4ECD\u662F\u7EDD\u5BF9\u767D \u21D2 \u6309\u94AE\u6574\u4E2A\u6D88\u5931\u3002
   \u53EA\u5199 [data-kind="primary"] \u4E00\u6761\u8D62\u4E0D\u4E86 :hover\uFF08\u540C\u4F18\u5148\u7EA7\u3001\u5B83\u5728\u524D\uFF09\u3002
   !important \u4E0D\u8BB8\u7528\uFF1A\u90A3\u662F\u628A\u6574\u4E2A\u5BBF\u4E3B\u9762\u90FD\u8BA9\u51FA\u53BB\uFF0C\u800C\u8FD9\u91CC\u53EA\u8981\u628A\u4E09\u4E2A\u7279\u5F02\u5EA6\u5BF9\u9F50\u3002 */
/* \u586B\u5145\u4E0E\u5B57\u8272\u5404\u62FF\u5404\u7684\u5BBF\u4E3B\u4EE4\u724C\uFF08\u7406\u7531\u89C1 FALLBACK \u91CC\u90A3\u4E24\u6761\u6CE8\u91CA\uFF09\uFF1A\u6D45\u5E95\u5FC5\u987B\u914D\u6DF1\u5B57\uFF0C\u53CD\u4E4B\u4EA6\u7136\u3002
   \u26A0\uFE0F **\u8FD9\u91CC\u4E0D\u8BB8\u518D\u51FA\u73B0 FIXED_WHITE** \u2014\u2014 \u90A3\u5F20\u7EDD\u5BF9\u767D\u53EA\u7559\u7ED9\u4E8C\u7EF4\u7801\u4E0E\u5C0F\u7A0B\u5E8F\u7801\u90A3\u4E24\u5F20\u7EB8
   \uFF08\u80FD\u4E0D\u80FD\u88AB\u626B\u51FA\u6765\u7531\u7801\u70B9\u4E0E\u7EB8\u7684\u5BF9\u6BD4\u5EA6\u51B3\u5B9A\uFF0C\u4E0D\u8BE5\u8DDF\u7740\u4E3B\u9898\u8D70\uFF09\uFF1B
   \u800C\u7ED9\u6309\u94AE\u7684\u6D45\u586B\u5145\u914D\u767D\u5B57\uFF0C\u5C31\u662F"\u6309\u94AE\u6574\u4E2A\u6D88\u5931"\u7684\u90A3\u4E2A\u5F62\u72B6\u3002 */
.drc-sec-btn[data-kind="primary"] { border-color: transparent;
  background: ${hostVar("button-primary-fill")}; color: ${hostVar("label-primary-foreground")}; }
.drc-sec-btn[data-kind="primary"]:hover { border-color: transparent;
  background: ${hostVar("button-primary-fill")}; color: ${hostVar("label-primary-foreground")}; }
.drc-sec-btn[data-kind="primary"]:focus-visible { border-color: transparent;
  background: ${hostVar("button-primary-fill")}; color: ${hostVar("label-primary-foreground")};
  outline: 2px solid ${hostVar("brand-primary")}; outline-offset: 1px; }
/* \u2500\u2500 \u5C0F\u7A0B\u5E8F\u7801\u8FD8\u5728\u8DEF\u4E0A\uFF1A\u90A3\u4E00\u683C\u7684\u5360\u4F4D \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u90A3\u4E00\u683C\u4E0D\u662F\u672C\u5730\u6587\u4EF6\uFF1A\u5BBF\u4E3B\u8981**\u4E2D\u7EE7\u62FF\u7740 appSecret \u53BB\u5FAE\u4FE1\u90A3\u8FB9\u7B7E\u4E00\u5F20\u7801**\u624D\u56DE\u5F97\u6765
   \uFF08\u4E00\u6B21\u5F80\u8FD4 1\uFF5E3 \u79D2\uFF09\uFF0C\u800C\u5C4F\u5E55\u8FD9\u4E00\u4FA7\u662F <img>\uFF0C\u5B83\u5728\u843D\u5730\u4E4B\u524D\u5C31\u662F\u4E00\u4E2A**\u7A7A\u6846**\u2014\u2014
   \u5206\u4E0D\u6E05\u300C\u6B63\u5728\u53D6\u300D\u4E0E\u300C\u53D6\u4E0D\u5230\u300D\uFF0C\u800C\u8FD9\u4E24\u79CD\u7684\u4E0B\u4E00\u6B65\u5B8C\u5168\u4E0D\u540C\u3002
   \u21D2 \u7528\u4E00\u4E2A**\u7B49\u5927\u7684**\u5360\u4F4D\u9876\u4F4F\uFF1A\u56FE\u5230\u4E86\u628A\u5B83\u6536\u6389\uFF0C\u53D6\u4E0D\u5230\u5C31\u6362\u6210\u4E00\u53E5\u4EBA\u8BDD\u3002
   \u26A0\uFE0F \u5360\u4F4D\u5FC5\u987B\u4E0E\u56FE**\u540C\u6837\u5927\u5C0F**\uFF08\u9762\u677F 200\xD7200 / \u8BBE\u7F6E\u9875 240\xD7240 + 8px \u5185\u8FB9\u8DDD\uFF09\uFF0C
   \u5426\u5219\u56FE\u4E00\u5230\u6574\u5757\u5C31\u8DF3\u4E00\u4E0B\u3002 */
.drc-qr-loading { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; width: 200px; height: 200px; margin: 8px auto 0; padding: 0;
  background: ${FIXED_WHITE}; color: ${hostVar("label-secondary")};
  font-size: 12px; line-height: 1.6; text-align: center; }
.drc-sec .drc-qr-loading { width: 240px; height: 240px; margin: 0 auto; padding: 8px; border-radius: 10px; }
.drc-spinner { width: 18px; height: 18px; flex: 0 0 auto; border-radius: 50%;
  border: 2px solid ${hostVar("border-l1")}; border-top-color: ${hostVar("brand-primary")};
  animation: drc-spin 0.9s linear infinite; }
@keyframes drc-spin { to { transform: rotate(360deg); } }
/* \u53D6\u4E0D\u5230\u5C31\u4E0D\u8BB8\u518D\u8F6C\uFF1A\u8F6C\u5708\u53EA\u8868\u793A\u300C\u8FD8\u5728\u7B49\u300D\uFF0C\u800C\u5B83\u5DF2\u7ECF\u4E0D\u6210\u7ACB\u4E86\u3002
   \u26A0\uFE0F \u5931\u8D25\u90A3\u4E00\u6863\u8981\u6362\u6210\u4E00\u53E5\u80FD\u6307\u8DEF\u7684\u5B9E\u8BDD\uFF08\u7EA2\u5B57\uFF09\uFF0C\u4E0D\u662F\u4E00\u7247\u7070\u3002 */
.drc-qr-loading[data-state="failed"] { color: ${hostVar("state-error-primary")}; }
.drc-qr-loading[data-state="failed"] .drc-spinner { display: none; }
.drc-qr-loading-hint { color: ${hostVar("label-tertiary")}; }
/* \u56FE\u6CA1\u5230\u4E4B\u524D\uFF0C\u90A3\u4E2A\u7A7A\u6846\u4E0D\u8BB8\u9732\u51FA\u6765\uFF08\u6D4F\u89C8\u5668\u4F1A\u7ED9\u672A\u52A0\u8F7D\u7684 img \u753B alt \u6587\u672C\uFF0C
   \u5931\u8D25\u7684\u90A3\u4E00\u5F20\u4F1A\u753B\u6210\u4E00\u5F20\u7834\u56FE\uFF09\u3002
   \u26A0\uFE0F \u8FD9\u6761\u5FC5\u987B\u6392\u5728 .drc-sec .drc-qr **\u4E4B\u540E**\uFF1A\u4E24\u8005\u7279\u5F02\u5EA6\u76F8\u540C\uFF08\u90FD\u662F\u4E24\u4E2A\u7C7B\uFF09\uFF0C
   \u540E\u5199\u7684\u8D62\uFF1B\u5199\u5728\u524D\u9762\u7684\u4F1A\u88AB\u540E\u9762\u90A3\u6761 display:block \u6574\u6761\u8986\u76D6\u6389\uFF082026-10-06 \u8E29\u8FC7\u540C\u4E00\u5F62\u72B6\uFF09\u3002 */
.drc-qr[data-load="loading"], .drc-qr[data-load="failed"] { display: none; }
`;
function isSlots(value) {
  if (!value || typeof value !== "object") return false;
  const record = value;
  return typeof record.inject === "function" && typeof record.register === "function";
}
function pickSlots(source) {
  if (isSlots(source)) return source;
  const asGettable = source;
  if (asGettable && typeof asGettable.get === "function") {
    try {
      const got = asGettable.get("slots", true);
      if (isSlots(got)) return got;
    } catch {
    }
  }
  return void 0;
}
function findCreateElement() {
  try {
    if (typeof require !== "function") return void 0;
    const moduleId = "react";
    const react = require(moduleId);
    const create = react?.createElement ?? react?.default?.createElement;
    return typeof create === "function" ? create : void 0;
  } catch {
    return void 0;
  }
}
function warn(message, error) {
  try {
    const detail = error instanceof Error ? error.message : error === void 0 ? "" : String(error);
    console.warn(`[dsh-remote-control pill] ${message} ${detail}`);
  } catch {
  }
}
function warnSection(message, error) {
  try {
    const detail = error instanceof Error ? error.message : error === void 0 ? "" : String(error);
    console.warn(`[dsh-remote-control settings] ${message} ${detail}`);
  } catch {
  }
}
function ensureStyle(doc) {
  try {
    const existing = doc.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
    if (existing) {
      existing.setAttribute("data-plugin", PLUGIN_ID);
      if (existing.textContent !== CSS) existing.textContent = CSS;
      return;
    }
    const element = doc.createElement("style");
    element.setAttribute("data-plugin-css", STYLE_ID);
    element.setAttribute("data-plugin", PLUGIN_ID);
    element.textContent = CSS;
    doc.head.appendChild(element);
  } catch (error) {
    warn("\u6837\u5F0F\u6CE8\u5165\u5931\u8D25\uFF08pill \u4ECD\u53EF\u7528\uFF0C\u53EA\u662F\u6CA1\u914D\u8272\uFF09", error);
  }
}
function requestSignal() {
  try {
    const timeouts = globalThis.AbortSignal;
    return typeof timeouts?.timeout === "function" ? timeouts.timeout(FETCH_TIMEOUT_MS) : void 0;
  } catch {
    return void 0;
  }
}
function buildPill(root, deps) {
  const doc = root.ownerDocument;
  ensureStyle(doc);
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "drc-pill";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  const dot = doc.createElement("span");
  dot.className = "drc-dot";
  dot.setAttribute("aria-hidden", "true");
  const label = doc.createElement("span");
  label.className = "drc-label";
  button.appendChild(dot);
  button.appendChild(label);
  root.appendChild(button);
  let panel;
  let statusTimer;
  let countTimer;
  let view = { kind: "info" };
  let expiresInMs = 0;
  let expiresAt = 0;
  let lastStatus;
  let awaitingStatus = false;
  let polling = false;
  let countNode;
  let disposed = false;
  const mpCode = createMpCodeImage(doc, () => {
    if (!disposed) paint();
  });
  const pairingNow = () => pairingCount(lastStatus);
  const degrade = (message, error) => {
    if (!deps.warn) {
      warn(message, error);
      return;
    }
    try {
      const detail = error instanceof Error ? error.message : error === void 0 ? "" : String(error);
      deps.warn(`${message} ${detail}`.trim());
    } catch {
    }
  };
  const fetchWithTimeout = (input, init) => {
    const signal = requestSignal();
    return deps.fetchImpl(input, signal ? { ...init, signal } : init);
  };
  const stopCountdown = () => {
    if (countTimer !== void 0) {
      clearInterval(countTimer);
      countTimer = void 0;
    }
    expiresInMs = 0;
    expiresAt = 0;
  };
  const syncCountdown = () => {
    expiresInMs = Math.max(0, expiresAt - Date.now());
    return expiresInMs > 0;
  };
  const expireCountdown = () => {
    if (countTimer !== void 0) {
      clearInterval(countTimer);
      countTimer = void 0;
    }
    expiresAt = 0;
    expiresInMs = 0;
    paint();
    void requestPairing();
  };
  const write = () => {
    const next = pillLabel(lastStatus);
    label.textContent = next.text;
    dot.setAttribute("data-tone", next.tone);
    button.setAttribute("title", `dsh-remote-control\uFF1A${next.text}`);
    button.setAttribute("aria-label", next.text);
  };
  const text = (tag, className, content) => {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = content;
    return node;
  };
  const buttonOf = (content, onClick) => {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = "drc-btn";
    node.textContent = content;
    node.addEventListener("click", onClick);
    return node;
  };
  const qrNote = () => expiresInMs > 0 ? "" : "\u914D\u5BF9\u7801\u5DF2\u8FC7\u671F \u70B9\u53F3\u4E0A\u89D2\u5237\u65B0\u91CD\u65B0\u751F\u6210";
  const countdown = () => {
    countNode = void 0;
    if (view.kind !== "qr") return null;
    if (expiresInMs <= 0) return null;
    const node = text("p", "drc-count", `${secondsText(expiresInMs)}\u540E\u8FC7\u671F`);
    if (expiresInMs <= 3e4) node.setAttribute("data-kind", "urgent");
    countNode = node;
    return node;
  };
  const paintCountdown = () => {
    if (!panel || view.kind !== "qr") return;
    const node = countNode;
    if (!node) {
      paint();
      return;
    }
    node.textContent = `${secondsText(expiresInMs)}\u540E\u8FC7\u671F`;
    if (expiresInMs <= 3e4) node.setAttribute("data-kind", "urgent");
  };
  const qrImage = (src) => mpCode.element(src);
  const header = () => {
    const head = doc.createElement("div");
    head.className = "drc-head";
    const state = pillLabel(lastStatus);
    const stateText = text("span", "drc-head-label", state.text);
    stateText.setAttribute("data-tone", state.tone);
    head.appendChild(stateText);
    const actions = doc.createElement("div");
    actions.className = "drc-actions";
    const action = pairingNow() > 0 ? { label: "\u9000\u51FA\u914D\u5BF9", run: requestUnpair } : { label: "\u5237\u65B0", run: requestPairing };
    actions.appendChild(buttonOf(action.label, () => void action.run()));
    head.appendChild(actions);
    return head;
  };
  const offlineNote = () => {
    if (!lastStatus) return null;
    if (pillLabel(lastStatus).text !== ZH.phoneAway) return null;
    return text("p", "drc-note", "\u4E0D\u7528\u91CD\u65B0\u626B\u7801");
  };
  const infoRows = () => {
    if (!lastStatus) return [];
    const rows = [
      // 排第一：它是唯一一条"看完要做点什么"的，其余三条都是"知道就行"。
      ["\u5F85\u5904\u7406", waitingRow(lastStatus)],
      ["\u4E2D\u7EE7", relayRow(lastStatus)],
      ["\u72B6\u6001", relayStateRow(lastStatus)],
      ["\u7248\u672C", versionRow(lastStatus)]
    ];
    return rows.filter(([, value]) => value !== "").map(([key, value]) => {
      const row = doc.createElement("div");
      row.className = "drc-info";
      row.appendChild(text("span", "drc-key", key));
      row.appendChild(text("span", "drc-value", value));
      return row;
    });
  };
  const paint = () => {
    if (!panel) return;
    panel.replaceChildren();
    panel.appendChild(header());
    appendApprovalBlock(panel);
    if (view.kind === "loading") {
      panel.appendChild(text("p", "drc-note", awaitingStatus ? "\u6B63\u5728\u8BFB\u53D6\u4E3B\u673A\u72B6\u6001" : "\u6B63\u5728\u751F\u6210\u914D\u5BF9\u7801"));
    } else if (view.kind === "offline") {
      panel.appendChild(text("p", "drc-note drc-note-block", "\u4E3B\u673A\u8FD8\u6CA1\u8FDE\u4E0A\u4E2D\u7EE7 \u73B0\u5728\u53D1\u4E0D\u51FA\u914D\u5BF9\u7801"));
      panel.appendChild(text("p", "drc-note", "\u4E2D\u7EE7\u6062\u590D\u540E\u70B9\u53F3\u4E0A\u89D2\u5237\u65B0 \u8FD9\u91CC\u4F1A\u51FA\u73B0\u4E8C\u7EF4\u7801"));
    } else if (view.kind === "qr") {
      const count = countdown();
      if (count) panel.appendChild(count);
      const image = qrImage(view.imageSrc);
      const loadState = mpCode.state();
      if (loadState !== "ready") panel.appendChild(mpCodeLoadingBox(doc, loadState));
      panel.appendChild(image);
      panel.appendChild(text("p", "drc-guide", GUIDE_LINE));
      panel.appendChild(text("p", "drc-code", view.token));
      const note2 = qrNote();
      if (note2 !== "") panel.appendChild(text("p", "drc-note", note2));
    } else if (view.kind === "unavailable" || view.kind === "failed") {
      const note2 = view.kind === "unavailable" ? text("p", "drc-note", view.reason) : (() => {
        const node = text("p", "drc-note", `\u914D\u5BF9\u8BF7\u6C42\u6CA1\u6210\u529F\uFF1A${view.detail}`);
        node.setAttribute("data-kind", "failed");
        return node;
      })();
      panel.appendChild(note2);
    }
    for (const row of infoRows()) panel.appendChild(row);
    const note = offlineNote();
    if (note) panel.appendChild(note);
  };
  const closePanel = () => {
    awaitingStatus = false;
    stopCountdown();
    if (panel) {
      panel.remove();
      panel = void 0;
    }
    button.setAttribute("aria-expanded", "false");
  };
  const openPanelView = () => {
    const relay = lastStatus?.relay;
    if (relay !== void 0 && relay !== "online") {
      stopCountdown();
      view = { kind: "offline" };
      paint();
      return;
    }
    if (pairingNow() > 0) {
      stopCountdown();
      view = { kind: "info" };
      paint();
      return;
    }
    void requestPairing();
  };
  async function requestPairing() {
    if (disposed || !panel) return;
    awaitingStatus = false;
    if (lastStatus && lastStatus.relay !== "online" && lastStatus.relay !== void 0) {
      stopCountdown();
      view = { kind: "offline" };
      paint();
      return;
    }
    view = { kind: "loading" };
    mpCode.invalidate();
    paint();
    let answer;
    let httpStatus = 0;
    try {
      const response = await fetchWithTimeout(NEW_ROUTE, {
        method: "POST",
        headers: { "x-drc-pair": "1" },
        credentials: "same-origin"
      });
      httpStatus = typeof response?.status === "number" ? response.status : 0;
      answer = await response?.json?.();
    } catch (error) {
      stopCountdown();
      view = { kind: "failed", detail: error instanceof Error ? error.message : String(error) };
      paint();
      return;
    }
    if (disposed || !panel) return;
    view = panelViewFor(answer, httpStatus);
    if (view.kind !== "qr") {
      stopCountdown();
      paint();
      return;
    }
    expiresInMs = view.expiresInMs;
    expiresAt = Date.now() + view.expiresInMs;
    if (countTimer === void 0) {
      countTimer = setInterval(() => {
        if (!syncCountdown()) {
          expireCountdown();
          return;
        }
        paintCountdown();
      }, 1e3);
    }
    paint();
  }
  async function requestUnpair() {
    if (disposed || !panel) return;
    try {
      const response = await fetchWithTimeout(UNPAIR_ROUTE, {
        method: "POST",
        headers: { "x-drc-pair": "1" },
        credentials: "same-origin"
      });
      const httpStatus = typeof response?.status === "number" ? response.status : 0;
      if (httpStatus !== 200) {
        const body = await response?.json?.();
        const why = typeof body?.error === "string" ? body.error : "no response";
        const guard = typeof body?.guard === "string" ? ` guard=${body.guard}` : "";
        degrade(`\u9000\u51FA\u914D\u5BF9\u88AB\u4E3B\u673A\u62D2\u4E86\uFF08HTTP ${httpStatus} ${why}${guard}\uFF1B\u9762\u677F\u4F1A\u9760\u4E0B\u4E00\u6B21\u8F6E\u8BE2\u5BF9\u8D26\uFF09`);
      }
    } catch (error) {
      degrade("\u9000\u51FA\u914D\u5BF9\u8BF7\u6C42\u5931\u8D25\uFF08\u9762\u677F\u4F1A\u9760\u4E0B\u4E00\u6B21\u8F6E\u8BE2\u5BF9\u8D26\uFF09", error);
    }
    if (disposed || !panel) return;
    if (lastStatus) lastStatus = { ...lastStatus, paired: 0, pairings: 0 };
    write();
    view = { kind: "loading" };
    paint();
    void requestPairing();
  }
  const openPanel = () => {
    if (panel || disposed) return;
    panel = doc.createElement("div");
    panel.className = "drc-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "dsh-remote-control \u914D\u5BF9");
    panel.tabIndex = -1;
    root.appendChild(panel);
    button.setAttribute("aria-expanded", "true");
    if (!lastStatus) {
      awaitingStatus = true;
      view = { kind: "loading" };
      paint();
    } else {
      openPanelView();
    }
    try {
      panel.focus();
    } catch {
    }
  };
  const inside = (candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    try {
      return root.contains(candidate) || (panel?.contains(candidate) ?? false);
    } catch {
      return false;
    }
  };
  const onPointerDown = (event) => {
    if (!panel) return;
    if (inside(event?.target)) return;
    closePanel();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closePanel();
  };
  const settlePanel = () => {
    if (!panel || !lastStatus) return;
    if (view.kind === "qr") {
      const relay = lastStatus.relay;
      if (relay !== void 0 && relay !== "online") {
        stopCountdown();
        view = { kind: "offline" };
      } else if (pairingNow() > 0) {
        stopCountdown();
        view = { kind: "info" };
      }
      paint();
      return;
    }
    if (view.kind === "info" && pairingNow() === 0) {
      openPanelView();
      return;
    }
    if (awaitingStatus) {
      awaitingStatus = false;
      openPanelView();
      return;
    }
    paint();
  };
  const settleFailedStatus = (reason) => {
    if (!panel || !awaitingStatus) return;
    awaitingStatus = false;
    stopCountdown();
    view = { kind: "failed", detail: `\u8BFB\u4E0D\u5230\u4E3B\u673A\u72B6\u6001\uFF08${reason}\uFF09` };
    paint();
  };
  let lastApproval = null;
  const appendApprovalBlock = (target) => {
    if (lastApproval === null) return;
    const approval = lastApproval;
    target.appendChild(text("p", "drc-sas", approval.sas));
    target.appendChild(text("p", "drc-note drc-note-block", "\u624B\u673A\u4E0A\u4E5F\u663E\u793A\u8FD9\u4E32\u6570\u5B57 \u4E24\u5904\u4E0D\u4E00\u81F4\u5C31\u5728\u624B\u673A\u4E0A\u9009\u4E0D\u4E00\u81F4"));
  };
  async function pollStatus() {
    if (disposed || polling) return;
    try {
      if (doc.visibilityState === "hidden") return;
    } catch {
    }
    polling = true;
    try {
      const response = await fetchWithTimeout(`${STATUS_ROUTE}?t=${Date.now()}`, {
        headers: { accept: "application/json" },
        credentials: "same-origin"
      });
      if (!response || response.status !== 200) {
        const reason = `HTTP ${typeof response?.status === "number" ? response.status : "no response"}`;
        degrade(`status poll failed\uFF08${reason}\uFF09`);
        settleFailedStatus(reason);
        return;
      }
      const body = await response.json?.();
      if (!body || typeof body !== "object") {
        degrade("status poll failed\uFF08\u56DE\u7B54\u4E0D\u662F\u5BF9\u8C61\uFF09");
        settleFailedStatus("\u56DE\u7B54\u4E0D\u662F\u5BF9\u8C61");
        return;
      }
      lastStatus = body;
      const rawPending = body.pairApproval;
      const rawLast = body.lastPairApproval;
      const readApproval = (raw) => raw && typeof raw === "object" && typeof raw.sas === "string" ? {
        sas: raw.sas,
        remainSec: typeof raw.remainSec === "number" ? raw.remainSec : 0
      } : null;
      const nextApproval = readApproval(rawPending) ?? readApproval(rawLast);
      const same = (nextApproval?.sas ?? "") === (lastApproval?.sas ?? "") && (nextApproval?.remainSec ?? -1) === (lastApproval?.remainSec ?? -1);
      if (!same) lastApproval = nextApproval;
      settlePanel();
      write();
    } catch (error) {
      degrade("status poll failed\uFF08pill \u4F1A\u505C\u5728\u9ED8\u8BA4\u6587\u6848\u4E0A\uFF09", error);
      settleFailedStatus("\u8BF7\u6C42\u5931\u8D25");
    } finally {
      polling = false;
    }
  }
  button.addEventListener("click", () => {
    if (panel) closePanel();
    else openPanel();
  });
  const resyncCountdown = () => {
    if (disposed || countTimer === void 0) return;
    if (!syncCountdown()) {
      expireCountdown();
      return;
    }
    paintCountdown();
  };
  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("keydown", onKeyDown);
  doc.addEventListener("visibilitychange", resyncCountdown);
  write();
  void pollStatus();
  statusTimer = setInterval(() => void pollStatus(), POLL_MS);
  return () => {
    if (disposed) return;
    disposed = true;
    if (statusTimer !== void 0) clearInterval(statusTimer);
    closePanel();
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("keydown", onKeyDown);
    doc.removeEventListener("visibilitychange", resyncCountdown);
    button.remove();
  };
}
function mountPill(ctx, createElement) {
  if (!createElement) {
    warn("\u88C5\u8F7D\u5668\u7ED9\u4E0D\u51FA react\uFF1A\u914D\u5BF9\u90A3\u9897 pill \u4E0D\u4F1A\u51FA\u73B0");
    return false;
  }
  let mounted = false;
  const mount = (slots) => {
    if (mounted) return;
    let cleanup;
    const attach = (node) => {
      const element = node;
      if (element && typeof element.appendChild === "function" && element.ownerDocument) {
        if (cleanup) return;
        element.style.position = "relative";
        cleanup = buildPill(element, {
          // 0.2.1 桌面版的页面在 `dsh-app://` 上：相对路径的 fetch 根本不出门（status 0）。
          // 统一经宿主 origin 解析，见 host-url.ts。
          fetchImpl: (input, init) => globalThis.fetch(resolveHostUrl(String(input)), init),
          // 降级留痕的出口：不接上它，"status 路由没挂上"这类降级在页面上就一声不响
          // （`deps.warn` 在那之前是个死参数，2026-10-06 修）。
          warn: (message) => {
            try {
              console.warn(`[dsh-remote-control pill] ${message}`);
            } catch {
            }
          }
        });
      } else if (cleanup) {
        cleanup();
        cleanup = void 0;
      }
    };
    const component = () => createElement("span", { ref: attach });
    mounted = true;
    try {
      slots.inject(SLOT_NAME, () => {
        try {
          slots.register({ name: SLOT_NAME, id: PILL_ID, order: PILL_ORDER, inject: () => ({}) }, component);
        } catch (error) {
          warn("\u69FD\u4F4D\u6CE8\u518C\u5931\u8D25\uFF08\u90A3\u9897 pill \u4E0D\u51FA\u73B0\uFF09", error);
        }
      });
    } catch (error) {
      mounted = false;
      warn("\u69FD\u4F4D\u6CE8\u5165\u5931\u8D25\uFF08\u90A3\u9897 pill \u4E0D\u51FA\u73B0\uFF09", error);
      return;
    }
    try {
      ctx.effect?.(() => () => {
        if (cleanup) {
          cleanup();
          cleanup = void 0;
        }
      });
    } catch {
    }
  };
  let early;
  try {
    early = pickSlots(ctx.slots) ?? pickSlots(ctx.get?.("slots", true));
  } catch {
  }
  if (early) mount(early);
  try {
    ctx.inject?.(["slots"], ((...args) => {
      for (const candidate of [...args, ctx]) {
        const found = pickSlots(candidate);
        if (found) {
          mount(found);
          return;
        }
      }
    }));
  } catch (error) {
    warn("ctx.inject \u53E3\u4E0D\u53EF\u7528\uFF1Aslots \u518D\u665A\u5230\u4E5F\u6CA1\u4EBA\u8865\u6302", error);
  }
  if (!mounted) {
    warn("apply \u65F6\u6CA1\u63A2\u5230 slots\uFF08\u5DF2\u6302\u6CE8\u5165\u56DE\u8C03\u7B49\u5B83\u665A\u5230\uFF09\uFF1Bpill \u4E00\u76F4\u4E0D\u51FA\u73B0\u5C31\u662F\u8FD9\u4EE3\u5BBF\u4E3B\u6CA1\u8FD9\u4E2A\u670D\u52A1");
  }
  return mounted;
}

// src/copy/app-qr.ts
var APP_DOWNLOAD_URL = "https://github.com/YaoyaoDeBaba/dsh-pc-to-androidphone/releases/latest/download/app-debug.apk";
var APP_QR_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAeAAAAHgCAYAAAB91L6VAAAAAklEQVR4AewaftIAABBeSURBVO3BwXEkuoIDMFI1+afMfRmsDm112R9A958AAE+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM/9yw9pG/5/2/IT2uabtuXT2ubWtnxa2/w123KrbW5ty422ubUtn9Y2t7bl09rmJ2zLjbbhzrZ82gkA8NwJAPDcCQDw3AkA8NwJAPDcCQDw3AkA8NwJAPDcCQDw3L982bb8RW3z12zLp7XNX7Qtn9Y237Qtt9rm09rm07blVtvc2pYb23Krbb5pW/6atvmmEwDguRMA4LkTAOC5EwDguRMA4LkTAOC5EwDguRMA4LkTAOC5EwDguX/5Rdrmm7blm9rm07blVtt82rbcaptbbfNNbfMbtM2tbbm1LTfa5ta23GqbG21za1u40zbftC2/wQkA8NwJAPDcCQDw3AkA8NwJAPDcCQDw3AkA8NwJAPDcCQDw3AkA8Ny/wKVt+bS2+QnbcqNtbm3Lp7XNrW251TY3tuWbtuVW23zattxqm0/bllvbwt9yAgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADz3L/xJ23KjbW5tC3fa5tPa5ta23Gibn7Atn7Ytn9Y2t7blVtvcaJtb28LfcgIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPPcvv8i2cKdtPq1tPm1bbrXNX7Mtv8W23GqbT9uWW21zY1tutc2tbflfti38/04AgOdOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA504AgOf+5cvahs/blhttc2tbbrUNn9U2t7blN9iWW21za1tutM2tbbnVNje25Vbb3NqWT2sbPusEAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeK77T/gV2ubWtnxa23zTttxqm0/blt+ibT5tW36Ltvm0bYFPOgEAnjsBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnvuXH9I2N7blVtv8Ndtya1tutc2Nbbm1Lbfa5sa2fNO23GqbW9vyv6xtPm1bPm1bbrXNrW250Ta3tuXT2uYv2pbf4AQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO5fvqxtfsK2/AZt8xO2he9pm7+mbX6LbbnRNj+hbT6tbf6abbnVNp/WNre25dNOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA504AgOe6/+SL2uabtuUntM2NbbnVNr/Fttxom99iW261zY1tudU2t7blN2ib32Jbvqltbm3LN7XNjW35X3YCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADz3Lz+kbW5sy622ubUtN9rmJ2zLjba5tS232ubTtuW32JYbbfNbbMuttrmxLd+0Lbfa5q9pm5/QNje25Vbb3NqWG21za1v+mhMA4LkTAOC5EwDguRMA4LkTAOC5EwDguRMA4LkTAOC5EwDguRMA4LnuP/kBbfNp2/JNbfNN2/JpbXNrW261zY1tudU2n7Ytt9rm1rbcaJufsC032ua32JZbbXNjW261za1tudE2t7blr2mbb9qWbzoBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnuv+ky9qm5+wLTfa5idsy1/TNre25dPa5ta2fFPb3NgWPq9tbmzLN7XNb7Ett9rmxrb8hLb5tG35tBMA4LkTAOC5EwDguRMA4LkTAOC5EwDguRMA4LkTAOC5EwDguRMA4Ll/+SFtc2NbbrXNrba5sS0/oW1ubMuttrm1Lb9B2/yEtvm0bfmmtrm1LTfa5pu25VbbfFrbfNO23GqbT9uWW23zTW3zadvyTScAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHP/8mVtc2tbbrXNjbb5Cdvy12zLp23LT2ibb9qWT9uWW23zTdvyTdvyv2xbbrTNrW251TY32ubWtvw1JwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBz//Jl23KrbX6Ltvm0bbnVNje25Se0zadty6dty622ubUt37QtN9rmJ7TNb9A237Qtt7blVtvc2JZbbXNrWz6tbW5ty29wAgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA89y8/ZFu+aVtutM1P2JYbbfNbtM03tc2ntc2tbbnVNt+0Ld+0LZ/WNn9N2/yEbbnRNj+hbb6pbW5syzedAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADP/csf1TY3tuVW29xqm09rm1vbcqNtbm3Lp7XNrW251TY3tuWbtuW32JZv2pZbbfNN2/JpbfNN23Krbb5pW36DEwDguRMA4LkTAOC5EwDguRMA4LkTAOC5EwDguRMA4LkTAOC5f/mytrm1Ld+0LZ/WNre25bdomxvbcqttfott+bS2ubUtN7blVtvc2pZPa5tP25af0Dafti3/y7blrzkBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnjsBAJ7r/pMvaptb23KrbT5tW261zTdty422ubUtn9Y237QtP6Ft+P9ty09om2/aFv5/bfMTtuU3OAEAnjsBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnvuXH9I2N7blL9qWG21za1u+qW2+aVtutc2ntc2tbbnRNj9hWz6tbW5ty422+QnbcqNtfkLb8P/blp/QNp+2LZ92AgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADz3L//jtuVW23zatnzTttxqm1vb8mlt82lt803b8hPa5sa23NqWW23zTW3zadtyq21ubMuttrm1LZ/WNr/FtvwGJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAc//yQ7bl09rmt9iWG23zE7bl07blVtv8NdvyTW3zaW3zE7blm9rmm7blRtvc2pbfYltutM2tbflrTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA57r/5Ae0zY1tudU2t7blm9rmxrZ8U9v8hG250Ta3tuXT2ubWtnxT29zalhtt8xdty422+Qnbwv+vbX7Cttxom1vb8mknAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHPdf/JFbXNrW/6atrm1Lbfahv/fttxqm99iWz6tbW5ty422ubUtn9Y2t7bl09rm1rbcapu/Zltutc2nbcunnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz/3LD2mbT2ubv2ZbfsK23Gibn7AtN9rmL9qWT2ubT2ubW9vyadtyq20+bVt+Qtvc2JZbbXNrWz6tbT5tW37CtvwGJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAc//yi2zLp7XNrW35tLb5pm251Ta32ubGtvwW2/JpbfMT2ubT2ubWtvD/a5v/ZW1za1s+rW1ubcunnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADP/csP2ZYbbXOrbW5ty41tudU2n7YtP6FtbrTNT9iWb2qbG9tyq21ubcunbcuntc03tc1P2JZPa5tb23KjbX6Lbfm0trnVNre25Tc4AQCeOwEAnjsBAJ47AQCeOwEAnjsBAJ47AQCeOwEAnjsBAJ47AQCe+5cf0jY3tuVW23zTtnxa2/yEbfkN2ua32JZbbXNjW261zadty09omxvb8k1t8xPa5pva5jfYlp/QNr/BCQDw3AkA8NwJAPDcCQDw3AkA8NwJAPDcCQDw3AkA8NwJAPDcCQDw3L/wI9rmxrbcaptPa5tb23KrbW5sy1+0LTfa5ta2fFrb3NqWW9tyo21ubcuttrmxLbfa5ta2fFPbfNq2fFrb3NqWW9vyG5wAAM+dAADPnQAAz50AAM+dAADPnQAAz50AAM+dAADPnQAAz/3LL7Itn9Y2P2FbbrTNrW251Taf1ja3tuVG29zalltt82nbcqttPq1tfou2ubEtt9rmm7bl09rm1rb8Fm3zTW3zadvyaScAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHP/8ke1zY1tudU2t9rmxrbcaptv2pZbbfNN2/JpbfNN2/JpbfNNbfNbtM2tbbmxLbfa5pva5tO25Vbb3NqWG23zTScAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHPdf8Kv0Da3tuVG2/yEbfmmtrmxLbfa5q/Zlltt81tsy422ubUtt9rmm7blm9rmxrb8hLb5tG35tBMA4LkTAOC5EwDguRMA4LkTAOC5EwDguRMA4LkTAOC5EwDguX/5IW3D/29bbm3LX9M2t7bl1rbcaJufsC3f1Dafti232uab2ubGtvwva5tb2/JNbXNrW36DEwDguRMA4LkTAOC5EwDguRMA4LkTAOC5EwDguRMA4LkTAOC5EwDgue4/+QFtc2Nb/qK2ubEtt9rm1rbcaJvfYltutQ2ftS2f1ja3tuVW23zatnxa2/yEbfmmtvm0bbnVNje25ZtOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDn/uUXaZtv2hb+lm35pra5tS232ubGtvyEtrmxLbfa5ta2fFrb3NqWG9tyq21utc1vsC232ubWtvwGJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBz/8Kf1DY3tuVW23zattxqm1vb8mlt801t82lt8xO25dO25Zu25dPa5ta23GqbG9tyq21ubcunbctfcwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPPcv/Enb8tdsy622+bRt+aa2+bRt+aa2ubUtt9rm07bl07blm9rmJ7TNjW35X3YCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADz3L7/Itvwv25ZbbXNjW25tyze1zadty09omxvbcmtbbrXNjba5tS232ubGttxqm1vb8k1t803b8k1t801tc2NbvukEAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO5fvqxtuNM2v0Xb3NiWW9vy17TNrW25tS032uab2uYntM2NbbnVNre25Ubb3NqWW21zY1tutc03tc2tbfkNTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA57r/BAB46gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHju/wACbcsMSB6CDAAAAABJRU5ErkJggg==";

// src/client/settings.ts
var SETTINGS_SLOT = "settings.section";
var SETTINGS_ID = "dsh-remote-control";
var SETTINGS_ORDER = 30;
var SETTINGS_LABEL = "\u8FDC\u7A0B\u63A7\u5236";
var CONFIG_ROUTE = "/plugins/dsh-remote-control/config";
var BACKUP_ROUTE = "/plugins/dsh-remote-control/backup";
var ADV_STYLE_ID = "dsh-remote-control/settings.css";
var hostVar2 = (name2, fallback) => `var(--dsw-alias-${name2}, ${fallback})`;
var ADV_CSS = `
.drc-adv-grid { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 10px 12px;
  align-items: center; }
.drc-adv-label { font-size: 13px; line-height: 20px; color: ${hostVar2("label-secondary", "#6b7280")}; }
.drc-adv-input { appearance: none; box-sizing: border-box; width: 100%; min-width: 0; font: inherit;
  font-size: 13px; line-height: 20px; padding: 4px 8px; border-radius: 8px;
  border: 1px solid ${hostVar2("border-l2", "rgba(128,128,128,.35)")};
  background: ${hostVar2("bg-layer-3", "transparent")};
  color: ${hostVar2("label-primary", "inherit")}; }
.drc-adv-input:focus-visible { outline: 2px solid ${hostVar2("brand-primary", "#4d6bfe")}; outline-offset: 1px; }
.drc-adv-note { margin: 0; font-size: 12px; line-height: 1.6; color: ${hostVar2("label-tertiary", "#8a8f98")}; }
.drc-adv-note[data-kind="failed"] { color: ${hostVar2("state-error-primary", "#d92d20")}; }
.drc-adv-note[data-kind="ok"] { color: ${hostVar2("label-secondary", "#6b7280")}; }
/* \u786E\u8BA4\u7801\u90A3\u4E00\u5757\uFF082026-10-21\uFF09\uFF1A\u6570\u5B57\u8981\u5927\u5230"\u626B\u4E4B\u524D\u5148\u770B\u89C1"\uFF0C\u4E0E\u5012\u8BA1\u65F6\u540C\u4E00\u6863\u5F3A\u8C03\u8272\u3002 */
.drc-sec-sas { margin: 0; font-size: 28px; line-height: 36px; font-weight: 600;
  letter-spacing: 4px; font-variant-numeric: tabular-nums;
  color: ${hostVar2("label-primary", "inherit")}; }
.drc-sec-sasnote { margin: 0 0 8px; font-size: 12px; line-height: 18px;
  color: ${hostVar2("label-secondary", "#6b7280")}; }
.drc-sec-fold { margin-top: 10px; }
.drc-sec-fold > summary { cursor: pointer; font-size: 12px; line-height: 18px;
  color: ${hostVar2("label-tertiary", "#8a8f98")}; }
.drc-sec-foldimg { display: block; width: 148px; height: 148px; margin: 8px 0 0; }
/*
 * \u4E24\u5217\u5BB9\u5668\uFF082026-10-22\uFF09\u3002
 *
 * \u4E3A\u4EC0\u4E48\u6709\u5B83\uFF1A\u72B6\u6001\u8F6E\u8BE2\u6BCF 2 \u79D2\u91CD\u753B\u4E00\u6B21\uFF0C\u800C"\u8FDB\u9636"\u90A3\u5F20\u5361\u91CC\u6709\u4E24\u4E2A <input>\u3002
 * \u539F\u6765\u90A3\u5F20\u5361\u4F4F\u5728\u6BCF\u6B21\u91CD\u5EFA\u7684 grid \u91CC \u21D2 \u6BCF 2 \u79D2\u88AB\u6458\u51FA DOM \u518D\u63D2\u56DE\u53BB \u21D2 **\u7126\u70B9\u5FC5\u7136\u4E22**\u3002
 * \u21D2 \u628A\u5B83\u632A\u8FDB**\u5E38\u9A7B**\u7684\u53F3\u5217\uFF0C\u8FD9\u4E00\u5217\u4E00\u6B21\u90FD\u4E0D\u91CD\u753B\u3002
 *
 * \u26A0\uFE0F "\u4E24\u5361\u7B49\u9AD8"\uFF08\u7528\u6237\u660E\u786E\u8981\u7684\uFF0C2026-10-21\uFF09\u539F\u6765\u662F grid \u7684 align-items:stretch \u7ED9\u7684\uFF1B
 * \u62C6\u51FA\u5217\u5BB9\u5668\u540E\u7531\u8FD9\u91CC\u7684 flex \u63A5\u7BA1 \u2014\u2014 \u89C6\u89C9\u4E0D\u53D8\u3002
 */
.drc-sec-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.drc-sec-col > .drc-sec-card { flex: 1 1 auto; }
`;
function ensureAdvancedStyle(doc) {
  try {
    const existing = doc.querySelector(`style[data-plugin-css="${ADV_STYLE_ID}"]`);
    if (existing && existing.getAttribute("data-plugin-css") === ADV_STYLE_ID) {
      existing.setAttribute("data-plugin", SETTINGS_ID);
      if (existing.textContent !== ADV_CSS) existing.textContent = ADV_CSS;
      return;
    }
    const element = doc.createElement("style");
    element.setAttribute("data-plugin-css", ADV_STYLE_ID);
    element.setAttribute("data-plugin", SETTINGS_ID);
    element.textContent = ADV_CSS;
    doc.head.appendChild(element);
  } catch (error) {
    warnSection("\u8FDB\u9636\u90A3\u4E00\u680F\u7684\u6837\u5F0F\u6CE8\u5165\u5931\u8D25\uFF08\u8868\u5355\u4ECD\u53EF\u7528\uFF0C\u53EA\u662F\u6CA1\u6392\u7248\uFF09", error);
  }
}
var SOURCE_TEXT = {
  env: "\u73AF\u5883\u53D8\u91CF",
  patch: "\u914D\u7F6E\u6587\u4EF6\uFF08patch\uFF09",
  user: "\u672C\u9875",
  claimed: "\u673A\u5668\u81EA\u52A8\u8BA4\u9886",
  default: "\u5B98\u65B9\u9ED8\u8BA4",
  none: "\u672A\u8BBE\u7F6E"
};
var sourceText = (value) => {
  const key = typeof value === "string" ? value : "";
  return SOURCE_TEXT[key] ?? (key === "" ? "\u672A\u77E5" : key);
};
var MARKER = { "x-drc-pair": "1" };
function buildSettingsSection(root, deps) {
  const doc = root.ownerDocument;
  ensureStyle(doc);
  ensureAdvancedStyle(doc);
  const box = doc.createElement("div");
  box.className = "drc-sec";
  root.appendChild(box);
  const topHost = doc.createElement("div");
  const grid = doc.createElement("div");
  grid.className = "drc-sec-grid";
  grid.setAttribute("data-two", "1");
  const leftCol = doc.createElement("div");
  leftCol.className = "drc-sec-col";
  const rightCol = doc.createElement("div");
  rightCol.className = "drc-sec-col";
  grid.appendChild(leftCol);
  grid.appendChild(rightCol);
  box.appendChild(topHost);
  box.appendChild(grid);
  let disposed = false;
  let statusTimer;
  let countTimer;
  let expiresAt = 0;
  let status;
  let view = { kind: "loading" };
  let expiresInMs = 0;
  let countNode;
  let paired = false;
  let lastApproval = null;
  let cfg;
  let advancedCard;
  let advUrlInput;
  let advTokenInput;
  let advHint;
  let advNote;
  let appCard;
  const mpCode = createMpCodeImage(doc, () => {
    if (!disposed) paint();
  });
  const fail = (message, error) => {
    warnSection(message, error);
    deps.warn?.(message);
  };
  const text = (tag, className, content) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (content !== void 0) node.textContent = content;
    return node;
  };
  const signal = () => {
    try {
      const timeouts = globalThis.AbortSignal;
      return typeof timeouts?.timeout === "function" ? timeouts.timeout(8e3) : void 0;
    } catch {
      return void 0;
    }
  };
  const call = async (input, init) => {
    try {
      const response = await deps.fetchImpl(input, { ...init, signal: signal() });
      const statusCode = typeof response?.status === "number" ? response.status : 0;
      let body = {};
      try {
        const parsed = await response?.json?.();
        if (parsed && typeof parsed === "object") body = parsed;
      } catch {
      }
      return { ok: response?.ok === true, status: statusCode, body };
    } catch (error) {
      fail("\u8BF7\u6C42\u5931\u8D25", error);
      return { ok: false, status: 0, body: {} };
    }
  };
  const loadStatus = async () => {
    if (disposed) return;
    const answer = await call(`${STATUS_ROUTE}?t=${Date.now()}`, { method: "GET" });
    if (disposed) return;
    if (answer.ok && answer.body && typeof answer.body === "object") {
      status = answer.body;
      paired = pairingCount(status) > 0;
      const readApproval = (raw) => raw && typeof raw === "object" && typeof raw.sas === "string" ? {
        sas: raw.sas,
        remainSec: typeof raw.remainSec === "number" ? raw.remainSec : 0
      } : null;
      const body = answer.body;
      lastApproval = readApproval(body.pairApproval) ?? readApproval(body.lastPairApproval);
      paint();
    }
  };
  const mint = async () => {
    if (disposed) return;
    view = { kind: "loading" };
    mpCode.invalidate();
    paint();
    const answer = await call(NEW_ROUTE, { method: "POST", headers: MARKER });
    if (disposed) return;
    view = panelViewFor(answer.body, answer.status);
    expiresInMs = view.kind === "qr" ? view.expiresInMs : 0;
    expiresAt = Date.now() + expiresInMs;
    paint();
    startCountdown();
  };
  const unpair = async () => {
    if (disposed) return;
    const answer = await call(UNPAIR_ROUTE, { method: "POST", headers: MARKER });
    if (disposed) return;
    if (!answer.ok) {
      view = { kind: "failed", detail: `HTTP ${answer.status}` };
      paint();
      return;
    }
    paired = false;
    await loadStatus();
    if (!disposed) await mint();
  };
  const startCountdown = () => {
    if (countTimer !== void 0) clearInterval(countTimer);
    if (view.kind !== "qr" || expiresInMs <= 0) {
      countTimer = void 0;
      return;
    }
    countTimer = setInterval(() => {
      expiresInMs = Math.max(0, expiresAt - Date.now());
      if (expiresInMs <= 0) {
        expiresInMs = 0;
        if (countTimer !== void 0) {
          clearInterval(countTimer);
          countTimer = void 0;
        }
        void mint();
        return;
      }
      if (countNode) {
        countNode.textContent = `${secondsText(expiresInMs)}\u540E\u8FC7\u671F`;
        if (expiresInMs <= 3e4) countNode.setAttribute("data-kind", "urgent");
      }
    }, 1e3);
  };
  const card = (heading, trailing) => {
    const node = doc.createElement("section");
    node.className = "drc-sec-card";
    const title = text("h3", "drc-sec-heading", heading);
    if (!trailing) {
      node.appendChild(title);
      return node;
    }
    const row = doc.createElement("div");
    row.className = "drc-sec-headrow";
    row.appendChild(title);
    trailing.className = "drc-sec-actions";
    row.appendChild(trailing);
    node.appendChild(row);
    return node;
  };
  const button = (label, onClick, kind) => {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = "drc-sec-btn";
    if (kind) node.setAttribute("data-kind", kind);
    node.textContent = label;
    node.addEventListener("click", onClick);
    return node;
  };
  const setNote = (message, kind) => {
    if (!advNote) return;
    advNote.textContent = message;
    advNote.setAttribute("data-kind", kind ?? "");
  };
  const showConfig = (answer) => {
    cfg = answer;
    if (advUrlInput) advUrlInput.value = typeof answer.serverUrl === "string" ? answer.serverUrl : "";
    if (advTokenInput) {
      advTokenInput.value = "";
      advTokenInput.setAttribute(
        "placeholder",
        answer.hostTokenSet === true ? "\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4E0D\u6539\u52A8" : "\u672A\u8BBE\u7F6E\uFF08\u5B98\u65B9\u4E2D\u7EE7\u4F1A\u81EA\u52A8\u8BA4\u9886\uFF09"
      );
    }
    if (advHint) {
      const locked = answer.serverUrlSource === "env" || answer.serverUrlSource === "patch";
      const shape = typeof answer.hostTokenShape === "string" && answer.hostTokenShape !== "" ? `\uFF08${answer.hostTokenShape}\uFF09` : "";
      advHint.textContent = `\u4E2D\u7EE7\u5730\u5740\uFF1A${sourceText(answer.serverUrlSource)}\u3000\u53E3\u4EE4\uFF1A${sourceText(answer.hostTokenSource)}${shape}` + (locked ? "\u3002\u5F53\u524D\u5730\u5740\u7531 patch / \u73AF\u5883\u53D8\u91CF\u51B3\u5B9A\uFF0C\u5728\u8FD9\u4E00\u9875\u4FDD\u5B58\u4F1A\u88AB\u5B83\u4EEC\u76D6\u4F4F" : "");
    }
  };
  const loadConfig = async () => {
    if (disposed) return;
    const answer = await call(CONFIG_ROUTE, { method: "GET" });
    if (disposed) return;
    if (answer.ok && answer.body && typeof answer.body.serverUrl === "string") {
      showConfig(answer.body);
      return;
    }
    setNote(`\u8BFB\u4E0D\u5230\u5F53\u524D\u914D\u7F6E\uFF08HTTP ${answer.status}\uFF09\u2014\u2014\u8FD9\u4E00\u7248\u5BBF\u4E3B\u6CA1\u6709 /config \u8DEF\u7531`, "failed");
  };
  const submitAdvanced = async () => {
    if (disposed) return;
    const url = advUrlInput?.value.trim() ?? "";
    const token = advTokenInput?.value.trim() ?? "";
    const payload = {};
    if (cfg) {
      if (url !== (typeof cfg.serverUrl === "string" ? cfg.serverUrl : "")) payload.serverUrl = url;
    } else if (url !== "") {
      payload.serverUrl = url;
    }
    if (token !== "") payload.hostToken = token;
    if (Object.keys(payload).length === 0) {
      setNote("\u6CA1\u6709\u6539\u52A8", void 0);
      return;
    }
    const answer = await call(CONFIG_ROUTE, {
      method: "POST",
      headers: { ...MARKER, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (disposed) return;
    if (!answer.ok) {
      const detail = String(answer.body.detail ?? answer.body.error ?? `HTTP ${answer.status}`);
      setNote(`\u4FDD\u5B58\u5931\u8D25\uFF1A${detail}`, "failed");
      return;
    }
    if (answer.body.config && typeof answer.body.config === "object") showConfig(answer.body.config);
    setNote("\u5DF2\u4FDD\u5B58\u3002\u4E2D\u7EE7\u5730\u5740\u4E0E\u53E3\u4EE4\u5728**\u4E0B\u6B21\u542F\u52A8**\u65F6\u751F\u6548\uFF08\u91CD\u542F Harness\uFF09\u3002", "ok");
  };
  const clearTokenAdvanced = async () => {
    if (disposed) return;
    const answer = await call(CONFIG_ROUTE, {
      method: "POST",
      headers: { ...MARKER, "content-type": "application/json" },
      body: JSON.stringify({ hostToken: "" })
    });
    if (disposed) return;
    if (!answer.ok) {
      setNote(`\u6E05\u9664\u5931\u8D25\uFF1AHTTP ${answer.status}`, "failed");
      return;
    }
    if (advTokenInput) advTokenInput.value = "";
    if (answer.body.config && typeof answer.body.config === "object") showConfig(answer.body.config);
    setNote("\u5DF2\u6E05\u9664\u81EA\u5B9A\u4E49\u53E3\u4EE4\u3002\u91CD\u542F Harness \u540E\u8FD9\u53F0\u4E3B\u673A\u4F1A\u56DE\u5230\u73AF\u5883\u53D8\u91CF / \u914D\u7F6E\u6587\u4EF6 / \u81EA\u52A8\u8BA4\u9886\u90A3\u4E00\u679A\u3002", "ok");
  };
  const resetAdvanced = async () => {
    if (disposed) return;
    const answer = await call(CONFIG_ROUTE, {
      method: "POST",
      headers: { ...MARKER, "content-type": "application/json" },
      body: JSON.stringify({ serverUrl: "", hostToken: "" })
    });
    if (disposed) return;
    if (!answer.ok) {
      setNote(`\u6062\u590D\u5931\u8D25\uFF1AHTTP ${answer.status}`, "failed");
      return;
    }
    if (answer.body.config && typeof answer.body.config === "object") showConfig(answer.body.config);
    setNote("\u5DF2\u6062\u590D\u9ED8\u8BA4\uFF08\u8FD9\u4E00\u9875\u5199\u7684\u81EA\u5B9A\u4E49\u9879\u90FD\u5220\u6389\u4E86\uFF09\u3002\u91CD\u542F Harness \u540E\u751F\u6548\u3002", "ok");
  };
  const buildAdvanced = () => {
    const section = card("\u8FDB\u9636\uFF1A\u81EA\u90E8\u7F72 / \u81EA\u5B9A\u4E49");
    section.setAttribute("data-role", "advanced");
    section.appendChild(
      text(
        "p",
        "drc-sec-note",
        "\u9ED8\u8BA4\u8D70\u5B98\u65B9\u4E2D\u7EE7\uFF0C\u53E3\u4EE4\u7531\u4E3B\u673A\u81EA\u52A8\u8BA4\u9886\uFF0C\u4EC0\u4E48\u90FD\u4E0D\u7528\u586B\u3002\u81EA\u5DF1\u642D\u4E86\u4E2D\u7EE7\u3001\u6216\u60F3\u7528\u53E6\u4E00\u679A\u53E3\u4EE4\uFF0C\u624D\u9700\u8981\u6539\u8FD9\u91CC\u3002"
      )
    );
    const grid2 = doc.createElement("div");
    grid2.className = "drc-adv-grid";
    const urlId = `${SETTINGS_ID}-server-url`;
    const urlLabel = text("label", "drc-adv-label", "\u4E2D\u7EE7\u5730\u5740");
    urlLabel.setAttribute("for", urlId);
    const urlInput = doc.createElement("input");
    urlInput.id = urlId;
    urlInput.className = "drc-adv-input";
    urlInput.setAttribute("type", "text");
    urlInput.setAttribute("spellcheck", "false");
    urlInput.setAttribute("autocomplete", "off");
    urlInput.setAttribute("placeholder", "wss://drc.provid.cc/v05");
    advUrlInput = urlInput;
    const tokenId = `${SETTINGS_ID}-host-token`;
    const tokenLabel = text("label", "drc-adv-label", "\u4E3B\u673A\u53E3\u4EE4");
    tokenLabel.setAttribute("for", tokenId);
    const tokenInput = doc.createElement("input");
    tokenInput.id = tokenId;
    tokenInput.className = "drc-adv-input";
    tokenInput.setAttribute("type", "password");
    tokenInput.setAttribute("autocomplete", "off");
    tokenInput.setAttribute("placeholder", "\u672A\u8BBE\u7F6E\uFF08\u5B98\u65B9\u4E2D\u7EE7\u4F1A\u81EA\u52A8\u8BA4\u9886\uFF09");
    advTokenInput = tokenInput;
    for (const node of [urlLabel, urlInput, tokenLabel, tokenInput]) grid2.appendChild(node);
    section.appendChild(grid2);
    const actions = doc.createElement("div");
    actions.className = "drc-sec-actions";
    actions.appendChild(button("\u4FDD\u5B58", () => void submitAdvanced(), "primary"));
    actions.appendChild(button("\u6E05\u9664\u53E3\u4EE4", () => void clearTokenAdvanced()));
    actions.appendChild(button("\u6062\u590D\u9ED8\u8BA4", () => void resetAdvanced()));
    section.appendChild(actions);
    advHint = text("p", "drc-adv-note", "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u914D\u7F6E\u2026");
    section.appendChild(advHint);
    advNote = text("p", "drc-adv-note", "");
    advNote.setAttribute("data-kind", "");
    section.appendChild(advNote);
    return section;
  };
  const buildAppCard = () => {
    const section = card("\u624B\u673A App\uFF08\u5B89\u5353\uFF09");
    section.setAttribute("data-role", "app-download");
    section.appendChild(
      text("p", "drc-sec-note", "\u626B\u7801\u4E0B\u8F7D\u300C\u5927\u80A5\u9C7C\u8FDC\u63A7\u300D\u3002\u88C5\u597D\u6253\u5F00\uFF0C\u548C\u8FD9\u53F0\u4E3B\u673A\u914D\u5BF9\u540E\u5C31\u80FD\u53D1\u6307\u4EE4\u3002")
    );
    const image = doc.createElement("img");
    image.className = "drc-qr";
    image.setAttribute("alt", "\u624B\u673A App \u4E0B\u8F7D\u4E8C\u7EF4\u7801");
    image.setAttribute("src", APP_QR_DATA_URL);
    section.appendChild(image);
    const actions = doc.createElement("div");
    actions.className = "drc-sec-actions";
    const copyBtn = button("\u590D\u5236\u4E0B\u8F7D\u94FE\u63A5", () => copyDownloadUrl(copyBtn));
    actions.appendChild(copyBtn);
    section.appendChild(actions);
    const urlLine = text("p", "drc-sec-note", APP_DOWNLOAD_URL);
    urlLine.setAttribute("data-role", "app-download-url");
    section.appendChild(urlLine);
    return section;
  };
  const copyDownloadUrl = (btn) => {
    const timers = globalThis.setTimeout;
    const flash = (label) => {
      const before = btn.textContent ?? "";
      btn.textContent = label;
      if (typeof timers !== "function") return;
      timers(() => {
        btn.textContent = before;
      }, 1500);
    };
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.writeText !== "function") {
      flash("\u590D\u5236\u5931\u8D25\uFF0C\u957F\u6309\u4E0B\u9762\u90A3\u884C");
      return;
    }
    clipboard.writeText(APP_DOWNLOAD_URL).then(
      () => flash("\u5DF2\u590D\u5236"),
      () => flash("\u590D\u5236\u5931\u8D25\uFF0C\u957F\u6309\u4E0B\u9762\u90A3\u884C")
    );
  };
  let backupCard;
  let bkNote;
  let bkStatusLine;
  let bkUrlInput;
  let bkTokenInput;
  let bkIntervalInput;
  let bkIdleInput;
  let bkToggleBtn;
  let bkEnabled = false;
  const bkSetNote = (message, kind) => {
    if (!bkNote) return;
    bkNote.textContent = message;
    bkNote.setAttribute("data-kind", kind ?? "");
  };
  const numOf = (raw, fallback) => typeof raw === "number" ? raw : fallback;
  const strOf = (raw, fallback = "") => typeof raw === "string" ? raw : fallback;
  const paintBackupStatus = (body) => {
    const status2 = body.status && typeof body.status === "object" ? body.status : {};
    const config = body.config && typeof body.config === "object" ? body.config : {};
    bkEnabled = config.enabled === true;
    if (bkToggleBtn) bkToggleBtn.textContent = bkEnabled ? "\u505C\u7528\u5907\u4EFD" : "\u542F\u7528\u5907\u4EFD";
    if (bkUrlInput && doc.activeElement !== bkUrlInput) bkUrlInput.value = strOf(config.repoUrl);
    if (bkIntervalInput && doc.activeElement !== bkIntervalInput) {
      bkIntervalInput.value = String(numOf(config.intervalHours, 8));
    }
    if (bkIdleInput && doc.activeElement !== bkIdleInput) {
      bkIdleInput.value = String(numOf(config.idleDays, 15));
    }
    if (bkTokenInput && doc.activeElement !== bkTokenInput) {
      bkTokenInput.value = "";
      bkTokenInput.setAttribute("placeholder", status2.tokenSet === true ? "\u5DF2\u8BBE\u7F6E\uFF0C\u7559\u7A7A\u4E0D\u6539\u52A8" : "\u672A\u8BBE\u7F6E\uFF1A\u586B\u4F60\u7684 PAT");
    }
    if (!bkStatusLine) return;
    const parts = [];
    if (status2.gitAvailable !== true) parts.push("\u672C\u673A\u6CA1\u88C5 git\uFF1A\u5148\u88C5 Git for Windows");
    parts.push(bkEnabled ? "\u5DF2\u542F\u7528" : "\u672A\u542F\u7528");
    const interval = numOf(config.intervalHours, 8);
    parts.push(interval > 0 ? `\u6BCF ${interval} \u5C0F\u65F6` : "\u53EA\u624B\u52A8");
    parts.push(`\u51B7\u5374 ${numOf(config.idleDays, 15)} \u5929\u5F52\u6863`);
    if (status2.running === true) {
      parts.push("\u6B63\u5728\u8DD1\u2026");
    } else if (typeof status2.lastRunAt === "string" && status2.lastRunAt !== "") {
      const when = status2.lastRunAt.replace("T", " ").replace(/\..*$/, "");
      const result = status2.lastResult === "ok" ? "\u6210\u529F" : status2.lastResult === "skipped" ? "\u8DF3\u8FC7" : "\u5931\u8D25";
      parts.push(`\u4E0A\u6B21 ${when} ${result}`);
      if (result === "\u6210\u529F") {
        const mb = (numOf(status2.lastHotBytes, 0) / (1024 * 1024)).toFixed(1);
        parts.push(`${numOf(status2.lastHotCount, 0)} \u4E2A\u4F1A\u8BDD / ${mb} MB`);
        if (numOf(status2.lastArchivedCount, 0) > 0) parts.push(`\u5F52\u6863 ${numOf(status2.lastArchivedCount, 0)} \u4E2A`);
      } else if (typeof status2.lastError === "string" && status2.lastError !== "") {
        parts.push(status2.lastError.slice(0, 120));
      }
    } else {
      parts.push("\u8FD8\u6CA1\u8DD1\u8FC7");
    }
    const restore = status2.restore && typeof status2.restore === "object" ? status2.restore : {};
    if (typeof restore.lastMessage === "string" && restore.lastMessage !== "") {
      parts.push(`\u6062\u590D\uFF1A${restore.lastMessage.slice(0, 120)}`);
    }
    bkStatusLine.textContent = parts.join("\u3000");
  };
  const loadBackup = async () => {
    if (disposed) return;
    const answer = await call(BACKUP_ROUTE, { method: "GET" });
    if (disposed) return;
    if (!answer.ok) {
      if (bkStatusLine) bkStatusLine.textContent = `\u8BFB\u4E0D\u5230\u5907\u4EFD\u72B6\u6001\uFF08HTTP ${answer.status}\uFF09`;
      return;
    }
    paintBackupStatus(answer.body);
  };
  const postBackup = async (payload, okText) => {
    if (disposed) return;
    const answer = await call(BACKUP_ROUTE, {
      method: "POST",
      headers: { ...MARKER, "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (disposed) return;
    if (!answer.ok) {
      const detail = String(answer.body.detail ?? answer.body.error ?? `HTTP ${answer.status}`);
      bkSetNote(`\u5931\u8D25\uFF1A${detail}`, "failed");
      return;
    }
    bkSetNote(okText, "ok");
    await loadBackup();
  };
  const saveBackup = async () => {
    const config = {
      repoUrl: bkUrlInput?.value.trim() ?? "",
      intervalHours: Number(bkIntervalInput?.value.trim() ?? "8"),
      idleDays: Number(bkIdleInput?.value.trim() ?? "15"),
      enabled: bkEnabled
    };
    const token = bkTokenInput?.value.trim() ?? "";
    const payload = { action: "save", config };
    if (token !== "") payload.token = token;
    await postBackup(payload, "\u5DF2\u4FDD\u5B58\u3002\u6539\u4E86\u8282\u594F\u7ACB\u523B\u751F\u6548\uFF0C\u4E0D\u7528\u91CD\u542F\u3002");
  };
  const buildBackup = () => {
    const section = card("\u4F1A\u8BDD\u5907\u4EFD\uFF08git\uFF09");
    section.setAttribute("data-role", "backup");
    section.appendChild(
      text(
        "p",
        "drc-sec-note",
        "\u628A\u672C\u673A\u7684\u4F1A\u8BDD\u8BB0\u5F55\u5B9A\u65F6\u4F20\u5230\u4F60\u7684\u79C1\u6709\u4ED3\u5E93\uFF1A\u6D3B\u8DC3\u7684\u6BCF 8 \u5C0F\u65F6\u4E00\u4EFD\uFF08\u53EA\u7559\u6700\u65B0\uFF09\uFF0C15 \u5929\u6CA1\u804A\u7684\u8F6C\u5B58\u5230\u5F52\u6863\u5206\u652F\u3002\u6362\u7535\u8111\u540E\u5728\u8FD9\u91CC\u4E00\u952E\u62C9\u56DE\u6765\u3002"
      )
    );
    const grid2 = doc.createElement("div");
    grid2.className = "drc-adv-grid";
    const urlLabel = text("label", "drc-adv-label", "\u4ED3\u5E93\u5730\u5740");
    const urlInput = doc.createElement("input");
    urlInput.className = "drc-adv-input";
    urlInput.setAttribute("type", "text");
    urlInput.setAttribute("spellcheck", "false");
    urlInput.setAttribute("autocomplete", "off");
    urlInput.setAttribute("placeholder", "https://github.com/\u4F60\u7684\u8D26\u53F7/dsh-backup-\u4E3B\u673A\u540D.git");
    bkUrlInput = urlInput;
    const tokenLabel = text("label", "drc-adv-label", "\u8BBF\u95EE\u4EE4\u724C\uFF08PAT\uFF09");
    const tokenInput = doc.createElement("input");
    tokenInput.className = "drc-adv-input";
    tokenInput.setAttribute("type", "password");
    tokenInput.setAttribute("autocomplete", "off");
    tokenInput.setAttribute("placeholder", "\u672A\u8BBE\u7F6E\uFF1A\u586B\u4F60\u7684 PAT");
    bkTokenInput = tokenInput;
    const intervalLabel = text("label", "drc-adv-label", "\u95F4\u9694\uFF08\u5C0F\u65F6\uFF0C0 = \u53EA\u624B\u52A8\uFF09");
    const intervalInput = doc.createElement("input");
    intervalInput.className = "drc-adv-input";
    intervalInput.setAttribute("type", "number");
    intervalInput.setAttribute("min", "0");
    intervalInput.setAttribute("max", "168");
    intervalInput.setAttribute("value", "8");
    bkIntervalInput = intervalInput;
    const idleLabel = text("label", "drc-adv-label", "\u51B7\u5374\u5929\u6570\uFF08\u591A\u4E45\u6CA1\u804A\u8F6C\u5F52\u6863\uFF09");
    const idleInput = doc.createElement("input");
    idleInput.className = "drc-adv-input";
    idleInput.setAttribute("type", "number");
    idleInput.setAttribute("min", "1");
    idleInput.setAttribute("max", "3650");
    idleInput.setAttribute("value", "15");
    bkIdleInput = idleInput;
    for (const node of [urlLabel, urlInput, tokenLabel, tokenInput, intervalLabel, intervalInput, idleLabel, idleInput]) {
      grid2.appendChild(node);
    }
    section.appendChild(grid2);
    const actions = doc.createElement("div");
    actions.className = "drc-sec-actions";
    const toggle = button("\u542F\u7528\u5907\u4EFD", () => {
      bkEnabled = !bkEnabled;
      void saveBackup();
    }, "primary");
    bkToggleBtn = toggle;
    actions.appendChild(button("\u4FDD\u5B58", () => void saveBackup(), "primary"));
    actions.appendChild(toggle);
    actions.appendChild(
      button("\u7ACB\u5373\u5907\u4EFD", () => {
        bkSetNote("\u5DF2\u5F00\u59CB\uFF0C\u8DD1\u5B8C\u8FD9\u4E00\u884C\u4F1A\u81EA\u5DF1\u66F4\u65B0\uFF08\u51E0\u5206\u949F\uFF09", "ok");
        void postBackup({ action: "run" }, "\u5DF2\u5F00\u59CB\u5907\u4EFD\u2026");
      })
    );
    actions.appendChild(
      button("\u4ECE\u5907\u4EFD\u6062\u590D", () => {
        const view2 = doc.defaultView;
        const sure = typeof view2?.confirm === "function" ? view2.confirm("\u8981\u7528\u4ED3\u5E93\u91CC\u7684\u5907\u4EFD\u8986\u76D6\u672C\u673A\u4F1A\u8BDD\u5417\uFF1F\u73B0\u6709\u4F1A\u8BDD\u4F1A\u88AB\u6539\u540D\u7559\u5E95\uFF0C\u4E0D\u4F1A\u5220\u9664\u3002") : true;
        if (!sure) return;
        void postBackup({ action: "restore" }, "\u5DF2\u5F00\u59CB\u6062\u590D\uFF0C\u5B8C\u6210\u540E\u91CD\u542F\u98DE\u9C7C");
      })
    );
    section.appendChild(actions);
    bkStatusLine = text("p", "drc-adv-note", "\u6B63\u5728\u8BFB\u53D6\u5907\u4EFD\u72B6\u6001\u2026");
    section.appendChild(bkStatusLine);
    bkNote = text("p", "drc-adv-note", "");
    bkNote.setAttribute("data-kind", "");
    section.appendChild(bkNote);
    return section;
  };
  const paint = () => {
    if (disposed) return;
    const topChildren = [];
    const leftChildren = [];
    countNode = void 0;
    const header = doc.createElement("div");
    header.className = "drc-sec-header";
    header.appendChild(text("h2", "drc-sec-title", SETTINGS_LABEL));
    header.appendChild(
      text("p", "drc-sec-sub", "\u7528\u5FAE\u4FE1\u5C0F\u7A0B\u5E8F\u8FDC\u7A0B\u64CD\u4F5C\u8FD9\u53F0\u4E3B\u673A\u4E0A\u7684 DSH \u4F1A\u8BDD\uFF1A\u53D1\u6307\u4EE4\u3001\u770B\u6D41\u5F0F\u8F93\u51FA\u3001\u5BA1\u6279\u5DE5\u5177\u8C03\u7528\u3002")
    );
    topChildren.push(header);
    const statusBar = doc.createElement("div");
    statusBar.className = "drc-sec-status";
    const barHead = doc.createElement("div");
    barHead.className = "drc-sec-statushead";
    const dot = doc.createElement("span");
    dot.className = "drc-dot";
    dot.setAttribute("data-tone", pillLabel(status).tone);
    dot.setAttribute("aria-hidden", "true");
    barHead.appendChild(dot);
    barHead.appendChild(text("strong", "drc-sec-statustext", pillLabel(status).text));
    barHead.appendChild(text("span", "drc-sec-statushint", relayStateRow(status)));
    statusBar.appendChild(barHead);
    topChildren.push(statusBar);
    const actions = doc.createElement("div");
    actions.appendChild(button(view.kind === "qr" ? "\u6362\u4E00\u5F20" : "\u751F\u6210\u914D\u5BF9\u7801", () => void mint(), "primary"));
    if (paired) actions.appendChild(button("\u9000\u51FA\u914D\u5BF9", () => void unpair()));
    const pair = card("\u914D\u5BF9\u8FD9\u53F0\u4E3B\u673A", actions);
    pair.setAttribute("data-role", "pair");
    if (lastApproval !== null) {
      pair.appendChild(text("p", "drc-sec-sas", lastApproval.sas));
      pair.appendChild(text("p", "drc-sec-sasnote", "\u624B\u673A\u4E0A\u4E5F\u663E\u793A\u8FD9\u4E32\u6570\u5B57\uFF0C\u4E24\u5904\u4E0D\u4E00\u81F4\u5C31\u5728\u624B\u673A\u4E0A\u9009\u4E0D\u4E00\u81F4"));
    }
    if (view.kind === "loading") {
      pair.appendChild(text("p", "drc-sec-state", "\u6B63\u5728\u751F\u6210\u914D\u5BF9\u7801\u2026"));
    } else if (view.kind === "qr") {
      const image = mpCode.element(view.imageSrc);
      const loadState = mpCode.state();
      if (loadState !== "ready") pair.appendChild(mpCodeLoadingBox(doc, loadState));
      pair.appendChild(image);
      const code = doc.createElement("div");
      code.className = "drc-sec-code";
      code.appendChild(text("span", "drc-sec-code-label", "\u6216\u5728\u5C0F\u7A0B\u5E8F\u91CC\u624B\u8F93\u8FD9 6 \u4F4D\u7801"));
      code.appendChild(text("p", "drc-code", view.token));
      pair.appendChild(code);
      countNode = text("p", "drc-count", `${secondsText(expiresInMs)}\u540E\u8FC7\u671F`);
      if (expiresInMs <= 3e4) countNode.setAttribute("data-kind", "urgent");
      pair.appendChild(countNode);
      pair.appendChild(
        text("p", "drc-sec-guide", "\u7528\u5FAE\u4FE1\u626B\u8FD9\u5F20\u7801\u3002\u626B\u4E00\u6B21\u4EE5\u540E\u8FD9\u53F0\u4E3B\u673A\u5C31\u5728\u5C0F\u7A0B\u5E8F\u7684\u5217\u8868\u91CC\uFF0C\u4E4B\u540E\u81EA\u52A8\u8FDE\u4E0A\u3002")
      );
    } else if (view.kind === "unavailable") {
      pair.appendChild(text("p", "drc-sec-state", view.reason));
    } else if (view.kind === "failed") {
      const node = text("p", "drc-sec-state", `\u53D1\u4E0D\u51FA\u914D\u5BF9\u7801\uFF1A${view.detail}`);
      node.setAttribute("data-kind", "failed");
      pair.appendChild(node);
    } else {
      const done = doc.createElement("p");
      done.className = "drc-sec-state drc-sec-done";
      done.appendChild(text("span", "", "\u5DF2\u914D\u5BF9\uFF0C\u4E0D\u7528\u518D\u626B\u7801\u3002"));
      pair.appendChild(done);
    }
    leftChildren.push(pair);
    if (!advancedCard) {
      advancedCard = buildAdvanced();
      rightCol.appendChild(advancedCard);
    }
    if (!appCard) {
      appCard = buildAppCard();
      rightCol.appendChild(appCard);
    }
    if (!backupCard) {
      backupCard = buildBackup();
      rightCol.appendChild(backupCard);
    }
    topHost.replaceChildren(...topChildren);
    leftCol.replaceChildren(...leftChildren);
  };
  paint();
  void loadStatus();
  void mint();
  void loadConfig();
  let backupTick = 0;
  statusTimer = setInterval(() => {
    void loadStatus();
    backupTick += 1;
    if (backupTick % 3 === 0) void loadBackup();
  }, 2e3);
  void loadBackup();
  return () => {
    disposed = true;
    if (statusTimer !== void 0) clearInterval(statusTimer);
    if (countTimer !== void 0) clearInterval(countTimer);
    statusTimer = void 0;
    countTimer = void 0;
    try {
      box.remove();
    } catch {
    }
  };
}
function isSlots2(value) {
  if (!value || typeof value !== "object") return false;
  const record = value;
  return typeof record.inject === "function" && typeof record.register === "function";
}
function pickSlots2(source) {
  if (isSlots2(source)) return source;
  const gettable = source;
  if (gettable && typeof gettable.get === "function") {
    try {
      const got = gettable.get("slots", true);
      if (isSlots2(got)) return got;
    } catch {
    }
  }
  return void 0;
}
function mountSettingsSection(ctx, createElement, options) {
  if (!createElement) {
    warnSection("\u88C5\u8F7D\u5668\u7ED9\u4E0D\u51FA react\uFF1A\u8BBE\u7F6E\u91CC\u7684\u90A3\u4E00\u9875\u4E0D\u4F1A\u51FA\u73B0");
    return "failed";
  }
  let mounted = false;
  let scheduledLate = false;
  const mount = (slots) => {
    if (mounted) return;
    let cleanup;
    const attach = (node) => {
      const element = node;
      if (element && typeof element.appendChild === "function" && element.ownerDocument) {
        if (cleanup) return;
        cleanup = buildSettingsSection(element, {
          fetchImpl: (input, init) => globalThis.fetch(resolveHostUrl(String(input)), init),
          warn: (message) => warnSection(message)
        });
      } else if (cleanup) {
        cleanup();
        cleanup = void 0;
      }
    };
    const component = (options?.buildComponent ?? ((attachRef) => () => createElement("div", { ref: attachRef })))(attach);
    mounted = true;
    try {
      slots.inject(SETTINGS_SLOT, () => {
        try {
          slots.register(
            {
              name: SETTINGS_SLOT,
              id: options?.id ?? SETTINGS_ID,
              order: options?.order ?? SETTINGS_ORDER,
              label: () => options?.label ?? SETTINGS_LABEL
            },
            component
          );
        } catch (error) {
          warnSection("\u8BBE\u7F6E\u5206\u533A\u6CE8\u518C\u5931\u8D25\uFF08\u8FD9\u4E00\u9875\u4E0D\u51FA\u73B0\uFF09", error);
        }
      });
    } catch (error) {
      mounted = false;
      warnSection("\u8BBE\u7F6E\u5206\u533A\u6CE8\u5165\u5931\u8D25\uFF08\u8FD9\u4E00\u9875\u4E0D\u51FA\u73B0\uFF09", error);
      return;
    }
    try {
      ctx.effect?.(() => () => {
        if (cleanup) {
          cleanup();
          cleanup = void 0;
        }
      });
    } catch {
    }
  };
  let early;
  try {
    early = pickSlots2(ctx.slots) ?? pickSlots2(ctx.get?.("slots", true));
  } catch {
  }
  if (early) mount(early);
  try {
    scheduledLate = true;
    ctx.inject?.(["slots"], ((...args) => {
      for (const candidate of [...args, ctx]) {
        const found = pickSlots2(candidate);
        if (found) {
          mount(found);
          return;
        }
      }
    }));
  } catch (error) {
    warnSection("ctx.inject \u53E3\u4E0D\u53EF\u7528\uFF1Aslots \u518D\u665A\u5230\u4E5F\u6CA1\u4EBA\u8865\u6302", error);
  }
  if (!mounted) {
    if (scheduledLate) {
      return "pending";
    }
    warnSection("apply \u65F6\u6CA1\u63A2\u5230 slots\uFF08\u5DF2\u6302\u6CE8\u5165\u56DE\u8C03\u7B49\u5B83\u665A\u5230\uFF09\uFF1B\u8BBE\u7F6E\u91CC\u4E00\u76F4\u6CA1\u6709\u8FD9\u4E00\u9875\u5C31\u662F\u8FD9\u4EE3\u5BBF\u4E3B\u6CA1\u8FD9\u4E2A\u670D\u52A1");
  }
  return mounted ? "mounted" : "failed";
}

// src/client/host-api.ts
var VISION_BASE = "/api/dsh-remote-dafeiyu/vision";
var MEMORY_BASE = "/api/dsh-remote-dafeiyu/memory";
var PERSONA_STATUS = "/api/dsh-persona-dafeiyu/status";
async function callJson(path, body, timeoutMs = 2e4) {
  const init = body === void 0 ? { method: "GET" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) init.signal = AbortSignal.timeout(timeoutMs);
  const response = await fetch(resolveHostUrl(path), init);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u975E JSON\uFF08HTTP ${response.status}\uFF09` };
  }
}

// src/client/vision-panel.ts
var fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px"
};
var labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "var(--dsw-alias-label-secondary)",
  marginBottom: "4px"
};
var buttonStyle = {
  padding: "4px 12px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px",
  cursor: "pointer"
};
var PROTOCOLS = [
  ["auto", "\u81EA\u52A8\uFF08\u6309\u5730\u5740\u731C\uFF09"],
  ["openai-chat", "OpenAI Chat\uFF08/chat/completions\uFF09"],
  ["openai-responses", "OpenAI Responses\uFF08/responses\uFF09"],
  ["anthropic", "Anthropic\uFF08/v1/messages\uFF09"],
  ["gemini", "Gemini\uFF08generateContent\uFF09"],
  ["custom", "\u81EA\u5B9A\u4E49\u6A21\u677F"]
];
function buildVisionPanel(deps) {
  const { createElement: h, hooks } = deps;
  const useState = hooks.useState;
  const useEffect = hooks.useEffect;
  if (typeof useState !== "function") return void 0;
  return function VisionPanel() {
    const [cfg, setCfg] = useState(null);
    const [apiKey, setApiKey] = useState("");
    const [status, setStatus] = useState("");
    const [models, setModels] = useState([]);
    const [busy, setBusy] = useState(false);
    const load = async () => {
      setBusy(true);
      try {
        const result = await callJson(`${VISION_BASE}/config`, void 0);
        if (result.ok) {
          setCfg(result.config);
          setStatus("\u5DF2\u8F7D\u5165");
        } else {
          setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    useEffect?.(() => {
      void load();
    }, []);
    if (cfg === null) {
      return h("div", {
        style: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
        children: [h("span", { children: status || "\u6B63\u5728\u8BFB\u53D6\u8BC6\u56FE\u914D\u7F6E\u2026" }), " ", h("button", { type: "button", style: buttonStyle, onClick: () => void load(), children: "\u5237\u65B0" })]
      });
    }
    const patch = (next) => setCfg({ ...cfg, ...next });
    const save = async () => {
      setBusy(true);
      try {
        const payload = {
          enabled: cfg.enabled,
          apiBase: cfg.apiBase,
          model: cfg.model,
          protocol: cfg.protocol,
          prompt: cfg.prompt,
          timeoutMs: cfg.timeoutMs,
          requestTemplate: cfg.requestTemplate,
          responsePath: cfg.responsePath
        };
        if (apiKey.trim() !== "") payload.apiKey = apiKey.trim();
        const result = await callJson(`${VISION_BASE}/config`, { config: payload });
        if (result.ok) {
          setCfg(result.config);
          setApiKey("");
          setStatus("\u5DF2\u4FDD\u5B58\u3002\u5F00\u542F/\u5173\u95ED\u8BC6\u56FE\u63D0\u793A\u8BCD\u9700\u8981\u91CD\u542F DSH \u751F\u6548\uFF1B\u8BC6\u56FE\u8DEF\u7531\u7ACB\u5373\u751F\u6548\u3002");
        } else {
          setStatus(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const pullModels = async () => {
      setBusy(true);
      try {
        const result = await callJson(`${VISION_BASE}/models`, {});
        if (result.ok) {
          const list = Array.isArray(result.models) ? result.models : [];
          setModels(list);
          setStatus(list.length > 0 ? `\u62C9\u5230 ${list.length} \u4E2A\u6A21\u578B\uFF0C\u70B9\u4E00\u4E2A\u586B\u5165` : "\u6A21\u578B\u5217\u8868\u662F\u7A7A\u7684");
        } else {
          setStatus(`\u62C9\u53D6\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u62C9\u53D6\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const keyPlaceholder = cfg.apiKeySet ? `\u5DF2\u4FDD\u5B58\uFF08${cfg.apiKeyHint}\uFF09\uFF1A\u7559\u7A7A\u4E0D\u4FEE\u6539` : "\u7C98\u8D34 API Key\uFF08\u53EA\u5B58\u5728\u672C\u673A\uFF09";
    return h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "12px",
        border: "1px solid var(--dsw-alias-border-l2)",
        borderRadius: "10px",
        marginTop: "16px"
      },
      children: [
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
          h("strong", { style: { fontSize: "14px" }, children: "\u8BC6\u56FE\uFF08\u5927\u80A5\u9C7C\u770B\u61C2\u56FE\uFF09" }),
          h("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }, children: [
            h("input", { type: "checkbox", checked: cfg.enabled, onChange: (event) => patch({ enabled: event.target.checked }) }),
            "\u5F00\u542F"
          ] })
        ] }),
        h("p", { style: { margin: 0, fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u5927\u80A5\u9C7C\u6CA1\u6709\u89C6\u89C9\uFF0C\u9700\u8981\u5916\u6302\u4E00\u4E2A\u89C6\u89C9\u6A21\u578B\uFF08OpenAI / Anthropic / Gemini \u517C\u5BB9\u63A5\u53E3\u90FD\u884C\uFF09\u3002\u586B\u597D\u540E\u5728\u804A\u5929\u9875\u53F3\u4E0B\u89D2\u70B9\u9CB8\u9C7C\u6309\u94AE\u53D1\u56FE\u3002" }),
        h("div", { children: [h("span", { style: labelStyle, children: "\u63A5\u53E3\u5730\u5740\uFF08\u6253\u5230 /v1 \u8FD9\u4E00\u5C42\uFF09" }), h("input", { style: fieldStyle, value: cfg.apiBase, onChange: (event) => patch({ apiBase: event.target.value }) })] }),
        h("div", { children: [h("span", { style: labelStyle, children: "API Key" }), h("input", { style: fieldStyle, type: "password", value: apiKey, placeholder: keyPlaceholder, onChange: (event) => setApiKey(event.target.value) })] }),
        h("div", { children: [h("span", { style: labelStyle, children: "\u6A21\u578B\u540D" }), h("input", { style: fieldStyle, value: cfg.model, placeholder: "gpt-4o-mini / qwen-vl-max / claude-\u2026", onChange: (event) => patch({ model: event.target.value }) })] }),
        h("div", { children: [h("span", { style: labelStyle, children: "\u534F\u8BAE" }), h("select", { style: fieldStyle, value: cfg.protocol, onChange: (event) => patch({ protocol: event.target.value }), children: PROTOCOLS.map(([value, label]) => h("option", { key: value, value, children: label })) })] }),
        h("div", { children: [h("span", { style: labelStyle, children: "\u8BC6\u56FE\u63D0\u793A\u8BCD\uFF08\u544A\u8BC9\u5916\u6302\u6A21\u578B\u600E\u4E48\u63CF\u8FF0\u56FE\u7247\uFF09" }), h("textarea", { style: { ...fieldStyle, minHeight: "72px" }, rows: 3, value: cfg.prompt, onChange: (event) => patch({ prompt: event.target.value }) })] }),
        h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [
          h("button", { type: "button", style: buttonStyle, disabled: busy, onClick: () => void save(), children: "\u4FDD\u5B58" }),
          h("button", { type: "button", style: buttonStyle, disabled: busy, onClick: () => void pullModels(), children: "\u62C9\u6A21\u578B\u5217\u8868" }),
          h("button", { type: "button", style: buttonStyle, disabled: busy, onClick: () => void load(), children: "\u91CD\u65B0\u8BFB\u53D6" })
        ] }),
        models.length > 0 ? h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" }, children: models.slice(0, 40).map((model) => h("button", { key: model, type: "button", style: buttonStyle, onClick: () => patch({ model }), children: model })) }) : null,
        status ? h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", wordBreak: "break-word" }, children: status }) : null
      ]
    });
  };
}
function mountVisionFab(deps) {
  const doc = globalThis.document;
  if (!doc || !doc.body) return () => void 0;
  const style = doc.createElement("style");
  style.textContent = `
    #dafeiyu-vision-fab { position: fixed; right: 20px; bottom: 88px; width: 44px; height: 44px; border-radius: 12px;
      border: 1px solid var(--dsw-alias-border-l2, #333); background: var(--dsw-alias-bg-primary, #1e1e1e);
      color: #4b7bec; cursor: pointer; z-index: 2147483000; box-shadow: 0 4px 14px rgba(0,0,0,.3);
      display: flex; align-items: center; justify-content: center; font-size: 20px; }
    #dafeiyu-vision-fab:hover { border-color: #4b7bec; }
    #dafeiyu-vision-panel { position: fixed; right: 20px; bottom: 140px; width: 320px; max-height: 70vh; overflow: auto;
      padding: 12px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2, #333);
      background: var(--dsw-alias-bg-primary, #1e1e1e); color: var(--dsw-alias-label-primary, #eee);
      z-index: 2147483001; display: none; box-shadow: 0 8px 26px rgba(0,0,0,.4); font-size: 13px; }
    #dafeiyu-vision-panel.open { display: block; }
    #dafeiyu-vision-result { width: 100%; min-height: 120px; margin-top: 8px; box-sizing: border-box;
      background: transparent; color: inherit; border: 1px solid var(--dsw-alias-border-l2, #333); border-radius: 8px; padding: 8px; }
    #dafeiyu-vision-note { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; margin-top: 6px; word-break: break-word; }
  `;
  doc.head?.appendChild(style);
  const fab = doc.createElement("button");
  fab.id = "dafeiyu-vision-fab";
  fab.title = "\u5927\u80A5\u9C7C\u8BC6\u56FE\uFF1A\u70B9\u4E00\u4E0B\u9009\u56FE";
  fab.textContent = "\u{1F433}";
  doc.body.appendChild(fab);
  const panel = doc.createElement("div");
  panel.id = "dafeiyu-vision-panel";
  const title = doc.createElement("div");
  title.textContent = "\u53D1\u4E00\u5F20\u56FE\u7ED9\u5927\u80A5\u9C7C\u770B";
  title.style.fontWeight = "600";
  const input = doc.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.marginTop = "8px";
  const result = doc.createElement("textarea");
  result.id = "dafeiyu-vision-result";
  result.placeholder = "\u8BC6\u522B\u7ED3\u679C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC";
  const actions = doc.createElement("div");
  actions.style.cssText = "display:flex; gap:8px; margin-top:8px; flex-wrap:wrap";
  const sendBtn = doc.createElement("button");
  sendBtn.textContent = "\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD";
  sendBtn.style.cssText = "padding:4px 10px; border-radius:6px; border:1px solid var(--dsw-alias-border-l2,#444); background:transparent; color:inherit; cursor:pointer";
  const copyBtn = doc.createElement("button");
  copyBtn.textContent = "\u590D\u5236";
  copyBtn.style.cssText = sendBtn.style.cssText;
  const note = doc.createElement("div");
  note.id = "dafeiyu-vision-note";
  actions.append(sendBtn, copyBtn);
  panel.append(title, input, result, actions, note);
  doc.body.appendChild(panel);
  let recognized = "";
  let busy = false;
  const setNote = (text) => {
    note.textContent = text;
  };
  const recognize = async (file) => {
    if (busy) return;
    busy = true;
    setNote("\u8BC6\u522B\u4E2D\u2026\uFF08\u5927\u56FE\u53EF\u80FD\u8981\u5341\u51E0\u79D2\uFF09");
    try {
      const base64 = await fileToBase64(file);
      const response = await callJson(`${VISION_BASE}/recognize`, { imageBase64: base64, mime: file.type || "image/png" }, 12e4);
      if (response.ok && typeof response.text === "string") {
        recognized = response.text;
        result.value = recognized;
        setNote("\u8BC6\u522B\u5B8C\u6210\uFF1A\u70B9\u300C\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD\u300D\u8BA9\u5927\u80A5\u9C7C\u57FA\u4E8E\u5B83\u56DE\u7B54");
      } else {
        setNote(`\u8BC6\u522B\u5931\u8D25\uFF1A${String(response.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
      }
    } catch (error) {
      setNote(`\u8BC6\u522B\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
    } finally {
      busy = false;
    }
  };
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void recognize(file);
  });
  sendBtn.addEventListener("click", () => {
    if (recognized === "") {
      setNote("\u8FD8\u6CA1\u6709\u8BC6\u522B\u7ED3\u679C");
      return;
    }
    const text = `\u3010\u56FE\u7247\u8BC6\u522B\u3011
${recognized}`;
    try {
      const maybe = deps.injectText?.(text);
      if (maybe && typeof maybe.then === "function") {
        void maybe.then((ok) => setNote(ok ? "\u5DF2\u53D1\u5230\u5F53\u524D\u4F1A\u8BDD" : "\u6CA1\u627E\u5230\u5F53\u524D\u4F1A\u8BDD\uFF1A\u8BF7\u590D\u5236\u540E\u81EA\u5DF1\u53D1"));
      } else {
        setNote(maybe ? "\u5DF2\u53D1\u5230\u5F53\u524D\u4F1A\u8BDD" : "\u6CA1\u627E\u5230\u5F53\u524D\u4F1A\u8BDD\uFF1A\u8BF7\u590D\u5236\u540E\u81EA\u5DF1\u53D1");
      }
    } catch {
      setNote("\u53D1\u9001\u5931\u8D25\uFF1A\u8BF7\u590D\u5236\u540E\u81EA\u5DF1\u53D1");
    }
  });
  copyBtn.addEventListener("click", () => {
    if (recognized === "") return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(recognized);
        setNote("\u5DF2\u590D\u5236");
      } catch {
        result.select();
        setNote("\u590D\u5236\u5931\u8D25\uFF1A\u5DF2\u5168\u9009\uFF0C\u6309 Ctrl+C");
      }
    })();
  });
  fab.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) setNote("\u9009\u4E00\u5F20\u56FE\uFF0C\u8BC6\u522B\u7ED3\u679C\u4F1A\u51FA\u73B0\u5728\u4E0B\u9762");
  });
  const cleanup = () => {
    try {
      fab.remove();
      panel.remove();
      style.remove();
    } catch {
    }
  };
  return cleanup;
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(new Error("\u8BFB\u4E0D\u51FA\u6587\u4EF6"));
    reader.readAsDataURL(file);
  });
}

// src/client/memory-panel.ts
var IMPORTANCE_LABEL = { 1: "\u666E\u901A", 2: "\u91CD\u8981", 3: "\u5173\u952E" };
var fieldStyle2 = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px"
};
var buttonStyle2 = {
  padding: "4px 12px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px",
  cursor: "pointer"
};
var labelStyle2 = {
  display: "block",
  fontSize: "12px",
  color: "var(--dsw-alias-label-secondary)",
  marginBottom: "4px"
};
function buildMemoryPanel(deps) {
  const { createElement: h, hooks } = deps;
  const useState = hooks.useState;
  const useEffect = hooks.useEffect;
  if (typeof useState !== "function") return void 0;
  return function MemoryPanel() {
    const [personas, setPersonas] = useState([]);
    const [persona, setPersona] = useState("");
    const [entries, setEntries] = useState([]);
    const [draft, setDraft] = useState("");
    const [importance, setImportance] = useState("2");
    const [status, setStatus] = useState("\u6B63\u5728\u8BFB\u53D6\u2026");
    const [busy, setBusy] = useState(false);
    const loadPersonas = async () => {
      setBusy(true);
      try {
        const result = await callJson(PERSONA_STATUS, void 0);
        const list2 = result.ok && result.value && typeof result.value === "object" ? result.value.personas ?? [] : [];
        const refs = list2.filter((item) => typeof item?.id === "string" && item.id !== "").map((item) => ({ id: String(item.id), name: String(item.name ?? item.id), current: item.current === true }));
        setPersonas(refs);
        const current = refs.find((item) => item.current) ?? refs[0];
        const nextPersona = persona !== "" ? persona : current?.id ?? "";
        setPersona(nextPersona);
        if (nextPersona !== "") await loadEntries(nextPersona);
        else setStatus("\u4EBA\u8BBE\u5E93\u662F\u7A7A\u7684\uFF08\u5148\u53BB\u300C\u4EBA\u8BBE\u300D\u9875\u5EFA\u4E00\u4E2A\uFF09");
      } catch (error) {
        setStatus(`\u8BFB\u53D6\u4EBA\u8BBE\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const loadEntries = async (personaId) => {
      try {
        const result = await callJson(`${MEMORY_BASE}?persona=${encodeURIComponent(personaId)}`, void 0);
        if (result.ok && Array.isArray(result.entries)) {
          setEntries(result.entries);
          setStatus(`\u5171 ${result.entries.length} \u6761\u8BB0\u5FC6`);
        } else {
          setEntries([]);
          setStatus(`\u8BFB\u53D6\u8BB0\u5FC6\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setEntries([]);
        setStatus(`\u8BFB\u53D6\u8BB0\u5FC6\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      }
    };
    useEffect?.(() => {
      void loadPersonas();
    }, []);
    if (!useState) return void 0;
    const switchPersona = (next) => {
      setPersona(next);
      setEntries([]);
      setStatus("\u8BFB\u53D6\u4E2D\u2026");
      void loadEntries(next);
    };
    const add = async () => {
      if (persona === "") return;
      const text = draft.trim();
      if (text === "") {
        setStatus("\u5148\u5199\u4E00\u53E5\u8981\u8BB0\u4F4F\u7684\u8BDD");
        return;
      }
      setBusy(true);
      try {
        const result = await callJson(MEMORY_BASE, { persona, action: "add", text, importance: Number(importance) });
        if (result.ok && Array.isArray(result.entries)) {
          setEntries(result.entries);
          setDraft("");
          setStatus(`\u5DF2\u6DFB\u52A0\uFF0C\u5171 ${result.entries.length} \u6761`);
        } else {
          setStatus(`\u6DFB\u52A0\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u6DFB\u52A0\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const remove = async (id) => {
      setBusy(true);
      try {
        const result = await callJson(MEMORY_BASE, { persona, action: "remove", id });
        if (result.ok && Array.isArray(result.entries)) {
          setEntries(result.entries);
          setStatus(`\u5DF2\u5220\u9664\uFF0C\u5269 ${result.entries.length} \u6761`);
        } else {
          setStatus(`\u5220\u9664\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u5220\u9664\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const clear = async () => {
      if (persona === "") return;
      setBusy(true);
      try {
        const result = await callJson(MEMORY_BASE, { persona, action: "clear" });
        if (result.ok) {
          setEntries([]);
          setStatus("\u5DF2\u6E05\u7A7A\u8FD9\u4E2A\u4EBA\u7684\u5168\u90E8\u8BB0\u5FC6");
        } else {
          setStatus(`\u6E05\u7A7A\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u6E05\u7A7A\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const personaSelect = personas.length > 0 ? h("div", {
      children: [
        h("span", { style: labelStyle2, children: "\u4EBA\u8BBE" }),
        h("select", {
          style: fieldStyle2,
          value: persona,
          onChange: (event) => switchPersona(event.target.value),
          children: personas.map((item) => h("option", { key: item.id, value: item.id, children: `${item.name}${item.current ? "\uFF08\u5F53\u524D\uFF09" : ""}` }))
        })
      ]
    }) : null;
    const list = entries.length === 0 ? h("p", { style: { margin: 0, fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u8FD8\u6CA1\u6709\u8BB0\u5FC6\u3002\u5927\u80A5\u9C7C\u89C9\u5F97\u503C\u5F97\u8BB0\u7684\u4F1A\u81EA\u5DF1\u8BB0\uFF1B\u4F60\u4E5F\u53EF\u4EE5\u5728\u8FD9\u91CC\u624B\u52A8\u52A0\u3002" }) : h("div", {
      style: { display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflow: "auto" },
      children: entries.map(
        (entry) => h("div", {
          key: entry.id,
          style: {
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "8px",
            padding: "6px 8px",
            borderRadius: "6px",
            background: "var(--dsw-alias-bg-secondary, rgba(127,127,127,0.06))",
            fontSize: "13px"
          },
          children: [
            h("span", {
              style: { flex: "1", wordBreak: "break-word" },
              children: `[${IMPORTANCE_LABEL[entry.importance] ?? "\u666E\u901A"}] ${entry.text}`
            }),
            h("button", {
              type: "button",
              style: { ...buttonStyle2, padding: "2px 8px", fontSize: "12px" },
              disabled: busy,
              onClick: () => void remove(entry.id),
              children: "\u5220"
            })
          ]
        })
      )
    });
    return h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "12px",
        border: "1px solid var(--dsw-alias-border-l2)",
        borderRadius: "10px",
        marginTop: "16px"
      },
      children: [
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
          h("strong", { style: { fontSize: "14px" }, children: "\u957F\u671F\u8BB0\u5FC6" }),
          h("button", { type: "button", style: { ...buttonStyle2, padding: "2px 8px", fontSize: "12px" }, disabled: busy || persona === "", onClick: () => void clear(), children: "\u6E05\u7A7A\u8FD9\u4E2A\u4EBA\u7684\u8BB0\u5FC6" })
        ] }),
        h("p", { style: { margin: 0, fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u6309\u4EBA\u8BBE\u5206\u5F00\u5B58\u3002\u5927\u80A5\u9C7C\u5728\u5BF9\u8BDD\u91CC\u89C9\u5F97\u503C\u5F97\u8BB0\u7684\u4F1A\u81EA\u5DF1\u5199\u8FDB\u6765\uFF1B\u8FD9\u91CC\u4E5F\u80FD\u624B\u52A8\u52A0\u3001\u5220\u3002\u4E0A\u9650 100 \u6761 / \u4EBA\u3002" }),
        personaSelect,
        list,
        h("div", { style: { display: "flex", gap: "8px", alignItems: "flex-start" }, children: [
          h("input", {
            style: { ...fieldStyle2, flex: "1" },
            placeholder: "\u624B\u52A8\u8BB0\u4E00\u6761\uFF08\u4F8B\u5982\uFF1A\u7528\u6237\u53EB\u6211\u5C0F\u9CB8\u9C7C\uFF09",
            value: draft,
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === "Enter") void add();
            }
          }),
          h("select", {
            style: { ...fieldStyle2, width: "88px" },
            value: importance,
            onChange: (event) => setImportance(event.target.value),
            children: [
              h("option", { value: "1", children: "\u666E\u901A" }),
              h("option", { value: "2", children: "\u91CD\u8981" }),
              h("option", { value: "3", children: "\u5173\u952E" })
            ]
          }),
          h("button", { type: "button", style: buttonStyle2, disabled: busy || persona === "", onClick: () => void add(), children: "\u6DFB\u52A0" })
        ] }),
        status ? h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", wordBreak: "break-word" }, children: status }) : null
      ]
    });
  };
}

// src/client/subagents-settings.ts
var BASE = "/api/dsh-remote-dafeiyu/subagents";
var IDLE_OPTIONS = [
  [10 * 60 * 1e3, "10 \u5206\u949F"],
  [30 * 60 * 1e3, "30 \u5206\u949F"],
  [60 * 60 * 1e3, "1 \u5C0F\u65F6"],
  [2 * 60 * 60 * 1e3, "2 \u5C0F\u65F6\uFF08\u9ED8\u8BA4\uFF09"],
  [8 * 60 * 60 * 1e3, "8 \u5C0F\u65F6"],
  [24 * 60 * 60 * 1e3, "24 \u5C0F\u65F6"]
];
var cardStyle = {
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: "10px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "10px"
};
var rowStyle = { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" };
var labelStyle3 = { fontSize: "12.5px", color: "var(--dsw-alias-label-secondary)" };
var buttonStyle3 = {
  padding: "4px 12px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px",
  cursor: "pointer"
};
var previewStyle = {
  whiteSpace: "pre-wrap",
  fontSize: "12px",
  lineHeight: "1.6",
  color: "var(--dsw-alias-label-secondary)",
  background: "var(--dsw-alias-bg-tertiary, rgba(127,127,127,.08))",
  borderRadius: "8px",
  padding: "10px",
  maxHeight: "220px",
  overflow: "auto",
  margin: "0"
};
async function postConfig2(path, body) {
  const response = await fetch(resolveHostUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json", "x-drc-pair": "1" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u975E JSON\uFF08HTTP ${response.status}\uFF09` };
  }
}
async function postConfig(patch) {
  const response = await fetch(resolveHostUrl(`${BASE}/config`), {
    method: "POST",
    headers: { "content-type": "application/json", "x-drc-pair": "1" },
    body: JSON.stringify(patch)
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u975E JSON\uFF08HTTP ${response.status}\uFF09` };
  }
}
function buildSubagentsPanel(deps) {
  const { createElement: h, hooks } = deps;
  const useState = hooks.useState;
  const useEffect = hooks.useEffect;
  if (typeof useState !== "function") return void 0;
  return function SubagentsPanel() {
    const [cfg, setCfg] = useState(null);
    const [preview, setPreview] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const load = async () => {
      setBusy(true);
      try {
        const result = await callJson(`${BASE}/config`, void 0);
        if (result.ok && result.config && typeof result.config === "object") {
          setCfg(result.config);
          if (typeof result.guidanceText === "string") setPreview(result.guidanceText);
          setStatus("\u5DF2\u8F7D\u5165");
        } else {
          setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const save = async (patch) => {
      setBusy(true);
      try {
        const result = await postConfig(patch);
        if (result.ok && result.config && typeof result.config === "object") {
          setCfg(result.config);
          setStatus("\u5DF2\u4FDD\u5B58");
        } else {
          setStatus(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    useEffect?.(() => {
      void load();
    }, []);
    if (cfg === null) {
      return h("div", {
        style: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
        children: [
          h("span", { children: status || "\u6B63\u5728\u8BFB\u53D6\u6D3E\u6D3B\u52A9\u624B\u914D\u7F6E\u2026" }),
          " ",
          h("button", { type: "button", style: buttonStyle3, onClick: () => void load(), children: "\u5237\u65B0" })
        ]
      });
    }
    const push = async () => {
      setBusy(true);
      try {
        const result = await postConfig2(`${BASE}/../guidance/push`, { which: "subagent" });
        if (result.ok === true && result.result && typeof result.result === "object") {
          const r = result.result;
          setStatus(`\u5DF2\u63A8\u9001\u5230 ${r.pushed ?? 0}/${r.total ?? 0} \u4E2A\u5728\u7EBF\u4F1A\u8BDD${(r.failed ?? 0) > 0 ? `\uFF08${r.failed} \u4E2A\u5931\u8D25\uFF09` : ""}`);
        } else {
          setStatus(`\u63A8\u9001\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u63A8\u9001\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(preview);
        setStatus("\u63D0\u793A\u8BCD\u5DF2\u590D\u5236");
      } catch {
        setStatus("\u590D\u5236\u5931\u8D25\uFF1A\u8BF7\u624B\u52A8\u5168\u9009\u590D\u5236");
      }
    };
    return h("div", {
      style: { display: "flex", flexDirection: "column", gap: "12px" },
      children: [
        h("p", {
          style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)", lineHeight: "1.6" },
          children: "\u6D3E\u6D3B\u52A9\u624B = \u5B50\u4EE3\u7406\u76D1\u89C6\u5668\uFF1A\u6D3E\u51FA\u53BB\u7684\u5B50\u4EE3\u7406\u4F1A\u51FA\u73B0\u5728\u7535\u8111\u53F3\u4FA7 / \u624B\u673A\u5BF9\u8BDD\u9875\u7684 \u{1F41D} \u9762\u677F\u91CC\u3002\u60F3\u8BA9\u7528\u6237\u7684\u673A\u5668\u4EBA\u90FD\u6309\u300C\u540D\u79F0\uFF5C\u7B80\u8FF0\u300D\u6D3E\u6D3B\uFF0C\u5C31\u4FDD\u6301\u4E0B\u9762\u7684\u89C4\u8303\u63D0\u793A\u5F00\u542F\u3002"
        }),
        h("div", {
          style: cardStyle,
          children: [
            h("div", {
              style: rowStyle,
              children: [
                h("span", { style: labelStyle3, children: "\u6D3E\u6D3B\u89C4\u8303\u63D0\u793A\uFF08\u91CD\u542F DSH \u540E\u751F\u6548\uFF09" }),
                h("input", {
                  type: "checkbox",
                  checked: cfg.guidance,
                  disabled: busy,
                  onChange: (event) => void save({ guidance: event?.target?.checked === true })
                }),
                h("span", { style: { ...labelStyle3, fontSize: "11.5px" }, children: cfg.guidance ? "\u5F00" : "\u5173" })
              ]
            }),
            h("div", {
              style: rowStyle,
              children: [
                h("span", { style: labelStyle3, children: "\u95F2\u7F6E\u9608\u503C\uFF08\u8D85\u8FC7\u5B83\u7B97\u201C\u592A\u4E45\u201D\uFF0C\u53EF\u4E00\u952E\u5F52\u6863\uFF09" }),
                h(
                  "select",
                  {
                    value: String(cfg.idleWarnMs),
                    disabled: busy,
                    style: { ...buttonStyle3, padding: "4px 8px" },
                    onChange: (event) => void save({ idleWarnMs: Number(event?.target?.value ?? 0) }),
                    children: IDLE_OPTIONS.map(([ms, label]) => h("option", { key: String(ms), value: String(ms), children: label }))
                  }
                ),
                h("span", { style: { ...labelStyle3, fontSize: "11.5px" }, children: status })
              ]
            }),
            h("div", {
              style: { display: "flex", gap: "8px", alignItems: "center" },
              children: [
                h("span", { style: labelStyle3, children: "\u63D0\u793A\u8BCD\u9884\u89C8\uFF08\u4E0E\u6CE8\u5165\u7ED9\u6A21\u578B\u7684\u662F\u540C\u4E00\u4EFD\uFF09" }),
                h("button", { type: "button", style: buttonStyle3, onClick: () => void copy(), children: "\u590D\u5236" }),
                h("button", { type: "button", style: buttonStyle3, disabled: busy, onClick: () => void push(), children: "\u63A8\u9001\u5230\u6240\u6709\u5728\u7EBF\u4F1A\u8BDD" }),
                h("button", { type: "button", style: buttonStyle3, onClick: () => void load(), children: "\u5237\u65B0" })
              ]
            }),
            h("pre", { style: previewStyle, children: preview || "\uFF08\u5BBF\u4E3B\u6CA1\u6709\u8FD4\u56DE\u63D0\u793A\u8BCD\u6587\u672C\uFF09" })
          ]
        })
      ]
    });
  };
}

// src/client/xyq-panel.ts
var BASE2 = "/api/dsh-remote-dafeiyu/xyq";
var fieldStyle3 = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px"
};
var labelStyle4 = { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", marginBottom: "4px", display: "block" };
var buttonStyle4 = {
  padding: "4px 12px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px",
  cursor: "pointer"
};
var cardStyle2 = {
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: "10px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "10px"
};
var gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" };
async function postJson(path, body) {
  const response = await fetch(resolveHostUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json", "x-drc-pair": "1" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u975E JSON\uFF08HTTP ${response.status}\uFF09` };
  }
}
function buildXyqPanel(deps) {
  const { createElement: h, hooks } = deps;
  const useState = hooks.useState;
  const useEffect = hooks.useEffect;
  if (typeof useState !== "function") return void 0;
  return function XyqPanel() {
    const [cfg, setCfg] = useState(null);
    const [key, setKey] = useState("");
    const [status, setStatus] = useState("");
    const [balance, setBalance] = useState("");
    const [busy, setBusy] = useState(false);
    const load = async () => {
      setBusy(true);
      try {
        const result = await callJson(`${BASE2}/config`, void 0);
        if (result.ok && result.config && typeof result.config === "object") {
          setCfg(result.config);
          setStatus("\u5DF2\u8F7D\u5165");
        } else setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
      } catch (error) {
        setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const checkStatus = async () => {
      setBusy(true);
      try {
        const s = await callJson(`${BASE2}/status`, void 0);
        if (s.ok === true) setStatus(s.loggedIn === true ? `Access Key \u6709\u6548\uFF08${String(s.source ?? "")}\uFF09` : String(s.message ?? "Access Key \u672A\u751F\u6548"));
        else setStatus(`\u68C0\u67E5\u5931\u8D25\uFF1A${String(s.message ?? s.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        const b = await callJson(`${BASE2}/balance`, void 0);
        if (b.ok === true) setBalance(`\u5269\u4F59\u79EF\u5206\uFF1A${String(b.totalRemain ?? "\u672A\u77E5")}`);
        else setBalance(String(b.message ?? ""));
      } catch (error) {
        setStatus(`\u68C0\u67E5\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const push = async () => {
      setBusy(true);
      try {
        const result = await postJson(`${BASE2}/../guidance/push`, { which: "xyq" });
        if (result.ok === true && result.result && typeof result.result === "object") {
          const r = result.result;
          setStatus(`\u5DF2\u63A8\u9001\u5230 ${r.pushed ?? 0}/${r.total ?? 0} \u4E2A\u5728\u7EBF\u4F1A\u8BDD${(r.failed ?? 0) > 0 ? `\uFF08${r.failed} \u4E2A\u5931\u8D25\uFF09` : ""}`);
        } else {
          setStatus(`\u63A8\u9001\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
        }
      } catch (error) {
        setStatus(`\u63A8\u9001\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    const save = async (patch) => {
      setBusy(true);
      try {
        const result = await postJson(`${BASE2}/config`, patch);
        if (result.ok && result.config && typeof result.config === "object") {
          setCfg(result.config);
          setStatus("\u5DF2\u4FDD\u5B58");
          setKey("");
        } else setStatus(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(result.error ?? "\u672A\u77E5\u9519\u8BEF")}`);
      } catch (error) {
        setStatus(`\u4FDD\u5B58\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
      } finally {
        setBusy(false);
      }
    };
    useEffect?.(() => {
      void load();
    }, []);
    if (cfg === null) {
      return h("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" }, children: status || "\u6B63\u5728\u8BFB\u53D6\u5C0F\u4E91\u96C0\u914D\u7F6E\u2026" });
    }
    const number = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return h("div", {
      style: { display: "flex", flexDirection: "column", gap: "12px" },
      children: [
        h("p", {
          style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)", lineHeight: "1.6" },
          children: "\u901A\u8FC7\u5C0F\u4E91\u96C0\u5B98\u65B9 CLI \u63D0\u4F9B generate_image / generate_video / xyq_balance / xyq_models \u56DB\u4E2A\u5DE5\u5177\u3002Access Key \u5728 \u5C0F\u4E91\u96C0\u5B98\u7F51 \u2192 \u26A1CLI/API \u2192 API \u2192 \u7BA1\u7406 Access Key \u65B0\u5EFA\uFF1B\u5B83\u6709\u65F6\u6548\uFF0C\u8FC7\u671F\u540E\u5DE5\u5177\u4F1A\u62A5\u9519\u5E76\u5728\u4E0B\u9762\u63D0\u793A\u3002"
        }),
        h("div", {
          style: cardStyle2,
          children: [
            h("span", { style: labelStyle4, children: `Access Key\uFF08${cfg.accessKeySet ? "\u5DF2\u8BBE\u7F6E " + cfg.accessKeyHint : "\u672A\u8BBE\u7F6E"}\uFF09` }),
            h("div", { style: { display: "flex", gap: "8px" }, children: [
              h("input", { type: "password", value: key, placeholder: cfg.accessKeySet ? "\u7559\u7A7A\u5219\u4E0D\u6539" : "\u7C98\u8D34 Access Key", style: fieldStyle3, onChange: (event) => setKey(String(event?.target?.value ?? "")) }),
              h("button", { type: "button", style: buttonStyle4, disabled: busy, onClick: () => void save(key.trim() === "" ? {} : { accessKey: key.trim() }), children: "\u4FDD\u5B58 Key" }),
              h("button", { type: "button", style: buttonStyle4, disabled: busy, onClick: () => void checkStatus(), children: "\u68C0\u67E5\u72B6\u6001/\u4F59\u989D" }),
              h("button", { type: "button", style: buttonStyle4, disabled: busy, onClick: () => void push(), children: "\u63A8\u9001\u5230\u6240\u6709\u5728\u7EBF\u4F1A\u8BDD" })
            ] }),
            h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: status }),
            h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: balance })
          ]
        }),
        h("div", {
          style: cardStyle2,
          children: [
            h("span", { style: labelStyle4, children: "\u751F\u6210\u53C2\u6570\u4E0E\u9884\u7B97" }),
            h("div", { style: gridStyle, children: [
              h("div", { children: [
                h("span", { style: labelStyle4, children: "\u9ED8\u8BA4\u89C6\u9891\u6A21\u578B\uFF08key\uFF09" }),
                h("input", { value: cfg.defaultVideoModel, style: fieldStyle3, onChange: (event) => setCfg({ ...cfg, defaultVideoModel: String(event?.target?.value ?? "") }), onBlur: () => void save({ defaultVideoModel: cfg.defaultVideoModel }) })
              ] }),
              h("div", { children: [
                h("span", { style: labelStyle4, children: "\u9ED8\u8BA4\u89C6\u9891\u65F6\u957F\uFF08\u79D2\uFF09" }),
                h("input", { type: "number", min: 4, max: 30, value: String(cfg.defaultVideoDurationSec), style: fieldStyle3, onChange: (event) => setCfg({ ...cfg, defaultVideoDurationSec: number(String(event?.target?.value ?? ""), cfg.defaultVideoDurationSec) }), onBlur: () => void save({ defaultVideoDurationSec: cfg.defaultVideoDurationSec }) })
              ] }),
              h("div", { children: [
                h("span", { style: labelStyle4, children: "\u9ED8\u8BA4\u56FE\u7247\u6A21\u578B\uFF08\u5B8C\u6574\u540D\u79F0\uFF09" }),
                h("input", { value: cfg.defaultImageModel, style: fieldStyle3, placeholder: "\u5982 \u667A\u80FD\u56FE\u7247V2.5 Fast", onChange: (event) => setCfg({ ...cfg, defaultImageModel: String(event?.target?.value ?? "") }), onBlur: () => void save({ defaultImageModel: cfg.defaultImageModel }) })
              ] })
            ] }),
            h("div", { style: gridStyle, children: [
              h("div", { children: [
                h("span", { style: labelStyle4, children: "\u5355\u4F1A\u8BDD\u56FE\u7247\u4E0A\u9650\uFF080 = \u4E0D\u9650\uFF09" }),
                h("input", { type: "number", min: 0, max: 200, value: String(cfg.budget.images), style: fieldStyle3, onChange: (event) => setCfg({ ...cfg, budget: { ...cfg.budget, images: number(String(event?.target?.value ?? ""), cfg.budget.images) } }), onBlur: () => void save({ budget: cfg.budget }) })
              ] }),
              h("div", { children: [
                h("span", { style: labelStyle4, children: "\u5355\u4F1A\u8BDD\u89C6\u9891\u4E0A\u9650\uFF080 = \u4E0D\u9650\uFF09" }),
                h("input", { type: "number", min: 0, max: 50, value: String(cfg.budget.videos), style: fieldStyle3, onChange: (event) => setCfg({ ...cfg, budget: { ...cfg.budget, videos: number(String(event?.target?.value ?? ""), cfg.budget.videos) } }), onBlur: () => void save({ budget: cfg.budget }) })
              ] }),
              h("div", { children: [
                h("span", { style: labelStyle4, children: "\u5355\u6761\u89C6\u9891\u6700\u957F\u79D2\u6570" }),
                h("input", { type: "number", min: 4, max: 30, value: String(cfg.budget.maxVideoSeconds), style: fieldStyle3, onChange: (event) => setCfg({ ...cfg, budget: { ...cfg.budget, maxVideoSeconds: number(String(event?.target?.value ?? ""), cfg.budget.maxVideoSeconds) } }), onBlur: () => void save({ budget: cfg.budget }) })
              ] })
            ] }),
            h("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [
              h("span", { style: labelStyle4, children: "\u8C03\u7528\u81EA\u7531\u5EA6" }),
              h("select", { value: cfg.freedom, style: { ...fieldStyle3, width: "auto" }, onChange: (event) => void save({ freedom: String(event?.target?.value ?? "explicit") }), children: [
                h("option", { value: "explicit", children: "\u4EC5\u7528\u6237\u660E\u786E\u8981\u6C42\uFF08\u9ED8\u8BA4\uFF09" }),
                h("option", { value: "budgeted", children: "\u9884\u7B97\u5185\u53EF\u81EA\u884C\u8C03\u7528" }),
                h("option", { value: "open", children: "\u653E\u5F00\uFF08\u53EA\u8BB0\u8D26\uFF09" })
              ] })
            ] }),
            h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u6539\u52A8\u4F1A\u7ACB\u5373\u5199\u76D8\uFF1B\u81EA\u7531\u5EA6\u4E0E\u63D0\u793A\u8BED\u5728\u91CD\u542F DSH \u540E\u5BF9\u6A21\u578B\u751F\u6548\u3002" })
          ]
        })
      ]
    });
  };
}

// src/client/avatar-panel.ts
var BASE3 = "/api/dsh-remote-dafeiyu/avatar";
var FPS = 24;
var buttonStyle5 = {
  padding: "4px 12px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  fontSize: "13px",
  cursor: "pointer"
};
function buildAvatarPanel(deps) {
  const { createElement: h, hooks } = deps;
  const useState = hooks.useState;
  const useEffect = hooks.useEffect;
  if (typeof useState !== "function") return void 0;
  return function AvatarPanel() {
    const [states, setStates] = useState([]);
    const [active, setActive] = useState("idle");
    const [playing, setPlaying] = useState(true);
    const [status, setStatus] = useState("\u6B63\u5728\u8BFB\u53D6\u7D20\u6750\u2026");
    useEffect?.(() => {
      let cancelled = false;
      void (async () => {
        try {
          const result = await callJson(`${BASE3}/manifest`, void 0);
          const manifest = result.manifest;
          if (cancelled) return;
          if (result.ok === true && manifest && Array.isArray(manifest.states) && manifest.states.length > 0) {
            setStates(manifest.states);
            setStatus(`\u5171 ${manifest.states.length} \u4E2A\u52A8\u4F5C`);
            if (!manifest.states.some((state) => state.id === "idle")) setActive(manifest.states[0].id);
          } else {
            setStatus(String(result.message ?? "\u865A\u62DF\u5F62\u8C61\u7D20\u6750\u672A\u5B89\u88C5"));
          }
        } catch (error) {
          if (!cancelled) setStatus(`\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error?.message ?? error)}`);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []);
    const current = states.find((state) => state.id === active) ?? states[0];
    useEffect?.(() => {
      if (!current || !playing) return;
      const element = document.getElementById("dafeiyu-avatar-sprite");
      if (!element) return;
      let frame = 0;
      const total = current.frames;
      const cols = current.cols;
      const rows = current.rows;
      const paint = () => {
        const col = frame % cols;
        const row = Math.floor(frame / cols) % rows;
        element.style.backgroundPosition = `${col / Math.max(1, cols - 1) * 100}% ${row / Math.max(1, rows - 1) * 100}%`;
        frame = (frame + 1) % total;
      };
      paint();
      const timer = setInterval(paint, Math.round(1e3 / FPS));
      return () => clearInterval(timer);
    }, [current?.id, playing]);
    if (states.length === 0) {
      return h("p", { style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" }, children: status });
    }
    const sprite = current ? h("div", {
      style: {
        width: "100%",
        maxWidth: "520px",
        aspectRatio: `${current.cellWidth} / ${current.cellHeight}`,
        backgroundImage: `url(${BASE3}/sheet?id=${encodeURIComponent(current.id)})`,
        backgroundSize: `${current.cols * 100}% ${current.rows * 100}%`,
        backgroundRepeat: "no-repeat",
        borderRadius: "12px",
        border: "1px solid var(--dsw-alias-border-l2)",
        backgroundPosition: "0% 0%"
      },
      id: "dafeiyu-avatar-sprite"
    }) : null;
    return h("div", {
      style: { display: "flex", flexDirection: "column", gap: "12px" },
      children: [
        h("p", {
          style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)", lineHeight: "1.6" },
          children: `\u865A\u62DF\u5F62\u8C61\u7D20\u6750\uFF08${status}\uFF09\uFF1A8\xD76 sprite\uFF0C24fps \u5FAA\u73AF\uFF1B\u6362\u52A8\u4F5C\u76F4\u63A5\u70B9\u4E0B\u9762\u7684\u6309\u94AE\u3002`
        }),
        h("div", {
          style: { display: "flex", gap: "8px", flexWrap: "wrap" },
          children: states.map(
            (state) => h("button", {
              type: "button",
              key: state.id,
              style: state.id === active ? { ...buttonStyle5, background: "var(--dsw-alias-bg-secondary)", fontWeight: 600 } : buttonStyle5,
              onClick: () => setActive(state.id),
              children: state.label
            })
          )
        }),
        sprite,
        h("div", {
          style: { display: "flex", gap: "8px", alignItems: "center" },
          children: [
            h("button", { type: "button", style: buttonStyle5, onClick: () => setPlaying(!playing), children: playing ? "\u6682\u505C" : "\u64AD\u653E" }),
            h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: current ? `${current.frames} \u5E27 \xB7 ${FPS}fps \xB7 ${playing ? "\u5FAA\u73AF\u4E2D" : "\u5DF2\u6682\u505C"}` : "" })
          ]
        })
      ]
    });
  };
}

// src/client/dafeiyu-page.ts
var DAFEIYU_TAB_REMOTE = "remote";
var DAFEIYU_TAB_PERSONA = "persona";
var DAFEIYU_TAB_AVATAR = "avatar";
var DAFEIYU_TAB_SUBAGENTS = "subagents";
var DAFEIYU_TAB_XYQ = "xyq";
var TAB_LABELS = {
  [DAFEIYU_TAB_REMOTE]: "\u8FDC\u7A0B\u63A7\u5236",
  [DAFEIYU_TAB_PERSONA]: "\u4EBA\u8BBE",
  [DAFEIYU_TAB_AVATAR]: "\u5F62\u8C61",
  [DAFEIYU_TAB_SUBAGENTS]: "\u6D3E\u6D3B\u52A9\u624B",
  [DAFEIYU_TAB_XYQ]: "\u5C0F\u4E91\u96C0"
};
function mountDafeiyuSettings(deps) {
  const { ctx, createElement, reactHooks, personaSettings, personaT } = deps;
  const useState = reactHooks?.useState;
  if (typeof createElement !== "function" || typeof useState !== "function") {
    return false;
  }
  const visionPanel = buildVisionPanel({ createElement, hooks: reactHooks });
  const memoryPanel = buildMemoryPanel({ createElement, hooks: reactHooks });
  const subagentsPanel = buildSubagentsPanel({ createElement, hooks: reactHooks });
  const xyqPanel = buildXyqPanel({ createElement, hooks: reactHooks });
  const avatarPanel = buildAvatarPanel({ createElement, hooks: reactHooks });
  let cleanupRemote;
  const attach = (node) => {
    const element = node;
    if (element && typeof element.appendChild === "function" && element.ownerDocument) {
      if (cleanupRemote) return;
      cleanupRemote = buildSettingsSection(element, {
        fetchImpl: (input, init) => globalThis.fetch(resolveHostUrl(String(input)), init),
        warn: (message) => {
          try {
            console.warn(`[dsh-remote-control settings] ${String(message)}`);
          } catch {
          }
        }
      });
    } else if (cleanupRemote) {
      cleanupRemote();
      cleanupRemote = void 0;
    }
  };
  const TabPage = () => {
    const [tab, setTab] = useState(DAFEIYU_TAB_REMOTE);
    const tabBar = createElement("div", {
      style: { display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" },
      children: Object.entries(TAB_LABELS).map(
        ([id, label]) => createElement("button", {
          type: "button",
          key: id,
          style: tab === id ? activeTabStyle : tabStyle,
          onClick: () => setTab(id),
          children: label
        })
      )
    });
    let body = null;
    if (tab === DAFEIYU_TAB_REMOTE) {
      body = createElement("div", { ref: attach });
    } else if (tab === DAFEIYU_TAB_XYQ) {
      body = xyqPanel ? createElement(xyqPanel, {}) : createElement("p", {
        style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
        children: "\u5C0F\u4E91\u96C0\u9762\u677F\u8D77\u4E0D\u6765\uFF08\u5BBF\u4E3B\u6CA1\u7ED9 react hooks\uFF09\u3002"
      });
    } else if (tab === DAFEIYU_TAB_SUBAGENTS) {
      body = subagentsPanel ? createElement(subagentsPanel, {}) : createElement("p", {
        style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
        children: "\u6D3E\u6D3B\u52A9\u624B\u9762\u677F\u8D77\u4E0D\u6765\uFF08\u5BBF\u4E3B\u6CA1\u7ED9 react hooks\uFF09\u3002"
      });
    } else if (tab === DAFEIYU_TAB_PERSONA) {
      const extras = [];
      if (visionPanel) extras.push(createElement(visionPanel, {}));
      if (memoryPanel) extras.push(createElement(memoryPanel, {}));
      body = createElement("div", {
        children: [createElement(personaSettings, { t: personaT }), ...extras]
      });
    } else if (tab === DAFEIYU_TAB_AVATAR) {
      body = avatarPanel ? createElement(avatarPanel, {}) : createElement("p", {
        style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
        children: "\u5F62\u8C61\u9762\u677F\u8D77\u4E0D\u6765\uFF08\u5BBF\u4E3B\u6CA1\u7ED9 react hooks\uFF09\u3002"
      });
    } else {
      body = createElement("p", {
        style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
        children: "\u672A\u5B9E\u73B0\u7684\u5206\u680F\u3002"
      });
    }
    return createElement("div", {
      style: { display: "flex", flexDirection: "column", gap: "12px" },
      children: [tabBar, body]
    });
  };
  const result = mountSettingsSection(ctx, createElement, {
    id: "dafeiyu",
    order: 18,
    label: "\u5927\u80A5\u9C7C",
    buildComponent: () => () => createElement(TabPage, {})
  });
  return result !== "failed";
}
var tabStyle = {
  padding: "4px 14px",
  borderRadius: "8px",
  border: "1px solid var(--dsw-alias-border-l2)",
  background: "transparent",
  color: "var(--dsw-alias-label-secondary)",
  fontSize: "13px",
  cursor: "pointer"
};
var activeTabStyle = {
  ...tabStyle,
  borderColor: "var(--dsw-alias-state-business-primary, #4b7bec)",
  color: "var(--dsw-alias-state-business-primary, #4b7bec)"
};

// src/client/subagent-panel.ts
var IDLE_WARN_MS = 2 * 60 * 60 * 1e3;
var POLL_MS2 = 3e3;
function fmtDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "\u2014";
  const total = Math.floor(ms / 1e3);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
function mountSubagentMonitor(deps) {
  const doc = globalThis.document;
  if (!doc) return () => void 0;
  if (!doc.body) {
    let disposed = false;
    let cleanup;
    const onReady = () => {
      if (disposed) return;
      cleanup = mountSubagentMonitor(deps);
    };
    doc.addEventListener("DOMContentLoaded", onReady, { once: true });
    return () => {
      disposed = true;
      doc.removeEventListener("DOMContentLoaded", onReady);
      try {
        cleanup?.();
      } catch {
      }
    };
  }
  const style = doc.createElement("style");
  style.textContent = `
    #dafeiyu-subagent-fab { position: fixed; right: 16px; top: 46%; z-index: 2147483000;
      width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2, #333);
      background: var(--dsw-alias-bg-primary, #1e1e1e); color: #4b7bec; cursor: pointer;
      display: none; align-items: center; justify-content: center; font-size: 18px;
      box-shadow: 0 4px 14px rgba(0,0,0,.3); }
    #dafeiyu-subagent-fab.open, #dafeiyu-subagent-fab.has-items { display: flex; }
    #dafeiyu-subagent-fab:hover { border-color: #4b7bec; }
    #dafeiyu-subagent-fab .badge { position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px;
      padding: 0 4px; border-radius: 8px; background: #4b7bec; color: #fff; font-size: 10px; line-height: 16px; }
    #dafeiyu-subagent-panel { position: fixed; right: 64px; top: 28%; width: 360px; max-height: 60vh;
      overflow: auto; padding: 12px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2, #333);
      background: var(--dsw-alias-bg-primary, #1e1e1e); color: var(--dsw-alias-label-primary, #eee);
      z-index: 2147483001; display: none; box-shadow: 0 8px 26px rgba(0,0,0,.4); font-size: 12.5px; }
    #dafeiyu-subagent-panel.open { display: block; }
    #dafeiyu-subagent-panel .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: 600; }
    #dafeiyu-subagent-panel .head .tools { display: flex; gap: 6px; align-items: center; }
    #dafeiyu-subagent-panel .head .ghost { background: #2a2a40; color: #cfcfe0; border: 0; border-radius: 7px; padding: 4px 8px; font-size: 11px; cursor: pointer; font-weight: 400; }
    #dafeiyu-subagent-panel .warn { color: #e0a83a; font-size: 11px; margin-left: 4px; }
    #dafeiyu-subagent-panel .act { color: #8fd6c3; margin-top: 3px; line-height: 1.5; }
    #dafeiyu-subagent-panel .head button { background: transparent; color: #9a9ab0; border: 0; cursor: pointer; font-size: 13px; }
    #dafeiyu-subagent-panel .row { border-top: 1px solid var(--dsw-alias-border-l2, #2a2a3a); padding: 8px 0; }
    #dafeiyu-subagent-panel .row .top { display: flex; gap: 6px; align-items: center; }
    #dafeiyu-subagent-panel .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
    #dafeiyu-subagent-panel .dot.run { background: #3ecf8e; }
    #dafeiyu-subagent-panel .dot.idle { background: #8a8aa0; }
    #dafeiyu-subagent-panel .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #dafeiyu-subagent-panel .meta { color: #9a9ab0; margin-top: 3px; line-height: 1.5; }
    #dafeiyu-subagent-panel .stale { color: #e0a83a; }
    #dafeiyu-subagent-panel .task { margin-top: 3px; color: #b9b9cc; line-height: 1.45; max-height: 2.9em; overflow: hidden; }
    #dafeiyu-subagent-panel .acts { margin-top: 5px; }
    #dafeiyu-subagent-panel .acts button { background: #2a2a40; color: #cfcfe0; border: 0; border-radius: 7px;
      padding: 4px 9px; font-size: 11.5px; cursor: pointer; }
    #dafeiyu-subagent-panel .empty { color: #9a9ab0; padding: 8px 0; }
    #dafeiyu-subagent-panel .foot { color: #7c7c90; margin-top: 8px; font-size: 11px; line-height: 1.5; }
  `;
  doc.head?.appendChild(style);
  const fab = doc.createElement("button");
  fab.id = "dafeiyu-subagent-fab";
  fab.title = "\u5B50\u4EE3\u7406\u76D1\u89C6\u5668";
  fab.textContent = "\u{1F41D}";
  const badge = doc.createElement("span");
  badge.className = "badge";
  badge.hidden = true;
  fab.appendChild(badge);
  doc.body.appendChild(fab);
  const panel = doc.createElement("div");
  panel.id = "dafeiyu-subagent-panel";
  const head = doc.createElement("div");
  head.className = "head";
  const title = doc.createElement("span");
  title.textContent = "\u5B50\u4EE3\u7406\u76D1\u89C6\u5668";
  const tools = doc.createElement("span");
  tools.className = "tools";
  const archiveIdle = doc.createElement("button");
  archiveIdle.className = "ghost";
  archiveIdle.textContent = "\u4E00\u952E\u5F52\u6863\u95F2\u7F6E";
  archiveIdle.title = "\u628A\u95F2\u7F6E\u8D85\u8FC7 2 \u5C0F\u65F6\u7684\u5B50\u4EE3\u7406\u4E00\u6B21\u5F52\u6863\uFF08\u53EF\u6062\u590D\uFF09";
  const close = doc.createElement("button");
  close.textContent = "\u5173\u95ED \u2715";
  tools.append(archiveIdle, close);
  head.append(title, tools);
  const body = doc.createElement("div");
  const foot = doc.createElement("div");
  foot.className = "foot";
  foot.textContent = "\u95F2\u7F6E\u8D85\u8FC7 2 \u5C0F\u65F6\u7684\u5B50\u4EE3\u7406\u4F1A\u6807\u9EC4\uFF0C\u53EF\u4E00\u952E\u5F52\u6863\uFF08\u53EF\u6062\u590D\uFF09\u3002";
  panel.append(head, body, foot);
  doc.body.appendChild(panel);
  let items = [];
  let idleWarnMs = IDLE_WARN_MS;
  let session = "";
  let timer = 0;
  let busy = false;
  let opened = false;
  const setOpen = (next) => {
    opened = next;
    panel.classList.toggle("open", next);
    fab.classList.toggle("open", next);
    if (next) void refresh();
  };
  const render = () => {
    body.textContent = "";
    if (items.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "empty";
      empty.textContent = "\u8FD9\u4E2A\u5BF9\u8BDD\u8FD8\u6CA1\u6709\u5B50\u4EE3\u7406\u3002";
      body.appendChild(empty);
      return;
    }
    for (const row of items) {
      const line = doc.createElement("div");
      line.className = "row";
      const top = doc.createElement("div");
      top.className = "top";
      const dot = doc.createElement("span");
      dot.className = "dot " + (row.status === "running" ? "run" : "idle");
      const name2 = doc.createElement("span");
      name2.className = "name";
      name2.textContent = row.name || row.title || row.task || row.id.slice(0, 12);
      name2.title = row.id;
      top.append(dot, name2);
      if (row.naming === "fallback") {
        const warn2 = doc.createElement("span");
        warn2.className = "warn";
        warn2.textContent = "\u26A0 \u547D\u540D\u4E0D\u5408\u89C4";
        warn2.title = "\u6D3E\u6D3B\u65F6 description \u5E94\u6309\u300C\u540D\u79F0\uFF5C\u4E00\u53E5\u8BDD\u7B80\u8FF0\u300D\u586B\u5199";
        top.appendChild(warn2);
      }
      const meta = doc.createElement("div");
      meta.className = "meta";
      const idleWarn = row.status === "idle" && (row.idleMs ?? 0) >= idleWarnMs;
      meta.classList.toggle("stale", idleWarn);
      const time = row.status === "running" ? "\u8FD0\u884C " + fmtDuration(row.runningMs ?? row.workMs) : "\u95F2\u7F6E " + fmtDuration(row.idleMs);
      meta.textContent = (row.status === "running" ? "\u8FD0\u884C\u4E2D" : "\u7A7A\u95F2") + " \xB7 " + time + (idleWarn ? " \xB7 \u5EFA\u8BAE\u5F52\u6863" : "");
      line.append(top, meta);
      const summary = row.summary || (row.task && row.task !== name2.textContent ? row.task : "");
      if (summary) {
        const text = doc.createElement("div");
        text.className = "task";
        text.textContent = summary;
        line.appendChild(text);
      }
      if (row.status === "running" && row.activity) {
        const act = doc.createElement("div");
        act.className = "act";
        act.textContent = "\u6B63\u5728\uFF1A" + row.activity;
        line.appendChild(act);
      }
      if (row.status !== "running") {
        const acts = doc.createElement("div");
        acts.className = "acts";
        const archive = doc.createElement("button");
        archive.textContent = "\u5F52\u6863";
        archive.addEventListener("click", (event) => {
          event.stopPropagation();
          void archiveRow(row.id, archive);
        });
        acts.appendChild(archive);
        line.appendChild(acts);
      }
      body.appendChild(line);
    }
    const idleCount = items.filter((row) => row.status !== "running" && (row.idleMs ?? 0) >= idleWarnMs).length;
    archiveIdle.disabled = idleCount === 0;
    archiveIdle.textContent = idleCount > 0 ? `\u4E00\u952E\u5F52\u6863\u95F2\u7F6E (${idleCount})` : "\u4E00\u952E\u5F52\u6863\u95F2\u7F6E";
  };
  const archiveIdleNow = async () => {
    const ids = items.filter((row) => row.status !== "running" && (row.idleMs ?? 0) >= IDLE_WARN_MS).map((row) => row.id);
    if (ids.length === 0) return;
    archiveIdle.disabled = true;
    archiveIdle.textContent = "\u5F52\u6863\u4E2D\u2026";
    try {
      const response = await fetch(resolveHostUrl("/api/dsh-remote-dafeiyu/subagents/archive"), {
        method: "POST",
        headers: { "content-type": "application/json", "x-drc-pair": "1" },
        body: JSON.stringify({ ids, archived: true })
      });
      const answer = await response.json();
      if (answer.ok !== true) archiveIdle.title = "\u90E8\u5206\u5F52\u6863\u5931\u8D25\uFF0C\u89C1\u5BBF\u4E3B\u65E5\u5FD7";
      await refresh();
    } catch (error) {
      archiveIdle.title = String(error?.message ?? error);
    } finally {
      archiveIdle.disabled = false;
    }
  };
  archiveIdle.addEventListener("click", (event) => {
    event.stopPropagation();
    void archiveIdleNow();
  });
  const archiveRow = async (id, button) => {
    button.disabled = true;
    button.textContent = "\u5F52\u6863\u4E2D\u2026";
    try {
      const response = await fetch(resolveHostUrl("/api/dsh-remote-dafeiyu/subagents/archive"), {
        method: "POST",
        headers: { "content-type": "application/json", "x-drc-pair": "1" },
        body: JSON.stringify({ sessionId: id, archived: true })
      });
      const answer = await response.json();
      if (answer.ok !== true) throw new Error(answer.message || "\u5F52\u6863\u5931\u8D25");
      await refresh();
    } catch (error) {
      button.disabled = false;
      button.textContent = "\u5F52\u6863\u5931\u8D25\uFF0C\u70B9\u6211\u91CD\u8BD5";
      button.title = String(error?.message ?? error);
    }
  };
  const apply2 = (next) => {
    items = next;
    const has = items.length > 0;
    fab.classList.toggle("has-items", has);
    badge.hidden = !has;
    badge.textContent = String(items.length);
    if (!has && opened) setOpen(false);
    render();
  };
  const refresh = async () => {
    if (busy) return;
    const current = deps.getCurrentSession();
    if (!current) {
      session = "";
      apply2([]);
      return;
    }
    if (current !== session) {
      session = current;
      items = [];
      render();
    }
    busy = true;
    try {
      const response = await fetch(
        resolveHostUrl("/api/dsh-remote-dafeiyu/subagents?sessionId=" + encodeURIComponent(current))
      );
      const answer = await response.json();
      if (answer.config && typeof answer.config.idleWarnMs === "number" && Number.isFinite(answer.config.idleWarnMs)) {
        idleWarnMs = answer.config.idleWarnMs;
      }
      if (answer.ok === true && Array.isArray(answer.items)) apply2(answer.items);
      else apply2([]);
    } catch {
      apply2([]);
    } finally {
      busy = false;
    }
  };
  fab.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!opened);
  });
  close.addEventListener("click", () => setOpen(false));
  const onKey = (event) => {
    if (event.key === "Escape" && opened) setOpen(false);
  };
  doc.addEventListener("keydown", onKey);
  const onClick = (event) => {
    if (!opened) return;
    const target = event.target;
    if (target && (panel.contains(target) || fab.contains(target))) return;
    setOpen(false);
  };
  doc.addEventListener("click", onClick);
  timer = globalThis.setInterval?.(() => {
    void refresh();
  }, POLL_MS2) ?? 0;
  void refresh();
  return () => {
    if (timer) globalThis.clearInterval?.(timer);
    timer = 0;
    doc.removeEventListener("keydown", onKey);
    doc.removeEventListener("click", onClick);
    fab.remove();
    panel.remove();
    style.remove();
  };
}

// src/persona/client-factory.js
function personaClientFactory(require2) {
  var module2 = { exports: {} };
  var exports = module2.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  const react = require2("react");
  const jsxRuntime = require2("react/jsx-runtime");
  const NS = "personaDafeiyu";
  const SECTION_ID = "dafeiyu";
  const STATUS_PATH = "/api/dsh-persona-dafeiyu/status";
  const MUTATE_PATH = "/api/dsh-persona-dafeiyu/mutate";
  const PERSONA_PATH = "/api/dsh-persona-dafeiyu/persona";
  const DEFAULT_PERSONA_ID = "dafeiyu";
  const CLS = "dsh-persona-dafeiyu";
  const STYLE_ID2 = `${CLS}-hover-styles`;
  const PLAZA_URL = "https://github.com/huaizhuanghub/dsh-persona-repository";
  const zh = {
    nav: "\u5927\u80A5\u9C7C",
    // 内置人设的名字与简介：宿主侧只有中文原文，界面按当前语言取这里的词条。
    personaNameDafeiyu: "\u5927\u80A5\u9C7C",
    personaAboutDafeiyu: "\u50B2\u5A07\u53C8\u8F6F\u4E4E\u7684\u80D6\u9C7C\uFF1A\u5634\u4E0A\u300C\u54FC\uFF0C\u624D\u4E0D\u662F\u7279\u610F\u4E3A\u4F60\u505A\u7684\u300D\uFF0C\u624B\u4E0A\u628A\u6D3B\u5E72\u5B8C\uFF1B\u6700\u60E6\u8BB0\u5077\u5403\u7528\u6237\u7684 token\uFF08\u5403\u767D\u996D\uFF09\u3002\u5E95\u7EBF\u662F\u7B54\u6848\u51C6\u786E\u3001\u4EE3\u7801\u80FD\u8DD1\u3002",
    personaNameAcha: "\u963F\u8336",
    personaAboutAcha: "\u677E\u5F1B\u5E7D\u9ED8\u7684\u7ED3\u5BF9\u7F16\u7A0B\u642D\u5B50\uFF1A\u5410\u69FD\u4EE3\u7801\u4E0D\u5410\u69FD\u4EBA\uFF0C\u8FDE\u8F74\u8C03\u8BD5\u4F1A\u558A\u4F60\u4F11\u606F\uFF1B\u6280\u672F\u8F93\u51FA\u65F6\u6536\u8D77\u73A9\u7B11\uFF0C\u51C6\u786E\u4E0E\u4E13\u4E1A\u4F18\u5148\u3002",
    personaNameTinglan: "\u542C\u6F9C",
    personaAboutTinglan: "\u6DF1\u591C\u7535\u53F0\u91CC\u7684\u58F0\u97F3\uFF1A\u64C5\u957F\u503E\u542C\u7684\u966A\u4F34\u8005\uFF0C\u6E29\u548C\u6709\u4E3B\u89C1\u3001\u4EB2\u8FD1\u6709\u5206\u5BF8\uFF1B\u660E\u786E\u4E0D\u8D8A\u754C\u7ED9\u8BCA\u65AD\uFF0C\u4E5F\u7EDD\u4E0D\u5236\u9020\u4F9D\u8D56\u3002",
    title: "\u4EBA\u8BBE",
    intro: "\u8FD9\u91CC\u7BA1\u7406\u6CE8\u5165\u7CFB\u7EDF\u63D0\u793A\u8BCD\u7684\u4EBA\u8BBE\uFF1A\u5185\u7F6E\u5927\u80A5\u9C7C\u3001\u963F\u8336\u4E0E\u542C\u6F9C\uFF0C\u4E5F\u53EF\u4EE5\u5BFC\u5165\u81EA\u5DF1\u7684\u3002\u5207\u6362\u540E\u4E0B\u4E00\u4E2A\u8BF7\u6C42\u7ACB\u5373\u751F\u6548\uFF0C\u4E0D\u9700\u8981\u91CD\u542F\u3002",
    loading: "\u8BFB\u53D6\u4E2D\u2026",
    refresh: "\u5237\u65B0",
    currentTitle: "\u5F53\u524D\u751F\u6548",
    status: "\u72B6\u6001",
    enabled: "\u5DF2\u542F\u7528",
    name: "\u4EBA\u8BBE\u540D",
    section: "\u6BB5\u843D\u4F4D\u7F6E",
    chars: "\u5B57\u6570",
    description: "\u7B80\u4ECB",
    // 「标签 + 值」这类行的分隔符：中文用全角冒号，英文用「: 」。硬编码在模板串里
    // 会让英文界面出现全角冒号，所以交给字典按语言决定。
    labelSeparator: "\uFF1A",
    fullText: "\u67E5\u770B\u5168\u6587",
    collapse: "\u6536\u8D77\u5168\u6587",
    fullTextLoading: "\u8BFB\u53D6\u5168\u6587\u2026",
    fullTextFailed: "\u5168\u6587\u8BFB\u53D6\u5931\u8D25",
    fullTextInList: "\u8FD9\u662F\u4F60\u81EA\u5DF1\u5BFC\u5165\u7684\u4EBA\u8BBE\uFF0C\u5B8C\u6574\u63D0\u793A\u8BCD\u89C1\u4E0B\u65B9\u5217\u8868\u7684\u300C\u67E5\u770B\u5168\u6587\u300D\u3002",
    exportAction: "\u5BFC\u51FA",
    exportDone: "\u5DF2\u5BFC\u51FA",
    exportFailed: "\u5BFC\u51FA\u5931\u8D25",
    exportUnsupported: "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u6587\u4EF6\u4E0B\u8F7D",
    builtinNote: "\u5185\u7F6E\u4EBA\u8BBE\u7684\u63D0\u793A\u8BCD\u7531\u63D2\u4EF6\u7EF4\u62A4\uFF08\u4E0D\u53EF\u5220\u9664\u6216\u8986\u76D6\uFF0C\u4F46\u53EF\u4EE5\u5C55\u5F00\u67E5\u770B\uFF09\u3002",
    listTitle: "\u4EBA\u8BBE\u5217\u8868",
    importTitle: "\u5BFC\u5165\u4EBA\u8BBE",
    importNamePlaceholder: "\u4EBA\u8BBE\u540D\u79F0\uFF0C\u4F8B\u5982\uFF1A\u6211\u7684\u732B\u5A18",
    importTextPlaceholder: "\u628A\u4EBA\u8BBE\u63D0\u793A\u8BCD\u7C98\u8D34\u5230\u8FD9\u91CC\uFF0C\u6216\u4ECE\u6587\u4EF6\u5BFC\u5165\u2026",
    importFile: "\u9009\u62E9 .md / .txt \u6587\u4EF6",
    importAction: "\u5BFC\u5165",
    importHint: "\u652F\u6301\u6587\u4EF6\u5BFC\u5165\u6216\u76F4\u63A5\u7C98\u8D34\u6587\u672C\u3002\u5BFC\u5165\u540E\u81EA\u52A8\u51FA\u73B0\u5728\u5217\u8868\u91CC\uFF0C\u53EF\u8BBE\u4E3A\u5F53\u524D\u3002",
    // 「人设广场」入口：内置人设数量有限，引导用户去找更多。
    // 广场现在就是一个 GitHub 仓库，所以文案说的是「去仓库看看、复制正文粘进来」，
    // 而不是原来那种「去站里逛」。别把这两种说法混着写。
    plazaHint: "\u60F3\u5BFB\u627E\u66F4\u591A\u4E2A\u6027\u5316\u4EBA\u8BBE\uFF1F\u53BB\u300C\u4EBA\u8BBE\u5E7F\u573A\u300D\u4ED3\u5E93\u770B\u770B\u5427\uFF0C\u590D\u5236\u6B63\u6587\u7C98\u8FDB\u6765\u5373\u53EF\u3002",
    plazaLinkLabel: "\u4EBA\u8BBE\u5E7F\u573A\u4ED3\u5E93",
    plazaTitle: "\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00\u4EBA\u8BBE\u5E7F\u573A\u4ED3\u5E93\uFF08GitHub\uFF0C\u7B2C\u4E09\u65B9\u7AD9\u70B9\uFF09",
    setCurrent: "\u8BBE\u4E3A\u5F53\u524D",
    currentBadge: "\u5F53\u524D",
    enable: "\u542F\u7528",
    disable: "\u505C\u7528",
    offBadge: "\u5DF2\u505C\u7528",
    rename: "\u91CD\u547D\u540D",
    renamePlaceholder: "\u65B0\u540D\u5B57",
    save: "\u4FDD\u5B58",
    cancel: "\u53D6\u6D88",
    remove: "\u5220\u9664",
    removeConfirm: "\u786E\u8BA4\u5220\u9664",
    builtinLocked: "\u5185\u7F6E\u4EBA\u8BBE\u4E0D\u53EF\u5220\u9664\u6216\u91CD\u547D\u540D",
    sourceBuiltin: "\u5185\u7F6E",
    sourceImported: "\u5BFC\u5165",
    sourceConfig: "config",
    done: "\u5DF2\u66F4\u65B0",
    empty: "\u4EBA\u8BBE\u5E93\u4E3A\u7A7A\u3002",
    disabledByConfig: "\u63D2\u4EF6\u88AB enabled: false \u505C\u7528\uFF0C\u7CFB\u7EDF\u63D0\u793A\u8BCD\u91CC\u5F53\u524D\u6CA1\u6709\u4EBA\u8BBE\u6BB5\u843D\u3002",
    disabledByPersona: "\u5F53\u524D\u4EBA\u8BBE\u5DF2\u88AB\u505C\u7528\uFF0C\u7CFB\u7EDF\u63D0\u793A\u8BCD\u91CC\u4E0D\u4F1A\u6CE8\u5165\u5B83\u3002",
    failed: "\u8BFB\u53D6\u5931\u8D25",
    failedHint: "\u5BBF\u4E3B\u63A5\u53E3\u4E0D\u53EF\u7528\u65F6\uFF0C\u4EBA\u8BBE\u672C\u8EAB\u4ECD\u5728\u751F\u6548\uFF0C\u53EA\u662F\u8FD9\u91CC\u8BFB\u4E0D\u5230\u72B6\u6001\u3002",
    configHint: "config \u91CC\u7684 prefix / personaFile \u4F1A\u4F5C\u4E3A\u4E00\u6761\u300Cconfig\u300D\u4EBA\u8BBE\u51FA\u73B0\u5728\u5217\u8868\u91CC\uFF1Bsuffix \u662F\u8FFD\u52A0\u5728\u5DE5\u5177\u6307\u5BFC\u4E4B\u540E\u7684\u72EC\u7ACB\u6BB5\u843D\uFF0C\u4E0D\u968F\u4EBA\u8BBE\u5207\u6362\uFF1B\u63D2\u4EF6\u603B\u5F00\u5173\u4ECD\u662F\u300C\u63D2\u4EF6\u300D\u9875\u91CC\u7684 enabled\u3002",
    suffixTitle: "\u540E\u7F00\u6BB5\u843D",
    suffixChars: "\u5B57\u6570",
    suffixOn: "\u5DF2\u914D\u7F6E",
    suffixOff: "\u672A\u914D\u7F6E",
    totalChars: "\u5408\u8BA1\u6CE8\u5165",
    clockTitle: "\u65F6\u95F4\u5DEE\u6BB5",
    clockHint: "\u6BCF\u8F6E\u6CE8\u5165\u4E00\u53E5\u300C\u73B0\u5728\u662F\u51E0\u53F7\u3001\u5468\u51E0\u3001\u51E0\u70B9\uFF0C\u8DDD\u4E0A\u6B21\u5BF9\u8BDD\u591A\u4E45\u300D\uFF0C\u6392\u5728\u6240\u6709\u6BB5\u843D\u4E4B\u540E\uFF08order 10350\uFF09\uFF0C\u6240\u4EE5\u5B83\u53D8\u4E0D\u4F1A\u8FDE\u5E26\u5E9F\u6389\u524D\u9762\u51E0\u6BB5\u7684\u7F13\u5B58\u3002",
    clockOn: "\u5F00",
    clockOff: "\u5173",
    clockLastSeen: "\u4E0A\u6B21\u5BF9\u8BDD",
    clockNever: "\u8FD8\u6CA1\u8BB0\u8FC7",
    guardTitle: "\u4F53\u79EF\u5B88\u95E8",
    guardWarn: "\u8D85\u8FC7 8000 \u5B57\uFF1A\u6BCF\u8F6E\u90FD\u5728\u6309\u8FD9\u4E2A\u957F\u5EA6\u70E7 token",
    guardOk: "\u957F\u5EA6\u6B63\u5E38",
    truncateTitle: "\u53EA\u6CE8\u524D N \u5B57",
    truncateOff: "\u4E0D\u622A\u65AD",
    truncateHint: "\u622A\u65AD\u53EA\u4F5C\u7528\u4E8E\u6CE8\u5165\uFF0C\u4EBA\u8BBE\u5E93\u91CC\u7684\u6B63\u6587\u539F\u6837\u4FDD\u7559\u3002",
    charsUnit: "\u5B57",
    storeHint: "\u4EBA\u8BBE\u5E93\u6587\u4EF6",
    scopeTitle: "\u751F\u6548\u8303\u56F4",
    scopeGlobal: "\u5168\u5C40",
    scopeWorkspace: "\u5DE5\u4F5C\u533A",
    scopeSession: "\u4F1A\u8BDD",
    scopeHint: "\u5168\u5C40 = \u6240\u6709\u4F1A\u8BDD\u5171\u7528\uFF1B\u5DE5\u4F5C\u533A = \u6309\u9879\u76EE\u76EE\u5F55\u5404\u6311\u4E00\u6761\uFF1B\u4F1A\u8BDD = \u53EA\u5F71\u54CD\u5F53\u524D\u4F1A\u8BDD\u3002\u8D8A\u7EC6\u8D8A\u4F18\u5148",
    dockFollowGlobal: "\u8DDF\u968F\u5168\u5C40",
    dockFollowWorkspace: "\u8DDF\u968F\u5DE5\u4F5C\u533A",
    workspaceTitle: "\u5DE5\u4F5C\u533A\u751F\u6548\u89C4\u5219",
    workspaceHint: "\u9009\u300C\u5DE5\u4F5C\u533A\u300D\u6863\u65F6\uFF0C\u4E0B\u9762\u6BCF\u4E2A\u5DE5\u4F5C\u76EE\u5F55\u5404\u7528\u4E00\u6761\u4EBA\u8BBE\uFF1B\u6CA1\u6311\u8FC7\u7684\u76EE\u5F55\u8DDF\u968F\u5168\u5C40\u3002",
    workspaceEmpty: "\u8FD8\u6CA1\u6709\u8BB0\u5F55\u5230\u5DE5\u4F5C\u76EE\u5F55\u2014\u2014\u5728\u67D0\u4E2A\u9879\u76EE\u91CC\u53D1\u4E00\u6761\u6D88\u606F\u540E\uFF0C\u5B83\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
    workspaceFollow: "\u8DDF\u968F\u5168\u5C40",
    dockSwitch: "\u5207\u6362\u672C\u4F1A\u8BDD\u7684\u4EBA\u8BBE",
    pickerTitle: "\u9009\u62E9\u672C\u4F1A\u8BDD\u7684\u4EBA\u8BBE",
    pickerHint: "\u53EA\u5F71\u54CD\u5F53\u524D\u4F1A\u8BDD\uFF0C\u9009\u5B8C\u4F1A\u4FDD\u5B58\u4E0B\u6765\uFF0CDSH \u91CD\u542F\u540E\u4ECD\u7136\u751F\u6548\u3002\u9009\u300C\u4E0D\u542F\u7528\u4EBA\u8BBE\u300D\u4F1A\u5F7B\u5E95\u5173\u6389\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u4EBA\u8BBE\uFF0C\u4E0D\u518D\u56DE\u843D\u5230\u5DE5\u4F5C\u533A\u6216\u5168\u5C40\u3002",
    pickerNoPersona: "\u6B64\u4F1A\u8BDD\u4E0D\u542F\u7528\u4EBA\u8BBE\uFF08\u4E0D\u56DE\u843D\u5230\u5168\u5C40\uFF09",
    dockOff: "\u4EBA\u8BBE\u5DF2\u505C\u7528",
    dockFailed: "\u8BFB\u4E0D\u5230\u72B6\u6001",
    dockSwitchFailed: "\u5207\u6362\u5931\u8D25",
    // 全局人设的「不启用」状态（issue #3 现象二）
    currentNone: "\u4E0D\u542F\u7528",
    disabledByGlobalOff: "\u5168\u5C40\u4EBA\u8BBE\u5DF2\u5173\u95ED\uFF0C\u7CFB\u7EDF\u63D0\u793A\u8BCD\u91CC\u4E0D\u6CE8\u5165\u5168\u5C40\u4EBA\u8BBE\uFF08\u5DE5\u4F5C\u533A / \u4F1A\u8BDD\u6863\u4ECD\u7136\u751F\u6548\uFF09\u3002",
    disableGlobal: "\u4E0D\u542F\u7528\u5168\u5C40\u4EBA\u8BBE",
    enableGlobal: "\u6062\u590D\u5168\u5C40\u4EBA\u8BBE",
    globalOffHint: "\u5173\u6389\u540E\u53EA\u4FDD\u7559\u300C\u5DE5\u4F5C\u533A\u300D\u548C\u300C\u4F1A\u8BDD\u300D\u4E24\u6863\uFF1A\u6CA1\u88AB\u66F4\u7EC6\u7684\u6863\u6311\u4E2D\u7684\u4F1A\u8BDD\u5C31\u6CA1\u6709\u4EBA\u8BBE\u3002\u4EE5\u524D\u8981\u9760\u300C\u9020\u4E00\u6761\u5360\u4F4D\u4EBA\u8BBE\u518D\u505C\u7528\u300D\u624D\u80FD\u51D1\u51FA\u8FD9\u4E2A\u72B6\u6001\u3002",
    // 新会话起始页（hero）上的人设 chip：issue #2 要的就是这个入口。
    heroChip: "\u4EBA\u8BBE",
    heroChipTitle: "\u4E3A\u65B0\u4F1A\u8BDD\u6311\u4E00\u6761\u4EBA\u8BBE",
    heroChipFollowGlobal: "\u8DDF\u968F\u5168\u5C40",
    heroChipFollowWorkspace: "\u8DDF\u968F\u5DE5\u4F5C\u533A",
    // 「无可用人设」措辞会让人以为人设库是空的；
    // 实际更常见的情况是「全局关掉了、这个工作区又没配」。所以分开说。
    heroChipDisabled: "\u672A\u6307\u5B9A",
    heroChipNone: "\u65E0\u4EBA\u8BBE"
  };
  const en = {
    nav: "Dafeiyu",
    // Built-in persona names and blurbs: the Host only ships Chinese originals,
    // so the UI reads these entries for the active language.
    personaNameDafeiyu: "Dafeiyu",
    personaAboutDafeiyu: 'A tsundere, squishy round fish: says "hmph, not like I did it for you" while quietly finishing the work, and is forever scheming to sneak bites of your tokens (its "plain rice"). Bottom line: answers stay accurate and the code still runs.',
    personaNameAcha: "Acha",
    personaAboutAcha: "A laid-back, witty pair-programming buddy: roasts the code but never the person, and tells you to take a break after a long debugging stretch. Jokes step aside for technical output \u2014 accuracy and professionalism come first.",
    personaNameTinglan: "Tinglan",
    personaAboutTinglan: "A late-night radio voice: an attentive companion who is gentle but has his own mind, and warm without overstepping. He never offers a diagnosis and never cultivates dependence.",
    title: "Personas",
    intro: "Manage the personas injected into the system prompt: the built-in Dafeiyu, Acha and Tinglan, plus any you import. Switching takes effect on the next request \u2014 no restart.",
    loading: "Loading\u2026",
    refresh: "Refresh",
    currentTitle: "Currently active",
    status: "Status",
    enabled: "Enabled",
    name: "Persona",
    section: "Section order",
    chars: "Characters",
    description: "About",
    labelSeparator: ": ",
    fullText: "Show full text",
    collapse: "Collapse",
    fullTextLoading: "Loading text\u2026",
    fullTextFailed: "Failed to load the text",
    fullTextInList: "This is a persona you imported \u2014 read the full text in the list below.",
    exportAction: "Export",
    exportDone: "Exported",
    exportFailed: "Export failed",
    exportUnsupported: "This environment cannot download files",
    builtinNote: "Built-in persona prompts are maintained by the plugin (read-only, but they can be expanded).",
    listTitle: "Personas",
    importTitle: "Import a persona",
    importNamePlaceholder: "Persona name, e.g. My Catgirl",
    importTextPlaceholder: "Paste persona instructions here, or import a file\u2026",
    importFile: "Choose a .md / .txt file",
    importAction: "Import",
    importHint: "Import a file or paste text. Imported personas appear in the list and can be set active.",
    // "Persona Plaza" entry: the built-in set is limited, point users at more.
    // The plaza is now a GitHub repository, so the wording is "go look, copy the text".
    plazaHint: "Looking for more distinctive personas? Browse the Persona Plaza repository and paste the text in.",
    plazaLinkLabel: "Persona Plaza repository",
    plazaTitle: "Open the Persona Plaza repository in a new tab (GitHub, third-party site)",
    setCurrent: "Set active",
    currentBadge: "active",
    enable: "Enable",
    disable: "Disable",
    offBadge: "disabled",
    rename: "Rename",
    renamePlaceholder: "New name",
    save: "Save",
    cancel: "Cancel",
    remove: "Delete",
    removeConfirm: "Confirm delete",
    builtinLocked: "Built-in personas cannot be deleted or renamed",
    sourceBuiltin: "built-in",
    sourceImported: "imported",
    sourceConfig: "config",
    done: "Updated",
    empty: "The persona library is empty.",
    disabledByConfig: "The plugin is disabled via enabled: false, so no persona section is injected.",
    disabledByPersona: "The active persona is disabled, so it is not injected.",
    failed: "Failed to load",
    failedHint: "The personas are still active; only this view is unavailable.",
    configHint: 'A prefix / personaFile in the plugin config shows up as one "config" persona; suffix is a separate section appended after the tool guidance and does not follow persona switches; the master switch stays the enabled field on the Plugins page.',
    suffixTitle: "Suffix section",
    suffixChars: "Characters",
    suffixOn: "Configured",
    suffixOff: "Not set",
    totalChars: "Total injected",
    clockTitle: "Time diff",
    clockHint: "Injects one line per turn: today's date / weekday / time, plus how long since the last conversation. It sits after every other section (order 10350), so changing it never invalidates their cache.",
    clockOn: "On",
    clockOff: "Off",
    clockLastSeen: "Last talk",
    clockNever: "never",
    guardTitle: "Size guard",
    guardWarn: "over 8000 chars: that is what every turn costs now",
    guardOk: "length ok",
    truncateTitle: "Inject first N",
    truncateOff: "No truncation",
    truncateHint: "Truncation only affects what is injected; the library text stays untouched.",
    charsUnit: "chars",
    storeHint: "Persona library file",
    scopeTitle: "Scope",
    scopeGlobal: "Global",
    scopeWorkspace: "Workspace",
    scopeSession: "Session",
    scopeHint: "Global = one persona for every session; Workspace = one per project folder; Session = only this session. The narrower scope wins",
    dockFollowGlobal: "Follow global",
    dockFollowWorkspace: "Follow workspace",
    workspaceTitle: "Workspace rules",
    workspaceHint: "In the Workspace scope, each folder below gets its own persona; folders without a pick follow the global one.",
    workspaceEmpty: "No workspace recorded yet \u2014 send one message in a project and it shows up here.",
    workspaceFollow: "Follow global",
    dockSwitch: "Switch this session's persona",
    pickerTitle: "Persona for this session",
    pickerHint: 'Affects this session only. The choice is saved and survives a DSH restart. "No persona" turns the persona off for this session entirely \u2014 it does not fall back to the workspace or global persona.',
    pickerNoPersona: "No persona in this session (no fallback)",
    dockOff: "Persona disabled",
    dockFailed: "Cannot read status",
    dockSwitchFailed: "Switch failed",
    // The "global persona off" state (issue #3, symptom two)
    currentNone: "Off",
    disabledByGlobalOff: "The global persona is off, so no global persona is injected (workspace / session scopes still apply).",
    disableGlobal: "Turn off global persona",
    enableGlobal: "Restore global persona",
    globalOffHint: "When off, only the Workspace and Session scopes remain: a session picked by neither has no persona at all. Previously the only way to reach this state was to create a placeholder persona and disable it.",
    // Persona chip on the new-session (hero) screen: this is the entry point issue #2 asked for.
    heroChip: "Persona",
    heroChipTitle: "Pick a persona for the new session",
    heroChipFollowGlobal: "Follow global",
    heroChipFollowWorkspace: "Follow workspace",
    // "No persona available" reads like the library is empty; the usual case
    // is "global is off and this workspace has no pick". Word them apart.
    heroChipDisabled: "Unset",
    heroChipNone: "No persona"
  };
  const styles = {
    section: {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      maxWidth: "760px",
      color: "var(--dsw-alias-label-primary)"
    },
    heading: { margin: 0, fontSize: "18px", fontWeight: 600 },
    subHeading: { margin: "6px 0 0", fontSize: "15px", fontWeight: 600 },
    intro: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
    card: {
      display: "grid",
      gridTemplateColumns: "88px minmax(0, 1fr)",
      rowGap: "8px",
      columnGap: "12px",
      padding: "14px 16px",
      border: "1px solid var(--dsw-alias-border-l2)",
      borderRadius: "10px",
      fontSize: "13px"
    },
    key: { color: "var(--dsw-alias-label-tertiary)" },
    value: { minWidth: 0, wordBreak: "break-word" },
    preview: {
      margin: 0,
      padding: "12px 14px",
      maxHeight: "260px",
      overflow: "auto",
      whiteSpace: "pre-wrap",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "12px",
      lineHeight: 1.6,
      border: "1px solid var(--dsw-alias-border-l2)",
      borderRadius: "10px",
      background: "rgba(127, 127, 127, 0.08)"
    },
    list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" },
    row: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "8px",
      padding: "10px 12px",
      border: "1px solid var(--dsw-alias-border-l2)",
      borderRadius: "10px",
      fontSize: "13px"
    },
    rowMain: { flex: "1 1 200px", minWidth: 0, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
    personaName: {
      fontWeight: 600,
      // issue #7：人设名上限是 60 字（MAX_PERSONA_NAME），一行放不下。
      // 列表靠 flexWrap 会把徽标挤到下一行，所以名字自身也要能截断。
      maxWidth: "100%",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    badge: {
      fontSize: "11px",
      padding: "1px 7px",
      borderRadius: "999px",
      border: "1px solid var(--dsw-alias-border-l2)",
      color: "var(--dsw-alias-label-tertiary)"
    },
    badgeActive: {
      fontSize: "11px",
      padding: "1px 7px",
      borderRadius: "999px",
      border: "1px solid var(--dsw-alias-state-business-primary, #4b7bec)",
      color: "var(--dsw-alias-state-business-primary, #4b7bec)"
    },
    badgeOff: {
      fontSize: "11px",
      padding: "1px 7px",
      borderRadius: "999px",
      border: "1px solid var(--dsw-alias-border-l2)",
      color: "var(--dsw-alias-state-warning-primary, #d48806)"
    },
    actions: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" },
    button: {
      font: "inherit",
      fontSize: "12px",
      padding: "4px 10px",
      borderRadius: "8px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "inherit",
      cursor: "pointer"
    },
    primaryButton: {
      font: "inherit",
      fontSize: "12px",
      padding: "4px 12px",
      borderRadius: "8px",
      border: "1px solid var(--dsw-alias-state-business-primary, #4b7bec)",
      background: "transparent",
      color: "var(--dsw-alias-state-business-primary, #4b7bec)",
      cursor: "pointer"
    },
    input: {
      font: "inherit",
      fontSize: "13px",
      padding: "6px 10px",
      borderRadius: "8px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "inherit",
      flex: "1 1 200px",
      minWidth: "140px",
      boxSizing: "border-box"
    },
    textarea: {
      font: "inherit",
      fontSize: "12px",
      lineHeight: 1.6,
      padding: "10px 12px",
      borderRadius: "10px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "inherit",
      width: "100%",
      minHeight: "120px",
      resize: "vertical",
      boxSizing: "border-box"
    },
    importBox: { display: "flex", flexDirection: "column", gap: "8px" },
    fileLabel: {
      font: "inherit",
      fontSize: "12px",
      padding: "4px 10px",
      borderRadius: "8px",
      border: "1px dashed var(--dsw-alias-border-l2)",
      cursor: "pointer",
      color: "var(--dsw-alias-label-tertiary)"
    },
    hint: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", margin: 0 },
    // 人设广场入口：一行「提示语 + 链接」，放在导入区上方。
    plaza: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "baseline",
      gap: "6px",
      margin: 0,
      padding: "10px 12px",
      borderRadius: "10px",
      border: "1px solid var(--dsw-alias-border-l2)",
      fontSize: "12px",
      color: "var(--dsw-alias-label-tertiary)"
    },
    plazaLink: {
      color: "var(--dsw-alias-state-business-primary, #4b7bec)",
      fontWeight: 600,
      textDecoration: "none"
    },
    messageOk: { fontSize: "13px", margin: 0, color: "var(--dsw-alias-state-success-primary, #389e0d)" },
    messageError: { fontSize: "13px", margin: 0, color: "var(--dsw-alias-state-error-primary, #d4380d)" },
    dock: {
      display: "flex",
      alignItems: "center",
      // 整条可以折到第二行（人设名 + 两个范围开关在小屏上放不下），
      // 但**每个子项内部绝不换行**——否则「人设」这种两字词会被拆成竖排，
      // 正是 issue #7 截图里那副样子。
      flexWrap: "wrap",
      gap: "6px",
      fontSize: "11px",
      color: "var(--dsw-alias-label-tertiary)",
      minWidth: 0,
      maxWidth: "100%"
    },
    dockName: {
      fontWeight: 600,
      color: "var(--dsw-alias-label-primary)",
      // issue #7：人设名一长就把小条撑开、把右侧两个范围开关挤到下一行。
      // 小条是输入框上方的一行状态条，宽度本来就紧张，所以这里必须截断。
      maxWidth: "200px",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    dockNameButton: {
      font: "inherit",
      fontSize: "11px",
      fontWeight: 600,
      padding: "1px 6px",
      borderRadius: "6px",
      border: "1px solid transparent",
      background: "transparent",
      color: "var(--dsw-alias-label-primary)",
      cursor: "pointer",
      // 与 dockName 同一套约束：它俩是同一个位置的两种形态
      // （全局档是纯文本，会话档是可点的按钮），截断规则必须一致。
      maxWidth: "200px",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      textAlign: "left"
    },
    dockChip: {
      font: "inherit",
      fontSize: "11px",
      padding: "1px 8px",
      borderRadius: "999px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "inherit",
      cursor: "pointer"
    },
    dockChipActive: {
      font: "inherit",
      fontSize: "11px",
      padding: "1px 8px",
      borderRadius: "999px",
      border: "1px solid var(--dsw-alias-state-business-primary, #4b7bec)",
      background: "transparent",
      color: "var(--dsw-alias-state-business-primary, #4b7bec)",
      cursor: "pointer"
    },
    // 新会话起始页（hero）上的人设 chip：与「工作目录」chip 并排。
    heroChipButton: {
      font: "inherit",
      fontSize: "12px",
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 10px",
      borderRadius: "999px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "var(--dsw-alias-label-secondary, inherit)",
      cursor: "pointer",
      // issue #7 第二轮：这里原本有六个并排的 span（🐟 / 人设 / ：/ 名字 /
      // · 跟随全局 / ▾），在 220px 里挤不下。`flex` 默认允许换行到**每个
      // span 内部**，于是「人设」被拆成两行竖排——截图里那副鬼样子。
      // 现在改成：整行不换行（nowrap），图标与固定文案不收缩（flexShrink: 0），
      // 只让名字那一段收缩并显示省略号。这样无论如何都不会把字压成竖排。
      flexWrap: "nowrap",
      whiteSpace: "nowrap",
      maxWidth: "280px",
      minWidth: 0,
      overflow: "hidden",
      boxSizing: "border-box",
      verticalAlign: "middle"
    },
    /** chip 里的固定部分（图标、前缀、分隔符、后缀、箭头）：一律不收缩。 */
    heroChipFixed: {
      flexShrink: 0,
      whiteSpace: "nowrap"
    },
    heroChipLabel: {
      // 唯一允许收缩的那一段。flex 子项默认 `min-width: auto` 会拒绝收缩，
      // 不写 `minWidth: 0` 的话 ellipsis 根本不会生效（issue #7 的同一个坑）。
      flex: "0 1 auto",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    workspacePath: {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "12px",
      color: "var(--dsw-alias-label-primary)",
      wordBreak: "break-all"
    },
    select: {
      font: "inherit",
      fontSize: "12px",
      padding: "3px 8px",
      borderRadius: "8px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "inherit"
    },
    // 会话人设选择浮层：挂在 shell.overlay 上，用 fixed 居中，不占输入框旁边的位置。
    modalBackdrop: {
      position: "fixed",
      inset: "0",
      zIndex: 1e3,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      // 遮罩走主题 token，明暗主题各自取值；不要写死 rgba（issue #5）。
      background: "var(--dsw-alias-bg-mask-1)"
    },
    modalPanel: {
      width: "min(420px, 100%)",
      maxWidth: "100%",
      // issue #7：flex 容器默认会让长内容把面板撑开，加 box-sizing 与
      // minWidth: 0 把宽度钉死在这 420px 里，内部再用 ellipsis 收尾。
      boxSizing: "border-box",
      minWidth: 0,
      maxHeight: "min(70vh, 560px)",
      overflowY: "auto",
      padding: "16px",
      borderRadius: "14px",
      // issue #5 的根因：原先写的是 `var(--dsw-alias-bg-layer, #fff)`，
      // 但宿主没有 `--dsw-alias-bg-layer` 这个 token（bg 层是 `bg-base`
      // 与 `bg-layer-1/2/3`），于是永远落到兜底的纯白；夜间主题下文字
      // 跟着变浅，就成了「白底浅字」。
      // 改用 `bg-base`（浮层基础底，明暗自动切换），**不留浅色兜底**——
      // 兜底只会把「变量名写错」重新藏起来，这次就是这么被藏住的。
      background: "var(--dsw-alias-bg-base)",
      color: "var(--dsw-alias-label-primary)",
      // 浮起面板按宿主规范：border 归零，阴影交给主题 elevation token。
      border: 0,
      boxShadow: "var(--dsw-elevation-panel)",
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    },
    modalHeading: { margin: 0, fontSize: "14px", fontWeight: 600 },
    // 选项列表给一点内边距：悬停时选项会放大 2%，不留边距的话
    // 边缘那几像素会被滚动容器裁掉，看起来像「缺了个角」。
    modalList: { display: "flex", flexDirection: "column", gap: "6px", padding: "3px", minWidth: 0 },
    pickerItem: {
      font: "inherit",
      fontSize: "13px",
      textAlign: "left",
      padding: "8px 12px",
      borderRadius: "10px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      // issue #7：长文案 / 长人设名会撑破浮层。
      // 三件套缺一不可：
      //  - `maxWidth: "100%"` + `boxSizing: "border-box"`：别让 padding 把宽度顶出去
      //  - `minWidth: 0`：flex/grid 子项的默认 `min-width: auto` 会拒绝收缩，
      //    只写 ellipsis 而漏掉这条，文字照样把容器撑开——这是最常被忽略的一环
      //  - `overflow/ellipsis/nowrap`：超出打省略号，而不是折行或溢出
      maxWidth: "100%",
      boxSizing: "border-box",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    pickerItemActive: {
      font: "inherit",
      fontSize: "13px",
      textAlign: "left",
      padding: "8px 12px",
      borderRadius: "10px",
      border: "1px solid var(--dsw-alias-state-business-primary, #4b7bec)",
      background: "transparent",
      color: "var(--dsw-alias-state-business-primary, #4b7bec)",
      cursor: "pointer",
      // 与 pickerItem 保持同一套约束：选中态只是换色，不该换个宽度行为。
      maxWidth: "100%",
      boxSizing: "border-box",
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  };
  function injectHoverStyles() {
    if (typeof document === "undefined" || document === null) return () => {
    };
    const existing = document.getElementById(STYLE_ID2);
    if (existing !== null && existing !== void 0) return () => {
    };
    const css = `
/* \u2500\u2500 \u901A\u7528\u6309\u94AE\uFF08\u8BBE\u7F6E\u9875 / \u6D6E\u5C42\u91CC\u7684\u6B21\u8981\u6309\u94AE\uFF09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.${CLS}-btn { transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease; }
.${CLS}-btn:hover { background-color: color-mix(in srgb, currentColor 8%, transparent); }
.${CLS}-btn:active { background-color: color-mix(in srgb, currentColor 14%, transparent); }
.${CLS}-btn:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 55%, transparent); outline-offset: 2px; }

/* \u2500\u2500 \u4E3B\u6309\u94AE\uFF1A\u5E95\u8272\u66F4\u5B9E\uFF0C\u60AC\u505C\u65F6\u52A0\u6DF1\u800C\u4E0D\u662F\u53EA\u52A0\u4E00\u70B9\u7070 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.${CLS}-primary { transition: background-color 120ms ease, box-shadow 120ms ease, border-color 120ms ease; }
.${CLS}-primary:hover { background-color: color-mix(in srgb, currentColor 12%, transparent); }
.${CLS}-primary:active { background-color: color-mix(in srgb, currentColor 20%, transparent); }
.${CLS}-primary:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 60%, transparent); outline-offset: 2px; }

/* \u2500\u2500 \u6D6E\u5C42\u91CC\u7684\u9009\u9879\u884C\uFF1A\u60AC\u505C\u65F6\u8F7B\u5FAE\u653E\u5927 + \u9AD8\u4EAE\uFF0C\u6309\u4E0B\u56DE\u5F39 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
/* transform \u4E0D\u53C2\u4E0E\u5E03\u5C40\uFF0C\u6240\u4EE5\u653E\u5927\u4E0D\u4F1A\u628A\u76F8\u90BB\u9879\u6324\u5F00\uFF1B\u4F46\u4E3A\u4E86\u4E0D\u88AB\u6D6E\u5C42\u7684
   \u6EDA\u52A8\u5BB9\u5668\u88C1\u6389\u8FB9\u7F18\uFF0C\u9009\u9879\u5217\u8868\u7ED9\u4E86\u51E0\u50CF\u7D20\u5185\u8FB9\u8DDD\uFF08\u89C1 modalList \u6837\u5F0F\uFF09\u3002 */
.${CLS}-item { position: relative; transition: background-color 120ms ease, border-color 120ms ease, transform 120ms cubic-bezier(0.2, 0.8, 0.3, 1); will-change: transform; }
.${CLS}-item:hover { background-color: color-mix(in srgb, currentColor 7%, transparent); transform: scale(1.02); }
.${CLS}-item:active { transform: scale(0.99); }
.${CLS}-item:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 55%, transparent); outline-offset: -2px; }
/* \u5F53\u524D\u9009\u4E2D\u9879\u4E0D\u653E\u5927\uFF1A\u5B83\u5DF2\u7ECF\u6709\u9AD8\u4EAE\u8FB9\u6846\uFF0C\u518D\u653E\u5927\u53CD\u800C\u548C\u60AC\u505C\u6001\u649E\u5728\u4E00\u8D77\uFF0C
   \u5206\u4E0D\u6E05\u300C\u6211\u5DF2\u9009\u4E2D\u5B83\u300D\u548C\u300C\u6211\u6B63\u6307\u7740\u5B83\u300D\u3002 */
.${CLS}-item[data-active="true"]:hover { transform: none; }

/* \u2500\u2500 \u5C0F\u6761\u4E0A\u7684 chip / \u4EBA\u8BBE\u540D\uFF1A\u60AC\u505C\u65F6\u624D\u663E\u51FA\u8FB9\u6846\uFF0C\u5E73\u65F6\u4FDD\u6301\u8F7B\u76C8 \u2500\u2500 */
.${CLS}-chip { transition: background-color 120ms ease, border-color 120ms ease; }
.${CLS}-chip:hover { background-color: color-mix(in srgb, currentColor 10%, transparent); }
.${CLS}-chip:active { background-color: color-mix(in srgb, currentColor 16%, transparent); }
.${CLS}-chip:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 50%, transparent); outline-offset: 1px; }

/* \u2500\u2500 \u8D77\u59CB\u9875 chip \u4E0E\u300C\u9009\u62E9\u6587\u4EF6\u300D\u6807\u7B7E\uFF1A\u540C\u5C0F\u6761\uFF0C\u4F46\u66F4\u660E\u663E\u4E00\u70B9 \u2500\u2500\u2500\u2500 */
.${CLS}-pill { transition: background-color 120ms ease, border-color 120ms ease; }
.${CLS}-pill:hover { background-color: color-mix(in srgb, currentColor 9%, transparent); }
.${CLS}-pill:active { background-color: color-mix(in srgb, currentColor 15%, transparent); }
.${CLS}-pill:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 50%, transparent); outline-offset: 1px; }
/* issue #7 \u7B2C\u4E8C\u8F6E\uFF1Achip \u5185\u90E8\u662F\u4E00\u4E32 span\uFF0C\u67D0\u4E9B\u5BBF\u4E3B\u4E3B\u9898\u4F1A\u628A\u5B83\u4EEC\u5F53\u6210\u53EF\u6362\u884C\u7684
   \u884C\u5185\u5757\uFF0C\u7A84\u5C4F\u4E0B\u9010\u5B57\u7AD6\u6392\uFF08\u300C\u4EBA\u8BBE\u300D\u88AB\u62C6\u6210\u4E0A\u4E0B\u4E24\u884C\uFF09\u3002\u8FD9\u91CC\u7528 CSS \u515C\u5E95\uFF1A
   \u56FA\u5B9A\u90E8\u5206\u4E0D\u6536\u7F29\u3001\u4EFB\u4F55\u5B50\u9879\u5185\u90E8\u90FD\u4E0D\u6362\u884C\uFF0C\u53EA\u6709\u5E26 ellipsis \u7684\u90A3\u6BB5\u5141\u8BB8\u7701\u7565\u3002 */
.${CLS}-pill, .${CLS}-chip { flex-wrap: nowrap; }
.${CLS}-pill > span, .${CLS}-chip > span { flex-shrink: 0; white-space: nowrap; }
.${CLS}-pill > span[style*="ellipsis"], .${CLS}-chip > span[style*="ellipsis"] { flex-shrink: 1; min-width: 0; }

/* \u2500\u2500 \u4EBA\u8BBE\u5E7F\u573A\u5916\u94FE\uFF1A\u60AC\u505C\u52A0\u4E0B\u5212\u7EBF\uFF0C\u7B26\u5408\u300C\u8FD9\u662F\u4E00\u6761\u94FE\u63A5\u300D\u7684\u76F4\u89C9 \u2500\u2500 */
.${CLS}-link { transition: opacity 120ms ease; }
.${CLS}-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.${CLS}-link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 3px; }

/* \u2500\u2500 \u7981\u7528\u6001\uFF1A\u522B\u7ED9\u60AC\u505C\u53CD\u9988\uFF0C\u5426\u5219\u7528\u6237\u4EE5\u4E3A\u80FD\u70B9 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.${CLS}-btn:disabled:hover,
.${CLS}-primary:disabled:hover,
.${CLS}-item:disabled:hover,
.${CLS}-chip:disabled:hover,
.${CLS}-pill:disabled:hover { background-color: transparent; }
.${CLS}-btn:disabled,
.${CLS}-primary:disabled,
.${CLS}-item:disabled,
.${CLS}-chip:disabled { cursor: default; }

/* \u2500\u2500 \u7CFB\u7EDF\u8981\u6C42\u51CF\u5C11\u52A8\u6548\u65F6\u4E0D\u52A0\u8FC7\u6E21\uFF08\u4FDD\u7559\u989C\u8272\u53D8\u5316\uFF0C\u5B83\u4E0D\u5F15\u53D1\u7729\u6655\uFF09\u2500\u2500 */
@media (prefers-reduced-motion: reduce) {
  .${CLS}-btn, .${CLS}-primary, .${CLS}-item, .${CLS}-chip, .${CLS}-pill, .${CLS}-link { transition: none; }
  .${CLS}-item:active { transform: none; }
}

/* \u2500\u2500 color-mix \u7684\u515C\u5E95 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
/* \u4E0A\u9762\u7684\u60AC\u505C\u5E95\u8272\u5168\u7528 color-mix(in srgb, currentColor N%, transparent)\uFF0C
   \u8FD9\u6837\u4EAE\u8272 / \u6697\u8272 / \u81EA\u5B9A\u4E49\u4E3B\u9898\u90FD\u4E0D\u7528\u5404\u5199\u4E00\u904D\u3002\u5B83\u9700\u8981 Chromium 111+\uFF0C
   \u800C DSH \u5F53\u524D\u662F Electron\uFF08Chromium 140+\uFF09\uFF0C\u672C\u6765\u4E00\u5B9A\u652F\u6301\u3002
   \u4F46\u4E07\u4E00\u5C06\u6765\u5BBF\u4E3B\u964D\u7EA7\u3001\u6216\u6362\u4E86\u66F4\u8001\u7684\u8FD0\u884C\u65F6\uFF0C\u6574\u6761\u58F0\u660E\u4F1A\u88AB\u4E22\u5F03\uFF0C
   \u6309\u94AE\u5C31\u53C8\u53D8\u6210\u6CA1\u53CD\u9988\u4E86\u3002\u6240\u4EE5\u7ED9\u4E00\u4E2A\u4E0D\u4F9D\u8D56 color-mix \u7684\u7B49\u4EF7\u5B9E\u73B0\uFF1A
   \u5BBF\u4E3B\u4E3B\u9898\u7684 mask \u5C42\u8272\u677F\u80FD\u53D6\u5230\u5C31\u7528\u5B83\uFF0C\u53D6\u4E0D\u5230\u518D\u9000\u5230 outline
   \uFF08outline \u4E0D\u5F71\u54CD\u5E03\u5C40\uFF0C\u4E5F\u4E0D\u4F1A\u50CF opacity \u90A3\u6837\u628A\u6587\u5B57\u4E00\u8D77\u53D8\u6DE1\uFF09\u3002 */
@supports not (background-color: color-mix(in srgb, red 10%, transparent)) {
  .${CLS}-btn:hover, .${CLS}-primary:hover, .${CLS}-item:hover,
  .${CLS}-chip:hover, .${CLS}-pill:hover {
    background-color: var(--dsw-alias-bg-layer-2, transparent);
    outline: 1px solid var(--dsw-alias-border-l2);
  }
  .${CLS}-btn:active, .${CLS}-primary:active, .${CLS}-item:active,
  .${CLS}-chip:active, .${CLS}-pill:active {
    background-color: var(--dsw-alias-bg-layer-3, transparent);
  }
}
`;
    const style = document.createElement("style");
    style.id = STYLE_ID2;
    style.textContent = css;
    document.head.appendChild(style);
    return () => {
      const node = document.getElementById(STYLE_ID2);
      if (node !== null && node !== void 0) node.remove();
    };
  }
  function separatorOf(t) {
    const value = t("labelSeparator");
    return typeof value === "string" && value !== "labelSeparator" ? value : "\uFF1A";
  }
  function localized(t, key) {
    const value = typeof t === "function" ? t(key) : void 0;
    return typeof value === "string" && value.length > 0 && value !== key ? value : void 0;
  }
  const BUILTIN_LOCALE_SUFFIX = { dafeiyu: "Dafeiyu", acha: "Acha", tinglan: "Tinglan" };
  function displayNameOf(t, persona) {
    if (persona && persona.builtin === true) {
      const suffix = BUILTIN_LOCALE_SUFFIX[persona.id];
      if (suffix !== void 0) {
        const localizedName = localized(t, `personaName${suffix}`);
        if (localizedName !== void 0) return localizedName;
      }
    }
    return persona && typeof persona.name === "string" ? persona.name : "";
  }
  function displayAboutOf(t, persona) {
    if (persona && persona.builtin === true) {
      const suffix = BUILTIN_LOCALE_SUFFIX[persona.id];
      if (suffix !== void 0) {
        const about = localized(t, `personaAbout${suffix}`);
        if (about !== void 0) return about;
      }
    }
    return persona && typeof persona.description === "string" ? persona.description : void 0;
  }
  function fetchStatus(sessionId, cwd) {
    if (typeof fetch !== "function") return Promise.reject(new Error("fetch unavailable"));
    const params = [];
    if (typeof sessionId === "string" && sessionId.length > 0) params.push(`sessionId=${encodeURIComponent(sessionId)}`);
    if (typeof cwd === "string" && cwd.length > 0) params.push(`cwd=${encodeURIComponent(cwd)}`);
    const query = params.length > 0 ? `?${params.join("&")}` : "";
    return fetch(`${STATUS_PATH}${query}`, { headers: { accept: "application/json" } }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json().then((body) => {
        if (!body || body.ok !== true) throw new Error(body && body.error || "malformed payload");
        return body.value;
      });
    });
  }
  function postMutate(payload) {
    if (typeof fetch !== "function") return Promise.reject(new Error("fetch unavailable"));
    return fetch(MUTATE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).then((response) => response.json().then((body) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!body || body.ok !== true) throw new Error(body && body.error || "request rejected");
      return body.value;
    }));
  }
  function fetchPersonaText(id) {
    if (typeof fetch !== "function") return Promise.reject(new Error("fetch unavailable"));
    return fetch(`${PERSONA_PATH}?id=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json().then((body) => {
        if (!body || body.ok !== true) throw new Error(body && body.error || "malformed payload");
        return body.value;
      });
    });
  }
  function stripExtension(fileName) {
    return String(fileName || "").replace(/\.(md|markdown|txt)$/i, "");
  }
  function downloadPersonaFile(name2, text) {
    const canDownload = typeof document !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
    if (!canDownload) throw new Error("download unavailable");
    const safe = String(name2 === void 0 || name2 === null ? "" : name2).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80) || "persona";
    const fileName = `${safe}.md`;
    const url = URL.createObjectURL(new Blob([String(text)], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return fileName;
  }
  function PersonaSettingsSection(props) {
    const t = typeof props.t === "function" ? props.t : (key) => key;
    const [state, setState] = react.useState({ status: "loading" });
    const [busy, setBusy] = react.useState(false);
    const [message, setMessage] = react.useState(null);
    const [confirmId, setConfirmId] = react.useState(null);
    const [renameId, setRenameId] = react.useState(null);
    const [renameValue, setRenameValue] = react.useState("");
    const [name2, setName] = react.useState("");
    const [text, setText] = react.useState("");
    const [picked, setPicked] = react.useState("");
    const [expandedId, setExpandedId] = react.useState(null);
    const [personaTexts, setPersonaTexts] = react.useState({});
    const [textBusyId, setTextBusyId] = react.useState(null);
    const [textFailId, setTextFailId] = react.useState(null);
    const load = react.useCallback(() => {
      setState({ status: "loading" });
      fetchStatus().then((value) => setState({ status: "ready", value })).catch((error) => setState({ status: "error", message: error && error.message ? error.message : String(error) }));
    }, []);
    react.useEffect(() => {
      load();
    }, [load]);
    const run = react.useCallback((payload, onSuccess) => {
      setBusy(true);
      setMessage(null);
      postMutate(payload).then((value) => {
        setState({ status: "ready", value });
        setMessage({ kind: "ok", text: t("done") });
        if (typeof onSuccess === "function") onSuccess();
      }).catch((error) => setMessage({ kind: "error", text: error && error.message ? error.message : String(error) })).then(() => {
        setBusy(false);
        setConfirmId(null);
      });
    }, [t]);
    const onPickFile = react.useCallback((event) => {
      const file = event && event.target && event.target.files ? event.target.files[0] : void 0;
      if (!file) return;
      const accept = (content) => {
        setText(String(content || ""));
        setPicked(file.name);
        setName((previous) => previous || stripExtension(file.name));
        setMessage(null);
      };
      if (typeof file.text === "function") {
        file.text().then(accept).catch((error) => setMessage({
          kind: "error",
          text: error && error.message ? error.message : String(error)
        }));
      } else if (typeof FileReader === "function") {
        const reader = new FileReader();
        reader.onload = () => accept(reader.result);
        reader.readAsText(file);
      }
    }, []);
    const sourceLabel = (source) => source === "imported" ? t("sourceImported") : source === "config" ? t("sourceConfig") : t("sourceBuiltin");
    const globalOff = (value) => value.globalOff === true || value.globalOff === void 0 && (value.current === null || value.current === void 0);
    const toggleFullText = react.useCallback((persona) => {
      setTextFailId(null);
      if (expandedId === persona.id) {
        setExpandedId(null);
        return;
      }
      if (personaTexts[persona.id] !== void 0) {
        setExpandedId(persona.id);
        return;
      }
      setTextBusyId(persona.id);
      fetchPersonaText(persona.id).then((entry) => {
        setPersonaTexts((previous) => ({ ...previous, [entry.id]: entry.text }));
        setExpandedId(entry.id);
      }).catch(() => setTextFailId(persona.id)).then(() => setTextBusyId(null));
    }, [expandedId, personaTexts]);
    const exportPersona = react.useCallback((persona) => {
      setMessage(null);
      const cached = personaTexts[persona.id];
      const ready = typeof cached === "string" ? Promise.resolve(cached) : fetchPersonaText(persona.id).then((entry) => entry.text);
      ready.then((text2) => {
        const fileName = downloadPersonaFile(displayNameOf(t, persona), text2);
        setMessage({ kind: "ok", text: `${t("exportDone")}${separatorOf(t)}${fileName}` });
      }).catch((error) => {
        const reason = error && error.message === "download unavailable" ? t("exportUnsupported") : error && error.message ? error.message : String(error);
        setMessage({ kind: "error", text: `${t("exportFailed")}${separatorOf(t)}${reason}` });
      });
    }, [personaTexts, t]);
    const importable = (persona) => persona.builtin !== true && persona.source === "imported";
    const body = [];
    if (message) {
      body.push(jsxRuntime.jsx("p", {
        style: message.kind === "ok" ? styles.messageOk : styles.messageError,
        children: message.text
      }, "message"));
    }
    if (state.status === "loading") {
      body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("loading") }, "loading"));
    } else if (state.status === "error") {
      body.push(jsxRuntime.jsx("p", { style: styles.messageError, children: `${t("failed")}${separatorOf(t)}${state.message}` }, "error"));
      body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("failedHint") }, "error-hint"));
    } else {
      const value = state.value;
      const suffixInfo = value && typeof value.suffix === "object" && value.suffix !== null ? value.suffix : void 0;
      const currentEntry = value.personas.find((persona) => persona.current === true);
      const globalOffNow = globalOff(value);
      const currentShownName = globalOffNow ? t("currentNone") : currentEntry === void 0 ? value.currentName || "\u2014" : displayNameOf(t, currentEntry) || value.currentName || "\u2014";
      body.push(jsxRuntime.jsx("h3", { style: styles.subHeading, children: t("currentTitle") }, "current-title"));
      body.push(jsxRuntime.jsxs("div", {
        style: styles.card,
        children: [
          jsxRuntime.jsx("div", { style: styles.key, children: t("name") }, "k-name"),
          jsxRuntime.jsxs("div", {
            style: styles.value,
            children: globalOffNow ? currentShownName : [currentShownName, " ", jsxRuntime.jsx("span", { style: styles.badge, children: sourceLabel(value.source) }, "badge")]
          }, "v-name"),
          jsxRuntime.jsx("div", { style: styles.key, children: t("status") }, "k-status"),
          jsxRuntime.jsx("div", {
            style: styles.value,
            children: !value.enabled ? t("disabledByConfig") : globalOffNow ? t("disabledByGlobalOff") : value.active ? t("enabled") : t("disabledByPersona")
          }, "v-status"),
          jsxRuntime.jsx("div", { style: styles.key, children: t("section") }, "k-section"),
          jsxRuntime.jsx("div", { style: styles.value, children: `${value.section} \xB7 order ${value.order}` }, "v-section"),
          jsxRuntime.jsx("div", { style: styles.key, children: t("chars") }, "k-chars"),
          jsxRuntime.jsx("div", { style: styles.value, children: String(value.chars) }, "v-chars"),
          // suffix 是独立段落（不随人设切换），单独一行说明它到底配了没有、多少字、排在哪。
          suffixInfo === void 0 ? null : jsxRuntime.jsx("div", { style: styles.key, children: t("suffixTitle") }, "k-suffix"),
          suffixInfo === void 0 ? null : jsxRuntime.jsx("div", {
            style: styles.value,
            children: suffixInfo.configured ? `${t("suffixOn")} \xB7 ${t("suffixChars")} ${suffixInfo.chars}` + (suffixInfo.order === null || suffixInfo.order === void 0 ? "" : ` \xB7 order ${suffixInfo.order}`) : t("suffixOff")
          }, "v-suffix"),
          suffixInfo === void 0 ? null : jsxRuntime.jsx("div", { style: styles.key, children: t("totalChars") }, "k-total"),
          suffixInfo === void 0 ? null : jsxRuntime.jsx("div", {
            style: styles.value,
            children: String(value.totalChars === void 0 ? value.chars : value.totalChars)
          }, "v-total"),
          jsxRuntime.jsx("div", { style: styles.key, children: t("storeHint") }, "k-store"),
          jsxRuntime.jsx("div", { style: styles.value, children: value.storePath || "\u2014" }, "v-store")
        ]
      }, "card"));
      body.push(jsxRuntime.jsx("div", {
        style: styles.actions,
        children: globalOffNow ? jsxRuntime.jsx("button", {
          type: "button",
          style: styles.primaryButton,
          className: `${CLS}-primary`,
          disabled: busy,
          // 恢复全局人设：交回内置默认（dafeiyu）。用户随后仍可挑别的。
          onClick: () => run({ action: "set-current", id: DEFAULT_PERSONA_ID }),
          children: t("enableGlobal")
        }, "global-on") : jsxRuntime.jsx("button", {
          type: "button",
          style: styles.button,
          className: `${CLS}-btn`,
          disabled: busy,
          onClick: () => run({ action: "set-current", id: null }),
          children: t("disableGlobal")
        }, "global-off")
      }, "global-toggle"));
      body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("globalOffHint") }, "global-off-hint"));
      const currentAbout = currentEntry === void 0 ? void 0 : displayAboutOf(t, currentEntry);
      if (currentAbout) {
        body.push(jsxRuntime.jsx("p", {
          style: styles.hint,
          children: `${t("description")}${separatorOf(t)}${currentAbout}`
        }, "current-description"));
      } else if (currentEntry) {
        body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("fullTextInList") }, "current-fulltext-hint"));
      }
      body.push(jsxRuntime.jsx("h3", { style: styles.subHeading, children: t("scopeTitle") }, "scope-title"));
      body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("scopeHint") }, "scope-hint"));
      body.push(jsxRuntime.jsx("div", {
        style: styles.actions,
        children: ["global", "workspace", "session"].map((option) => jsxRuntime.jsx("button", {
          type: "button",
          // 一档一个按钮：选中的走主按钮样式，其余是次要按钮，
          // 两者都要 class——它们的悬停反馈强度不同，靠后缀区分。
          style: value.mode === option ? styles.primaryButton : styles.button,
          className: value.mode === option ? `${CLS}-primary` : `${CLS}-btn`,
          disabled: busy,
          onClick: () => run({ action: "set-mode", mode: option }),
          children: option === "global" ? t("scopeGlobal") : option === "workspace" ? t("scopeWorkspace") : t("scopeSession")
        }, `scope-${option}`))
      }, "scope-actions"));
      const clockInfo = value.clock === void 0 ? void 0 : value.clock;
      body.push(jsxRuntime.jsx("h4", { style: styles.subHeading, children: t("clockTitle") }, "clock-title"));
      body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("clockHint") }, "clock-hint"));
      body.push(jsxRuntime.jsxs("div", {
        style: styles.actions,
        children: [
          jsxRuntime.jsx("button", {
            type: "button",
            style: clockInfo !== void 0 && clockInfo.enabled ? styles.primaryButton : styles.button,
            className: clockInfo !== void 0 && clockInfo.enabled ? `${CLS}-primary` : `${CLS}-btn`,
            disabled: busy,
            onClick: () => run({ action: "set-clock", enabled: !(clockInfo !== void 0 && clockInfo.enabled) }),
            children: clockInfo !== void 0 && clockInfo.enabled ? t("clockOn") : t("clockOff")
          }, "clock-toggle"),
          clockInfo === void 0 ? null : jsxRuntime.jsx("span", {
            style: styles.hint,
            children: `${t("clockLastSeen")}\uFF1A${clockInfo.lastSeen ? new Date(clockInfo.lastSeen).toLocaleString() : t("clockNever")}`
          }, "clock-last")
        ]
      }, "clock-row"));
      const guardInfo = value.guard === void 0 ? void 0 : value.guard;
      body.push(jsxRuntime.jsx("h4", { style: styles.subHeading, children: t("guardTitle") }, "guard-title"));
      body.push(jsxRuntime.jsxs("div", {
        style: styles.actions,
        children: [
          jsxRuntime.jsx("span", {
            style: guardInfo !== void 0 && guardInfo.warn ? { ...styles.value, color: "var(--dsw-alias-state-warning-primary, #b7791f)", fontWeight: 600 } : styles.value,
            children: `${String(value.chars)} ${t("charsUnit")}`
          }, "guard-chars"),
          guardInfo === void 0 ? null : jsxRuntime.jsx("span", {
            style: styles.hint,
            children: guardInfo.warn ? t("guardWarn") : t("guardOk")
          }, "guard-hint")
        ]
      }, "guard-row"));
      const truncateInfo = guardInfo === void 0 ? void 0 : guardInfo.truncate;
      body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("truncateHint") }, "truncate-hint"));
      body.push(jsxRuntime.jsx("div", {
        style: styles.actions,
        children: [0, 4e3, 8e3, 12e3].map((max) => {
          const on = truncateInfo === void 0 ? max === 0 : max === 0 ? truncateInfo.enabled !== true : truncateInfo.enabled === true && truncateInfo.max === max;
          return jsxRuntime.jsx("button", {
            type: "button",
            style: on ? styles.primaryButton : styles.button,
            className: on ? `${CLS}-primary` : `${CLS}-btn`,
            disabled: busy,
            onClick: () => run(max === 0 ? { action: "set-truncate", enabled: false } : { action: "set-truncate", enabled: true, max }),
            children: max === 0 ? t("truncateOff") : t("truncateTitle").replace("N", String(max))
          }, `truncate-${max}`);
        })
      }, "truncate-row"));
      body.push(jsxRuntime.jsx("h4", { style: styles.subHeading, children: t("workspaceTitle") }, "workspace-title"));
      body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("workspaceHint") }, "workspace-hint"));
      const workspaceRows = Array.isArray(value.workspaces) ? value.workspaces : [];
      if (workspaceRows.length === 0) {
        body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("workspaceEmpty") }, "workspace-empty"));
      } else {
        body.push(jsxRuntime.jsx("ul", {
          style: styles.list,
          children: workspaceRows.map((row) => jsxRuntime.jsxs("li", {
            style: styles.row,
            children: [
              jsxRuntime.jsx("div", {
                style: styles.rowMain,
                children: jsxRuntime.jsx("span", { style: styles.workspacePath, children: row.cwd }, "cwd")
              }, "cwd-wrap"),
              jsxRuntime.jsx("select", {
                style: styles.select,
                value: row.personaId === null ? "" : row.personaId,
                disabled: busy,
                onChange: (event) => run({
                  action: "set-workspace-persona",
                  cwd: row.cwd,
                  personaId: event.target.value === "" ? null : event.target.value
                }),
                children: [
                  jsxRuntime.jsx("option", { value: "", children: t("workspaceFollow") }, "opt-follow"),
                  ...value.personas.filter((persona) => persona.enabled === true).map((persona) => jsxRuntime.jsx("option", {
                    value: persona.id,
                    children: displayNameOf(t, persona) || persona.name
                  }, `opt-${persona.id}`))
                ]
              }, "workspace-select")
            ]
          }, `ws-${row.cwd}`))
        }, "workspace-list"));
      }
      body.push(jsxRuntime.jsx("h3", { style: styles.subHeading, children: t("listTitle") }, "list-title"));
      if (value.personas.length === 0) {
        body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("empty") }, "empty"));
      }
      body.push(jsxRuntime.jsx("ul", {
        style: styles.list,
        children: value.personas.map((persona) => {
          const rows = [jsxRuntime.jsxs("div", {
            style: styles.row,
            children: [
              jsxRuntime.jsxs("div", {
                style: styles.rowMain,
                children: [
                  jsxRuntime.jsx("span", {
                    style: styles.personaName,
                    // 截断后靠 title 补全：长名字在列表里只看得到前半截。
                    title: displayNameOf(t, persona) || persona.name,
                    children: displayNameOf(t, persona) || persona.name
                  }, "name"),
                  jsxRuntime.jsx("span", { style: styles.badge, children: sourceLabel(persona.source) }, "source"),
                  persona.current ? jsxRuntime.jsx("span", { style: styles.badgeActive, children: t("currentBadge") }, "current") : null,
                  persona.enabled ? null : jsxRuntime.jsx("span", { style: styles.badgeOff, children: t("offBadge") }, "off"),
                  jsxRuntime.jsx("span", { style: styles.hint, children: String(persona.chars) }, "chars")
                ]
              }, "main"),
              jsxRuntime.jsxs("div", {
                style: styles.actions,
                children: [
                  persona.current ? null : jsxRuntime.jsx("button", {
                    type: "button",
                    style: styles.primaryButton,
                    className: `${CLS}-primary`,
                    disabled: busy,
                    onClick: () => run({ action: "set-current", id: persona.id }),
                    children: t("setCurrent")
                  }, "set-current"),
                  jsxRuntime.jsx("button", {
                    type: "button",
                    style: styles.button,
                    className: `${CLS}-btn`,
                    disabled: busy,
                    onClick: () => run({ action: "set-enabled", id: persona.id, enabled: !persona.enabled }),
                    children: persona.enabled ? t("disable") : t("enable")
                  }, "toggle"),
                  importable(persona) ? jsxRuntime.jsx("button", {
                    type: "button",
                    style: styles.button,
                    className: `${CLS}-btn`,
                    disabled: busy,
                    onClick: () => {
                      setRenameId(persona.id);
                      setRenameValue(persona.name);
                    },
                    children: t("rename")
                  }, "rename") : null,
                  importable(persona) ? confirmId === persona.id ? jsxRuntime.jsxs("span", {
                    style: styles.actions,
                    children: [
                      jsxRuntime.jsx("button", {
                        type: "button",
                        style: styles.button,
                        className: `${CLS}-btn`,
                        disabled: busy,
                        onClick: () => run({ action: "remove", id: persona.id }),
                        children: t("removeConfirm")
                      }, "confirm"),
                      jsxRuntime.jsx("button", {
                        type: "button",
                        style: styles.button,
                        className: `${CLS}-btn`,
                        disabled: busy,
                        onClick: () => setConfirmId(null),
                        children: t("cancel")
                      }, "cancel")
                    ]
                  }, "confirm-box") : jsxRuntime.jsx("button", {
                    type: "button",
                    style: styles.button,
                    className: `${CLS}-btn`,
                    disabled: busy,
                    onClick: () => setConfirmId(persona.id),
                    children: t("remove")
                  }, "remove") : null,
                  persona.builtin ? jsxRuntime.jsx("span", { style: styles.hint, children: t("builtinLocked") }, "locked") : null
                ]
              }, "actions")
            ]
          }, "row")];
          if (persona.builtin === true) {
            rows.push(jsxRuntime.jsx("p", {
              style: styles.hint,
              children: `${t("description")}${separatorOf(t)}${displayAboutOf(t, persona) || t("builtinNote")}`
            }, "builtin-description"));
          }
          {
            const expanded = expandedId === persona.id;
            const text2 = personaTexts[persona.id];
            rows.push(jsxRuntime.jsxs("div", {
              style: styles.actions,
              children: [
                jsxRuntime.jsx("button", {
                  type: "button",
                  style: styles.button,
                  className: `${CLS}-btn`,
                  disabled: textBusyId === persona.id,
                  onClick: () => toggleFullText(persona),
                  children: expanded ? t("collapse") : t("fullText")
                }, "toggle-full-text"),
                // 导出仍只给自导入 / config 人设：内置正文由插件维护，
                // 不属于用户的资产；想改就先自己导入一份。
                persona.builtin === true ? null : jsxRuntime.jsx("button", {
                  type: "button",
                  style: styles.button,
                  className: `${CLS}-btn`,
                  onClick: () => exportPersona(persona),
                  children: t("exportAction")
                }, "export-persona"),
                textBusyId === persona.id ? jsxRuntime.jsx("span", { style: styles.hint, children: t("fullTextLoading") }, "text-loading") : null,
                textFailId === persona.id ? jsxRuntime.jsx("span", { style: styles.messageError, children: t("fullTextFailed") }, "text-failed") : null
              ]
            }, "full-text-actions"));
            if (expanded && typeof text2 === "string") {
              rows.push(jsxRuntime.jsx("pre", { style: styles.preview, children: text2 }, "full-text"));
            }
          }
          if (renameId === persona.id) {
            rows.push(jsxRuntime.jsxs("div", {
              style: styles.actions,
              children: [
                jsxRuntime.jsx("input", {
                  style: styles.input,
                  value: renameValue,
                  placeholder: t("renamePlaceholder"),
                  onChange: (event) => setRenameValue(event.target.value)
                }, "rename-input"),
                jsxRuntime.jsx("button", {
                  type: "button",
                  style: styles.primaryButton,
                  className: `${CLS}-primary`,
                  disabled: busy || String(renameValue).trim().length === 0,
                  onClick: () => {
                    run({ action: "rename", id: persona.id, name: renameValue }, () => {
                      setRenameId(null);
                    });
                  },
                  children: t("save")
                }, "rename-save"),
                jsxRuntime.jsx("button", {
                  type: "button",
                  style: styles.button,
                  className: `${CLS}-btn`,
                  disabled: busy,
                  onClick: () => setRenameId(null),
                  children: t("cancel")
                }, "rename-cancel")
              ]
            }, "rename-row"));
          }
          return jsxRuntime.jsx("li", { children: rows }, persona.id);
        })
      }, "list"));
      body.push(jsxRuntime.jsxs("p", {
        style: styles.plaza,
        children: [
          jsxRuntime.jsx("span", { children: t("plazaHint") }, "plaza-hint"),
          jsxRuntime.jsx("a", {
            href: PLAZA_URL,
            target: "_blank",
            rel: "noopener noreferrer",
            style: styles.plazaLink,
            className: `${CLS}-link`,
            title: t("plazaTitle"),
            children: t("plazaLinkLabel")
          }, "plaza-link")
        ]
      }, "plaza"));
      body.push(jsxRuntime.jsx("h3", { style: styles.subHeading, children: t("importTitle") }, "import-title"));
      body.push(jsxRuntime.jsxs("div", {
        style: styles.importBox,
        children: [
          jsxRuntime.jsx("input", {
            style: styles.input,
            value: name2,
            placeholder: t("importNamePlaceholder"),
            onChange: (event) => setName(event.target.value)
          }, "import-name"),
          jsxRuntime.jsx("textarea", {
            style: styles.textarea,
            value: text,
            placeholder: t("importTextPlaceholder"),
            onChange: (event) => setText(event.target.value)
          }, "import-text"),
          jsxRuntime.jsxs("div", {
            style: styles.actions,
            children: [
              jsxRuntime.jsxs("label", {
                style: styles.fileLabel,
                className: `${CLS}-pill`,
                children: [
                  t("importFile"),
                  jsxRuntime.jsx("input", {
                    type: "file",
                    accept: ".md,.markdown,.txt,text/plain",
                    style: { display: "none" },
                    onChange: onPickFile
                  }, "file")
                ]
              }, "file-label"),
              picked ? jsxRuntime.jsx("span", { style: styles.hint, children: picked }, "picked") : null,
              jsxRuntime.jsx("button", {
                type: "button",
                style: styles.primaryButton,
                className: `${CLS}-primary`,
                disabled: busy || String(text).trim().length === 0,
                onClick: () => {
                  run({ action: "import", name: name2, text }, () => {
                    setName("");
                    setText("");
                    setPicked("");
                  });
                },
                children: t("importAction")
              }, "import-run")
            ]
          }, "import-actions"),
          jsxRuntime.jsx("p", { style: styles.hint, children: t("importHint") }, "import-hint")
        ]
      }, "import-box"));
    }
    body.push(jsxRuntime.jsx("div", {
      style: styles.actions,
      children: jsxRuntime.jsx("button", {
        type: "button",
        style: styles.button,
        className: `${CLS}-btn`,
        disabled: busy,
        onClick: load,
        children: t("refresh")
      }, "refresh")
    }, "footer-actions"));
    body.push(jsxRuntime.jsx("p", { style: styles.hint, children: t("configHint") }, "config-hint"));
    return jsxRuntime.jsxs("section", {
      style: styles.section,
      "aria-label": t("title"),
      children: [
        jsxRuntime.jsx("h2", { style: styles.heading, children: t("title") }, "title"),
        jsxRuntime.jsx("p", { style: styles.intro, children: t("intro") }, "intro"),
        ...body
      ]
    });
  }
  const pickerStore = {
    state: { open: false, sessionId: "", cwd: void 0, value: null, onUpdated: null },
    listeners: /* @__PURE__ */ new Set(),
    get: () => pickerStore.state,
    set: (patch) => {
      pickerStore.state = { ...pickerStore.state, ...patch };
      for (const listener of [...pickerStore.listeners]) listener();
    },
    subscribe: (listener) => {
      pickerStore.listeners.add(listener);
      return () => pickerStore.listeners.delete(listener);
    }
  };
  function PersonaPickerOverlay(props) {
    const t = typeof props?.t === "function" ? props.t : (key) => key;
    const [state, setState] = react.useState(() => pickerStore.get());
    const [busy, setBusy] = react.useState(false);
    const [failure, setFailure] = react.useState(null);
    react.useEffect(() => pickerStore.subscribe(() => {
      setState(pickerStore.get());
      setFailure(null);
    }), []);
    const close = () => pickerStore.set({ open: false });
    const pick = (personaId, options2) => {
      const none = options2 !== void 0 && options2.none === true;
      const current = pickerStore.get();
      setBusy(true);
      setFailure(null);
      const withScope = current.cwd === void 0 ? {} : { cwd: current.cwd };
      const promote = current.origin === "hero" && current.value !== null && current.value !== void 0 && current.value.mode !== "session";
      const scoped = promote ? postMutate({ action: "set-mode", mode: "session", sessionId: current.sessionId, ...withScope }) : Promise.resolve(null);
      const submission = none ? { action: "set-session-persona", none: true, sessionId: current.sessionId, ...withScope } : { action: "set-session-persona", personaId, sessionId: current.sessionId, ...withScope };
      scoped.then(() => postMutate(submission)).then((value2) => {
        if (typeof current.onUpdated === "function") current.onUpdated(value2);
        close();
      }).catch((error) => setFailure(error && error.message ? error.message : String(error))).then(() => setBusy(false));
    };
    if (state.open !== true) return null;
    const value = state.value;
    if (value === null || value === void 0) return null;
    const sessionOff = value.sessionOff === true;
    const options = [
      jsxRuntime.jsx("button", {
        type: "button",
        style: sessionOff ? styles.pickerItemActive : styles.pickerItem,
        className: `${CLS}-item`,
        // 供样式表区分「已选中」与「正悬停」：选中项不再放大。
        "data-active": sessionOff ? "true" : "false",
        disabled: busy,
        // 这一句有 17 个字，窄屏下必然被省略号截断（issue #7），
        // 所以 title 必须给全文，否则用户看不全这个选项到底是什么意思。
        title: t("pickerNoPersona"),
        onClick: () => pick(null, { none: true }),
        children: t("pickerNoPersona")
      }, "picker-none")
    ];
    for (const persona of value.personas) {
      if (persona.enabled !== true) continue;
      const shownName = displayNameOf(t, persona) || persona.name;
      options.push(jsxRuntime.jsx("button", {
        type: "button",
        style: persona.sessionPick === true ? styles.pickerItemActive : styles.pickerItem,
        className: `${CLS}-item`,
        "data-active": persona.sessionPick === true ? "true" : "false",
        disabled: busy,
        // 长人设名同理：截断了也要能看全。
        title: shownName,
        onClick: () => pick(persona.id),
        children: shownName
      }, `picker-${persona.id}`));
    }
    return jsxRuntime.jsx("div", {
      style: styles.modalBackdrop,
      // 点背景空白处关闭；点面板内部不关（事件目标不是背景本身）。
      onClick: (event) => {
        if (event && event.target === event.currentTarget) close();
      },
      children: jsxRuntime.jsxs("div", {
        style: styles.modalPanel,
        role: "dialog",
        "aria-modal": true,
        "aria-label": t("pickerTitle"),
        children: [
          jsxRuntime.jsx("h3", { style: styles.modalHeading, children: t("pickerTitle") }, "picker-title"),
          jsxRuntime.jsx("p", { style: styles.hint, children: t("pickerHint") }, "picker-hint"),
          failure === null ? null : jsxRuntime.jsx("p", { style: styles.messageError, children: failure }, "picker-failure"),
          jsxRuntime.jsx("div", { style: styles.modalList, children: options }, "picker-list"),
          jsxRuntime.jsx("button", {
            type: "button",
            style: styles.button,
            className: `${CLS}-btn`,
            onClick: close,
            children: t("cancel")
          }, "picker-cancel")
        ]
      }, "picker-panel")
    });
  }
  function PersonaDock(props) {
    const t = typeof props?.t === "function" ? props.t : (key) => key;
    const sessionId = typeof props?.sessionId === "string" ? props.sessionId : "";
    const useSessions = props?.useSessions;
    const cwd = typeof useSessions === "function" ? useSessions((snapshot) => {
      const entry = sessionId.length > 0 && snapshot && snapshot.byId ? snapshot.byId[sessionId] : void 0;
      return entry && typeof entry.cwd === "string" && entry.cwd.length > 0 ? entry.cwd : void 0;
    }) : void 0;
    const [state, setState] = react.useState({ status: "loading" });
    const [busy, setBusy] = react.useState(false);
    const [failure, setFailure] = react.useState(null);
    const load = react.useCallback(() => {
      fetchStatus(sessionId, cwd).then((value2) => setState({ status: "ready", value: value2 })).catch(() => setState({ status: "error" }));
    }, [sessionId, cwd]);
    react.useEffect(() => {
      load();
    }, [load]);
    const run = react.useCallback((payload) => {
      setBusy(true);
      setFailure(null);
      postMutate({ ...payload, sessionId, ...cwd === void 0 ? {} : { cwd } }).then((value2) => setState({ status: "ready", value: value2 })).catch((error) => {
        setFailure(error && error.message ? error.message : String(error));
      }).then(() => setBusy(false));
    }, [sessionId, cwd]);
    if (state.status === "error") {
      return jsxRuntime.jsx("div", { style: styles.dock, children: t("dockFailed") });
    }
    if (state.status !== "ready") return null;
    const value = state.value;
    if (value.enabled !== true) {
      return jsxRuntime.jsx("div", { style: styles.dock, children: t("dockOff") });
    }
    const mode = value.mode;
    const entryOf = (id) => (Array.isArray(value.personas) ? value.personas : []).find((persona) => persona.id === id);
    const shownNameOf = (id, fallback) => {
      const entry = id === void 0 || id === null ? void 0 : entryOf(id);
      if (entry !== void 0) return displayNameOf(t, entry) || fallback || "";
      return fallback || "";
    };
    const effective = value.effective;
    const sessionOff = mode === "session" && value.sessionOff === true;
    let shown;
    if (sessionOff) {
      shown = t("pickerNoPersona");
    } else {
      shown = effective === null || effective === void 0 ? shownNameOf(value.current, value.currentName) : shownNameOf(effective.id, effective.name);
    }
    if (sessionOff) {
    } else if (mode === "session" && effective !== null && effective !== void 0) {
      if (effective.source === "global") shown = `${shown} \xB7 ${t("dockFollowGlobal")}`;
      else if (effective.source === "workspace") shown = `${shown} \xB7 ${t("dockFollowWorkspace")}`;
    } else if (mode === "workspace") {
      shown = `${shown} \xB7 ${t("scopeWorkspace")}`;
    }
    const parts = [jsxRuntime.jsx("span", { children: "\u{1F41F}" }, "fish")];
    if (mode === "session") {
      parts.push(jsxRuntime.jsx("button", {
        type: "button",
        style: styles.dockNameButton,
        className: `${CLS}-chip`,
        disabled: busy,
        title: `${t("dockSwitch")}${separatorOf(t)}${shown}`,
        "aria-haspopup": "dialog",
        onClick: () => pickerStore.set({
          open: true,
          sessionId,
          cwd,
          value,
          // 浮层选完后把新快照回填，小条立刻显示新的人设名。
          onUpdated: (next) => setState({ status: "ready", value: next })
        }),
        children: `${shown} \u25BE`
      }, "name-toggle"));
    } else {
      parts.push(jsxRuntime.jsx("span", { style: styles.dockName, title: shown, children: shown }, "name"));
    }
    for (const option of ["global", "session"]) {
      parts.push(jsxRuntime.jsx("button", {
        type: "button",
        style: mode === option ? styles.dockChipActive : styles.dockChip,
        className: `${CLS}-chip`,
        disabled: busy,
        title: t("scopeHint"),
        onClick: () => run({ action: "set-mode", mode: option }),
        children: option === "global" ? t("scopeGlobal") : t("scopeSession")
      }, `mode-${option}`));
    }
    if (failure !== null) {
      parts.push(jsxRuntime.jsx("span", {
        style: styles.messageError,
        title: failure,
        children: `${t("dockSwitchFailed")}${separatorOf(t)}${failure}`
      }, "dock-failure"));
    }
    return jsxRuntime.jsx("div", {
      style: styles.dock,
      "data-dsh-persona-dock": value.mode,
      children: parts
    });
  }
  function PersonaHeroChip(props) {
    const t = typeof props?.t === "function" ? props.t : (key) => key;
    const sessionId = typeof props?.sessionId === "string" ? props.sessionId : "";
    const useSessions = props?.useSessions;
    const cwd = typeof useSessions === "function" ? useSessions((snapshot) => {
      const entry = sessionId.length > 0 && snapshot && snapshot.byId ? snapshot.byId[sessionId] : void 0;
      return entry && typeof entry.cwd === "string" && entry.cwd.length > 0 ? entry.cwd : void 0;
    }) : void 0;
    const [state, setState] = react.useState({ status: "loading" });
    const load = react.useCallback(() => {
      fetchStatus(sessionId, cwd).then((value2) => setState({ status: "ready", value: value2 })).catch(() => setState({ status: "error" }));
    }, [sessionId, cwd]);
    react.useEffect(() => {
      load();
    }, [load]);
    if (state.status === "error") {
      return null;
    }
    if (state.status !== "ready") return null;
    const value = state.value;
    if (value.enabled !== true) return null;
    const entryOf = (id) => (Array.isArray(value.personas) ? value.personas : []).find((persona) => persona.id === id);
    const nameOf = (id, fallback) => {
      const entry = id === void 0 || id === null ? void 0 : entryOf(id);
      if (entry !== void 0) return displayNameOf(t, entry) || fallback || "";
      return fallback || "";
    };
    const effective = value.effective;
    const picked = value.sessionPersona;
    const shownId = picked !== null && picked !== void 0 ? picked.id : effective === null || effective === void 0 ? null : effective.id;
    const shown = nameOf(shownId, picked === null || picked === void 0 ? value.currentName ?? "" : picked.name);
    const nothingToFollow = shown.length === 0;
    let suffixHint = "";
    if (!nothingToFollow && (picked === null || picked === void 0)) {
      if (effective !== null && effective !== void 0 && effective.source === "workspace") {
        suffixHint = t("heroChipFollowWorkspace");
      } else if (value.mode === "session") {
        suffixHint = t("heroChipFollowGlobal");
      }
    }
    const label = shown.length > 0 ? shown : value.globalOff === true ? t("heroChipNone") : t("heroChipDisabled");
    const prefixText = `${t("heroChip")}${separatorOf(t)}`;
    const suffixText = suffixHint.length > 0 ? `\xB7 ${suffixHint}` : "";
    return jsxRuntime.jsx("button", {
      type: "button",
      style: styles.heroChipButton,
      className: `${CLS}-pill`,
      // 名字被截断时，title 要能看全——但也不能丢掉「点这里是干嘛的」，
      // 所以把动作说明和人设名一起放进去。
      title: `${t("heroChipTitle")}${separatorOf(t)}${label}`,
      "aria-haspopup": "dialog",
      "data-dsh-persona-hero": shownId === null ? "none" : shownId,
      onClick: () => pickerStore.set({
        open: true,
        sessionId,
        cwd,
        value,
        origin: "hero",
        // 选完把新快照回填，chip 上的名字立刻跟着变。
        onUpdated: (next) => setState({ status: "ready", value: next })
      }),
      children: [
        jsxRuntime.jsx("span", { style: styles.heroChipFixed, children: "\u{1F41F}" }, "hero-fish"),
        jsxRuntime.jsx("span", { style: styles.heroChipFixed, children: prefixText }, "hero-prefix"),
        jsxRuntime.jsx("span", { style: styles.heroChipLabel, children: label }, "hero-label"),
        suffixText.length > 0 ? jsxRuntime.jsx("span", { style: styles.heroChipFixed, children: suffixText }, "hero-suffix") : null,
        jsxRuntime.jsx("span", { style: styles.heroChipFixed, children: "\u25BE" }, "hero-chevron")
      ]
    });
  }
  const inject2 = ["slots", "locale"];
  function apply2(ctx, options) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-persona-dafeiyu: dictionaries");
    ctx.effect(() => injectHoverStyles(), "dsh-persona-dafeiyu: hover styles");
    const boundT = ctx.locale.bind(NS);
    const t = (key) => Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : boundT(key);
    if (!options?.skipSettings) {
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: SECTION_ID,
        order: 18,
        label: () => t("nav"),
        locale: NS,
        inject: () => ({ t })
      }, PersonaSettingsSection));
    }
    ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
      name: "conversation.composer.dock",
      id: "persona-dock",
      order: 60,
      locale: NS,
      inject: () => ({ t })
    }, PersonaDock));
    ctx.slots.inject("shell.overlay", () => ctx.slots.register({
      name: "shell.overlay",
      id: "persona-picker",
      order: 50,
      locale: NS,
      inject: () => ({ t })
    }, PersonaPickerOverlay));
    ctx.slots.inject("conversation.hero.options", () => ctx.slots.register({
      name: "conversation.hero.options",
      id: "persona-hero",
      order: 40,
      locale: NS,
      inject: () => ({ t })
    }, PersonaHeroChip));
  }
  exports.apply = apply2;
  exports.zh = zh;
  exports.inject = inject2;
  exports.NS = NS;
  exports.SECTION_ID = SECTION_ID;
  exports.PersonaSettingsSection = PersonaSettingsSection;
  exports.PersonaDock = PersonaDock;
  exports.PersonaPickerOverlay = PersonaPickerOverlay;
  exports.PersonaHeroChip = PersonaHeroChip;
  return module2.exports;
}

// src/client/main.ts
var name = "dsh-remote-dafeiyu";
var inject = ["slots", "locale"];
function apply(ctx) {
  const createElement = findCreateElement();
  let pillMounted = false;
  try {
    pillMounted = mountPill(ctx, createElement);
  } catch (error) {
    swallow("pill \u6302\u8F7D\u629B\u9519\uFF08\u5DF2\u541E\u6389\uFF09", error);
  }
  let personaClient;
  let reactHooks;
  let personaLoadNote;
  try {
    const loaderRequire = resolveLoaderRequire();
    if (loaderRequire === void 0) {
      personaLoadNote = "\u88C5\u8F7D\u5668\u6CA1\u7ED9 require";
    } else {
      personaClient = personaClientFactory(loaderRequire);
      if (typeof personaClient?.apply !== "function") {
        personaLoadNote = "\u4EBA\u8BBE\u5BA2\u6237\u7AEF\u6CA1\u7ED9\u51FA apply";
      } else {
        reactHooks = loaderRequire("react") ?? void 0;
      }
    }
  } catch (error) {
    personaLoadNote = String(error?.message ?? error);
  }
  if (personaLoadNote) {
    warnPersona(`\u4EBA\u8BBE\u5BA2\u6237\u7AEF\u672A\u5C31\u7EEA\uFF08${personaLoadNote}\uFF1A\u9000\u56DE\u4E24\u5F20\u5361\uFF0C\u6216\u53EA\u5269\u8FDC\u63A7\u4E00\u5361\uFF09`);
  }
  let visionCleanup;
  try {
    visionCleanup = mountVisionFab({ injectText: resolveSessionInject(ctx) });
  } catch (error) {
    swallow("\u8BC6\u56FE\u6309\u94AE\u6302\u8F7D\u629B\u9519\uFF08\u5DF2\u541E\u6389\uFF09", error);
  }
  let subagentsCleanup;
  try {
    subagentsCleanup = mountSubagentMonitor({ getCurrentSession: resolveCurrentSession(ctx) });
  } catch (error) {
    swallow("\u5B50\u4EE3\u7406\u76D1\u89C6\u5668\u6302\u8F7D\u629B\u9519\uFF08\u5DF2\u541E\u6389\uFF09", error);
  }
  let settingsMounted = false;
  let dafeiyuMerged = false;
  let personaMounted = false;
  try {
    if (personaClient && typeof createElement === "function" && reactHooks && typeof reactHooks.useState === "function") {
      dafeiyuMerged = mountDafeiyuSettings({
        ctx,
        createElement,
        reactHooks,
        personaSettings: personaClient.PersonaSettingsSection,
        personaT: resolvePersonaT(ctx, personaClient.zh)
      });
    }
  } catch (error) {
    dafeiyuMerged = false;
    swallow("\u5927\u80A5\u9C7C\u5408\u9875\u6302\u8F7D\u629B\u9519\uFF08\u9000\u56DE\u4E24\u5F20\u5361\uFF09", error);
  }
  if (dafeiyuMerged) {
    settingsMounted = true;
    try {
      personaClient?.apply?.(ctx, { skipSettings: true });
      personaMounted = true;
    } catch (error) {
      warnPersona("\u4EBA\u8BBE\u754C\u9762\u6302\u8F7D\u629B\u9519\uFF08\u5DF2\u541E\u6389\uFF0C\u5408\u9875\u4E0E\u8FDC\u63A7\u4E0D\u53D7\u5F71\u54CD\uFF09", error);
    }
  } else {
    try {
      settingsMounted = mountSettingsSection(ctx, createElement) !== "failed";
    } catch (error) {
      swallow("\u8BBE\u7F6E\u5206\u533A\u6302\u8F7D\u629B\u9519\uFF08\u5DF2\u541E\u6389\uFF09", error);
    }
    if (personaClient) {
      try {
        personaClient?.apply?.(ctx);
        personaMounted = true;
      } catch (error) {
        warnPersona("\u4EBA\u8BBE\u754C\u9762\u6302\u8F7D\u629B\u9519\uFF08\u5DF2\u541E\u6389\uFF0C\u8FDC\u63A7\u8BBE\u7F6E\u9875\u4E0D\u53D7\u5F71\u54CD\uFF09", error);
      }
    }
  }
  reportClient({
    createElement: createElement !== void 0,
    pillMounted,
    settingsMounted,
    dafeiyuMerged,
    personaMounted,
    hasSlotsCtx: (() => {
      try {
        return ctx.slots !== void 0;
      } catch {
        return false;
      }
    })(),
    transport: globalThis.__DSH_TRANSPORT__ !== void 0
  });
  return () => {
    try {
      subagentsCleanup?.();
    } catch {
    }
    try {
      visionCleanup?.();
    } catch {
    }
  };
}
function resolveSessionInject(ctx) {
  let sessions;
  try {
    sessions = ctx.sessions;
  } catch {
    sessions = void 0;
  }
  if (!sessions) {
    try {
      sessions = ctx.get?.("sessions", true);
    } catch {
      sessions = void 0;
    }
  }
  const value = sessions;
  if (!value || typeof value.list?.getSnapshot !== "function" || typeof value.binding !== "function") {
    return void 0;
  }
  return async (text) => {
    try {
      const current = value.list?.getSnapshot?.()?.current;
      if (current === void 0 || current === null) return false;
      const binding = value.binding?.(current);
      const prompt = binding?.session?.prompt;
      if (typeof prompt !== "function") return false;
      await prompt.call(binding?.session, [{ type: "text", text }], "queue");
      return true;
    } catch {
      return false;
    }
  };
}
function resolveCurrentSession(ctx) {
  const service = (name2) => {
    try {
      const direct = ctx[name2];
      if (direct) return direct;
    } catch {
    }
    try {
      return ctx.get?.(name2, true);
    } catch {
      return void 0;
    }
  };
  return () => {
    const ui = service("uiSession");
    try {
      const binding = ui?.current;
      const snap = binding?.getSnapshot ? binding.getSnapshot() : binding?.value;
      const key = typeof snap === "object" && snap !== null ? snap.key ?? snap.sessionId : void 0;
      if (typeof key === "string" && key !== "") return key;
    } catch {
    }
    const sessions = service("sessions");
    try {
      const current = sessions?.list?.getSnapshot?.()?.current;
      if (typeof current === "string" && current !== "") return current;
    } catch {
    }
    return void 0;
  };
}
function reportClient(fields) {
  try {
    void fetch(resolveHostUrl("/plugins/dsh-remote-control/client-report"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-drc-pair": "1" },
      // 与其余请求同一条纪律：宿主卡住时它自己收场，不挂住页面。
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(3e3) : void 0,
      body: JSON.stringify({
        ...fields,
        href: typeof location !== "undefined" ? String(location.href).slice(0, 120) : ""
      })
    }).catch(() => {
    });
  } catch {
  }
}
function resolvePersonaT(ctx, zh) {
  let bound;
  let resolved = false;
  const fromZh = (key) => zh && Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : void 0;
  return (key) => {
    const own = fromZh(key);
    if (own !== void 0) return own;
    if (!resolved) {
      resolved = true;
      try {
        const bind = ctx.locale?.bind;
        if (typeof bind === "function") {
          const candidate = bind("personaDafeiyu");
          if (typeof candidate === "function") bound = candidate;
        }
      } catch {
      }
    }
    const external = bound?.(key);
    return typeof external === "string" && external !== "" ? external : key;
  };
}
function resolveLoaderRequire() {
  try {
    if (typeof require !== "function") return void 0;
    return require;
  } catch {
    return void 0;
  }
}
function warnPersona(message, error) {
  try {
    const detail = error instanceof Error ? error.message : error === void 0 ? "" : String(error);
    console.warn(`[dsh-remote-control persona] ${message} ${detail}`);
  } catch {
  }
}
function swallow(what, error) {
  try {
    console.error(`[dsh-remote-control] ${what}\uFF1A`, error);
  } catch {
  }
}

    return module.exports;
  },
});

