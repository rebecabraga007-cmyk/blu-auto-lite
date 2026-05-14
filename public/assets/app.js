const MODEL_OPTIONS = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"],
  mistral: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest", "ministral-8b-latest"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"]
};

const ONBOARDING_KEY = "bluLiteOnboardingDone";
const ONBOARDING_STEPS = [
  {
    tab: "scripts",
    target: "action",
    title: "Escolha o script",
    text: "Comece escolhendo o que quer fazer com a planilha: validar telefones pelo Dono do Zap, formatar, avaliar ICP, validar tempo/MEI ou unificar empresas e sócios.",
    tip: "Nesta versão não existe Meetime. Ela foi feita para rodar só os scripts independentes."
  },
  {
    tab: "scripts",
    target: "drop",
    title: "Envie sua planilha",
    text: "Depois de escolher o script, envie um CSV ou XLSX. Se a planilha tiver abas, o painel detecta e deixa você selecionar quais abas devem ser processadas.",
    tip: "Os arquivos enviados são temporários. O servidor apaga o upload ao final da requisição."
  },
  {
    tab: "settings",
    target: "aiProvider",
    title: "Configure a IA",
    text: "Na engrenagem você escolhe o provedor de IA: GPT, Claude, Mistral, Gemini ou DeepSeek. Em seguida escolha o modelo mais adequado para sua chave.",
    tip: "A IA é usada no Avaliar ICP e também para corrigir cabeçalhos quando a planilha usa nomes diferentes, como Telemóvel no lugar de Telefone."
  },
  {
    tab: "settings",
    target: "aiToken",
    title: "Cole o token da sua IA",
    text: "O token é a chave de API do seu provedor de IA. Você cola aqui, salva neste navegador e o painel envia essa chave só durante o processamento.",
    tip: "O token não é gravado no banco do servidor. Ele fica no localStorage deste navegador."
  },
  {
    tab: "settings",
    target: "saveAiBtn",
    title: "O que é BYOK?",
    text: "BYOK significa Bring Your Own Key: traga sua própria chave. Na prática, cada usuário usa a própria conta de IA, com seus próprios limites, custos e permissões.",
    tip: "Isso evita colocar uma chave única da empresa dentro do sistema e dá mais controle sobre consumo e segurança."
  },
  {
    tab: "scripts",
    target: "runBtn",
    title: "Execute e baixe",
    text: "Com a planilha e as configurações prontas, clique em Executar. O painel mostra o progresso e libera o botão de download quando terminar.",
    tip: "Se faltar uma coluna obrigatória, o sistema tenta corrigir com IA antes de rodar. Se ainda faltar, ele mostra exatamente o que precisa ajustar."
  }
];

const $ = (id) => document.getElementById(id);
const state = { file: null, companyFile: null, partnerFile: null };
let onboardingIndex = 0;

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

async function request(method, url, body) {
  const options = { method };
  if (body instanceof FormData) options.body = body;
  else if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}

