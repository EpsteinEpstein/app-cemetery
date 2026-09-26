let graves = [];
let allGraves = [];
let currentGraveId = null;
let currentView = "grid";
let soundOn = true;
let causeChartInstance = null;
let categoryChartInstance = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d) {
  if (!d) return "unknown";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function formatShortDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function skulls(n) {
  n = parseInt(n) || 0;
  if (n < 1) return "";
  return "☠".repeat(Math.min(n, 5));
}

function makeStars() {
  const box = $("stars");
  for (let i = 0; i < 70; i++) {
    const s = document.createElement("div");
    s.className = "star";
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 55 + "%";
    s.style.opacity = (0.2 + Math.random() * 0.6).toFixed(2);
    box.appendChild(s);
  }
}

makeStars();

let audioCtx = null;

function playSound(type) {
  if (!soundOn) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === "bury") {
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    } else if (type === "resurrect") {
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.3);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    } else if (type === "open") {
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    } else if (type === "achieve") {
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      osc.frequency.setValueAtTime(784, now + 0.2);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    }

    osc.type = "sine";
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  } catch (err) {
    /* silent */
  }
}

function applyTheme() {
  const saved = localStorage.getItem("cemetery_theme");
  if (saved === "light") {
    document.body.classList.add("light");
  } else {
    document.body.classList.remove("light");
  }
}

function applySoundSetting() {
  const saved = localStorage.getItem("cemetery_sound");
  soundOn = saved !== "off";
  $("soundToggle").textContent = soundOn ? "sound: on" : "sound: off";
}

applyTheme();
applySoundSetting();

$("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("cemetery_theme", isLight ? "light" : "dark");
});

$("soundToggle").addEventListener("click", () => {
  soundOn = !soundOn;
  localStorage.setItem("cemetery_sound", soundOn ? "on" : "off");
  $("soundToggle").textContent = soundOn ? "sound: on" : "sound: off";
  if (soundOn) playSound("open");
});

document.querySelectorAll(".bottom-nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.dataset.view;
    document.querySelectorAll(".bottom-nav button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach((s) => s.classList.remove("active"));
    $("view-" + v).classList.add("active");

    if (v === "stats") loadStats();
    if (v === "resurrected") loadResurrected();
    if (v === "cemetery") loadCemetery();
    if (v === "settings") loadCategories();
  });
});

function applySortAndFilter() {
  const query = $("searchInput").value.toLowerCase().trim();
  const sort = $("sortSelect").value;

  let list = allGraves.slice();

  if (query) {
    list = list.filter((g) =>
      (g.name || "").toLowerCase().includes(query) ||
      (g.cause || "").toLowerCase().includes(query) ||
      (g.category || "").toLowerCase().includes(query) ||
      (g.note || "").toLowerCase().includes(query) ||
      (g.tags || "").toLowerCase().includes(query)
    );
  }

  const comparators = {
    deleted_desc: (a, b) => (b.deleted || "").localeCompare(a.deleted || ""),
    deleted_asc: (a, b) => (a.deleted || "").localeCompare(b.deleted || ""),
    name_asc: (a, b) => (a.name || "").localeCompare(b.name || ""),
    name_desc: (a, b) => (b.name || "").localeCompare(a.name || ""),
    age_desc: (a, b) => ageInDays(b) - ageInDays(a),
    age_asc: (a, b) => ageInDays(a) - ageInDays(b),
    rating_desc: (a, b) => (b.rating || 0) - (a.rating || 0),
    visits_desc: (a, b) => (b.visits || 0) - (a.visits || 0),
    category_asc: (a, b) => (a.category || "").localeCompare(b.category || ""),
    cause_asc: (a, b) => (a.cause || "").localeCompare(b.cause || "")
  };

  if (comparators[sort]) list.sort(comparators[sort]);

  graves = list;
  renderGraves();
}

function ageInDays(g) {
  if (!g.installed || !g.deleted) return 0;
  const d1 = new Date(g.installed);
  const d2 = new Date(g.deleted);
  if (isNaN(d1) || isNaN(d2)) return 0;
  return Math.abs((d2 - d1) / (1000 * 60 * 60 * 24));
}

