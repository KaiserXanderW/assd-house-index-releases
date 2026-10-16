// ==UserScript==
// @name         assd-house-index
// @namespace    https://github.com/KaiserXanderW/assd-house-index-releases
// @version      0.1.2
// @description  Search the house list and open a house's page in the booking system. The list is imported from a file and stays in this browser.
// @match        https://*.assd.com/*
// @match        https://botfriendsx.com/project/*/handover/tool/handover
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_openInTab
// @updateURL    https://raw.githubusercontent.com/KaiserXanderW/assd-house-index-releases/main/userscript/assd-house-index.user.js
// @downloadURL  https://raw.githubusercontent.com/KaiserXanderW/assd-house-index-releases/main/userscript/assd-house-index.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/houses.ts
  var HOUSES_KIND = "assd-houses";
  var isObj = (v) => !!v && typeof v == "object" && !Array.isArray(v), str = (v) => typeof v == "number" && Number.isFinite(v) ? String(v) : typeof v == "string" && v.trim() ? v.trim() : void 0, strList = (v) => {
    if (!Array.isArray(v)) return;
    let out = v.map(str).filter((s) => !!s);
    return out.length ? out : void 0;
  }, FIELD_NAMES = {
    code: ["code", "houseId", "house_id", "id"],
    houseNumber: ["houseNumber", "house_number", "number"],
    name: ["name"],
    city: ["city"],
    country: ["country"],
    address: ["address"],
    link: ["link", "url"],
    aliases: ["aliases"]
  }, KNOWN = new Set(Object.values(FIELD_NAMES).flat());
  function pick(h, names) {
    for (let n of names) if (h[n] !== void 0 && h[n] !== null) return h[n];
  }
  function safeLink(v) {
    let s = str(v);
    if (s)
      try {
        let u = new URL(s);
        return u.protocol === "https:" || u.protocol === "http:" ? u.href : void 0;
      } catch {
        return;
      }
  }
  function houseNumberOf(v) {
    return v == null || v === "" ? { value: null, odd: !1 } : typeof v == "number" && Number.isInteger(v) && v >= 0 ? { value: v, odd: !1 } : typeof v == "string" && /^\s*#?\s*\d+\s*$/.test(v) ? { value: Number(v.replace(/[^\d]/g, "")), odd: !1 } : { value: null, odd: !0 };
  }
  function looksLegacy(v) {
    let vals = Object.values(v);
    return vals.length > 0 && vals.every((x) => isObj(x) && ("houseId" in x || "houseNumber" in x));
  }
  function parseHouses(raw) {
    let v = raw;
    if (typeof raw == "string")
      try {
        v = JSON.parse(raw);
      } catch (e) {
        return { ok: !1, error: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
      }
    let warnings = [], list, generatedAt, source;
    if (Array.isArray(v))
      return { ok: !1, error: `expected a JSON object with "kind": "${HOUSES_KIND}", got a list` };
    if (!isObj(v)) return { ok: !1, error: "expected a JSON object" };
    if (v.kind === void 0 && looksLegacy(v))
      list = Object.values(v), warnings.push('old userscript format (no "kind"); converted');
    else {
      if (v.kind !== HOUSES_KIND) return { ok: !1, error: `"kind" must be "${HOUSES_KIND}"` };
      if (v.schemaVersion !== 1)
        return { ok: !1, error: '"schemaVersion" must be 1' };
      if (!Array.isArray(v.houses)) return { ok: !1, error: '"houses" must be a list' };
      list = v.houses, generatedAt = str(v.generatedAt), source = str(v.source);
    }
    let houses = [], seen = /* @__PURE__ */ new Set(), unknownKeys = /* @__PURE__ */ new Set(), oddNumbers = [], badLinks = [];
    if (list.forEach((h, i) => {
      if (!isObj(h)) {
        warnings.push(`house #${i + 1} skipped: not an object`);
        return;
      }
      let code = str(pick(h, FIELD_NAMES.code)), name = str(pick(h, FIELD_NAMES.name));
      if (!code && !name) {
        warnings.push(`house #${i + 1} skipped: needs "code" or "name"`);
        return;
      }
      let label = code ?? name ?? "", dupKey = code ? normCode(code) : `name:${norm(name ?? "")}`;
      if (seen.has(dupKey)) {
        warnings.push(`"${label}" listed twice; kept the first`);
        return;
      }
      seen.add(dupKey);
      for (let k of Object.keys(h)) KNOWN.has(k) || unknownKeys.add(k);
      let num2 = houseNumberOf(pick(h, FIELD_NAMES.houseNumber));
      num2.odd && oddNumbers.push(label);
      let rawLink = pick(h, FIELD_NAMES.link), link = safeLink(rawLink);
      rawLink !== void 0 && !link && badLinks.push(label);
      let house = { code: code ?? "", houseNumber: num2.value, name: name ?? code ?? "" }, city = str(h.city), country = str(h.country), address = str(h.address), aliases = strList(h.aliases);
      city && (house.city = city), country && (house.country = country), address && (house.address = address), link && (house.link = link), aliases && (house.aliases = aliases), houses.push(house);
    }), !houses.length) return { ok: !1, error: "no usable houses" };
    let few = (xs) => xs.slice(0, 5).join(", ") + (xs.length > 5 ? ", \u2026" : "");
    unknownKeys.size && warnings.push(`unknown fields ignored: ${[...unknownKeys].join(", ")}`), oddNumbers.length && warnings.push(`${oddNumbers.length} house number(s) weren't a whole number and were left empty: ${few(oddNumbers)}`), badLinks.length && warnings.push(`${badLinks.length} link(s) weren't a web address and were dropped: ${few(badLinks)}`);
    let noLink = houses.filter((h) => !h.link).map((h) => h.code || h.name);
    return noLink.length && warnings.push(`${noLink.length} house(s) have no link and can't be opened: ${few(noLink)}`), {
      ok: !0,
      warnings,
      data: { kind: HOUSES_KIND, schemaVersion: 1, generatedAt, source, houses }
    };
  }
  var DASHES = /[-\u2010-\u2015\u2212]/g;
  function norm(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u00df/g, "ss").toLowerCase();
  }
  function normCode(s) {
    return norm(s).replace(DASHES, "").replace(/\s+/g, "");
  }
  function textHaystack(h) {
    return norm([h.name, h.city, h.address, ...h.aliases ?? []].filter(Boolean).join(" | "));
  }
  function termMatches(h, hay, term) {
    let t = norm(term), c = normCode(term);
    return c ? hay.includes(t) || h.country && norm(h.country) === t || h.code && normCode(h.code).includes(c) ? !0 : h.houseNumber !== null && String(h.houseNumber).startsWith(t) : !1;
  }
  function rank(h, query) {
    let q = norm(query.trim()), qc = normCode(query);
    return h.code && normCode(h.code) === qc || h.houseNumber !== null && String(h.houseNumber) === q ? 0 : norm(h.name) === q || (h.aliases ?? []).some((a) => norm(a) === q) ? 1 : norm(h.name).startsWith(q) ? 2 : 3;
  }
  function searchHouses(houses, query, limit = 5) {
    let terms = query.split(/[\s,]+/).filter((t) => normCode(t));
    return terms.length ? houses.map((h, i) => ({ h, i, hay: textHaystack(h) })).filter((x) => terms.every((t) => termMatches(x.h, x.hay, t))).map((x) => ({ ...x, r: rank(x.h, query) })).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, limit).map((x) => x.h) : [];
  }
  var SORT_KEYS = ["name", "number", "id", "address"], byText = (a, b) => a.localeCompare(b, void 0, { sensitivity: "base", numeric: !0 });
  function sortHouses(houses, by) {
    let out = [...houses];
    switch (by) {
      case "name":
        return out.sort((a, b) => byText(a.name, b.name));
      case "id":
        return out.sort((a, b) => byText(a.code, b.code));
      case "number":
        return out.sort((a, b) => (a.houseNumber ?? 1 / 0) - (b.houseNumber ?? 1 / 0) || byText(a.name, b.name));
      case "address":
        return out.sort((a, b) => (a.address ? 0 : 1) - (b.address ? 0 : 1) || byText(a.address ?? "", b.address ?? ""));
    }
  }
  var num = (h) => h.houseNumber === null ? "\u2014" : String(h.houseNumber), codeOf = (h) => h.code || "\u2014";
  function rowText(h, by) {
    switch (by) {
      case "number":
        return { strong: num(h), rest: ` (#) - ${codeOf(h)} - ${h.name}` };
      case "id":
        return { strong: codeOf(h), rest: ` - House#: ${num(h)} - ${h.name}` };
      case "address":
        return { strong: h.address ?? "[No Address]", rest: ` - ${codeOf(h)} - House#: ${num(h)} - ${h.name}` };
      default:
        return { strong: h.name, rest: ` - ${codeOf(h)} - House#: ${num(h)}` };
    }
  }
  function resultText(h) {
    return { line1: `${h.name} - ${codeOf(h)} - House#: ${num(h)}`, line2: h.address ?? "No address available" };
  }

  // src/store.ts
  var HOUSES_KEY = "ahi.houses";
  async function importHouses(storage, text) {
    let r = parseHouses(text);
    return r.ok ? (await storage.set({ [HOUSES_KEY]: r.data }), { ok: !0, houses: r.data.houses.length, warnings: r.warnings }) : r;
  }
  async function loadHouses(storage) {
    let d = (await storage.get(HOUSES_KEY))[HOUSES_KEY];
    return d && d.kind === HOUSES_KIND && Array.isArray(d.houses) ? d : null;
  }
  async function removeHouses(storage) {
    storage.remove ? await storage.remove(HOUSES_KEY) : await storage.set({ [HOUSES_KEY]: null });
  }
  var ctrlSEnabled = (s) => s?.ctrlS !== !1;

  // src/sites.ts
  var LAUNCHER_POS_KEY = "ahi.launcherPos";
  var DEFAULT_POS = { right: 20, bottom: 20 };
  function siteCovers(siteKey, pageKey) {
    if (siteKey === pageKey) return !0;
    let m = /^(https?:\/\/)\*\.(.+)$/.exec(siteKey);
    if (!m || !pageKey.startsWith(m[1])) return !1;
    let host = pageKey.slice(m[1].length);
    return host === m[2] || host.endsWith("." + m[2]);
  }
  function findSiteForUrl(href, sites) {
    let pageKey = siteKeyForUrl(href);
    if (!pageKey) return null;
    let exact = `${pageKey}/*`;
    return sites.includes(exact) ? exact : sites.find((p) => siteCovers(siteKeyFromPattern(p), pageKey)) ?? null;
  }
  function siteKeyFromPattern(pattern) {
    return pattern.replace(/\/\*$/, "");
  }
  function siteKeyForUrl(href) {
    try {
      let u = new URL(href);
      return u.protocol !== "https:" && u.protocol !== "http:" ? null : `${u.protocol}//${u.hostname}`;
    } catch {
      return null;
    }
  }
  async function loadPositions(storage) {
    let raw = (await storage.get(LAUNCHER_POS_KEY))[LAUNCHER_POS_KEY];
    return raw && typeof raw == "object" ? { ...raw } : {};
  }
  async function savePosition(storage, key, pos) {
    let all = await loadPositions(storage);
    all[key] = { right: Math.round(pos.right), bottom: Math.round(pos.bottom) }, await storage.set({ [LAUNCHER_POS_KEY]: all });
  }
  async function resetPosition(storage, key) {
    let all = await loadPositions(storage);
    key in all && (delete all[key], await storage.set({ [LAUNCHER_POS_KEY]: all }));
  }
  function isValidPos(p) {
    let v = p;
    return !!v && Number.isFinite(v.right) && Number.isFinite(v.bottom);
  }
  function clampPos(pos, vw, vh) {
    let maxR = Math.max(0, vw - 70), maxB = Math.max(0, vh - 70);
    return {
      right: Math.min(Math.max(0, pos.right), maxR),
      bottom: Math.min(Math.max(0, pos.bottom), maxB)
    };
  }
  var GAP = 10, MARGIN = 8, MIN_PANEL_H = 200;
  function panelRect(pos, vw, vh, want) {
    let width = Math.max(0, Math.min(want.width, vw - 2 * MARGIN)), lTop = vh - pos.bottom - 70, lBottom = vh - pos.bottom, lRight = vw - pos.right, left = Math.min(Math.max(MARGIN, lRight - width), Math.max(MARGIN, vw - MARGIN - width)), above = lTop - GAP - MARGIN, below = vh - lBottom - GAP - MARGIN;
    if (above >= want.height) return { left, top: lTop - GAP - want.height, width, height: want.height };
    if (below >= want.height) return { left, top: lBottom + GAP, width, height: want.height };
    if (above >= below) {
      let height2 = Math.max(Math.min(MIN_PANEL_H, vh - 2 * MARGIN), above);
      return { left, top: Math.max(MARGIN, lTop - GAP - height2), width, height: height2 };
    }
    let height = Math.max(Math.min(MIN_PANEL_H, vh - 2 * MARGIN), below);
    return { left, top: Math.min(lBottom + GAP, vh - MARGIN - height), width, height };
  }

  // src/messages.ts
  var PANEL_CLOSE = "ahi.panel.close", PANEL_OPENED = "ahi.panel.opened", PANEL_RESIZE = "ahi.panel.resize";

  // src/launcher.ts
  var DRAG_THRESHOLD = 4, PANEL_SIZE = { width: 520, height: 520 }, PANEL_MIN_WIDTH = 240, PANEL_MAX_WIDTH = 600, PANEL_MAX_VH = 0.8, BAR_HEIGHT = 37, PANEL_BORDER = 1, T = {
    lines: ["ASSD", "House", "Index"],
    tip: "House index (Ctrl+S) \u2014 drag to move",
    reset: "Reset position",
    close: "Close",
    frame: "House index"
  };
  function viewportEl(doc) {
    return doc.compatMode === "BackCompat" && doc.body || doc.documentElement;
  }
  function setStyle(el, props) {
    for (let [k, v] of Object.entries(props)) el.style.setProperty(k, v, "important");
  }
  function mountLauncher(deps) {
    let doc = deps.doc ?? document, win = doc.defaultView ?? window, ctrlS = ctrlSEnabled(deps.settings), pos = isValidPos(deps.position) ? { ...deps.position } : { ...DEFAULT_POS }, open = !1, frame = null, frameReady = !1, launcher = doc.createElement("ahi-launcher");
    launcher.id = "ahi-launcher", launcher.setAttribute("role", "button"), launcher.tabIndex = 0;
    for (let text of T.lines) {
      let line = doc.createElement("ahi-line");
      line.textContent = text, launcher.appendChild(line);
    }
    let panel = doc.createElement("ahi-panel");
    panel.id = "ahi-panel";
    let slot = doc.createElement("ahi-frame-slot"), bar = doc.createElement("ahi-bar"), resetBtn = doc.createElement("button");
    resetBtn.type = "button", resetBtn.className = "ahi-bar-btn";
    let closeBtn = doc.createElement("button");
    if (closeBtn.type = "button", closeBtn.className = "ahi-bar-btn ahi-bar-close", closeBtn.textContent = "\xD7", deps.buttons?.length) {
      let group = doc.createElement("ahi-bar-group");
      group.append(resetBtn);
      for (let b of deps.buttons) {
        let btn = doc.createElement("button");
        btn.type = "button", btn.className = "ahi-bar-btn", btn.textContent = b.label, btn.addEventListener("click", () => b.onClick()), group.append(btn);
      }
      bar.append(group, closeBtn);
    } else
      bar.append(resetBtn, closeBtn);
    panel.append(slot, bar);
    let renderText = () => {
      launcher.title = ctrlS ? T.tip : T.tip.replace(" (Ctrl+S)", ""), launcher.setAttribute("aria-label", T.frame), launcher.setAttribute("aria-expanded", String(open)), resetBtn.textContent = T.reset, closeBtn.title = T.close, closeBtn.setAttribute("aria-label", T.close), frame && (frame.title = T.frame);
    }, content = null, frame2 = (outer, inner) => outer > inner ? outer - inner : PANEL_BORDER * 2, wanted = () => {
      if (!content) return PANEL_SIZE;
      let barH = bar.getBoundingClientRect().height || BAR_HEIGHT, bx = frame2(panel.offsetWidth, panel.clientWidth), by = frame2(panel.offsetHeight, panel.clientHeight);
      return {
        width: Math.min(Math.max(content.width + bx, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH),
        height: Math.min(content.height + barH + by, Math.floor(vh() * PANEL_MAX_VH))
      };
    }, vw = () => viewportEl(doc).clientWidth || win.innerWidth, vh = () => viewportEl(doc).clientHeight || win.innerHeight, place = () => {
      let drawn = clampPos(pos, vw(), vh());
      if (setStyle(launcher, { right: `${drawn.right}px`, bottom: `${drawn.bottom}px` }), !open) return;
      let r = panelRect(drawn, vw(), vh(), wanted());
      setStyle(panel, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`
      });
    }, post = (type) => {
      frame?.contentWindow && frameReady && deps.extOrigin && frame.contentWindow.postMessage({ type }, deps.extOrigin);
    }, embedded = !1, doOpen = () => {
      if (!open) {
        if (open = !0, deps.embed) {
          embedded || (embedded = !0, deps.embed.mount(slot)), panel.dataset.open = "true", renderText(), place(), deps.embed.opened();
          return;
        }
        !frame && deps.frameUrl && (frame = doc.createElement("iframe"), frame.className = "ahi-frame", frame.src = deps.frameUrl, frame.addEventListener("load", () => {
          frameReady = !0, open && (frame?.focus(), post(PANEL_OPENED));
        }), slot.appendChild(frame)), panel.dataset.open = "true", renderText(), place(), frame?.focus(), post(PANEL_OPENED);
      }
    }, doClose = (refocus = !1) => {
      open && (open = !1, panel.dataset.open = "false", renderText(), refocus && launcher.focus({ preventScroll: !0 }));
    }, toggle = () => open ? doClose() : doOpen(), press = null, dragged = !1, suppressClick = !1;
    launcher.addEventListener("pointerdown", (e) => {
      e.button === 0 && (press = { x: e.clientX, y: e.clientY, start: clampPos(pos, vw(), vh()), id: e.pointerId }, dragged = !1, launcher.setPointerCapture?.(e.pointerId), e.preventDefault());
    }), launcher.addEventListener("pointermove", (e) => {
      if (!press) return;
      let dx = e.clientX - press.x, dy = e.clientY - press.y;
      !dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD || (dragged = !0, launcher.dataset.dragging = "true", pos = clampPos({ right: press.start.right - dx, bottom: press.start.bottom - dy }, vw(), vh()), place());
    });
    let endPress = (e) => {
      press && (launcher.releasePointerCapture?.(press.id), press = null, delete launcher.dataset.dragging, dragged && e.type === "pointerup" && (suppressClick = !0, win.setTimeout(() => {
        suppressClick = !1;
      }, 0), savePosition(deps.storage, deps.siteKey, pos).catch(() => {
      })));
    };
    launcher.addEventListener("pointerup", endPress), launcher.addEventListener("pointercancel", endPress), launcher.addEventListener("click", (e) => {
      if (e.preventDefault(), suppressClick || dragged) {
        suppressClick = !1, dragged = !1;
        return;
      }
      toggle();
    }), launcher.addEventListener("keydown", (e) => {
      (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle());
    }), resetBtn.addEventListener("click", () => {
      handle.resetPosition();
    }), closeBtn.addEventListener("click", () => doClose(!0));
    let onKey = (e) => {
      open && e.key === "Escape" && doClose(!0), ctrlS && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === "s" && (e.preventDefault(), toggle());
    }, setContentSize = (size) => {
      let { width, height } = size;
      typeof width != "number" || typeof height != "number" || !(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height) || (content = { width, height }, place());
    }, onMessage = (e) => {
      if (!deps.extOrigin || e.origin !== deps.extOrigin || !frame || e.source !== frame.contentWindow) return;
      let type = e.data?.type;
      type === PANEL_CLOSE && doClose(!0), type === PANEL_RESIZE && setContentSize(e.data);
    }, onResize = () => place();
    doc.addEventListener("keydown", onKey, !0), win.addEventListener("message", onMessage), win.addEventListener("resize", onResize), panel.dataset.open = "false", renderText(), place(), doc.documentElement.append(panel, launcher);
    let handle = {
      launcher,
      panel,
      isOpen: () => open,
      open: doOpen,
      close: (refocus = !1) => doClose(refocus),
      toggle,
      setContentSize,
      async resetPosition() {
        pos = { ...DEFAULT_POS }, place(), await resetPosition(deps.storage, deps.siteKey);
      },
      applySettings(s) {
        ctrlS = ctrlSEnabled(s), renderText();
      },
      applyPositions(all) {
        if (press) return;
        let p = all[deps.siteKey];
        pos = isValidPos(p) ? { ...p } : { ...DEFAULT_POS }, place();
      },
      destroy() {
        doc.removeEventListener("keydown", onKey, !0), win.removeEventListener("message", onMessage), win.removeEventListener("resize", onResize), launcher.remove(), panel.remove();
      }
    };
    return handle;
  }

  // src/panel.ts
  var SORT_LABELS = {
    name: ["Sort by", "Name"],
    number: ["Sort by", "#"],
    id: ["Sort by", "ID"],
    address: ["Sort by", "Address"]
  }, MIN_WIDTH = 360, MIN_WIDTH_SEARCH = 240, MAX_WIDTH = 600;
  function measureNatural(root, minWidth = MIN_WIDTH) {
    let saved = root.getAttribute("style");
    root.style.cssText += `;width:max-content;min-width:${minWidth}px;max-width:${MAX_WIDTH}px;height:auto;max-height:none`;
    let box = root.getBoundingClientRect(), size = { width: Math.ceil(box.width), height: Math.ceil(box.height) };
    return saved === null ? root.removeAttribute("style") : root.setAttribute("style", saved), size;
  }
  function mountPanel(root, deps) {
    let doc = deps.doc ?? root.ownerDocument;
    root.textContent = "", root.classList.add("ahi-panel");
    let listWrap = doc.createElement("div");
    listWrap.className = "ahi-list-wrap";
    let list = doc.createElement("ul");
    list.className = "ahi-list", list.setAttribute("role", "listbox"), listWrap.appendChild(list);
    let sortArea = doc.createElement("div");
    sortArea.className = "ahi-sort";
    let sortButtons = /* @__PURE__ */ new Map();
    for (let key of SORT_KEYS) {
      let b = doc.createElement("button");
      b.type = "button", b.className = "ahi-sort-btn", b.dataset.sort = key;
      let [l1, l2] = SORT_LABELS[key];
      b.append(l1, doc.createElement("br"), l2), sortArea.appendChild(b), sortButtons.set(key, b);
    }
    let search = doc.createElement("input");
    search.type = "text", search.className = "ahi-search", search.placeholder = "Search (name, ID, #, address)...", search.setAttribute("aria-label", "Search houses"), search.autocomplete = "off", search.spellcheck = !1, root.append(listWrap, sortArea, search);
    let sortBy = "name", item = (cls = "") => {
      let li = doc.createElement("li");
      return cls && (li.className = cls), li;
    }, linkRow = (li, h, title) => {
      li.setAttribute("role", "option"), li.title = title, h.link ? li.dataset.link = h.link : (li.classList.add("ahi-nolink"), li.title = "No link for this house in the imported file");
    }, showMessage = (text, cls, onClick) => {
      let li = item(cls);
      li.textContent = text, onClick && li.addEventListener("click", onClick), list.replaceChildren(li);
    }, showNoData = () => deps.data()?.houses.length ? !1 : (showMessage(deps.noDataText ?? "No house list loaded. Click here to import one on the options page.", "ahi-empty", deps.openOptions), !0), widest = 0, report = () => {
      if (!deps.onSize) return;
      let searching = sortArea.hidden, s = (deps.measure ?? measureNatural)(root, searching ? MIN_WIDTH_SEARCH : MIN_WIDTH);
      widest = searching ? Math.max(widest, s.width) : 0, deps.onSize({ width: searching ? widest : s.width, height: s.height });
    }, drawFullList = (by) => {
      sortBy = by, sortArea.hidden = !1;
      for (let [k, b] of sortButtons) b.classList.toggle("active", k === by);
      if (showNoData()) return;
      let rows = sortHouses(deps.data().houses, by).map((h) => {
        let li = item(), t = rowText(h, by), strong = doc.createElement("strong");
        return strong.textContent = t.strong, li.append(strong, t.rest), linkRow(li, h, t.strong + t.rest), li;
      });
      list.replaceChildren(...rows), listWrap.scrollTop = 0;
    }, drawResults = (q) => {
      if (sortArea.hidden = !0, showNoData()) return;
      let matches = searchHouses(deps.data().houses, q, 5);
      if (!matches.length) {
        showMessage("No results", "no-results");
        return;
      }
      let rows = matches.slice().reverse().map((h, i, arr) => {
        let li = item(i === arr.length - 1 ? "highlight" : ""), t = resultText(h);
        return li.append(t.line1, doc.createElement("br"), t.line2), linkRow(li, h, `${t.line1}
${t.line2}`), li;
      });
      list.replaceChildren(...rows), rows[rows.length - 1].scrollIntoView?.({ block: "nearest" });
    }, showFullList = (by) => {
      drawFullList(by), report();
    }, showResults = (q) => {
      drawResults(q), report();
    }, render = () => {
      let q = search.value.trim();
      q ? showResults(q) : showFullList(sortBy);
    }, activate = (li, background = !1) => {
      let link = safeLink(li?.dataset?.link);
      link && deps.openLink(link, background);
    };
    sortArea.addEventListener("click", (e) => {
      let b = e.target.closest("button[data-sort]");
      b && showFullList(b.dataset.sort);
    }), search.addEventListener("input", render), list.addEventListener("click", (e) => activate(e.target.closest("li[data-link]"), e.ctrlKey || e.metaKey)), list.addEventListener("auxclick", (e) => {
      e.button === 1 && (e.preventDefault(), activate(e.target.closest("li[data-link]"), !0));
    });
    let move = (step) => {
      let items = Array.from(list.querySelectorAll("li[role=option]"));
      if (!items.length) return;
      let cur = list.querySelector(".highlight"), idx = items.indexOf(cur), next = idx < 0 ? step === 1 ? 0 : items.length - 1 : (idx + step + items.length) % items.length;
      for (let li of items) li.classList.remove("highlight");
      items[next].classList.add("highlight"), items[next].scrollIntoView?.({ block: "nearest" });
    }, keyTarget = deps.keyTarget ?? doc, onKey = (e) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === "s") {
        e.preventDefault(), deps.ctrlS?.() !== !1 && deps.close();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault(), deps.close();
        return;
      }
      e.target === search && (e.key === "ArrowDown" ? (e.preventDefault(), move(1)) : e.key === "ArrowUp" ? (e.preventDefault(), move(-1)) : e.key === "Enter" && (e.preventDefault(), activate(list.querySelector(".highlight"), e.ctrlKey || e.metaKey)));
    };
    return keyTarget.addEventListener("keydown", onKey, !0), showFullList("name"), {
      reset() {
        search.value = "", showFullList("name");
      },
      focusInput() {
        search.focus();
      },
      refresh: render,
      destroy() {
        keyTarget.removeEventListener("keydown", onKey, !0), root.textContent = "";
      }
    };
  }

  // src/prompt.ts
  var WORK_AI_PROMPT = `I need the house table below converted into one JSON file that I can download and
import into a browser tool. The output must follow this exact format.

FORMAT
{
  "kind": "assd-houses",
  "schemaVersion": 1,
  "generatedAt": "<today, YYYY-MM-DD>",
  "source": "<which table/page this came from and its as-of date, one line>",
  "houses": [ <one entry per house / row of the table> ]
}

Each house:
{ "code": "<the house ID exactly as in the table, e.g. DK-K1>",
  "houseNumber": <the house number as a plain whole number, e.g. 12>,
  "name": "<house name>",
  "city": "<city>",
  "country": "<ISO 2-letter country code>",
  "address": "<street and number, postcode, city>",
  "link": "<the booking-system page address of this house>",
  "aliases": [ <other names or short names staff use for this house, if any> ] }

RULES
1. One entry per house in the table. Do not drop, merge or invent houses. Keep the
   order of the table.
2. Copy codes, names and addresses exactly as written. Do not translate or
   "correct" them.
3. "houseNumber" is a number without quotes. If the table has no house number for
   a house, or it is unclear, use null.
4. "link": take it from the table if the table has it. Otherwise take it from the
   previous file I attached: find the same house by its code (ignore dashes and
   upper/lower case, so DKK1 = DK-K1) and copy its "link" exactly. If the house is
   not in the previous file, use null. Never build, guess or complete a link
   yourself, even if other links look like a pattern.
5. Blank, unclear or contradictory cells are null. Never guess and never fill in
   from general knowledge. "aliases" may be an empty list.
6. If I attach a previous file, keep the "aliases" it has for houses that still
   exist.
7. Use exactly the field names above, with this spelling. No other fields.

OUTPUT
- The complete JSON as a downloadable file named assd-houses-<YYYY-MM-DD>.json.
  If you cannot create files, output it as one single \`\`\`json code block and
  nothing else inside that block. It must be valid JSON (no comments, no trailing
  commas).
- After the file: one short check list:
  - number of houses
  - houses whose "link" is null (code and name)
  - houses that were in the previous file but are not in the table any more
  - every other null you set because a cell was unclear (not just blank), with
    the reason

THE TABLE
<paste the table here, or attach it / name the page>
`;

  // static/launcher.css
  var launcher_default = `/* In-page launcher + panel (src/launcher.ts). Copied from the
   interactive-knowledge-base extension's static/launcher.css (Flat only).
   Injected by the browser alongside the content script, so a page CSP can't
   block it. Every rule is !important and starts from \`all: initial\`, because
   these elements live in the host page's DOM. The panel itself is an iframe
   and needs none of this.

   ao-tools-shared DESIGN.md \xA72.1/\xA72.2: launcher 70\xD770, #007BFF, 11px Arial
   label, z-index 999999; panel #222, 1px #444, radius 10px, z-index 999998.
   Position (right/bottom, and the panel's box) is set from script through
   CSSOM. */

ahi-launcher#ahi-launcher,
ahi-panel#ahi-panel,
ahi-panel#ahi-panel * {
  all: initial !important;
}

ahi-launcher#ahi-launcher {
  position: fixed !important;
  z-index: 999999 !important;
  width: 70px !important;
  height: 70px !important;
  box-sizing: border-box !important;
  border-radius: 50% !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
  font: 11px/1.3 Arial, sans-serif !important;
  text-align: center !important;
  cursor: pointer !important;
  user-select: none !important;
  -webkit-user-select: none !important;
  touch-action: none !important;
  background: #007BFF !important;
  color: #fff !important;
  transition: background 0.3s !important;
}
ahi-launcher#ahi-launcher:hover { background: #0056b3 !important; }
ahi-launcher#ahi-launcher[data-dragging="true"] { cursor: grabbing !important; }
ahi-launcher#ahi-launcher:focus-visible { outline: 2px solid #fff !important; outline-offset: 2px !important; }
ahi-launcher#ahi-launcher ahi-line {
  all: initial !important;
  display: block !important;
  font: inherit !important;
  color: inherit !important;
  pointer-events: none !important;
}

ahi-panel#ahi-panel {
  position: fixed !important;
  z-index: 999998 !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  background: #222 !important;
  border: 1px solid #444 !important;
  border-radius: 10px !important;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6) !important;
  font: 12px Arial, sans-serif !important;
  color: #fff !important;
}
ahi-panel#ahi-panel[data-open="false"] { display: none !important; }
ahi-panel#ahi-panel ahi-frame-slot {
  display: flex !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
}
ahi-panel#ahi-panel iframe.ahi-frame {
  display: block !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  height: 100% !important;
  border: 0 !important;
  background: #222 !important;
  color-scheme: dark !important;
}
ahi-panel#ahi-panel ahi-bar {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 6px 8px !important;
  border-top: 1px solid #444 !important;
  background: #222 !important;
}
ahi-panel#ahi-panel button.ahi-bar-btn {
  display: inline-block !important;
  padding: 4px 10px !important;
  background: #333 !important;
  border: 1px solid #555 !important;
  border-radius: 5px !important;
  color: #fff !important;
  font: 12px Arial, sans-serif !important;
  cursor: pointer !important;
  transition: background 0.3s !important;
}
ahi-panel#ahi-panel button.ahi-bar-btn:hover { background: #007BFF !important; }
ahi-panel#ahi-panel button.ahi-bar-btn:focus-visible { outline: 2px solid #007BFF !important; outline-offset: 1px !important; }
ahi-panel#ahi-panel button.ahi-bar-close { font-size: 16px !important; line-height: 1 !important; padding: 2px 9px !important; }
`;

  // static/panel.css
  var panel_default = `/* The house index panel (src/panel.ts). ao-tools-shared DESIGN.md \xA72.1 tokens,
   as ao-tools-ui.js draws them for the userscript. An MV3 extension can't load
   that remote file, so the values are copied here. */

html, body {
  margin: 0;
  padding: 0;
  background: #222;
  color: #fff;
  font-family: Arial, sans-serif;
  color-scheme: dark;
}

/* Sized by its content, within DESIGN.md \xA72.2's limits (max 600 px wide).
   Toolbar popup: the browser sizes the popup to the panel (max-height keeps
   it inside the popup's 600 px; the list scrolls). Embedded (?embed=1): the
   panel fills the iframe, and the launcher sizes the iframe to what the
   panel measures (src/panel.ts measureNatural, PANEL_RESIZE). */
html.ahi-embed, html.ahi-embed body { width: 100%; height: 100%; overflow: hidden; }

#app.ahi-panel {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: max-content;
  min-width: 240px;
  max-width: 600px;
  max-height: 580px;
  padding: 10px;
}
#app.ahi-panel:has(> .ahi-sort:not([hidden])) { min-width: 360px; }   /* room for the sort buttons */
html.ahi-embed #app.ahi-panel { width: 100%; height: 100%; min-width: 0; max-width: none; max-height: none; }

.ahi-list-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* The panel measures itself unscrolled (panel.ts measureNatural); with
     classic scrollbars (15 px, e.g. Windows) the long list's scrollbar then
     took that width from the rows, cutting 50 of 60 with "\u2026" (Chromium,
     2026-10-16). The gutter is reserved while measuring too. 0 px with
     overlay scrollbars. */
  scrollbar-gutter: stable;
  margin-bottom: 10px;
}

.ahi-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ahi-list li {
  padding: 10px;
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 5px;
  margin-bottom: 5px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.3s;
}
.ahi-list li:hover,
.ahi-list li.highlight { background: #007BFF; }
.ahi-list li.ahi-nolink { color: #aaa; cursor: default; }
.ahi-list li.ahi-nolink.highlight { background: #444; }
.ahi-list li.ahi-nolink:hover { background: #333; }

/* DESIGN.md \xA72.1 "No results" row. */
.ahi-list li.no-results {
  background: #3d0000;
  color: #ff6b6b;
  cursor: default;
  text-align: center;
  font-style: italic;
}
.ahi-list li.no-results:hover { background: #3d0000; }
.ahi-list li.ahi-empty { white-space: normal; text-align: center; color: #aaa; }
.ahi-list li.ahi-empty:hover { background: #0056b3; color: #fff; }

.ahi-sort {
  flex-shrink: 0;
  display: flex;
  gap: 5px;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ahi-sort[hidden] { display: none; }

.ahi-sort-btn {
  flex: 1;
  height: 48px;
  padding: 0 10px;
  box-sizing: border-box;
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 5px;
  cursor: pointer;
  font: 12px/1.2 Arial, sans-serif;
  text-align: center;
  transition: background 0.3s;
}
.ahi-sort-btn.active { background: #007BFF; }
.ahi-sort-btn:hover { background: #0056b3; }

.ahi-search {
  flex-shrink: 0;
  padding: 10px;
  height: 48px;
  border: 1px solid #555;
  border-radius: 5px;
  background: #333;
  color: #fff;
  font: 14px Arial, sans-serif;
  box-sizing: border-box;
  width: 100%;
  outline: none;
}
.ahi-search:focus { border-color: #007BFF; }
`;

  // static/userscript.css
  var userscript_default = `/* Userscript only (src/userscript.ts), added to the page with launcher.css
   through GM_addStyle: the bar's button group and the toast. Same rules as
   launcher.css: everything !important, from \`all: initial\`. */

ahi-panel#ahi-panel ahi-bar-group {
  display: flex !important;
  gap: 8px !important;
}

/* Block, not flex: the panel inside is measured at max-content
   (panel.ts measureNatural), and as a growing flex item it would always
   measure the slot's current width. */
ahi-panel#ahi-panel ahi-panel-root {
  display: block !important;
  flex: 1 1 auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
}

ahi-toast {
  all: initial !important;
  position: fixed !important;
  z-index: 999999 !important;
  max-width: 360px !important;
  box-sizing: border-box !important;
  padding: 8px 12px !important;
  background: #333 !important;
  border: 1px solid #555 !important;
  border-radius: 5px !important;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6) !important;
  color: #fff !important;
  font: 12px/1.4 Arial, sans-serif !important;
  white-space: normal !important;
}
ahi-toast[hidden] { display: none !important; }
`;

  // static/userscript-panel.css
  var userscript_panel_default = `/* Userscript only: inside the panel's shadow root, after panel.css. Does what
   panel.css's html/body and html.ahi-embed rules do in the extension's iframe
   (those selectors match nothing in a shadow root). */

#app.ahi-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  max-width: none;
  max-height: none;
  background: #222;
  color: #fff;
  font-family: Arial, sans-serif;
  color-scheme: dark;
  overflow: hidden;
}
`;

  // src/userscript.ts
  var POSITION_SITES = ["https://*.assd.com/*"], TOAST_MS = 6e3, PICKER_ID = "ahi-file-picker";
  function gmStorageArea(gm) {
    return {
      async get(key) {
        let v = gm.getValue(key);
        return v === void 0 ? {} : { [key]: v };
      },
      async set(items) {
        for (let [k, v] of Object.entries(items)) gm.setValue(k, v);
      }
    };
  }
  function importMessage(name, r) {
    return r.ok ? `Imported ${r.houses} houses from ${name}.` + (r.warnings.length ? ` Warnings: ${r.warnings.join("; ")}.` : "") : `Import failed \u2014 ${r.error}. The previous list is unchanged.`;
  }
  async function startUserscript(deps) {
    let doc = deps.doc ?? document;
    if (doc.getElementById("ahi-launcher")) return null;
    deps.addStyle(launcher_default + `
` + userscript_default);
    let { storage } = deps, pattern = findSiteForUrl(deps.href, POSITION_SITES), siteKey = pattern ? siteKeyFromPattern(pattern) : siteKeyForUrl(deps.href) ?? "", data = await loadHouses(storage).catch(() => null), panel = null, toastEl = doc.createElement("ahi-toast");
    toastEl.hidden = !0;
    let toastTimer = 0, win = doc.defaultView ?? window, toast = (text) => {
      toastEl.textContent = text;
      let r = launcher.launcher.getBoundingClientRect(), vw = viewportEl(doc).clientWidth || win.innerWidth, vh = viewportEl(doc).clientHeight || win.innerHeight;
      toastEl.style.setProperty("right", `${Math.max(8, vw - r.left + 8)}px`, "important"), toastEl.style.setProperty("bottom", `${Math.max(8, vh - r.bottom)}px`, "important"), toastEl.hidden = !1, win.clearTimeout(toastTimer), toastTimer = win.setTimeout(() => {
        toastEl.hidden = !0;
      }, TOAST_MS);
    }, reload = async () => {
      data = await loadHouses(storage).catch(() => null), panel?.refresh();
    }, importText = async (name, text) => {
      let r = await importHouses(storage, text);
      toast(importMessage(name, r)), await reload(), launcher.isOpen() && panel?.focusInput();
    }, pickFile = () => {
      if (deps.pickFile) {
        deps.pickFile((n, t) => void importText(n, t));
        return;
      }
      doc.getElementById(PICKER_ID)?.remove();
      let input = doc.createElement("input");
      input.id = PICKER_ID, input.type = "file", input.accept = "application/json,.json", input.hidden = !0, input.style.setProperty("display", "none", "important"), doc.documentElement.appendChild(input), input.addEventListener("change", async () => {
        input.remove();
        let file = input.files?.[0];
        if (!file) return;
        let text;
        try {
          text = await file.text();
        } catch (e) {
          toast(`Import failed \u2014 could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        await importText(file.name, text);
      }), input.click();
    }, positions = await loadPositions(storage), launcher = mountLauncher({
      storage,
      siteKey,
      doc,
      position: positions[siteKey],
      buttons: [{ label: "Import list", onClick: pickFile }],
      embed: {
        mount(slot) {
          let host = doc.createElement("ahi-panel-root");
          slot.appendChild(host);
          let shadow = host.attachShadow({ mode: "closed" }), css = panel_default + `
` + userscript_panel_default;
          try {
            let sheet = new CSSStyleSheet();
            sheet.replaceSync(css), shadow.adoptedStyleSheets = [sheet];
          } catch {
            let style = doc.createElement("style");
            style.textContent = css, shadow.appendChild(style);
          }
          let root = doc.createElement("div");
          root.id = "app", shadow.appendChild(root), panel = mountPanel(root, {
            doc,
            keyTarget: shadow,
            data: () => data,
            // Ctrl+S: the launcher's document listener (capture) toggles first;
            // the panel's own close then finds it closed.
            close: () => launcher.close(!0),
            openOptions: pickFile,
            noDataText: "No house list loaded. Click here to import the file (assd-houses JSON).",
            onSize: (size) => launcher.setContentSize(size),
            openLink: (url, background) => {
              deps.openInTab(url, background), background || launcher.close();
            }
          });
        },
        opened() {
          panel?.reset(), panel?.focusInput();
        }
      }
    });
    return doc.documentElement.appendChild(toastEl), deps.registerMenuCommand("Import house list\u2026", () => {
      launcher.open(), pickFile();
    }), deps.registerMenuCommand("Remove house list", () => {
      deps.confirm("Remove the imported house list from this browser?") && removeHouses(storage).then(reload).then(() => toast("House list removed from this browser."));
    }), deps.registerMenuCommand("Copy work-AI prompt", () => {
      deps.setClipboard(WORK_AI_PROMPT), toast("Work-AI prompt copied.");
    }), deps.registerMenuCommand("Reset launcher position", () => {
      launcher.resetPosition();
    }), deps.onValueChange(HOUSES_KEY, () => {
      reload();
    }), deps.onValueChange(LAUNCHER_POS_KEY, (v) => launcher.applyPositions(v ?? {})), { launcher, importText, toast };
  }
  typeof GM_getValue == "function" && typeof window < "u" && window === window.top && startUserscript({
    storage: gmStorageArea({ getValue: (k) => GM_getValue(k), setValue: (k, v) => GM_setValue(k, v) }),
    href: location.href,
    openInTab: (url, background) => {
      GM_openInTab(url, { active: !background, insert: !0 });
    },
    addStyle: (css) => {
      GM_addStyle(css);
    },
    setClipboard: (text) => GM_setClipboard(text, "text"),
    registerMenuCommand: (caption, onClick) => {
      GM_registerMenuCommand(caption, onClick);
    },
    onValueChange: (key, cb) => {
      GM_addValueChangeListener(key, (_k, _old, nv) => cb(nv));
    },
    confirm: (text) => window.confirm(text)
  });
})();
