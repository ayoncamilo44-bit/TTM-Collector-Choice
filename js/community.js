import { supabase } from "./auth.js?v=2";

const TABLE = "community_posts";
const BUCKET = "community-photos";
const PAGE_SIZE = 10;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const feed = $("feedContainer");
const loadMoreBtn = $("loadMorePosts");
const form = $("communityPostForm");
const statusEl = $("communityFormStatus");
const photoInput = $("postPhoto");
const photoPreview = $("postPhotoPreview");
const resultSelect = $("postResult");
const daysWrap = $("postDaysWrap");
const shareModal = $("shareModal");
const editModal = $("postEditModal");
const editForm = $("postEditForm");
const editText = $("postEditText");
const editCount = $("postEditCount");
const editStatus = $("postEditStatus");
const editCancel = $("postEditCancel");

let offset = 0;
let editingId = null;
let currentUser = null;

const RESULT_LABELS = {
  success: "Success - Got it back!",
  pending: "Still Waiting",
  "no-response": "No Response",
  returned: "Returned Unsigned",
  story: "Collector Story"
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showStatus(el, msg, isError) {
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.toggle("text-red-400", isError);
  el.classList.toggle("text-green-400", !isError);
}

function renderPost(p) {
  const mine = currentUser && p.user_id === currentUser.id;
  const days = p.days_to_response != null ? ` · ${esc(p.days_to_response)} days` : "";
  const photo = p.photo_url
    ? `<img src="${esc(p.photo_url)}" alt="Photo shared by a collector" loading="lazy" class="mt-4 rounded-xl max-h-80 border border-darkBorder">`
    : "";
  return `<article class="glass-card rounded-2xl p-6">
    <div class="flex justify-between gap-4 flex-wrap">
      <h2 class="text-lg font-bold text-white">${esc(p.player_name)}</h2>
      <span class="text-xs text-gray-400">${p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}</span>
    </div>
    <p class="text-sm text-accent mt-1">${esc(RESULT_LABELS[p.result] || p.result)}${days}</p>
    <p class="text-gray-300 mt-3 whitespace-pre-line leading-7">${esc(p.experience)}</p>
    ${photo}
    ${mine ? `<button type="button" data-edit="${esc(p.id)}" class="mt-4 text-sm text-accent hover:underline">Edit</button>` : ""}
  </article>`;
}

async function loadPosts(reset = false) {
  if (reset) {
    offset = 0;
    feed.innerHTML = "";
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    feed.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center text-red-400">Couldn't load posts: ${esc(error.message)}</div>`;
    loadMoreBtn.classList.add("hidden");
    return;
  }
  if (reset && data.length === 0) {
    feed.innerHTML = `<div class="glass-card rounded-2xl p-6 text-center text-gray-400">No posts yet. Be the first to share a result!</div>`;
  }
  feed.insertAdjacentHTML("beforeend", data.map(renderPost).join(""));
  offset += data.length;
  loadMoreBtn.classList.toggle("hidden", data.length < PAGE_SIZE);
}

// Share modal
window.openShareModal = () => {
  if (!currentUser) {
    alert("Please sign in with Google before sharing a result.");
    return;
  }
  shareModal.classList.remove("hidden");
};
window.closeShareModal = () => shareModal.classList.add("hidden");

function updateDaysVisibility() {
  daysWrap.classList.toggle("hidden", resultSelect.value === "story");
}
resultSelect.addEventListener("change", updateDaysVisibility);

photoInput.addEventListener("change", () => {
  const f = photoInput.files[0];
  if (!f) {
    photoPreview.classList.add("hidden");
    return;
  }
  photoPreview.src = URL.createObjectURL(f);
  photoPreview.classList.remove("hidden");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    showStatus(statusEl, "Please sign in with Google before sharing.", true);
    return;
  }
  const photo = photoInput.files[0];
  if (photo && photo.size > MAX_PHOTO_BYTES) {
    showStatus(statusEl, "That photo is over 5 MB. Please choose a smaller one.", true);
    return;
  }

  const fd = new FormData(form);
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    let photo_url = null;
    if (photo) {
      const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${currentUser.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, photo, { contentType: photo.type });
      if (upErr) throw new Error("Photo upload: " + upErr.message);
      photo_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }

    const days = fd.get("days_to_response");
    const { error } = await supabase.from(TABLE).insert({
      user_id: currentUser.id,
      player_name: fd.get("player_name").trim(),
      result: fd.get("result"),
      days_to_response: days ? Number(days) : null,
      experience: fd.get("experience").trim(),
      photo_url
    });
    if (error) throw new Error("Post: " + error.message);

    form.reset();
    photoPreview.classList.add("hidden");
    updateDaysVisibility();
    window.closeShareModal();
    showStatus(statusEl, "Shared! Thanks for posting.", false);
    await loadPosts(true);
  } catch (err) {
    showStatus(statusEl, "Couldn't share. " + err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

// Edit your own posts
function updateEditCount() {
  editCount.textContent = `${editText.value.length} / 2000`;
}
function openEdit(id, text) {
  editingId = id;
  editText.value = text;
  updateEditCount();
  editStatus.classList.add("hidden");
  editModal.classList.remove("hidden");
  editModal.classList.add("flex");
}
function closeEdit() {
  editModal.classList.add("hidden");
  editModal.classList.remove("flex");
  editingId = null;
}

feed.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit]");
  if (!btn) return;
  const text = btn.closest("article").querySelector("p.whitespace-pre-line").textContent;
  openEdit(btn.dataset.edit, text);
});
editText.addEventListener("input", updateEditCount);
editCancel.addEventListener("click", closeEdit);
editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await supabase
    .from(TABLE)
    .update({ experience: editText.value.trim() })
    .eq("id", editingId)
    .eq("user_id", currentUser.id);
  if (error) {
    showStatus(editStatus, "Couldn't save: " + error.message, true);
    return;
  }
  closeEdit();
  await loadPosts(true);
});

loadMoreBtn.addEventListener("click", () => loadPosts(false));

// Start up
(async function init() {
  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user ?? null;
  supabase.auth.onAuthStateChange((_e, session) => {
    currentUser = session?.user ?? null;
  });
  updateDaysVisibility();
  await loadPosts(true);
})();