$("searchInput").addEventListener("input", applySortAndFilter);
$("sortSelect").addEventListener("change", applySortAndFilter);

$("viewToggle").addEventListener("click", () => {
  currentView = currentView === "grid" ? "map" : "grid";
  $("viewToggle").textContent = currentView === "grid" ? "▦" : "☰";
  renderGraves();
});

function graveCard(g) {
  const icon = g.icon && g.icon.startsWith("http")
    ? `<img src="${escapeHtml(g.icon)}" alt="">`
    : `<span>${escapeHtml(g.icon || "▣")}</span>`;

  const y1 = (g.installed || "").slice(0, 4) || "????";
  const y2 = (g.deleted || "").slice(0, 4) || "????";
  const rating = skulls(g.rating);
  const star = g.favorite ? `<div class="favorite-star">★</div>` : "";

  const tags = (g.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");

  return `
    <div class="grave" data-id="${g.id}">
      ${star}
      <span class="icon">${icon}</span>
      <div class="name">${escapeHtml(g.name)}</div>
      <div class="years">${y1} — ${y2}</div>
      <div class="cause">${escapeHtml(g.cause || "unknown")}</div>
      ${rating ? `<div class="skulls">${rating}</div>` : ""}
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </div>
  `;
}

function renderGraves() {
  const grid = $("graveList");
  grid.classList.toggle("map-view", currentView === "map");

  if (!graves.length) {
    grid.innerHTML = `<div class="empty">the cemetery is empty.<br>bury your first app.</div>`;
    return;
  }

  grid.innerHTML = graves.map(graveCard).join("");
  grid.querySelectorAll(".grave").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.id));
  });
}

async function loadCemetery() {
  const res = await fetch("/api/graves");
  allGraves = await res.json();
  applySortAndFilter();
}

async function loadResurrected() {
  const res = await fetch("/api/resurrected");
  const list = await res.json();
  const box = $("resurrectedList");

  if (!list.length) {
    box.innerHTML = `<div class="empty">no resurrections yet.</div>`;
    return;
  }

  box.innerHTML = list.map((g) => `
    <div class="grave resurrected" data-id="${g.id}">
      <span class="icon">${escapeHtml(g.icon || "▣")}</span>
      <div class="name">${escapeHtml(g.name)}</div>
      <div class="years">died: ${formatDate(g.deleted)}</div>
      <div class="cause">back: ${formatDate(g.resurrected_date)}</div>
      <div class="cause">x${g.resurrect_count}</div>
    </div>
  `).join("");

  box.querySelectorAll(".grave").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.id));
  });
}

const addModal = $("addModal");
const detailModal = $("detailModal");

$("addBtn").addEventListener("click", () => addModal.classList.add("open"));
$("cancelAdd").addEventListener("click", () => addModal.classList.remove("open"));
$("closeDetail").addEventListener("click", () => detailModal.classList.remove("open"));

const causeSelect = $("causeSelect");
const customCauseLabel = $("customCauseLabel");

causeSelect.addEventListener("change", () => {
  customCauseLabel.classList.toggle("hidden", causeSelect.value !== "__custom__");
});

const ratingInput = $("ratingInput");
const ratingValue = $("ratingValue");

ratingInput.querySelectorAll("span").forEach((span) => {
  span.addEventListener("click", () => {
    const val = parseInt(span.dataset.value);
    const current = parseInt(ratingValue.value) || 0;
    const newVal = val === current ? 0 : val;
    ratingValue.value = newVal;
    ratingInput.querySelectorAll("span").forEach((s) => {
      s.classList.toggle("active", parseInt(s.dataset.value) <= newVal);
    });
  });
});

$("genLastWordsBtn").addEventListener("click", async () => {
  const res = await fetch("/api/epitaph");
  const data = await res.json();
  const name = $("addForm").querySelector('input[name="name"]').value || "this app";
  $("lastWordsInput").value = data.epitaph.replace("{name}", name);
});

$("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());

  if (data.cause === "__custom__") {
    data.cause = $("customCause").value || "Other";
  }

  await fetch("/api/graves", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  playSound("bury");
  e.target.reset();
  ratingValue.value = 0;
  ratingInput.querySelectorAll("span").forEach((s) => s.classList.remove("active"));
  customCauseLabel.classList.add("hidden");
  addModal.classList.remove("open");
  loadCemetery();
  checkAchievements();
});