function newJobId() {
  return `job-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function logLine(text, kind = "info") {
  const line = document.createElement("div");
  line.innerHTML = `<span class="ts">${new Date().toLocaleTimeString("pt-BR")}</span><span class="${kind}">${escapeHtml(text)}</span>`;
  $("terminal").appendChild(line);
  $("terminal").scrollTop = $("terminal").scrollHeight;
}

function setProgress(job) {
  $("stage").textContent = job.stage || "—";
  const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : (job.status === "done" ? 100 : 5);
  $("bar").style.width = `${pct}%`;
  $("pill").textContent = job.status === "done" ? "concluído" : job.status === "error" ? "erro" : "em execução";
}

async function pollJob(jobId, onJob) {
  let lastDetailCount = 0;
  while (true) {
    const job = await request("GET", `/api/jobs/${encodeURIComponent(jobId)}`);
    onJob(job);
    const details = job.details || [];
    details.slice(lastDetailCount).forEach((detail) => {
      const clean = detail.replace(/^\d+:\d+:\d+ - /, "");
      const lower = clean.toLowerCase();
      const kind = lower.includes("erro") ? "err" : lower.includes("alerta") || lower.includes("nao ") || lower.includes("não ") ? "warn" : "info";
      logLine(clean, kind);
    });
    lastDetailCount = details.length;
    if (["done", "error"].includes(job.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

function switchTab(tab) {
  $("tabScripts").classList.toggle("hidden", tab !== "scripts");
  $("tabSettings").classList.toggle("hidden", tab !== "settings");
  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
}

function clearTourTarget() {
  document.querySelectorAll(".tour-target").forEach((item) => item.classList.remove("tour-target"));
}

function renderOnboarding() {
  const step = ONBOARDING_STEPS[onboardingIndex];
  switchTab(step.tab);
  clearTourTarget();
  $("onboardingStepTitle").textContent = step.title;
  $("onboardingStepText").textContent = step.text;
  $("onboardingTip").textContent = step.tip;
  $("prevOnboardingBtn").disabled = onboardingIndex === 0;
  $("nextOnboardingBtn").textContent = onboardingIndex === ONBOARDING_STEPS.length - 1 ? "Concluir" : "Próximo";
  $("onboardingDots").innerHTML = ONBOARDING_STEPS.map((_, index) =>
    `<span class="onboarding-dot ${index === onboardingIndex ? "active" : ""}"></span>`
  ).join("");

  window.setTimeout(() => {
    const target = $(step.target);
    if (!target) return;
    target.classList.add("tour-target");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 80);
}

function openOnboarding(force = false) {
  if (!force && localStorage.getItem(ONBOARDING_KEY) === "yes") return;
  onboardingIndex = 0;
  $("onboarding").classList.remove("hidden");
  renderOnboarding();
}

function closeOnboarding(done = true) {
  $("onboarding").classList.add("hidden");
  clearTourTarget();
  if (done) localStorage.setItem(ONBOARDING_KEY, "yes");
}

function nextOnboarding() {
  if (onboardingIndex >= ONBOARDING_STEPS.length - 1) {
    closeOnboarding(true);
    return;
  }
  onboardingIndex += 1;
  renderOnboarding();
}

function previousOnboarding() {
  onboardingIndex = Math.max(0, onboardingIndex - 1);
  renderOnboarding();
}

function syncAction() {
  const action = $("action").value;
  $("singleFileBlock").classList.toggle("hidden", action === "uni");
  $("unifyBlock").classList.toggle("hidden", action !== "uni");
  $("icpBlock").classList.toggle("hidden", action !== "enrich");
}

function fillModels() {
  const provider = $("aiProvider").value;
  $("aiModel").innerHTML = (MODEL_OPTIONS[provider] || MODEL_OPTIONS.openai)
    .map((model) => `<option value="${model}">${model}</option>`)
    .join("");
}

function loadAiSettings() {
  const settings = JSON.parse(localStorage.getItem("bluLiteAi") || "{}");
  $("aiProvider").value = settings.aiProvider || "openai";
  fillModels();
  $("aiModel").value = settings.aiModel || MODEL_OPTIONS[$("aiProvider").value][0];
  $("aiToken").value = settings.aiToken || "";
  $("aiStatus").textContent = settings.aiToken ? `${$("aiProvider").value} / ${$("aiModel").value}` : "não";
}

function saveAiSettings() {
  const settings = {
    aiProvider: $("aiProvider").value,
    aiModel: $("aiModel").value,
    aiToken: $("aiToken").value
  };
  localStorage.setItem("bluLiteAi", JSON.stringify(settings));
  loadAiSettings();
  switchTab("scripts");
}

function aiSettingsForRequest() {
  return JSON.parse(localStorage.getItem("bluLiteAi") || "{}");
}

function renderSheets(host, sheets) {
  if (!sheets || sheets.length <= 1) {
    host.style.display = "none";
    host.innerHTML = "";
    return;
  }
  host.style.display = "block";
  host.innerHTML = `
    <div class="card" style="box-shadow:none;background:var(--surface-soft);padding:12px;">
      <div style="font-size:13px;font-weight:800;margin-bottom:8px;">Abas detectadas: ${sheets.length}</div>
      <div class="sheet-list">
        ${sheets.map((sheet) => `
          <label>
            <input type="checkbox" data-sheet-name="${escapeHtml(sheet.name)}" ${sheet.selected ? "checked" : ""}/>
            <span>${escapeHtml(sheet.name)}${sheet.rowCount != null ? ` (${sheet.rowCount})` : ""}</span>
          </label>
        `).join("")}
      </div>
    </div>`;
}

async function detectSheets(file, host) {
  host.style.display = "none";
  host.innerHTML = "";
  if (!file || !/\.xls[xm]?$/i.test(file.name)) return;
  host.style.display = "block";
  host.innerHTML = `<div class="sub">Detectando abas...</div>`;
  const fd = new FormData();
  fd.append("file", file);
  const res = await request("POST", "/api/workbook/sheets", fd);
  renderSheets(host, res.sheets || []);
}

function selectedSheets(host) {
  return Array.from(host.querySelectorAll("input[data-sheet-name]:checked")).map((input) => input.dataset.sheetName);
}

function attachFilePicker(drop, input, callback) {
  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", () => callback(input.files[0] || null));
  ["dragenter", "dragover"].forEach((eventName) => drop.addEventListener(eventName, (event) => event.preventDefault()));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    callback(event.dataTransfer.files[0] || null);
  });
}

async function runProcess(event) {
  event.preventDefault();
  const action = $("action").value;
  const jobId = newJobId();
  const fd = new FormData();
  const ai = aiSettingsForRequest();

  fd.append("action", action);
  fd.append("jobId", jobId);
  fd.append("aiProvider", ai.aiProvider || "openai");
  fd.append("aiModel", ai.aiModel || "");
  fd.append("aiToken", ai.aiToken || "");

  if (action === "uni") {
    if (!state.companyFile || !state.partnerFile) throw new Error("Envie empresas e sócios.");
    fd.append("companyFile", state.companyFile);
    fd.append("partnerFile", state.partnerFile);
    const companySheets = selectedSheets($("companySheets"));
    const partnerSheets = selectedSheets($("partnerSheets"));
    if (companySheets.length) fd.append("companySheetNames", JSON.stringify(companySheets));
    if (partnerSheets.length) fd.append("partnerSheetNames", JSON.stringify(partnerSheets));
  } else {
    if (!state.file) throw new Error("Envie uma planilha.");
    fd.append("file", state.file);
    const sheets = selectedSheets($("sheetSelector"));
    if (sheets.length) fd.append("sheetNames", JSON.stringify(sheets));
  }

  if (action === "enrich") fd.append("icpDescription", $("icpDescription").value);

  $("runBtn").disabled = true;
  $("download").style.display = "none";
  $("download").innerHTML = "";
  $("terminal").innerHTML = "";
  $("statusTitle").textContent = $("action").selectedOptions[0].textContent;
  logLine("Iniciando...");
  setProgress({ stage: "Preparando", status: "running" });

  const poll = pollJob(jobId, setProgress).catch(() => {});
  try {
    const res = await request("POST", "/api/process", fd);
    await poll;
    setProgress({ stage: "Concluído", status: "done", total: res.rows, done: res.rows });
    logLine(`✓ ${res.rows} linhas processadas`, "ok");
    (res.logs || []).forEach((item) => logLine(item));
    $("download").innerHTML = `<a class="btn btn-primary" href="${res.downloadUrl}">Baixar ${escapeHtml(res.fileName)}</a>`;
    $("download").style.display = "block";
  } catch (error) {
    setProgress({ stage: "Erro", status: "error" });
    logLine(`✗ ${error.message}`, "err");
  } finally {
    $("runBtn").disabled = false;
  }
}

document.querySelectorAll(".nav button").forEach((button) => {
  if (!button.dataset.tab) return;
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});
$("openSettingsBtn").addEventListener("click", () => switchTab("settings"));
$("reopenOnboardingBtn").addEventListener("click", () => openOnboarding(true));
$("skipOnboardingBtn").addEventListener("click", () => closeOnboarding(true));
$("nextOnboardingBtn").addEventListener("click", nextOnboarding);
$("prevOnboardingBtn").addEventListener("click", previousOnboarding);
$("action").addEventListener("change", syncAction);
$("aiProvider").addEventListener("change", fillModels);
$("saveAiBtn").addEventListener("click", saveAiSettings);
$("clearAiBtn").addEventListener("click", () => {
  localStorage.removeItem("bluLiteAi");
  loadAiSettings();
});
$("processForm").addEventListener("submit", (event) => {
  runProcess(event).catch((error) => logLine(`✗ ${error.message}`, "err"));
});

attachFilePicker($("drop"), $("file"), async (file) => {
  state.file = file;
  $("fileName").textContent = file ? file.name : "CSV ou XLSX";
  await detectSheets(file, $("sheetSelector"));
});
$("companyFile").addEventListener("change", async (event) => {
  state.companyFile = event.target.files[0] || null;
  await detectSheets(state.companyFile, $("companySheets"));
});
$("partnerFile").addEventListener("change", async (event) => {
  state.partnerFile = event.target.files[0] || null;
  await detectSheets(state.partnerFile, $("partnerSheets"));
});

loadAiSettings();
syncAction();
openOnboarding(false);
