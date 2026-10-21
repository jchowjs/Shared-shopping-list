import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, collection, doc, addDoc, setDoc,
  deleteDoc, onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

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

// ---- Start-up ----

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

function startList(code) {
  show("list-view");

  const app = initializeApp(firebaseConfig);
  // Keeps a copy on the phone, so the list still opens in a shop with poor signal.
  const db = initializeFirestore(app, { localCache: persistentLocalCache() });
  const items = collection(db, "lists", code, "items");

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
    addDoc(items, {
      name,
      details: $("details-input").value.trim(),
      addedBy: store.get("myName") || "",
      createdAt: serverTimestamp(),
    }).catch(showError);
    $("item-input").value = "";
    $("details-input").value = "";
    $("item-input").focus();
  };

  onSnapshot(query(items, orderBy("createdAt")), (snap) => {
    const list = $("items");
    list.replaceChildren();
    snap.forEach((d) => list.append(renderItem(d.id, d.data({ serverTimestamps: "estimate" }), items)));
    $("status").textContent = snap.empty ? "Nothing on the list. Nice!" : "";
    $("status").hidden = !snap.empty;
  }, showError);
}

function renderItem(id, data, items) {
  const li = document.createElement("li");

  const tick = document.createElement("button");
  tick.className = "tick";
  tick.setAttribute("aria-label", "Bought " + data.name);
  tick.onclick = () => {
    const ref = doc(items, id);
    deleteDoc(ref).catch(showError);
    showToast(`Ticked off: ${data.name}`, () => setDoc(ref, data).catch(showError));
  };

  const text = document.createElement("div");
  text.className = "item-text";
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

  li.append(tick, text);
  return li;
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
  $("status").hidden = false;
  $("status").textContent = "Couldn't reach the list. Check your internet connection, then reload the page.";
}