async function openDetail(id) {
  currentGraveId = id;
  playSound("open");

  const res = await fetch("/api/graves/" + id);
  const g = await res.json();

  const icon = g.icon && g.icon.startsWith("http")
    ? `<img src="${escapeHtml(g.icon)}" alt="">`
    : `<span>${escapeHtml(g.icon || "▣")}</span>`;

  const photoHtml = g.photo
    ? `<div class="cert-photo"><img src="/uploads/${escapeHtml(g.photo)}" alt=""></div>`
    : "";

  const rows = [
    ["born", formatDate(g.installed)],
    ["died", formatDate(g.deleted)],
    ["age", g.age || "unknown"],
    ["cause", g.cause || "unknown"],
    ["category", g.category || "other"]
  ];

  if (g.note) rows.push(["note", g.note]);
  if (g.memory) rows.push(["memory", g.memory]);
  if (g.visits > 0) rows.push(["visited", g.visits + " time(s)"]);
  if (g.resurrect_count > 0) rows.push(["resurrected", g.resurrect_count + " time(s)"]);

  $("detailBody").innerHTML = `
    <div class="cert-header">app cemetery</div>
    ${photoHtml}
    <div class="cert-icon">${icon}</div>
    <div class="cert-name">${escapeHtml(g.name)}</div>
    ${g.rating > 0 ? `<div class="cert-skulls">${skulls(g.rating)}</div>` : ""}
    ${rows.map(([k, v]) => `
      <div class="cert-row">
        <span class="k">${escapeHtml(k)}</span>
        <span class="v">${escapeHtml(v)}</span>
      </div>
    `).join("")}
    ${g.last_words ? `<div class="cert-quote">"${escapeHtml(g.last_words)}"</div>` : ""}
    <div class="cert-drama">you haven't thought about this app in ${g.days_since || 0} days.</div>
  `;

  $("resurrectBtn").style.display = g.resurrected ? "none" : "block";
  $("favoriteBtn").textContent = g.favorite ? "unfavorite" : "favorite";

  detailModal.classList.add("open");
  loadNotes(id);
}

$("favoriteBtn").addEventListener("click", async () => {
  if (!currentGraveId) return;
  const res = await fetch(`/api/graves/${currentGraveId}/favorite`, { method: "POST" });
  const data = await res.json();
  $("favoriteBtn").textContent = data.favorite ? "unfavorite" : "favorite";
  checkAchievements();
  loadCemetery();
});

$("resurrectBtn").addEventListener("click", async () => {
  if (!currentGraveId) return;
  await fetch(`/api/graves/${currentGraveId}/resurrect`, { method: "POST" });
  playSound("resurrect");
  detailModal.classList.remove("open");
  loadCemetery();
  checkAchievements();
});

$("deleteBtn").addEventListener("click", async () => {
  if (!currentGraveId) return;
  if (!confirm("delete this grave forever?")) return;
  await fetch("/api/graves/" + currentGraveId, { method: "DELETE" });
  detailModal.classList.remove("open");
  loadCemetery();
});

$("uploadPhotoBtn").addEventListener("click", () => $("photoInput").click());

$("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentGraveId) return;

  const fd = new FormData();
  fd.append("photo", file);

  await fetch(`/api/graves/${currentGraveId}/photo`, {
    method: "POST",
    body: fd
  });

  e.target.value = "";
  openDetail(currentGraveId);
});

$("printBtn").addEventListener("click", () => window.print());

$("shareImageBtn").addEventListener("click", async () => {
  const cert = $("certificate");
  const btns = cert.querySelectorAll(".no-print");
  btns.forEach((b) => b.style.visibility = "hidden");

  try {
    const canvas = await html2canvas(cert, {
      backgroundColor: "#f0e8d8",
      scale: 2,
      useCORS: true
    });

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const name = $("detailBody").querySelector(".cert-name")?.textContent || "grave";
      a.download = name.replace(/[^a-z0-9]/gi, "_").toLowerCase() + "_certificate.png";
      a.click();
      URL.revokeObjectURL(url);
    });
  } catch (err) {
    alert("could not generate image.");
  } finally {
    btns.forEach((b) => b.style.visibility = "visible");
  }
});

