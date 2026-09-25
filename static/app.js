const LS = {
  sessions: "nebula.sessions",
  current: "nebula.current",
  theme: "nebula.theme",
  model: "nebula.model",
  reasoning: "nebula.reasoning",
  sidebar: "nebula.sidebar",
};

const COPIED_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

const el = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function timeAgo(ts) {
  const secs = Math.max(0, (Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  const mins = secs / 60;
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function inlineMd(escaped) {
  const codes = [];
  let out = escaped.replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000C${codes.length - 1}\u0000`;
  });

  out = out.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  out = out.replace(/\u0000C(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);

  return out;
}

function codeBlockHtml(block) {
  const lang = block.lang || "text";
  return (
    `<div class="code">` +
    `<div class="code__head"><span class="code__lang">${escapeHtml(lang)}</span>` +
    `<button type="button" class="code__copy">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>` +
    `<span>Copy</span></button></div>` +
    `<pre><code>${escapeHtml(block.code)}</code></pre></div>`
  );
}

function isListStart(line) {
  return /^\s*([-*+]|\d{1,3}[.)])\s+/.test(line);
}

function isBlockStart(line) {
  return (
    /^\s*#{1,6}\s/.test(line) ||
    /^\s*>\s?/.test(line) ||
    isListStart(line) ||
    /^\s*```/.test(line) ||
    /^\s*([-*_])\s*\1[\s\-*_]*$/.test(line) ||
    line.includes("|")
  );
}

function renderMarkdown(src) {
  const blocks = [];
  let body = String(src).replace(/```([\w+#.-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push({ lang, code: code.replace(/\n+$/, "") });
    return `\n\u0000B${blocks.length - 1}\u0000\n`;
  });

  const lines = body.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const blockRef = /^\s*\u0000B(\d+)\u0000\s*$/.exec(line);
    if (blockRef) {
      out.push(codeBlockHtml(blocks[Number(blockRef[1])]));
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      out.push(`<h${level}>${inlineMd(escapeHtml(heading[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1[\s\-*_]*$/.test(line)) {
      out.push("<hr>");
      i += 1;
      continue;
    }

    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /-/.test(lines[i + 1]) &&
      lines[i + 1].includes("|") &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])
    ) {
      const splitRow = (row) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const headers = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) =>
        /^:.*:$/.test(c) ? "center" : c.endsWith(":") ? "right" : "left",
      );
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const th = headers
        .map((h, c) => `<th style="text-align:${aligns[c] || "left"}">${inlineMd(escapeHtml(h))}</th>`)
        .join("");
      const tb = rows
        .map(
          (r) =>
            "<tr>" +
            r
              .map((cell, c) => `<td style="text-align:${aligns[c] || "left"}">${inlineMd(escapeHtml(cell))}</td>`)
              .join("") +
            "</tr>",
        )
        .join("");
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${inlineMd(escapeHtml(quoted.join("\n"))).replace(/\n/g, "<br>")}</blockquote>`);
      continue;
    }

    if (isListStart(line)) {
      const ordered = /^\s*\d{1,3}[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length) {
        const cur = lines[i];
        const m = /^\s*(?:[-*+]|\d{1,3}[.)])\s+(.*)$/.exec(cur);
        if (m) {
          items.push(m[1]);
          i += 1;
        } else if (cur.trim() && /^\s{2,}\S/.test(cur) && items.length) {
          items[items.length - 1] += `\n${cur.trim()}`;
          i += 1;
        } else {
          break;
        }
      }
      const tag = ordered ? "ol" : "ul";
      const lis = items.map((t) => `<li>${inlineMd(escapeHtml(t)).replace(/\n/g, "<br>")}</li>`).join("");
      out.push(`<${tag}>${lis}</${tag}>`);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) {
      out.push(`<p>${inlineMd(escapeHtml(para.join("\n"))).replace(/\n/g, "<br>")}</p>`);
    } else {
      i += 1;
    }
  }

  return out.join("");
}

class Nebula {
  constructor() {
    this.dom = {
      app: el("app"),
      sidebar: el("sidebar"),
      sidebarOpen: el("sidebar-open"),
      sidebarCollapse: el("sidebar-collapse"),
      scrim: el("scrim"),
      sessions: el("sessions"),
      newChat: el("new-chat"),
      status: el("status"),
      statusText: el("status").querySelector(".status__text"),
      modelTrigger: el("model-trigger"),
      modelMenu: el("model-menu"),
      modelName: el("model-name"),
      modelSub: el("model-sub"),
      refresh: el("refresh-models"),
      thinking: el("thinking-toggle"),
      theme: el("theme-toggle"),
      viewport: el("viewport"),
      thread: el("thread"),
      welcome: el("welcome"),
      welcomeGrid: el("welcome-grid"),
      scrollCue: el("scroll-cue"),
      composer: el("composer"),
      input: el("input"),
      send: el("send-btn"),
      stop: el("stop-btn"),
      toasts: el("toasts"),
      sessionTpl: el("tpl-session"),
    };

    this.models = [];
    this.model = readStore(LS.model, "") || "";
    this.reasoning = readStore(LS.reasoning, false) === true;
    this.sessions = readStore(LS.sessions, []) || [];
    this.sessionId = readStore(LS.current, "") || "";
    this.stick = true;
    this.busy = false;
    this.controller = null;
    this.activeOption = -1;

    this.session = this.findSession(this.sessionId) || this.createSession();
    this.sessionId = this.session.id;

    this.restoreTheme();
    this.bind();
    this.dom.thinking.checked = this.reasoning;
    this.renderSessions();
    this.renderThread();
    this.syncComposer();
    this.loadModels();
    this.setStatus("connecting", "Connecting to Ollama…");

    if (window.matchMedia("(max-width: 60rem)").matches) {
      this.dom.app.classList.remove("is-collapsed");
    } else if (readStore(LS.sidebar, true) === false) {
      this.dom.app.classList.add("is-collapsed");
    }
  }

  /* ---------- persistence ---------- */

  findSession(id) {
    return this.sessions.find((s) => s.id === id) || null;
  }

  createSession() {
    const session = {
      id: uid(),
      title: "New conversation",
      model: this.model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    this.sessions.unshift(session);
    this.persist();
    return session;
  }

  persist() {
    writeStore(LS.sessions, this.sessions);
    writeStore(LS.current, this.sessionId);
  }

  touch() {
    this.session.updatedAt = Date.now();
    this.sessions = [this.session, ...this.sessions.filter((s) => s.id !== this.session.id)];
    this.persist();
    this.renderSessions();
  }

  /* ---------- theme ---------- */

  restoreTheme() {
    const saved = readStore(LS.theme, null);
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.dataset.theme = saved || (prefersLight ? "light" : "dark");
  }

  toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    writeStore(LS.theme, next);
  }

  /* ---------- status / toasts ---------- */

  setStatus(state, text) {
    this.dom.status.dataset.state = state;
    this.dom.statusText.textContent = text;
  }

  toast(message, variant = "info") {
    const node = document.createElement("div");
    node.className = `toast toast--${variant}`;
    node.innerHTML = `<span class="toast__dot"></span><span></span>`;
    node.lastElementChild.textContent = message;
    this.dom.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add("is-leaving");
      node.addEventListener("animationend", () => node.remove(), { once: true });
    }, 4200);
  }

  /* ---------- models ---------- */

  async loadModels() {
    this.dom.refresh.classList.add("is-spinning");
    this.dom.refresh.disabled = true;
    try {
      const res = await fetch("/api/models");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.models = await res.json();
      this.setStatus("ok", `${this.models.length} model${this.models.length === 1 ? "" : "s"} available`);

      if (!this.models.length) {
        this.model = "";
        this.renderModelMenu();
        this.setModelLabel();
        this.dom.modelMenu.hidden = true;
        this.toast("No models found. Install one with: ollama pull <model>", "error");
        return;
      }

      const stillThere = this.models.some((m) => m.name === this.model);
      if (!stillThere) this.model = this.models[0].name;
      this.session.model = this.model;
      this.persist();
      this.renderModelMenu();
      this.setModelLabel();
      this.syncComposer();
    } catch (err) {
      this.models = [];
      this.model = "";
      this.setStatus("error", "Ollama unreachable");
      this.setModelLabel();
      this.renderModelMenu();
      this.toast(`Cannot reach Ollama (${err.message}). Is it running?`, "error");
    } finally {
      this.dom.refresh.classList.remove("is-spinning");
      this.dom.refresh.disabled = false;
    }
  }

  setModelLabel() {
    const found = this.models.find((m) => m.name === this.model);
    if (!found) {
      this.dom.modelName.textContent = "No model";
      this.dom.modelSub.textContent = "install with ollama pull";
      return;
    }
    this.dom.modelName.textContent = found.name;
    this.dom.modelSub.textContent = [found.parameter_size, found.quantization, found.size]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" · ");
  }

  renderModelMenu() {
    const menu = this.dom.modelMenu;
    menu.innerHTML = "";

    if (!this.models.length) {
      const empty = document.createElement("div");
      empty.className = "sidebar__empty";
      empty.textContent = "No models installed yet.";
      menu.appendChild(empty);
      return;
    }

    this.models.forEach((m, idx) => {
      const selected = m.name === this.model;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "model-option";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", String(selected));
      btn.dataset.index = String(idx);
      btn.innerHTML =
        `<span class="model-option__body"><span class="model-option__name"></span>` +
        `<span class="model-option__meta"></span></span>` +
        `<svg class="model-option__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
      btn.querySelector(".model-option__name").textContent = m.name;
      btn.querySelector(".model-option__meta").textContent = [m.parameter_size, m.quantization, m.size]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(" · ");
      btn.addEventListener("click", () => {
        this.pickModel(m.name);
        this.closeModelMenu();
      });
      menu.appendChild(btn);
    });
  }

  pickModel(name) {
    this.model = name;
    this.session.model = name;
    writeStore(LS.model, name);
    this.persist();
    this.setModelLabel();
    this.renderModelMenu();
    this.syncComposer();
  }

  openModelMenu() {
    this.renderModelMenu();
    this.dom.modelMenu.hidden = false;
    this.dom.modelTrigger.setAttribute("aria-expanded", "true");
    const idx = this.models.findIndex((m) => m.name === this.model);
    this.activeOption = idx;
    this.highlightOption();
  }

  closeModelMenu() {
    this.dom.modelMenu.hidden = true;
    this.dom.modelTrigger.setAttribute("aria-expanded", "false");
    this.activeOption = -1;
  }

  highlightOption() {
    const options = this.dom.modelMenu.querySelectorAll(".model-option");
    options.forEach((o, i) => o.classList.toggle("is-active", i === this.activeOption));
    if (options[this.activeOption]) {
      options[this.activeOption].scrollIntoView({ block: "nearest" });
      this.dom.modelTrigger.setAttribute("aria-activedescendant", options[this.activeOption].id || "");
    }
  }

  /* ---------- thread rendering ---------- */

  renderThread() {
    const thread = this.dom.thread;
    thread.innerHTML = "";
    this.dom.welcome.hidden = this.session.messages.length > 0;

    this.session.messages.forEach((msg, idx) => {
      thread.appendChild(this.buildMessage(msg, idx));
    });
    this.stick = true;
    this.scrollToEnd();
  }

  buildMessage(msg, idx) {
    const wrap = document.createElement("article");
    wrap.className = `msg msg--${msg.role}`;
    wrap.dataset.index = String(idx);

    const isUser = msg.role === "user";
    const head = document.createElement("div");
    head.className = "msg__head";
    head.innerHTML =
      `<span class="msg__avatar" aria-hidden="true">${isUser ? "YOU" : "AI"}</span>` +
      `<span class="msg__who">${isUser ? "You" : escapeHtml(this.model || "Assistant")}</span>`;
    if (!isUser && msg.model) {
      const tag = document.createElement("span");
      tag.className = "msg__model";
      tag.textContent = msg.model;
      head.appendChild(tag);
    }

    const body = document.createElement("div");
    body.className = "msg__body";

    if (msg.error) {
      body.innerHTML =
        `<div class="msg__error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><span></span></div>`;
      body.querySelector("span").textContent = msg.error;
    } else if (isUser) {
      body.textContent = msg.content;
    } else {
      const md = document.createElement("div");
      md.className = "md";
      md.innerHTML = renderMarkdown(msg.content || "");
      body.appendChild(md);
    }

    if (msg.thinking) {
      body.insertBefore(this.buildReasoning(msg.thinking), body.firstChild);
    }

    wrap.appendChild(head);
    wrap.appendChild(body);

    if (!msg.error) {
      const actions = document.createElement("div");
      actions.className = "msg__actions";

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "msg__action";
      copy.title = "Copy";
      copy.setAttribute("aria-label", "Copy message");
      copy.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
      copy.addEventListener("click", () => this.copyText(msg.content, copy));

      actions.appendChild(copy);

      if (!isUser) {
        const regen = document.createElement("button");
        regen.type = "button";
        regen.className = "msg__action";
        regen.title = "Regenerate";
        regen.setAttribute("aria-label", "Regenerate response");
        regen.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-1.6 5.6"/><path d="M20 5v6h-6"/></svg>';
        regen.addEventListener("click", () => this.regenerate(idx));
        actions.appendChild(regen);
      }

      wrap.appendChild(actions);

      if (msg.stats && msg.stats.tokens) {
        const stats = document.createElement("div");
        stats.className = "msg__stats";
        stats.innerHTML =
          `<span><b>${msg.stats.tokens}</b> tokens</span>` +
          `<span><b>${msg.stats.tokens_per_second}</b> tok/s</span>` +
          `<span><b>${(msg.stats.total_ms / 1000).toFixed(1)}</b>s</span>` +
          (msg.stats.load_ms > 250 ? `<span>load <b>${(msg.stats.load_ms / 1000).toFixed(1)}</b>s</span>` : "");
        wrap.appendChild(stats);
      }
    }

    return wrap;
  }

  buildReasoning(text, streaming = false) {
    const box = document.createElement("div");
    box.className = `reason is-open${streaming ? " is-streaming" : ""}`;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "reason__toggle";
    toggle.setAttribute("aria-expanded", "true");
    toggle.innerHTML =
      '<svg class="reason__spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>' +
      "<span>Reasoning</span>" +
      '<svg class="reason__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';

    const panel = document.createElement("div");
    panel.className = "reason__panel";
    const inner = document.createElement("div");
    const pre = document.createElement("div");
    pre.className = "reason__text";
    pre.textContent = text;
    inner.appendChild(pre);
    panel.appendChild(inner);

    toggle.addEventListener("click", () => {
      const open = box.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    box.appendChild(toggle);
    box.appendChild(panel);
    return box;
  }

  /* ---------- sidebar ---------- */

  renderSessions() {
    const wrap = this.dom.sessions;
    wrap.innerHTML = "";

    if (!this.sessions.length) {
      const empty = document.createElement("div");
      empty.className = "sidebar__empty";
      empty.textContent = "No conversations yet.";
      wrap.appendChild(empty);
      return;
    }

    this.sessions.forEach((session) => {
      const node = this.dom.sessionTpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = session.id;
      node.classList.toggle("is-active", session.id === this.sessionId);
      node.querySelector(".session__title").textContent = session.title;
      node.querySelector(".session__meta").textContent = `${session.messages.length} message${
        session.messages.length === 1 ? "" : "s"
      } · ${timeAgo(session.updatedAt)}`;

      node.querySelector(".session__main").addEventListener("click", () => this.openSession(session.id));
      node.querySelector(".session__delete").addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteSession(session.id);
      });

      wrap.appendChild(node);
    });
  }

  openSession(id) {
    if (this.busy) return this.toast("Wait for the current response to finish.", "error");
    const session = this.findSession(id);
    if (!session) return;
    this.session = session;
    this.sessionId = id;
    writeStore(LS.current, id);
    this.renderSessions();
    this.renderThread();
    this.closeDrawer();
  }

  newChat() {
    if (this.busy) return this.toast("Wait for the current response to finish.", "error");
    this.session = this.createSession();
    this.sessionId = this.session.id;
    this.renderSessions();
    this.renderThread();
    this.dom.input.focus();
    this.closeDrawer();
  }

  deleteSession(id) {
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    this.sessions.splice(idx, 1);
    if (id === this.sessionId) {
      this.session = this.sessions[0] || this.createSession();
      this.sessionId = this.session.id;
      this.renderThread();
    }
    this.persist();
    this.renderSessions();
  }

  openDrawer() {
    this.dom.app.classList.add("is-drawer-open");
    this.dom.scrim.hidden = false;
  }

  closeDrawer() {
    this.dom.app.classList.remove("is-drawer-open");
    this.dom.scrim.hidden = true;
  }

  /* ---------- composer ---------- */

  syncComposer() {
    const hasText = this.dom.input.value.trim().length > 0;
    this.dom.send.disabled = !(hasText && this.model && !this.busy);
    this.dom.send.hidden = this.busy;
    this.dom.stop.hidden = !this.busy;
    this.dom.input.disabled = false;
  }

  autosize() {
    const ta = this.dom.input;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 224)}px`;
  }

  /* ---------- streaming ---------- */

  async send(text) {
    if (this.busy || !this.model) return;

    const content = text.trim();
    if (!content) return;

    if (!this.session.messages.some((m) => m.role === "user")) {
      this.session.title = content.length > 48 ? `${content.slice(0, 48)}…` : content;
    }

    const userMsg = { role: "user", content, at: Date.now() };
    const aiMsg = { role: "assistant", content: "", thinking: "", model: this.model, at: Date.now() };
    this.session.messages.push(userMsg, aiMsg);

    const userNode = this.buildMessage(userMsg, this.session.messages.length - 2);
    const aiNode = this.buildMessage(aiMsg, this.session.messages.length - 1);
    aiNode.querySelector(".msg__body").innerHTML = "";
    this.dom.thread.appendChild(userNode);
    this.dom.thread.appendChild(aiNode);
    this.dom.welcome.hidden = true;
    this.touch();

    this.busy = true;
    this.dom.input.value = "";
    this.autosize();
    this.syncComposer();
    this.stick = true;
    this.scrollToEnd();

    await this.runStream(aiMsg, aiNode);
  }

  async runStream(aiMsg, aiNode) {
    const body = aiNode.querySelector(".msg__body");
    const md = document.createElement("div");
    md.className = "md";
    body.appendChild(md);

    let reasonNode = null;
    let reasonText = "";
    if (this.reasoning) {
      reasonNode = this.buildReasoning("", true);
      body.insertBefore(reasonNode, md);
    }

    const history = this.session.messages
      .filter((m) => m !== aiMsg && !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    this.controller = new AbortController();
    let raw = "";
    let painted = "";
    let lastPaint = 0;

    const paint = (force = false) => {
      const now = performance.now();
      if (!force && now - lastPaint < 40) return;
      lastPaint = now;
      md.innerHTML = renderMarkdown(raw);
      const kids = md.children;
      if (kids.length) kids[kids.length - 1].classList.add("is-streaming-caret");
      if (reasonNode) {
        reasonNode.querySelector(".reason__text").textContent = reasonText;
        reasonNode.classList.add("is-streaming");
      }
      this.scrollToEnd();
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: history,
          stream: true,
          show_thinking: this.reasoning,
        }),
        signal: this.controller.signal,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let data;
          try {
            data = JSON.parse(line);
          } catch {
            continue;
          }

          if (data.error) throw new Error(data.error);

          if (data.thinking) {
            reasonText += data.thinking;
            if (reasonNode) reasonNode.querySelector(".reason__text").textContent = reasonText;
            if (this.stick) this.scrollToEnd();
          }

          if (data.content) {
            raw += data.content;
            paint();
          }

          if (data.stats) aiMsg.stats = data.stats;

          if (data.done) {
            finished = true;
            break;
          }
        }
      }

      aiMsg.content = raw;
      aiMsg.thinking = this.reasoning ? reasonText : "";
      aiMsg.at = Date.now();
      if (!aiMsg.content && !aiMsg.thinking) {
        aiMsg.error = "The model returned an empty response.";
      }
      } catch (err) {
      if (err.name === "AbortError") {
        aiMsg.content = raw;
        aiMsg.thinking = this.reasoning ? reasonText : "";
        this.toast("Generation stopped.");
      } else {
        aiMsg.error = err.message || "Something went wrong.";
        this.toast(aiMsg.error, "error");
      }
    } finally {
      this.controller = null;
      this.busy = false;
      paint(true);
      const replacement = this.buildMessage(aiMsg, this.session.messages.indexOf(aiMsg));
      aiNode.replaceWith(replacement);
      this.touch();
      this.syncComposer();
      this.dom.input.focus();
    }
  }

  stop() {
    if (this.controller) this.controller.abort();
  }

  async regenerate(index) {
    if (this.busy) return this.toast("Wait for the current response to finish.", "error");
    const target = this.session.messages[index];
    if (!target || target.role !== "assistant") return;

    let cursor = index;
    while (cursor > 0 && this.session.messages[cursor - 1].role === "assistant") cursor -= 1;
    const prompt = this.session.messages[cursor - 1];
    if (!prompt || prompt.role !== "user") return this.toast("Nothing to regenerate.", "error");

    this.session.messages = this.session.messages.slice(0, index);
    this.renderThread();

    const aiMsg = { role: "assistant", content: "", thinking: "", model: this.model, at: Date.now() };
    this.session.messages.push(aiMsg);
    const aiNode = this.buildMessage(aiMsg, this.session.messages.length - 1);
    aiNode.querySelector(".msg__body").innerHTML = "";
    this.dom.thread.appendChild(aiNode);
    this.dom.welcome.hidden = true;
    this.touch();

    this.busy = true;
    this.syncComposer();
    this.stick = true;
    this.scrollToEnd();
    await this.runStream(aiMsg, aiNode);
  }

  /* ---------- misc ---------- */

  async copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        btn.innerHTML = COPIED_ICON;
        btn.classList.add("is-done");
        setTimeout(() => {
          btn.classList.remove("is-done");
          btn.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
        }, 1400);
      }
    } catch {
      this.toast("Clipboard blocked by the browser.", "error");
    }
  }

  scrollToEnd() {
    if (!this.stick) return;
    requestAnimationFrame(() => {
      this.dom.viewport.scrollTop = this.dom.viewport.scrollHeight;
    });
  }

  onScroll() {
    const gap = this.dom.viewport.scrollHeight - this.dom.viewport.scrollTop - this.dom.viewport.clientHeight;
    this.stick = gap < 120;
    this.dom.scrollCue.hidden = this.stick;
  }

  /* ---------- events ---------- */

  bind() {
    this.dom.composer.addEventListener("submit", (e) => {
      e.preventDefault();
      this.send(this.dom.input.value);
    });

    this.dom.input.addEventListener("input", () => {
      this.autosize();
      this.syncComposer();
    });

    this.dom.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.send(this.dom.input.value);
      }
    });

    this.dom.stop.addEventListener("click", () => this.stop());
    this.dom.newChat.addEventListener("click", () => this.newChat());
    this.dom.refresh.addEventListener("click", () => this.loadModels());
    this.dom.theme.addEventListener("click", () => this.toggleTheme());

    this.dom.thinking.addEventListener("change", () => {
      this.reasoning = this.dom.thinking.checked;
      writeStore(LS.reasoning, this.reasoning);
      this.toast(this.reasoning ? "Reasoning visible" : "Reasoning hidden");
    });

    this.dom.modelTrigger.addEventListener("click", () => {
      if (this.dom.modelMenu.hidden) this.openModelMenu();
      else this.closeModelMenu();
    });

    this.dom.modelTrigger.addEventListener("keydown", (e) => this.onModelKey(e));

    this.dom.modelMenu.addEventListener("keydown", (e) => this.onModelKey(e));

    this.dom.thread.addEventListener("click", (e) => {
      const btn = e.target.closest(".code__copy");
      if (!btn) return;
      const block = btn.closest(".code");
      const code = block ? block.querySelector("code").textContent : "";
      if (!code) return;
      this.copyText(code, btn);
      const label = btn.querySelector("span");
      if (label) {
        label.textContent = "Copied";
        btn.classList.add("is-done");
        setTimeout(() => {
          label.textContent = "Copy";
          btn.classList.remove("is-done");
        }, 1400);
      }
    });

    this.dom.viewport.addEventListener("scroll", () => this.onScroll());
    this.dom.scrollCue.addEventListener("click", () => {
      this.stick = true;
      this.scrollToEnd();
    });

    this.dom.welcomeGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".prompt-card");
      if (!card) return;
      this.dom.input.value = card.dataset.prompt;
      this.autosize();
      this.send(card.dataset.prompt);
    });

    this.dom.sidebarOpen.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 60rem)").matches) {
        this.openDrawer();
      } else {
        this.dom.app.classList.remove("is-collapsed");
        writeStore(LS.sidebar, true);
      }
    });
    this.dom.scrim.addEventListener("click", () => this.closeDrawer());
    this.dom.sidebarCollapse.addEventListener("click", () => {
      this.dom.app.classList.add("is-collapsed");
      writeStore(LS.sidebar, false);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#model-picker")) this.closeModelMenu();
    });

    document.addEventListener("keydown", (e) => this.onGlobalKey(e));
  }

  onModelKey(e) {
    const options = this.dom.modelMenu.querySelectorAll(".model-option");
    if (e.key === "Escape") {
      this.closeModelMenu();
      this.dom.modelTrigger.focus();
      return;
    }
    if (!options.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      this.activeOption = (this.activeOption + dir + options.length) % options.length;
      this.highlightOption();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const target = options[this.activeOption] || options[0];
      if (target) {
        this.pickModel(target.querySelector(".model-option__name").textContent);
        this.closeModelMenu();
      }
    }
  }

  onGlobalKey(e) {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      this.newChat();
      return;
    }
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      this.dom.app.classList.toggle("is-collapsed");
      writeStore(LS.sidebar, !this.dom.app.classList.contains("is-collapsed"));
      return;
    }
    if (mod && e.key.toLowerCase() === "j") {
      e.preventDefault();
      this.toggleTheme();
      return;
    }
    if (e.key === "Escape") {
      if (!this.dom.modelMenu.hidden) this.closeModelMenu();
      else if (this.busy) this.stop();
      else this.closeDrawer();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => new Nebula());
