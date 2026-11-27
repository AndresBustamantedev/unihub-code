"use strict";

const $ = (id) => document.getElementById(id);
let renewingToken = false;

async function init() {
  const cfg = await window.unihubSetup.get();
  if (!cfg) return;
  $("canvasBaseUrl").value = cfg.canvasBaseUrl ? cfg.canvasBaseUrl.replace(/^https:\/\//, "").replace(/\/api\/v1$/, "") : "";
  const known = (await window.unihubSetup.knownSchools()) || [];
  const current = known.find((k) => $("canvasBaseUrl").value === k.domain);
  if (current) $("school").value = current.name;
  setupSchoolSearch();
  // La demo se ofrece mientras no haya un Canvas configurado (o si ya se está en ella).
  if (!cfg.hasCanvasToken && !cfg.demo) $("demoRow").hidden = false;
  $("demo").addEventListener("click", async () => {
    $("demo").disabled = true;
    $("demo").textContent = "Preparando la demo…";
    const r = await window.unihubSetup.startDemo();
    if (!r || !r.ok) {
      showError((r && r.error) || "No se pudo abrir la demo.");
      $("demo").disabled = false;
      $("demo").textContent = "Probar con datos de ejemplo";
    }
  });
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
  $("save").textContent = cfg.demo ? "Conectar mi Canvas" : cfg.hasCanvasToken ? "Guardar" : "Guardar y abrir UniHub";
  const renewing = cfg.reason === "token";
  renewingToken = renewing;
  if (renewing) {
    $("tokenNotice").hidden = false;
    $("canvasToken").required = true;
    $("canvasToken").placeholder = "Pega aquí el token nuevo";
  }
  (!cfg.canvasBaseUrl ? $("school") : cfg.hasCanvasToken && !renewing ? $("openaiKey") : $("canvasToken")).focus();

  $("openCanvas").addEventListener("click", (e) => {
    e.preventDefault();
    const host = campusHost();
    if (!host) {
      showError("Primero elige tu universidad o escribe la dirección de tu campus.");
      $("school").focus();
      return;
    }
    void window.unihubSetup.openExternal(`https://${host}/profile/settings`);
  });
  $("openOpenAI").addEventListener("click", (e) => {
    e.preventDefault();
    void window.unihubSetup.openExternal("https://platform.openai.com/api-keys");
  });
}

/** Dominio del campus a partir de lo escrito («https://campus.x.es/courses» → «campus.x.es»). */
function campusHost() {
  const v = $("canvasBaseUrl").value.trim();
  if (!v) return "";
  try {
    return new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`).hostname;
  } catch {
    return "";
  }
}

function showError(text) {
  $("error").textContent = text;
  $("error").hidden = false;
}

/** Buscador de universidades: lista corta conocida + el buscador público de Canvas. */
function setupSchoolSearch() {
  const input = $("school");
  const list = $("schoolList");
  let items = [];
  let active = -1;
  let timer = null;
  let seq = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    active = -1;
  };
  const choose = (it) => {
    input.value = it.name;
    $("canvasBaseUrl").value = it.domain;
    $("schoolHint").textContent = `Campus: ${it.domain}. Si no es el tuyo, cambia la dirección de abajo.`;
    close();
    $("canvasToken").focus();
  };
  const render = (msg) => {
    list.replaceChildren();
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = msg || "No aparece: escribe abajo la dirección de tu campus.";
      list.append(li);
    }
    items.forEach((it, i) => {
      const li = document.createElement("li");
      li.id = `school-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      li.textContent = it.name;
      const small = document.createElement("small");
      small.textContent = it.domain;
      li.append(small);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        choose(it);
      });
      list.append(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", `school-${active}`);
    else input.removeAttribute("aria-activedescendant");
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) return close();
    timer = setTimeout(async () => {
      const mine = ++seq;
      items = [];
      active = -1;
      render("Buscando…");
      const found = (await window.unihubSetup.searchSchools(q)) || [];
      if (mine !== seq) return;
      items = found;
      render();
    }, 300);
  });
  input.addEventListener("keydown", (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      close();
    }
  });
  input.addEventListener("blur", () => setTimeout(close, 100));
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("error");
  err.hidden = true;
  if (!campusHost()) {
    showError("Elige tu universidad o escribe la dirección de tu campus Canvas.");
    $("school").focus();
    return;
  }
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
