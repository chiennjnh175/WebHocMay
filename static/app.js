"use strict";
import { syncVideos } from "./video-sync.mjs";
import { enhanceGlassDropdowns } from "./dropdowns.mjs";
const $ = (id) => document.getElementById(id);
const fileInput = $("file");
const generate = $("generate");
const choose = $("choose");
const download = $("download");
const confidence = $("confidence");
const confidenceNumber = $("confidence-number");
const modelSelect = $("model-select");
enhanceGlassDropdowns([modelSelect]);
let selectedFile = null;
let previewURL = null;
let resultURL = null;
let resultKind = null;
let busy = false;
let disposeVideoSync = null;

function clearSync() {
  if (disposeVideoSync) disposeVideoSync();
  disposeVideoSync = null;
  document.querySelectorAll("video").forEach((video) => video.pause());
}

function clearPanel(id) {
  const panel = $(id);
  panel.querySelectorAll("img, video").forEach((media) => { media.removeAttribute("src"); media.remove(); });
  panel.classList.remove("has-media");
}

function showMedia(panelId, url, kind) {
  clearPanel(panelId);
  const media = document.createElement(kind === "image" ? "img" : "video");
  if (kind === "image") media.alt = panelId === "original-panel" ? "Bản gốc" : "Kết quả phát hiện";
  else { media.controls = true; media.playsInline = true; media.preload = "metadata"; media.muted = true; }
  media.src = url;
  $(panelId).append(media);
  $(panelId).classList.add("has-media");
  return media;
}

function setBusy(value) {
  busy = value;
  choose.disabled = value;
  generate.disabled = value || !selectedFile;
  confidence.disabled = value;
  confidenceNumber.disabled = value;
  modelSelect.disabled = value;
  modelSelect.dispatchEvent(new Event('change'));
  download.disabled = value || !resultURL;
  $("loading").hidden = !value;
  $("workspace").setAttribute("aria-busy", String(value));
}

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}

function updateSlider(syncNumber = true) {
  const percent = (Number(confidence.value) - 1) / 99 * 100;
  $("progress").style.width = `${percent}%`;
  $("thumb").style.left = `${percent}%`;
  if (syncNumber) confidenceNumber.value = (Number(confidence.value) / 100).toFixed(2);
}
confidence.addEventListener("input", () => updateSlider());
confidenceNumber.addEventListener("input", () => {
  const value = confidenceNumber.valueAsNumber;
  if (Number.isFinite(value) && value >= .01 && value <= 1) {
    confidence.value = Math.round(value * 100);
    updateSlider(false);
  }
});
confidenceNumber.addEventListener("change", () => {
  const value = confidenceNumber.valueAsNumber;
  if (Number.isFinite(value)) confidence.value = Math.round(Math.max(.01, Math.min(1, value)) * 100);
  updateSlider();
});
confidence.addEventListener("pointerdown", () => $("thumb").classList.add("active"));
for (const event of ["pointerup", "pointercancel", "blur"]) window.addEventListener(event, () => $("thumb").classList.remove("active"));
updateSlider();

choose.addEventListener("click", () => { fileInput.value = ""; fileInput.click(); });
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file || busy) return;
  clearSync();
  clearPanel("original-panel");
  clearPanel("result-panel");
  if (previewURL) URL.revokeObjectURL(previewURL);
  selectedFile = file;
  resultURL = null;
  resultKind = /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name) ? "image" : "video";
  previewURL = URL.createObjectURL(file);
  showMedia("original-panel", previewURL, resultKind);
  showError("");
  setBusy(false);
});

async function readJSON(response) {
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Không nhận được phản hồi từ máy chủ."); }
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Yêu cầu không hợp lệ.");
  return data;
}

generate.addEventListener("click", async () => {
  if (!selectedFile || busy) return;
  clearSync();
  resultURL = null;
  clearPanel("result-panel");
  showError("");
  $("job-progress").value = "0%";
  setBusy(true);
  try {
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("confidence", String(Number(confidence.value) / 100));
    form.append("model_id", modelSelect.value);
    const { id } = await readJSON(await fetch("/api/jobs", { method: "POST", body: form }));
    for (;;) {
      const job = await readJSON(await fetch(`/api/jobs/${id}`, { cache: "no-store" }));
      $("job-progress").value = `${job.progress}%`;
      if (job.status === "error") throw new Error(job.error);
      if (job.status === "done") {
        resultURL = job.result;
        resultKind = job.kind;
        const left = showMedia("original-panel", job.original, job.kind);
        const right = showMedia("result-panel", job.result, job.kind);
        if (job.kind === "video") disposeVideoSync = syncVideos(left, right, showError);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  } catch (error) { showError(error.message || "Không kết nối được máy chủ."); }
  finally { setBusy(false); }
});

download.addEventListener("click", async () => {
  if (!resultURL) return;
  download.disabled = true;
  try {
    const response = await fetch(resultURL);
    if (!response.ok) throw new Error("Kết quả đã hết hạn.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `result.${resultKind === "video" ? "mp4" : "jpg"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) { showError(error.message); }
  finally { download.disabled = !resultURL; }
});

window.addEventListener("beforeunload", () => { if (previewURL) URL.revokeObjectURL(previewURL); });
