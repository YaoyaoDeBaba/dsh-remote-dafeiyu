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
var APP_QR_DATA_URL = "data:image/png;base64,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tQ2ftS2f1ja3tuVW23zatnxa2/yEbfmmtvm0bbnVNje25ZtOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDn/uUXaZtv2hb+lm35pra5tS232ubGtvyEtrmxLbfa5ta2fFrb3NqWG9tyq21utc1vsC232ubWtvwGJwDAcycAwHMnAMBzJwDAcycAwHMnAMBzJwDAcycAwHMnAMBz/8Kf1DY3tuVW23zattxqm1vb8mlt801t82lt8xO25dO25Zu25dPa5ta23GqbG9tyq21ubcunbctfcwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPPcv/Enb8tdsy622+bRt+aa2+bRt+aa2ubUtt9rm07bl07blm9rmJ7TNjW35X3YCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADx3AgA8dwIAPHcCADz3L7/Itvwv25ZbbXNjW25tyze1zadty09omxvbcmtbbrXNjba5tS232ubGttxqm1vb8k1t803b8k1t801tc2NbvukEAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO5fvqxtuNM2v0Xb3NiWW9vy17TNrW25tS032uab2uYntM2NbbnVNre25Ubb3NqWW21zY1tutc03tc2tbfkNTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA504AgOdOAIDnTgCA57r/BAB46gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHjuBAB47gQAeO4EAHju/wACbcsMSB6CDAAAAABJRU5ErkJggg==";

// src/client/settings.ts
var SETTINGS_SLOT = "settings.section";
var SETTINGS_ID = "dsh-remote-control";
var SETTINGS_ORDER = 30;
var SETTINGS_LABEL = "\u8FDC\u7A0B\u63A7\u5236";
var CONFIG_ROUTE = "/plugins/dsh-remote-control/config";
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
    topHost.replaceChildren(...topChildren);
    leftCol.replaceChildren(...leftChildren);
  };
  paint();
  void loadStatus();
  void mint();
  void loadConfig();
  statusTimer = setInterval(() => void loadStatus(), 2e3);
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
function mountSettingsSection(ctx, createElement) {
  if (!createElement) {
    warnSection("\u88C5\u8F7D\u5668\u7ED9\u4E0D\u51FA react\uFF1A\u8BBE\u7F6E\u91CC\u7684\u90A3\u4E00\u9875\u4E0D\u4F1A\u51FA\u73B0");
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
        cleanup = buildSettingsSection(element, {
          fetchImpl: (input, init) => globalThis.fetch(resolveHostUrl(String(input)), init),
          warn: (message) => warnSection(message)
        });
      } else if (cleanup) {
        cleanup();
        cleanup = void 0;
      }
    };
    const component = () => createElement("div", { ref: attach });
    mounted = true;
    try {
      slots.inject(SETTINGS_SLOT, () => {
        try {
          slots.register(
            {
              name: SETTINGS_SLOT,
              id: SETTINGS_ID,
              order: SETTINGS_ORDER,
              label: () => SETTINGS_LABEL
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
    warnSection("apply \u65F6\u6CA1\u63A2\u5230 slots\uFF08\u5DF2\u6302\u6CE8\u5165\u56DE\u8C03\u7B49\u5B83\u665A\u5230\uFF09\uFF1B\u8BBE\u7F6E\u91CC\u4E00\u76F4\u6CA1\u6709\u8FD9\u4E00\u9875\u5C31\u662F\u8FD9\u4EE3\u5BBF\u4E3B\u6CA1\u8FD9\u4E2A\u670D\u52A1");
  }
  return mounted;
}

// src/client/main.ts
var name = "dsh-remote-dafeiyu";
var inject = ["slots"];
function apply(ctx) {
  const createElement = findCreateElement();
  let pillMounted = false;
  try {
    pillMounted = mountPill(ctx, createElement);
  } catch (error) {
    swallow("pill \u6302\u8F7D\u629B\u9519\uFF08\u5DF2\u541E\u6389\uFF09", error);
  }
  let settingsMounted = false;
  try {
    settingsMounted = mountSettingsSection(ctx, createElement);
  } catch (error) {
    swallow("\u8BBE\u7F6E\u5206\u533A\u6302\u8F7D\u629B\u9519\uFF08\u5DF2\u541E\u6389\uFF09", error);
  }
  reportClient({
    createElement: createElement !== void 0,
    pillMounted,
    settingsMounted,
    hasSlotsCtx: (() => {
      try {
        return ctx.slots !== void 0;
      } catch {
        return false;
      }
    })(),
    transport: globalThis.__DSH_TRANSPORT__ !== void 0
  });
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
function swallow(what, error) {
  try {
    console.error(`[dsh-remote-control] ${what}\uFF1A`, error);
  } catch {
  }
}

    return module.exports;
  },
});

