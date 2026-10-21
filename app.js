import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, updateDoc, onSnapshot,
  deleteDoc, setDoc,
  query, orderBy, serverTimestamp, writeBatch, Timestamp, increment,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
// "?v=" makes phones fetch the latest copy of each file after an update (bump it in index.html too).
import { firebaseConfig, aiModel } from "./config.js?v=6";
import { splitIntoItems } from "./parse.js?v=6";

const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const s of ["setup-needed", "start", "name-ask", "list-view"]) $(s).hidden = s !== id;
};

// Small wrapper so the app still works if the phone blocks saved settings.
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// The list code is a long random string. It acts as the family's shared password.
const CODE_PATTERN = /^[A-Za-z0-9]{20,64}$/;

function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function linkFor(code) {
  const url = new URL(location.href);
  url.hash = "";
  url.search = "?list=" + code;
  return url.toString();
}

function codeFromText(text) {
  text = text.trim();
  if (CODE_PATTERN.test(text)) return text;
  try {
    const code = new URL(text).searchParams.get("list");
    if (code && CODE_PATTERN.test(code)) return code;
  } catch {}
  return null;
}

function openList(code) {
  store.set("listCode", code);
  location.href = linkFor(code);
}

$("new-list").onclick = () => openList(newCode());

$("join-form").onsubmit = (e) => {
  e.preventDefault();
  const code = codeFromText($("join-input").value);
  if (code) openList(code);
  else alert("That doesn't look like a family list link. Try copying it again.");
};

function askNameThen(next) {
  const name = store.get("myName");
  if (name) {
    $("who").textContent = name;
    $("who").hidden = false;
    return next();
  }
  show("name-ask");
  $("name-input").focus();
  $("name-form").onsubmit = (e) => {
    e.preventDefault();
    const value = $("name-input").value.trim();
    if (!value) return;
    store.set("myName", value);
    askNameThen(next);
  };
}

// Tap your name in the corner to change it.
$("who").onclick = () => {
  const value = prompt("Change your name:", store.get("myName") || "");
  const name = (value || "").trim().slice(0, 30);
  if (name) {
    store.set("myName", name);
    $("who").textContent = name;
  }
};

// ---- The list ----

// Shared by everything below once a list is open.
let db, items, history;
let onList = [];             // items currently on the list: { id, data }
const bought = new Map();    // purchase history, one entry per item: key -> data
let editingId = null;        // the item being edited, if any

function startList(code) {
  show("list-view");

  const app = initializeApp(firebaseConfig);
  // Normally a copy of the list is kept on the phone, so it still opens in a shop with poor
  // signal. If that copy ever gets stuck (it can on iPhones after an update), the app
  // reloads without it, rather than showing "Loading…" forever.
  const offlineCopy = store.get("offlineCopy") !== "off";
  db = initializeFirestore(app, offlineCopy
    ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
    : {});
  let loaded = false;
  setTimeout(() => {
    if (loaded) return;
    if (offlineCopy) {
      store.set("offlineCopy", "off");
      location.reload();
    } else {
      $("status").textContent = "The list is taking a long time to load.";
      showError(new Error("The list took too long to load."));
    }
  }, 10_000);
  items = collection(db, "lists", code, "items");
  history = collection(db, "lists", code, "history");

  $("share-link").value = linkFor(code);
  $("copy-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("share-link").value);
      $("copy-link").textContent = "Copied!";
    } catch {
      $("share-link").select();
    }
  };

  $("add-form").onsubmit = (e) => {
    e.preventDefault();
    const name = $("item-input").value.trim();
    if (!name) return;
    const already = findOnList(name);
    if (already && !confirm(`${already.name} is already on the list${already.addedBy ? ` (added by ${already.addedBy})` : ""}. Add it again anyway?`)) return;
    addItems([{ name, details: $("details-input").value.trim() }]);
    $("item-input").value = "";
    $("details-input").value = "";
    $("item-input").focus();
  };

  setUpBulkAdd(app);

  onSnapshot(query(items, orderBy("createdAt")), (snap) => {
    loaded = true;
    onList = snap.docs.map((d) => ({ id: d.id, data: d.data({ serverTimestamps: "estimate" }) }));
    renderList();
    renderBuyAgain();
  }, showError);

  onSnapshot(history, (snap) => {
    bought.clear();
    snap.forEach((d) => bought.set(d.id, d.data({ serverTimestamps: "estimate" })));
    renderBuyAgain();
    renderRecent();
  }, showError);

  // Keep "2 hours ago" up to date.
  setInterval(renderRecent, 60_000);
}

function addItems(list) {
  const batch = writeBatch(db);
  const now = Date.now();
  // Spaced a millisecond apart so they stay in the same order on the list.
  list.forEach((i, n) => batch.set(doc(items), {
    name: i.name,
    details: i.details || "",
    addedBy: store.get("myName") || "",
    createdAt: Timestamp.fromMillis(now + n),
  }));
  batch.commit().catch(showError);
}

