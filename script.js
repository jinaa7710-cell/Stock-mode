/* ============================================================
   THEME
   ============================================================ */
const THEME_KEY = "stockTheme";
let currentTheme = localStorage.getItem(THEME_KEY) || "dark";

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

/* ============================================================
   STATE
   ============================================================ */
const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const STORAGE_KEY = "stockData_v5";
const UNITS = ["can","bag","pack","bottle","case","dozen","bundle","piece"];

const defaultItems = [
  "Black coffee",
  "Yeye coffee",
  "Coast milk",
  "Cereal",
  "Corn flakes",
  "Chocos",
  "Packet milk",
  "Packet juice"
];

const todayName = weekdays[new Date().getDay()];
let selectedDay = todayName;
let selectedUnit = "pack";

let stock = loadStock();

function makeEmptyDay() {
  return { catalog: [], items: [] };
}

function loadStock() {
  const fresh = { days: {}, godown: [] };
  weekdays.forEach(d => fresh.days[d] = makeEmptyDay());

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.days && typeof parsed.days === "object") {
        weekdays.forEach(day => {
          const d = parsed.days[day];
          if (d && typeof d === "object") {
            fresh.days[day] = {
              catalog: Array.isArray(d.catalog)
                ? d.catalog.filter(x => typeof x === "string")
                : [],
              items: Array.isArray(d.items)
                ? d.items.filter(it => it && typeof it.name === "string")
                : []
            };
          }
        });
        
        fresh.godown = Array.isArray(parsed.godown)
          ? parsed.godown.filter(g =>
              g && typeof g.name === "string" &&
              Number.isFinite(g.base) && g.base >= 0 &&
              UNITS.includes(g.unit)
            ).map(g => ({ 
              name: g.name, 
              unit: g.unit, 
              base: Math.floor(g.base),
              used: Math.floor(g.used || 0) 
            }))
          : [];
        return fresh;
      }
    }
  } catch (e) {
    console.warn("Corrupt storage, resetting.", e);
  }

  weekdays.forEach(day => {
    fresh.days[day].catalog = [...defaultItems];
  });
  return fresh;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stock));
  } catch (e) {
    console.error("Failed to save:", e);
    toast("Could not save data");
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ============================================================
   HELPERS
   ============================================================ */
function currentDay() {
  if (!stock.days[selectedDay]) stock.days[selectedDay] = makeEmptyDay();
  return stock.days[selectedDay];
}
function dayItems() { return currentDay().items; }
function dayCatalog() { return currentDay().catalog; }

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

/* ============================================================
   GODOWN HELPERS
   ============================================================ */
function findGodown(name) {
  return stock.godown.find(g => g.name.toLowerCase() === name.toLowerCase());
}

function deductGodown(name, amount) {
  const g = findGodown(name);
  if (!g) return false;

  const actualDeduct = Math.min(amount, g.base);
  g.base -= actualDeduct;
  g.used += amount;

  if (actualDeduct < amount) {
    toast(`Only ${actualDeduct} ${g.unit}(s) available in godown`);
  }
  return true;
}

function refundGodown(name, amount) {
  const g = findGodown(name);
  if (!g) return;
  g.base += amount;
  g.used = Math.max(0, g.used - amount);
}

/* ============================================================
   RENDER: DAYS
   ============================================================ */
function renderDays() {
  const wrap = document.getElementById("days");
  wrap.innerHTML = weekdays.map(day => {
    const count = (stock.days[day]?.items || []).length;
    return `
      <button class="day ${day === selectedDay ? "active" : ""}"
              onclick="changeDay('${day}')"
              aria-pressed="${day === selectedDay}">
        <span class="dow">${day.slice(0,3)}</span>
        ${count > 0 ? `<span class="dot" title="${count} item(s)"></span>` : ""}
      </button>`;
  }).join("");
}

function changeDay(day) {
  selectedDay = day;
  catalogUI = [];
  render();
}

/* ============================================================
   RENDER: CATALOG
   ============================================================ */
let catalogUI = [];

function syncCatalogUI() {
  const prev = new Map(catalogUI.map(c => [c.name, c]));
  catalogUI = dayCatalog().map(name => {
    const found = prev.get(name);
    return { name, checked: found ? found.checked : false, qty: found ? found.qty : "" };
  });
}

function renderCatalog() {
  syncCatalogUI();
  const wrap = document.getElementById("catalog");
  document.getElementById("catalogDayBadge").textContent = selectedDay;

  if (dayCatalog().length === 0) {
    wrap.innerHTML = `<div class="empty">No items for ${selectedDay} yet. Add one below.</div>`;
    updateAddSelectedBtn();
    return;
  }

  const alreadyOnDay = new Set(dayItems().map(i => i.name));

  wrap.innerHTML = dayCatalog().map((name, i) => {
    const onDay = alreadyOnDay.has(name);
    return `
      <div class="item" data-idx="${i}">
        <input type="checkbox" id="check${i}"
               ${catalogUI[i].checked ? "checked" : ""}
               onchange="onCheckChange(${i}, this.checked)">
        <span class="name">
          ${escapeHTML(name)}
          ${onDay ? `<span class="badge">on ${selectedDay.slice(0,3)}</span>` : ""}
        </span>
        <input type="number" id="qty${i}" min="0" step="1"
               inputmode="numeric" placeholder="QTY"
               value="${escapeAttr(catalogUI[i].qty)}"
               oninput="onQtyInput(${i}, this.value)">
        <button class="btn-del" title="Remove ${escapeAttr(name)} from ${escapeAttr(selectedDay)}"
                aria-label="Remove ${escapeAttr(name)}"
                onclick="deleteCatalogItem(${i})">✕</button>
      </div>`;
  }).join("");

  updateAddSelectedBtn();
}

function onCheckChange(i, checked) {
  if (catalogUI[i]) catalogUI[i].checked = checked;
  updateAddSelectedBtn();
}

function onQtyInput(i, value) {
  if (catalogUI[i]) catalogUI[i].qty = value;
  updateAddSelectedBtn();
}

function updateAddSelectedBtn() {
  const btn = document.getElementById("addSelectedBtn");
  const anyChecked = catalogUI.some(c => c.checked);
  btn.disabled = !anyChecked;
}

/* ============================================================
   ACTIONS
   ============================================================ */
function addItem() {
  const input = document.getElementById("newName");
  const name = input.value.trim();

  if (!name) { toast("Enter an item name"); return; }
  if (dayCatalog().some(x => x.toLowerCase() === name.toLowerCase())) {
    toast(`"${name}" already in ${selectedDay}'s list`);
    return;
  }

  dayCatalog().push(name);
  save();
  input.value = "";
  renderCatalog();
  toast(`Added "${name}" to ${selectedDay}`);
}

function deleteCatalogItem(i) {
  const name = dayCatalog()[i];
  if (name == null) return;

  dayCatalog().splice(i, 1);

  const day = currentDay();
  const before = day.items.length;
  day.items = day.items.filter(it => it.name !== name);
  const removedFromList = before - day.items.length;

  catalogUI.splice(i, 1);

  save();
  renderCatalog();
  renderUpdate();
  renderDays();
  renderGodown();

  toast(
    removedFromList > 0
      ? `Removed "${name}" (and ${removedFromList} from update)`
      : `Removed "${name}" from ${selectedDay}`
  );
}

function addSelected() {
  let added = 0;
  let invalid = 0;
  let dupes = 0;

  dayCatalog().forEach((name, i) => {
    const ui = catalogUI[i];
    if (!ui || !ui.checked) return;

    const raw = String(ui.qty).trim();
    const qtyNum = Number(raw);
    if (raw === "" || !Number.isFinite(qtyNum) || qtyNum <= 0 || !Number.isInteger(qtyNum)) {
      invalid++;
      return;
    }

    if (dayItems().some(item => item.name === name)) {
      dupes++;
      return;
    }

    dayItems().push({
      id: uid(),
      name,
      qty: qtyNum,
      collected: false
    });
    ui.checked = false;
    ui.qty = "";
    added++;
  });

  save();

  if (added === 0) {
    if (invalid > 0) toast("Enter a valid positive quantity");
    else if (dupes > 0) toast("Already in the daily update");
    else toast("Select items first");
    renderCatalog();
    return;
  }

  renderDays();
  renderCatalog();
  renderUpdate();
  renderGodown();

  toast(`Added ${added} item${added > 1 ? "s" : ""} to ${selectedDay}`);

  showPage("update", document.querySelector('.tabs button[data-tab="update"]'));
}

function toggleCollected(id, value) {
  const item = dayItems().find(x => x.id === id);
  if (!item) return;

  if (value) {
    deductGodown(item.name, item.qty);
  } else {
    refundGodown(item.name, item.qty);
  }

  item.collected = value;
  save();
  renderUpdate();
  renderGodown();
}

function clearCollected() {
  const day = currentDay();
  const before = day.items.length;
  day.items = day.items.filter(x => !x.collected);
  const removed = before - day.items.length;
  save();
  renderUpdate();
  renderDays();
  renderCatalog();
  renderGodown();
  toast(removed ? `Removed ${removed} collected item${removed > 1 ? "s" : ""}` : "Nothing collected to remove");
}

function resetDay() {
  if (!confirm(`Reset all items for ${selectedDay}? This cannot be undone.`)) return;
  
  stock.days[selectedDay].items.forEach(item => {
    if (item.collected) {
      refundGodown(item.name, item.qty);
    }
  });

  stock.days[selectedDay].items = [];
  save();
  renderUpdate();
  renderDays();
  renderCatalog();
  renderGodown();
  toast(`${selectedDay} update reset`);
}

function selectAllRemaining() {
  let n = 0;
  dayItems().forEach(item => {
    if (!item.collected) { 
      item.collected = true; 
      deductGodown(item.name, item.qty);
      n++; 
    }
  });
  save();
  renderUpdate();
  renderGodown();
  if (n) toast(`Marked ${n} as collected`);
}

function unselectAll() {
  dayItems().forEach(item => {
    if (item.collected) {
      refundGodown(item.name, item.qty);
      item.collected = false;
    }
  });
  save();
  renderUpdate();
  renderGodown();
  toast("Unmarked all");
}

/* ============================================================
   RENDER: UPDATE
   ============================================================ */
function renderUpdate() {
  const items = dayItems();
  const total = items.length;
  const collected = items.filter(x => x.collected).length;
  const remaining = total - collected;

  document.getElementById("dayBadge").textContent = selectedDay;
  document.getElementById("statCollected").textContent = collected;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statRemaining").textContent = remaining;

  const list = document.getElementById("updateList");

  if (total === 0) {
    list.innerHTML = `<div class="empty">No items for ${selectedDay} yet.<br>
      Add some from the "Daily stock data" tab.</div>`;
    return;
  }

  const sorted = [...items].sort((a, b) => Number(a.collected) - Number(b.collected));

  list.innerHTML = sorted.map(item => {
    const g = findGodown(item.name);
    const unitLabel = g ? ` ${g.unit}` : "";
    return `
      <div class="item" style="grid-template-columns:28px 1fr 84px;">
        <input type="checkbox" ${item.collected ? "checked" : ""}
               onchange="toggleCollected('${item.id}', this.checked)">
        <span class="name ${item.collected ? "done" : ""}">${escapeHTML(item.name)}</span>
        <span class="qty-badge">${item.qty}${escapeHTML(unitLabel)}</span>
      </div>
    `;
  }).join("");
}

/* ============================================================
   RENDER: GODOWN
   ============================================================ */
function renderGodown() {
  const wrap = document.getElementById("godownList");

  if (stock.godown.length === 0) {
    wrap.innerHTML = `<div class="empty">No godown items yet. Add one below.</div>`;
    renderUnitPicker();
    return;
  }

  const header = `
    <div class="godown-row godown-header">
      <span class="g-name">Item</span>
      <span class="g-unit">Unit</span>
      <span class="g-num">Base</span>
      <span class="g-num">Used</span>
      <span class="g-num">Avail</span>
      <span></span>
    </div>`;

  const rows = stock.godown.map((g, i) => {
    return `
      <div class="godown-row">
        <span class="g-name">${escapeHTML(g.name)}</span>
        <span class="g-unit">${escapeHTML(g.unit)}</span>
        <span class="g-num">${g.base + g.used}</span>
        <span class="g-num used">${g.used}</span>
        <span class="g-num avail">${g.base}</span>
        <button class="btn-del" title="Delete ${escapeAttr(g.name)}"
                aria-label="Delete ${escapeAttr(g.name)}"
                onclick="deleteGodownItem(${i})">✕</button>
        <div class="restock">
          <input type="number" id="restock${i}" min="1" step="1"
                 inputmode="numeric" placeholder="Restock qty"
                 onkeydown="if(event.key==='Enter')restockGodown(${i})">
          <button onclick="restockGodown(${i})">Restock</button>
        </div>
      </div>`;
  }).join("");

  wrap.innerHTML = header + rows;
  renderUnitPicker();
}

function renderUnitPicker() {
  const wrap = document.getElementById("godownUnitPicker");
  wrap.innerHTML = UNITS.map(u => `
    <button class="${u === selectedUnit ? "active" : ""}"
            onclick="pickUnit('${u}')">${u}</button>
  `).join("");
}

function pickUnit(u) {
  selectedUnit = u;
  renderUnitPicker();
}

function addGodownItem() {
  const nameEl = document.getElementById("godownName");
  const qtyEl  = document.getElementById("godownQty");

  const name = nameEl.value.trim();
  const qty  = Number(qtyEl.value);

  if (!name) { toast("Enter an item name"); return; }
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    toast("Enter a valid positive quantity");
    return;
  }
  if (!UNITS.includes(selectedUnit)) { toast("Pick a unit"); return; }
  if (findGodown(name)) {
    toast(`"${name}" already in godown — use Restock`);
    return;
  }

  stock.godown.push({ name, unit: selectedUnit, base: qty, used: 0 });
  save();
  nameEl.value = "";
  qtyEl.value = "";
  renderGodown();
  toast(`Added "${name}" (${qty} ${selectedUnit})`);
}

