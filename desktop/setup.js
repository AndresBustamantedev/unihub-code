"use strict";

const $ = (id) => document.getElementById(id);
let renewingToken = false;

async function init() {
  const cfg = await window.unihubSetup.get();
  if (!cfg) return;
  $("canvasBaseUrl").value = cfg.canvasBaseUrl;
  if (cfg.hasCanvasToken) {
    $("canvasToken").placeholder = "Guardado · escribe uno nuevo solo si quieres cambiarlo";
  } else {
    $("canvasToken").required = true;
  }
  if (cfg.hasOpenAiKey) {
    $("openaiKey").placeholder = "Guardada · escribe una nueva solo si quieres cambiarla";
    $("removeRow").hidden = false;
  }
  const model = document.querySelector(`input[name="openaiModel"][value="${cfg.openaiModel}"]`) || document.querySelector('input[name="openaiModel"]');
  model.checked = true;
  $("save").textContent = cfg.hasCanvasToken ? "Guardar" : "Guardar y abrir UniHub";
  const renewing = cfg.reason === "token";
  renewingToken = renewing;
  if (renewing) {
    $("tokenNotice").hidden = false;
    $("canvasToken").required = true;
    $("canvasToken").placeholder = "Pega aquí el token nuevo";
  }
  (cfg.hasCanvasToken && !renewing ? $("openaiKey") : $("canvasToken")).focus();

  $("openCanvas").addEventListener("click", (e) => {
    e.preventDefault();
    const base = $("canvasBaseUrl").value.replace(/\/api\/v1\/?$/, "");
    void window.unihubSetup.openExternal(`${base}/profile/settings`);
  });
  $("openOpenAI").addEventListener("click", (e) => {
    e.preventDefault();
    void window.unihubSetup.openExternal("https://platform.openai.com/api-keys");
  });
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("error");
  err.hidden = true;
  if (renewingToken && !$("canvasToken").value.trim()) {
    err.textContent = "Pega el token nuevo de Canvas.";
    err.hidden = false;
    $("canvasToken").focus();
    return;
  }
  $("save").disabled = true;
  $("save").textContent = "Comprobando con Canvas…";
  const data = {
    canvasBaseUrl: $("canvasBaseUrl").value,
    canvasToken: $("canvasToken").value,
    openaiKey: $("openaiKey").value,
    openaiModel: (document.querySelector('input[name="openaiModel"]:checked') || {}).value,
    removeOpenAi: $("removeOpenAi").checked,
  };
  const r = await window.unihubSetup.save(data);
  if (!r || !r.ok) {
    err.textContent = (r && r.error) || "No se pudo guardar.";
    err.hidden = false;
    $("save").disabled = false;
    $("save").textContent = "Guardar";
  }
});

void init();