// "Eggs", "egg" and " EGGS " all count as the same item.
function forms(name) {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  return [n, n.replace(/s$/, ""), n.replace(/es$/, "")];
}
function sameItem(a, b) {
  const fb = forms(b);
  return forms(a).some((f) => fb.includes(f));
}
function findOnList(name) {
  return onList.find((i) => sameItem(i.data.name, name))?.data;
}

// One history entry per item, e.g. "i_eggs". "/" isn't allowed in the name, hence the encoding.
const historyKey = (name) => "i_" + encodeURIComponent(forms(name)[1]);

function renderList() {
  if (editingId && onList.some((i) => i.id === editingId)) return; // wait until editing is finished
  editingId = null;
  $("items").replaceChildren(...onList.map(({ id, data }) => renderItem(id, data)));
  $("status").textContent = onList.length ? "" : "Nothing on the list. Nice!";
  $("status").hidden = onList.length > 0;
}

function renderItem(id, data) {
  const li = document.createElement("li");

  const tick = document.createElement("button");
  tick.className = "tick";
  tick.setAttribute("aria-label", "Bought " + data.name);
  tick.onclick = () => markBought(id, data);

  const text = document.createElement("button");
  text.className = "item-text";
  text.setAttribute("aria-label", "Edit " + data.name);
  const name = document.createElement("div");
  name.className = "item-name";
  name.textContent = data.name;
  text.append(name);
  if (data.details) {
    const details = document.createElement("div");
    details.className = "item-details";
    details.textContent = data.details;
    text.append(details);
  }
  if (data.addedBy) {
    const by = document.createElement("div");
    by.className = "item-by";
    by.textContent = "Added by " + data.addedBy;
    text.append(by);
  }
  text.onclick = () => li.replaceWith(renderEditor(id, data));

  li.append(tick, text);
  return li;
}

function renderEditor(id, data) {
  editingId = id;
  const form = document.createElement("form");
  form.className = "editor";
  const name = Object.assign(document.createElement("input"),
    { value: data.name, maxLength: 100, required: true, placeholder: "Item" });
  const details = Object.assign(document.createElement("input"),
    { value: data.details || "", maxLength: 100, placeholder: "How many / notes (optional)" });
  const remove = Object.assign(document.createElement("button"),
    { type: "button", textContent: "Remove", className: "danger" });
  const cancel = Object.assign(document.createElement("button"), { type: "button", textContent: "Cancel" });
  const save = Object.assign(document.createElement("button"), { className: "primary", textContent: "Save" });
  const buttons = document.createElement("div");
  buttons.className = "row";
  buttons.append(remove, cancel, save);
  form.append(name, details, buttons);

  const close = () => {
    editingId = null;
    renderList();
  };
  cancel.onclick = close;
  // For mistakes and duplicates: takes it off the list without counting it as bought.
  remove.onclick = () => {
    const ref = doc(items, id);
    deleteDoc(ref).catch(showError);
    close();
    showToast(`Removed: ${data.name}`, () => setDoc(ref, data).catch(showError));
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    updateDoc(doc(items, id), { name: name.value.trim(), details: details.value.trim() }).catch(showError);
    close();
  };

  const li = document.createElement("li");
  li.append(form);
  setTimeout(() => name.focus());
  return li;
}

function markBought(id, data) {
  const ref = doc(items, id);
  const key = historyKey(data.name);
  const before = bought.get(key); // so Undo can put the history back as it was
  const batch = writeBatch(db);
  batch.delete(ref);
  batch.set(doc(history, key), {
    name: data.name,
    details: data.details || "",
    count: increment(1),
    lastBoughtAt: serverTimestamp(),
    lastBoughtBy: store.get("myName") || "",
  }, { merge: true });
  batch.commit().catch(showError);

  showToast(`Ticked off: ${data.name}`, () => {
    const undo = writeBatch(db);
    undo.set(ref, data);
    if (before) undo.set(doc(history, key), before);
    else undo.delete(doc(history, key));
    undo.commit().catch(showError);
  });
}

// ---- "Buy again" buttons: the things bought most often that aren't on the list ----

function renderBuyAgain() {
  const top = [...bought.values()]
    .filter((h) => !findOnList(h.name))
    .sort((a, b) => b.count - a.count || millis(b.lastBoughtAt) - millis(a.lastBoughtAt))
    .slice(0, 10);
  $("buy-again").hidden = top.length === 0;
  $("buy-again-items").replaceChildren(...top.map((h) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = "+ " + h.name;
    chip.onclick = () => addItems([{ name: h.name, details: h.details }]);
    return chip;
  }));
}

// ---- "Recently bought": what was ticked off in the last 2 days, and by whom ----

const RECENT_MS = 2 * 24 * 60 * 60 * 1000;
const millis = (t) => t?.toMillis?.() ?? 0;

function renderRecent() {
  const now = Date.now();
  const recent = [...bought.values()]
    .filter((h) => now - millis(h.lastBoughtAt) < RECENT_MS)
    .sort((a, b) => millis(b.lastBoughtAt) - millis(a.lastBoughtAt));
  $("recent").hidden = recent.length === 0;
  $("recent-items").replaceChildren(...recent.map((h) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = h.name;
    const when = document.createElement("span");
    when.className = "muted";
    when.textContent = ` · ${timeAgo(now - millis(h.lastBoughtAt))}${h.lastBoughtBy ? " by " + h.lastBoughtBy : ""}`;
    li.append(name, when);
    return li;
  }));
}