function restockGodown(i) {
  const g = stock.godown[i];
  if (!g) return;
  const input = document.getElementById(`restock${i}`);
  const qty = Number(input.value);

  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    toast("Enter a valid restock quantity");
    return;
  }

  g.base += qty;
  save();
  renderGodown();
  toast(`Restocked ${qty} ${g.unit}(s) of "${g.name}"`);
}

function deleteGodownItem(i) {
  const g = stock.godown[i];
  if (!g) return;
  if (!confirm(`Delete "${g.name}" from godown?`)) return;
  stock.godown.splice(i, 1);
  save();
  renderGodown();
  toast(`Deleted "${g.name}"`);
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function showPage(page, button) {
  document.getElementById("data").classList.toggle("hidden", page !== "data");
  document.getElementById("update").classList.toggle("hidden", page !== "update");
  document.getElementById("godown").classList.toggle("hidden", page !== "godown");

  document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
  if (button) button.classList.add("active");
}

/* ============================================================
   UTIL
   ============================================================ */
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function escapeAttr(str) {
  return escapeHTML(str).replace(/`/g, "&#96;");
}

/* ============================================================
   INIT
   ============================================================ */
applyTheme(currentTheme);

function render() {
  renderDays();
  renderCatalog();
  renderUpdate();
  renderGodown();
}

render();

window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    stock = loadStock();
    catalogUI = [];
    render();
  }
});