$("randomBtn").addEventListener("click", async () => {
  const res = await fetch("/api/random");
  if (!res.ok) {
    alert("the cemetery is empty.");
    return;
  }
  const g = await res.json();
  openDetail(g.id);
});

async function loadNotes(graveId) {
  const res = await fetch(`/api/graves/${graveId}/notes`);
  const notes = await res.json();
  const box = $("notesList");

  if (!notes.length) {
    box.innerHTML = `<div class="notes-empty">no notes yet.</div>`;
    return;
  }

  box.innerHTML = notes.map((n) => `
    <div class="note-item">
      <div class="note-text">
        ${escapeHtml(n.text)}
        <span class="note-date">${formatShortDate(n.created_at)}</span>
      </div>
      <button class="note-del" data-id="${n.id}">×</button>
    </div>
  `).join("");

  box.querySelectorAll(".note-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch("/api/notes/" + btn.dataset.id, { method: "DELETE" });
      loadNotes(graveId);
    });
  });
}

$("addNoteBtn").addEventListener("click", async () => {
  if (!currentGraveId) return;
  const text = $("newNoteInput").value.trim();
  if (!text) return;

  await fetch(`/api/graves/${currentGraveId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  $("newNoteInput").value = "";
  loadNotes(currentGraveId);
});

async function loadCategories() {
  const res = await fetch("/api/categories");
  const cats = await res.json();

  const defaults = ["Social Media", "Games", "Entertainment", "Productivity", "Shopping", "School", "Other"];
  const all = Array.from(new Set([...defaults, ...cats]));

  const sel = $("categorySelect");
  sel.innerHTML = all.map((c) => `<option>${escapeHtml(c)}</option>`).join("");

  const list = $("categoryList");
  if (!cats.length) {
    list.innerHTML = `<span style="font-size:12px;color:var(--muted);font-style:italic;">no custom categories yet.</span>`;
  } else {
    list.innerHTML = cats.map((c) => `<span class="cat-chip">${escapeHtml(c)}</span>`).join("");
  }
}

$("addCategoryBtn").addEventListener("click", async () => {
  const name = $("newCategoryInput").value.trim();
  if (!name) return;

  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  if (res.ok) {
    $("newCategoryInput").value = "";
    loadCategories();
  } else {
    alert("category already exists.");
  }
});

async function loadStats() {
  const res = await fetch("/api/stats");
  const s = await res.json();

  const health = s.health_score || 0;
  $("healthBar").style.width = health + "%";
  $("healthScore").textContent = health + "/100";

  const cards = [
    ["total buried", s.total + " apps"],
    ["buried this month", s.this_month + " apps"],
    ["most common cause", `"${s.common_cause.cause}" (${s.common_cause.c})`],
    ["most common category", `${s.common_category.category} (${s.common_category.c})`]
  ];

  if (s.longest) cards.push(["longest survivor", `${s.longest.name} — ${s.longest.age}`]);
  if (s.shortest) cards.push(["shortest life", `${s.shortest.name} — ${s.shortest.age}`]);
  if (s.most_resurrected) cards.push(["most resurrected", `${s.most_resurrected.name} — x${s.most_resurrected.resurrect_count}`]);

  cards.push(["resurrected", s.resurrected_count + " apps"]);

  $("statsBox").innerHTML = cards.map(([k, v]) => `
    <div class="stat-card">
      <span class="label">${escapeHtml(k)}</span>
      <span class="value">${escapeHtml(v)}</span>
    </div>
  `).join("");

  await loadCharts();
  await loadTimeline();
  await loadAchievements();
}

async function loadCharts() {
  const causeRes = await fetch("/api/charts/causes");
  const causeData = await causeRes.json();

  const catRes = await fetch("/api/charts/categories");
  const catData = await catRes.json();

  const colors = [
    "#a08050", "#7a2828", "#d4b878", "#8b6f47", "#5a4f42",
    "#6b2828", "#9a9080", "#c9a878", "#4a4038", "#b89868"
  ];

  if (causeChartInstance) causeChartInstance.destroy();
  if (categoryChartInstance) categoryChartInstance.destroy();

  const textColor = getComputedStyle(document.body).getPropertyValue("--paper").trim() || "#f0e8d8";

  causeChartInstance = new Chart($("causeChart"), {
    type: "bar",
    data: {
      labels: causeData.map((d) => d.label),
      datasets: [{
        label: "buried",
        data: causeData.map((d) => d.value),
        backgroundColor: colors,
        borderColor: "#1a1612",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: textColor, font: { family: "Times New Roman" } },
          grid: { color: "rgba(154, 144, 128, 0.15)" }
        },
        x: {
          ticks: { color: textColor, font: { family: "Times New Roman", size: 11 } },
          grid: { display: false }
        }
      }
    }
  });

  categoryChartInstance = new Chart($("categoryChart"), {
    type: "doughnut",
    data: {
      labels: catData.map((d) => d.label),
      datasets: [{
        data: catData.map((d) => d.value),
        backgroundColor: colors,
        borderColor: "#1a1612",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: textColor,
            font: { family: "Times New Roman", size: 12 }
          }
        }
      }
    }
  });
}

async function loadTimeline() {
  const res = await fetch("/api/timeline");
  const timeline = await res.json();
  const box = $("timelineBox");

  if (!timeline.length) {
    box.innerHTML = `<div class="empty">no history yet.</div>`;
    return;
  }

  box.innerHTML = timeline.map((t) => `
    <div class="timeline-row">
      <span>${escapeHtml(t.year)}</span>
      <span>${t.c} apps buried</span>
    </div>
  `).join("");
}

async function loadAchievements() {
  const res = await fetch("/api/achievements");
  const list = await res.json();
  const box = $("achievementsBox");

  box.innerHTML = list.map((a) => `
    <div class="achievement ${a.unlocked ? "unlocked" : ""}">
      <span class="ach-name">${escapeHtml(a.name)}</span>
      <span class="ach-desc">${escapeHtml(a.desc)}</span>
      ${a.unlocked && a.unlocked_at ? `<span class="ach-date">unlocked ${formatShortDate(a.unlocked_at)}</span>` : ""}
    </div>
  `).join("");
}

async function checkAchievements() {
  const res = await fetch("/api/achievements");
  const list = await res.json();
  const unlockedNow = list.filter((a) => a.unlocked).length;
  const lastCount = parseInt(localStorage.getItem("cemetery_ach_count") || "0");

  if (unlockedNow > lastCount) {
    playSound("achieve");
  }
  localStorage.setItem("cemetery_ach_count", String(unlockedNow));
}

async function loadFlashback() {
  try {
    const res = await fetch("/api/flashback");
    if (!res.ok) return;
    const g = await res.json();
    const banner = $("flashbackBanner");
    const text = $("flashbackText");
    const years = g.years_ago || 1;

    text.textContent = `${years} year${years !== 1 ? "s" : ""} ago, you buried ${g.name}.`;
    banner.classList.remove("hidden");

    banner.addEventListener("click", (e) => {
      if (e.target.id === "flashbackClose") return;
      openDetail(g.id);
    });
  } catch (err) {
    /* silent */
  }
}

$("flashbackClose").addEventListener("click", (e) => {
  e.stopPropagation();
  $("flashbackBanner").classList.add("hidden");
});

$("exportBtn").addEventListener("click", async () => {
  const res = await fetch("/api/export");
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cemetery_backup_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
});

$("importBtn").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    alert("invalid json file.");
    return;
  }

  if (!data.graves || !data.graves.length) {
    alert("no graves found in file.");
    return;
  }

  if (!confirm(`import ${data.graves.length} graves?`)) return;

  await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  e.target.value = "";
  alert("import complete.");
  loadCemetery();
});

$("wipeBtn").addEventListener("click", async () => {
  if (!confirm("wipe the entire cemetery? this cannot be undone.")) return;
  const res = await fetch("/api/graves");
  const list = await res.json();
  for (const g of list) {
    await fetch("/api/graves/" + g.id, { method: "DELETE" });
  }
  alert("cemetery wiped.");
  loadCemetery();
});

loadCemetery();
loadCategories();
loadFlashback();