function timeAgo(ms) {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return "yesterday";
}

// ---- Adding several items at once: paste a block of text, or a photo of a list ----

function setUpBulkAdd(app) {
  const panels = ["paste-panel", "photo-status", "preview-panel"];
  const showPanel = (id) => panels.forEach((p) => ($(p).hidden = p !== id));

  $("open-paste").onclick = () => {
    showPanel("paste-panel");
    $("paste-input").focus();
  };
  $("paste-cancel").onclick = () => showPanel(null);
  $("paste-next").onclick = () => {
    const found = splitIntoItems($("paste-input").value);
    if (!found.length) return alert("There's nothing to add yet. Type or paste your list first.");
    showPreview(found);
  };

  $("photo-input").onchange = async () => {
    const file = $("photo-input").files[0];
    $("photo-input").value = ""; // so the same photo can be picked again
    if (!file) return;
    showPanel("photo-status");
    try {
      const { readPhoto } = await import("./photo.js?v=6");
      const found = await readPhoto(app, file, aiModel);
      if (found.length) showPreview(found);
      else {
        showPanel(null);
        alert("Couldn't spot a shopping list in that photo. Try again with the list filling more of the picture.");
      }
    } catch (err) {
      console.error(err);
      showPanel(null);
      alert("Sorry, the photo couldn't be read just now. Check your internet connection and try again.");
    }
  };

  function showPreview(found) {
    const list = $("preview-items");
    list.replaceChildren(...found.slice(0, 50).map(previewRow));
    showPanel("preview-panel");
    updateAddButton();
  }

  function previewRow({ name, details }) {
    const li = document.createElement("li");
    // Anything already on the list starts unticked.
    const already = findOnList(name);
    const check = Object.assign(document.createElement("input"), { type: "checkbox", checked: !already });
    if (already) li.classList.add("off");
    check.setAttribute("aria-label", "Include this item");
    check.onchange = () => {
      li.classList.toggle("off", !check.checked);
      updateAddButton();
    };
    const nameInput = Object.assign(document.createElement("input"),
      { type: "text", value: name, maxLength: 100, className: "preview-name", placeholder: "Item" });
    const detailsInput = Object.assign(document.createElement("input"),
      { type: "text", value: details, maxLength: 100, className: "preview-details", placeholder: "Amount" });
    li.append(check, nameInput, detailsInput);
    if (already) {
      const note = document.createElement("div");
      note.className = "preview-note";
      note.textContent = "Already on the list";
      li.append(note);
    }
    return li;
  }

  function chosenItems() {
    return [...$("preview-items").children]
      .filter((li) => li.querySelector("input[type=checkbox]").checked)
      .map((li) => ({
        name: li.querySelector(".preview-name").value.trim(),
        details: li.querySelector(".preview-details").value.trim(),
      }))
      .filter((i) => i.name);
  }

  function updateAddButton() {
    const n = [...$("preview-items").querySelectorAll("input[type=checkbox]")].filter((c) => c.checked).length;
    $("preview-add").textContent = n === 1 ? "Add 1 item" : `Add ${n} items`;
    $("preview-add").disabled = n === 0;
  }

  $("preview-cancel").onclick = () => showPanel(null);
  $("preview-add").onclick = () => {
    addItems(chosenItems());
    $("paste-input").value = "";
    showPanel(null);
  };
}

// ---- Little pop-up at the bottom with an Undo button ----

let toastTimer;
function showToast(message, undo) {
  $("toast-text").textContent = message;
  $("toast").hidden = false;
  $("toast-undo").onclick = () => {
    undo();
    $("toast").hidden = true;
  };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6000);
}

function showError(err) {
  console.error(err);
  // Stays on screen until closed, so it isn't wiped when the list redraws.
  $("error-text").textContent = "Something went wrong. Check your internet connection, then reload the page.";
  // The technical reason, in small print, so a screenshot shows what went wrong.
  const detail = document.createElement("small");
  detail.className = "error-detail";
  detail.textContent = String(err?.message || err).slice(0, 200);
  $("error-text").append(detail);
  $("error").hidden = false;
}
$("error-close").onclick = () => ($("error").hidden = true);

// Any unexpected problem gets shown on screen too, instead of failing silently.
window.addEventListener("error", (e) => showError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showError(e.reason));

// ---- Start-up ----
// This stays at the very end of the file, so everything above is ready before the list opens.

if (firebaseConfig.projectId === "PASTE_HERE") {
  show("setup-needed");
} else {
  const fromUrl = codeFromText(new URL(location.href).searchParams.get("list") || "");
  const saved = store.get("listCode");
  if (fromUrl) {
    store.set("listCode", fromUrl);
    askNameThen(() => startList(fromUrl));
  } else if (saved && CODE_PATTERN.test(saved)) {
    openList(saved);
  } else {
    show("start");
  }
}
