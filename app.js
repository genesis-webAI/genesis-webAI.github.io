const LEGACY_STORAGE_KEY = "genesis-studio:v4";
const LEGACY_STORAGE_CHUNK_PREFIX = `${LEGACY_STORAGE_KEY}:chunk:`;
const DB_NAME = "genesis-studio-db";
const DB_VERSION = 1;
const DB_STORE_NAME = "genesis-state";
const DB_STATE_KEY = "app-state";
const MAX_REVISIONS = 40;
const COMMAND_BLOCK_REGEX = /```genesis-commands\s*([\s\S]*?)```/i;
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];

const els = {
  themeToggleBtn: document.querySelector("#themeToggleBtn"),
  projectSelect: document.querySelector("#projectSelect"),
  newProjectBtn: document.querySelector("#newProjectBtn"),
  renameProjectBtn: document.querySelector("#renameProjectBtn"),
  duplicateProjectBtn: document.querySelector("#duplicateProjectBtn"),
  deleteProjectBtn: document.querySelector("#deleteProjectBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  previewFrame: document.querySelector("#previewFrame"),
  previewTitle: document.querySelector("#previewTitle"),
  previewStatus: document.querySelector("#previewStatus"),
  saveStatus: document.querySelector("#saveStatus"),
  storageUsage: document.querySelector("#storageUsage"),
  refreshPreviewBtn: document.querySelector("#refreshPreviewBtn"),
  clearErrorsBtn: document.querySelector("#clearErrorsBtn"),
  debugAiBtn: document.querySelector("#debugAiBtn"),
  errorList: document.querySelector("#errorList"),
  projectDescription: document.querySelector("#projectDescription"),
  projectEmptyState: document.querySelector("#projectEmptyState"),
  saveProjectBtn: document.querySelector("#saveProjectBtn"),
  newFileBtn: document.querySelector("#newFileBtn"),
  fileList: document.querySelector("#fileList"),
  activeFileSelect: document.querySelector("#activeFileSelect"),
  saveFileBtn: document.querySelector("#saveFileBtn"),
  renameFileBtn: document.querySelector("#renameFileBtn"),
  deleteFileBtn: document.querySelector("#deleteFileBtn"),
  codeEditor: document.querySelector("#codeEditor"),
  newAssetBtn: document.querySelector("#newAssetBtn"),
  assetList: document.querySelector("#assetList"),
  activeAssetSelect: document.querySelector("#activeAssetSelect"),
  saveAssetBtn: document.querySelector("#saveAssetBtn"),
  renameAssetBtn: document.querySelector("#renameAssetBtn"),
  deleteAssetBtn: document.querySelector("#deleteAssetBtn"),
  assetEditor: document.querySelector("#assetEditor"),
  importAssetBtn: document.querySelector("#importAssetBtn"),
  assetImportInput: document.querySelector("#assetImportInput"),
  imageEditorCard: document.querySelector("#imageEditorCard"),
  imageEditorCanvas: document.querySelector("#imageEditorCanvas"),
  imageBrightness: document.querySelector("#imageBrightness"),
  imageContrast: document.querySelector("#imageContrast"),
  imageSaturation: document.querySelector("#imageSaturation"),
  imageRotation: document.querySelector("#imageRotation"),
  applyImageEditsBtn: document.querySelector("#applyImageEditsBtn"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  modelSelect: document.querySelector("#modelSelect"),
  promptInput: document.querySelector("#promptInput"),
  runAiBtn: document.querySelector("#runAiBtn"),
  aiSettingsBtn: document.querySelector("#aiSettingsBtn"),
  aiSettingsModal: document.querySelector("#aiSettingsModal"),
  closeAiSettingsBtn: document.querySelector("#closeAiSettingsBtn"),
  aiChatThread: document.querySelector("#aiChatThread"),
  aiImportAssetBtn: document.querySelector("#aiImportAssetBtn"),
  aiAssetImportInput: document.querySelector("#aiAssetImportInput"),
  revisionSelect: document.querySelector("#revisionSelect"),
  revisionMeta: document.querySelector("#revisionMeta"),
  revisionList: document.querySelector("#revisionList"),
  restoreRevisionBtn: document.querySelector("#restoreRevisionBtn"),
  startupGate: document.querySelector("#startupGate"),
  startupApiKeyInput: document.querySelector("#startupApiKeyInput"),
  startupEnterBtn: document.querySelector("#startupEnterBtn"),
  startupMessage: document.querySelector("#startupMessage")
};

const drafts = {
  projectDescription: "",
  fileContent: "",
  assetContent: "",
  dirtyProject: false,
  dirtyFile: false,
  dirtyAsset: false
};

const imageEditorState = {
  image: null
};

function defaultFile() {
  return {
    id: crypto.randomUUID(),
    name: "index.html",
    type: "html",
    content: ""
  };
}

function defaultProject() {
  const file = defaultFile();
  return {
    id: crypto.randomUUID(),
    name: "Genesis Project",
    description: "A multi-file website project built inside Genesis.",
    files: [file],
    assets: [],
    activeFileId: file.id,
    activeAssetId: null,
    activePanel: "filesPanel",
    settings: { model: "gemini-2.5-flash" },
    ai: { apiKey: "", lastPrompt: "", lastSubmittedPrompt: "", lastResponse: "", messages: [] },
    revisions: [],
    previewErrors: [],
    updatedAt: new Date().toISOString()
  };
}

let state;
let dbPromise = null;
let saveQueue = Promise.resolve();
let booted = false;

void boot();

async function boot() {
  state = await loadState();
  init();
  booted = true;
}

function init() {
  MODELS.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    els.modelSelect.append(option);
  });

  getActiveProject().activePanel = "filesPanel";
  bindEvents();
  syncDraftsFromProject();
  render();
  refreshPreview();
  updateStartupGate();
}

function bindEvents() {
  window.addEventListener("message", handlePreviewMessage);

  els.themeToggleBtn.addEventListener("click", toggleTheme);
  els.projectSelect.addEventListener("change", onProjectChange);
  els.newProjectBtn.addEventListener("click", createProject);
  els.renameProjectBtn.addEventListener("click", renameProject);
  els.duplicateProjectBtn.addEventListener("click", duplicateProject);
  els.deleteProjectBtn.addEventListener("click", deleteProject);
  els.exportBtn.addEventListener("click", exportProjectZip);
  els.importInput.addEventListener("change", importProjectZip);
  els.refreshPreviewBtn.addEventListener("click", refreshPreview);
  els.clearErrorsBtn.addEventListener("click", clearPreviewErrors);
  els.debugAiBtn.addEventListener("click", debugErrorsWithAi);
  els.restoreRevisionBtn.addEventListener("click", restoreSelectedRevision);
  els.revisionSelect.addEventListener("change", renderRevisionMeta);

  document.querySelectorAll(".dock-tab").forEach((button) => {
    button.addEventListener("click", () => {
      getActiveProject().activePanel = button.dataset.panel;
      renderDockTabs();
      persistState();
    });
  });

  els.projectDescription.addEventListener("input", () => {
    drafts.projectDescription = els.projectDescription.value;
    drafts.dirtyProject = true;
    updateSaveButtons();
  });
  els.saveProjectBtn.addEventListener("click", saveProjectDraft);

  els.newFileBtn.addEventListener("click", () => createEntity("file"));
  els.activeFileSelect.addEventListener("change", onFileChange);
  els.codeEditor.addEventListener("input", () => {
    drafts.fileContent = els.codeEditor.value;
    drafts.dirtyFile = true;
    updateDiffInfo();
    updateSaveButtons();
  });
  els.saveFileBtn.addEventListener("click", saveFileDraft);
  els.renameFileBtn.addEventListener("click", () => renameEntity("file"));
  els.deleteFileBtn.addEventListener("click", () => deleteEntity("file"));

  els.newAssetBtn.addEventListener("click", () => createEntity("asset"));
  els.importAssetBtn.addEventListener("click", () => els.assetImportInput.click());
  els.assetImportInput.addEventListener("change", importAssetFromFile);
  els.activeAssetSelect.addEventListener("change", onAssetChange);
  els.assetEditor.addEventListener("input", () => {
    drafts.assetContent = els.assetEditor.value;
    drafts.dirtyAsset = true;
    updateSaveButtons();
  });
  els.saveAssetBtn.addEventListener("click", saveAssetDraft);
  els.renameAssetBtn.addEventListener("click", () => renameEntity("asset"));
  els.deleteAssetBtn.addEventListener("click", () => deleteEntity("asset"));
  els.applyImageEditsBtn.addEventListener("click", applyImageEdits);
  [els.imageBrightness, els.imageContrast, els.imageSaturation, els.imageRotation].forEach((input) => {
    input.addEventListener("input", renderImageEditorPreview);
  });

  els.apiKeyInput.addEventListener("input", () => {
    getActiveProject().ai.apiKey = els.apiKeyInput.value.trim();
    persistState();
    updateStartupGate();
  });
  els.modelSelect.addEventListener("change", () => {
    getActiveProject().settings.model = els.modelSelect.value;
    persistState();
  });
  els.promptInput.addEventListener("input", () => {
    getActiveProject().ai.lastPrompt = els.promptInput.value;
    persistState();
  });
  els.aiSettingsBtn.addEventListener("click", () => {
    els.aiSettingsModal.classList.remove("hidden");
  });
  els.closeAiSettingsBtn.addEventListener("click", closeAiSettingsModal);
  els.aiSettingsModal.addEventListener("click", (event) => {
    if (event.target === els.aiSettingsModal) {
      closeAiSettingsModal();
    }
  });
  els.aiImportAssetBtn.addEventListener("click", () => els.aiAssetImportInput.click());
  els.aiAssetImportInput.addEventListener("change", importAssetFromFile);
  els.runAiBtn.addEventListener("click", runGemini);

  els.startupEnterBtn.addEventListener("click", enterWithStartupKey);
  els.startupApiKeyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      enterWithStartupKey();
    }
  });
}

async function loadState() {
  const fallbackState = createFreshState();

  if (!("indexedDB" in window)) {
    els.saveStatus.textContent = "IndexedDB is unavailable in this browser.";
    return loadLegacyLocalState();
  }

  try {
    const stored = await readStateFromDb();
    if (stored) {
      return normalizeState(stored);
    }

    if (hasLegacyLocalState()) {
      const legacyState = loadLegacyLocalState();
      await writeStateToDb(legacyState);
      clearLegacyStorageNamespace();
      return legacyState;
    }
  } catch (error) {
    console.error("Genesis could not load IndexedDB state.", error);
    els.saveStatus.textContent = "Genesis could not open IndexedDB. Starting fresh.";
    return loadLegacyLocalState();
  }

  return fallbackState;
}

function persistState() {
  if (!state || !booted) {
    return;
  }

  state.projects = state.projects.map((project) => ({ ...project, updatedAt: new Date().toISOString() }));
  const snapshot = JSON.parse(JSON.stringify(state));

  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      await writeStateToDb(snapshot);
      els.saveStatus.textContent = `Saved to IndexedDB at ${new Date().toLocaleTimeString()}`;
      updateStorageUsage();
    })
    .catch((error) => {
      console.error("Genesis could not save IndexedDB state.", error);
      els.saveStatus.textContent = "IndexedDB save failed. Export a ZIP to keep working.";
    });
}

function createFreshState() {
  const project = defaultProject();
  return { theme: "dark", activeProjectId: project.id, projects: [project] };
}

function normalizeState(parsed) {
  const projects = Array.isArray(parsed.projects) && parsed.projects.length ? parsed.projects.map(normalizeProject) : [defaultProject()];
  return {
    theme: parsed.theme === "light" ? "light" : "dark",
    activeProjectId: projects.some((project) => project.id === parsed.activeProjectId) ? parsed.activeProjectId : projects[0].id,
    projects
  };
}

function loadLegacyLocalState() {
  const manifestRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!manifestRaw) {
    return createFreshState();
  }

  try {
    const manifest = JSON.parse(manifestRaw);
    const serialized = Array.from(
      { length: manifest.chunkCount },
      (_, index) => localStorage.getItem(`${LEGACY_STORAGE_CHUNK_PREFIX}${index}`) || ""
    ).join("");
    return normalizeState(JSON.parse(serialized));
  } catch (error) {
    clearLegacyStorageNamespace();
    return createFreshState();
  }
}

function hasLegacyLocalState() {
  return Boolean(localStorage.getItem(LEGACY_STORAGE_KEY));
}

function openGenesisDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
        db.createObjectStore(DB_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
  });

  return dbPromise;
}

async function withStateStore(mode, handler) {
  const db = await openGenesisDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE_NAME, mode);
    const store = transaction.objectStore(DB_STORE_NAME);

    let handledResult;
    try {
      handledResult = handler(store, transaction);
    } catch (error) {
      reject(error);
      return;
    }

    transaction.oncomplete = () => resolve(handledResult);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
  });
}

async function readStateFromDb() {
  return withStateStore("readonly", (store) => new Promise((resolve, reject) => {
    const request = store.get(DB_STATE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Failed to read IndexedDB state."));
  }));
}

async function writeStateToDb(value) {
  return withStateStore("readwrite", (store) => new Promise((resolve, reject) => {
    const request = store.put(value, DB_STATE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to write IndexedDB state."));
  }));
}

function normalizeProject(project) {
  const files = Array.isArray(project.files) && project.files.length
    ? project.files.map((file) => ({
        id: file.id || crypto.randomUUID(),
        name: file.name || "untitled.txt",
        type: file.type || inferType(file.name || "untitled.txt", true),
        content: String(file.content || "")
      }))
    : [defaultFile()];

  const assets = Array.isArray(project.assets)
    ? project.assets.map((asset) => ({
        id: asset.id || crypto.randomUUID(),
        name: asset.name || "asset.txt",
        type: asset.type || inferType(asset.name || "asset.txt", false),
        content: String(asset.content || "")
      }))
    : [];

  return {
    id: project.id || crypto.randomUUID(),
    name: project.name || "Genesis Project",
    description: project.description || "",
    files,
    assets,
    activeFileId: files.some((file) => file.id === project.activeFileId) ? project.activeFileId : files[0].id,
    activeAssetId: assets.some((asset) => asset.id === project.activeAssetId) ? project.activeAssetId : assets[0]?.id || null,
    activePanel: "filesPanel",
    settings: { model: MODELS.includes(project.settings?.model) ? project.settings.model : "gemini-2.5-flash" },
    ai: {
      apiKey: project.ai?.apiKey || "",
      lastPrompt: project.ai?.lastPrompt || "",
      lastSubmittedPrompt: project.ai?.lastSubmittedPrompt || "",
      lastResponse: project.ai?.lastResponse || "",
      messages: Array.isArray(project.ai?.messages) ? project.ai.messages : []
    },
    revisions: Array.isArray(project.revisions) ? project.revisions.slice(0, MAX_REVISIONS) : [],
    previewErrors: Array.isArray(project.previewErrors) ? project.previewErrors : [],
    updatedAt: project.updatedAt || new Date().toISOString()
  };
}

function render() {
  renderTheme();
  renderProjectSelect();
  renderDockTabs();
  renderFiles();
  renderAssets();
  renderEditors();
  renderAi();
  renderRevisions();
  renderErrors();
  updateDiffInfo();
  updateSaveButtons();
  updateStorageUsage();
  els.previewTitle.textContent = `${getActiveProject().name} Preview`;
}

function renderTheme() {
  document.body.classList.toggle("dark-mode", state.theme === "dark");
  els.themeToggleBtn.textContent = state.theme === "dark" ? "Light Mode" : "Dark Mode";
}

function renderProjectSelect() {
  const activeProject = getActiveProject();
  els.projectSelect.innerHTML = "";
  state.projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    option.selected = project.id === activeProject.id;
    els.projectSelect.append(option);
  });
}

function renderDockTabs() {
  const panelId = getActiveProject().activePanel || "filesPanel";
  document.querySelectorAll(".dock-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panelId);
  });
  document.querySelectorAll(".dock-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
}

function renderFiles() {
  const project = getActiveProject();
  const activeFile = getActiveFile();
  els.fileList.innerHTML = "";
  els.activeFileSelect.innerHTML = "";

  project.files.forEach((file) => {
    const item = createEntityButton(file.name, `${file.type || "text"} - ${formatSize(file.content.length)}`, file.id === activeFile?.id);
    item.addEventListener("click", () => {
      if (!confirmDiscardUnsaved("file")) {
        return;
      }
      project.activeFileId = file.id;
      syncFileDraft();
      renderFiles();
      renderEditors();
    });
    els.fileList.append(item);

    const option = document.createElement("option");
    option.value = file.id;
    option.textContent = file.name;
    option.selected = file.id === activeFile?.id;
    els.activeFileSelect.append(option);
  });
}

function renderAssets() {
  const project = getActiveProject();
  const activeAsset = getActiveAsset();
  els.assetList.innerHTML = "";
  els.activeAssetSelect.innerHTML = "";

  project.assets.forEach((asset) => {
    const item = createEntityButton(asset.name, `${asset.type || "text/plain"} - ${formatSize(asset.content.length)}`, asset.id === activeAsset?.id);
    item.addEventListener("click", () => {
      if (!confirmDiscardUnsaved("asset")) {
        return;
      }
      project.activeAssetId = asset.id;
      syncAssetDraft();
      renderAssets();
      renderEditors();
    });
    els.assetList.append(item);

    const option = document.createElement("option");
    option.value = asset.id;
    option.textContent = asset.name;
    option.selected = asset.id === activeAsset?.id;
    els.activeAssetSelect.append(option);
  });
}

function renderEditors() {
  els.projectDescription.value = drafts.projectDescription;
  els.codeEditor.value = drafts.fileContent;
  els.assetEditor.value = drafts.assetContent;
  els.projectEmptyState.classList.toggle("hidden", projectHasCode(getActiveProject()));
  renderAssetEditorMode();
}

function renderAi() {
  const project = getActiveProject();
  els.apiKeyInput.value = project.ai.apiKey || "";
  els.modelSelect.value = project.settings.model || "gemini-2.5-flash";
  els.promptInput.value = project.ai.lastPrompt || "";
  renderAiThread();
}

function renderAiThread() {
  const messages = getActiveProject().ai.messages || [];
  els.aiChatThread.innerHTML = "";
  if (!messages.length) {
    const bubble = document.createElement("div");
    bubble.className = "ai-bubble assistant";
    bubble.textContent = "Genesis AI Editor is ready. Ask for changes across files, assets, or debugging help.";
    els.aiChatThread.append(bubble);
  } else {
    messages.forEach((message, index) => {
      const bubble = document.createElement("div");
      bubble.className = `ai-bubble ${message.role}`;
      bubble.textContent = message.text;
      els.aiChatThread.append(bubble);

      const isLast = index === messages.length - 1;
      if (isLast && message.role === "assistant" && !message.isThinking) {
        const retryRow = document.createElement("div");
        retryRow.className = "retry-row";
        const retryBtn = document.createElement("button");
        retryBtn.className = "button ghost small";
        retryBtn.type = "button";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => retryLastAiPrompt());
        retryRow.append(retryBtn);
        els.aiChatThread.append(retryRow);
      }
    });
  }
  els.aiChatThread.scrollTop = els.aiChatThread.scrollHeight;
}

function retryLastAiPrompt() {
  const project = getActiveProject();
  const prompt = (project.ai.lastSubmittedPrompt || "").trim();
  if (!prompt) {
    alert("There is no previous AI prompt to retry.");
    return;
  }
  project.ai.lastPrompt = prompt;
  els.promptInput.value = prompt;
  runGemini();
}

function renderAssetEditorMode() {
  const asset = getActiveAsset();
  const isImage = Boolean(asset && isImageAsset(asset));
  els.imageEditorCard.classList.toggle("hidden", !isImage);
  if (!isImage) {
    imageEditorState.image = null;
    return;
  }
  loadImageIntoEditor(drafts.assetContent);
}

function renderRevisions() {
  const revisions = getActiveProject().revisions;
  els.revisionSelect.innerHTML = "";

  if (!revisions.length) {
    els.revisionMeta.textContent = "No revisions yet.";
    els.revisionList.className = "revision-list empty-state";
    els.revisionList.textContent = "Save files, assets, or AI changes to create revision history automatically.";
    return;
  }

  els.revisionList.className = "revision-list";
  els.revisionList.innerHTML = "";
  revisions.forEach((revision, index) => {
    const option = document.createElement("option");
    option.value = revision.id;
    option.textContent = `${index === 0 ? "Latest" : `Revision ${revisions.length - index}`} - ${formatDateTime(revision.createdAt)}`;
    els.revisionSelect.append(option);

    const button = document.createElement("button");
    button.className = "revision-item";
    button.type = "button";
    button.textContent = `${formatDateTime(revision.createdAt)} - ${revision.label}`;
    button.addEventListener("click", () => {
      els.revisionSelect.value = revision.id;
      renderRevisionMeta();
    });
    els.revisionList.append(button);
  });
  if (!els.revisionSelect.value) {
    els.revisionSelect.value = revisions[0].id;
  }
  renderRevisionMeta();
}

function renderRevisionMeta() {
  const revision = getSelectedRevision();
  els.revisionMeta.textContent = revision
    ? `${revision.label} - ${formatDateTime(revision.createdAt)} - ${revision.snapshot.files.length} files - ${revision.snapshot.assets.length} assets`
    : "No revisions yet.";
}

function renderErrors() {
  const errors = getActiveProject().previewErrors;
  els.errorList.innerHTML = "";
  if (!errors.length) {
    els.errorList.className = "error-list empty-state";
    els.errorList.textContent = "No preview errors detected.";
    els.debugAiBtn.classList.add("hidden");
    return;
  }

  els.errorList.className = "error-list";
  errors.forEach((error) => {
    const template = document.querySelector("#errorItemTemplate");
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".error-title").textContent = error.title;
    node.querySelector(".error-message").textContent = error.message;
    els.errorList.append(node);
  });
  els.debugAiBtn.classList.remove("hidden");
}

function updateSaveButtons() {
  els.saveProjectBtn.textContent = drafts.dirtyProject ? "Save Project *" : "Save";
  els.saveFileBtn.textContent = drafts.dirtyFile ? "Save File *" : "Save File";
  els.saveAssetBtn.textContent = drafts.dirtyAsset ? "Save Asset *" : "Save Asset";
}

function updateDiffInfo() {
  const colors = detectColors(drafts.fileContent || "");
  const accent = colors[0] || (state.theme === "dark" ? "#a78bfa" : "#7c3aed");
  document.documentElement.style.setProperty("--code-accent", accent);
}

function syncDraftsFromProject() {
  syncProjectDraft();
  syncFileDraft();
  syncAssetDraft();
}

function syncProjectDraft() {
  drafts.projectDescription = getActiveProject().description || "";
  drafts.dirtyProject = false;
}

function syncFileDraft() {
  const file = getActiveFile();
  drafts.fileContent = file?.content || "";
  drafts.dirtyFile = false;
}

function syncAssetDraft() {
  const asset = getActiveAsset();
  drafts.assetContent = asset?.content || "";
  drafts.dirtyAsset = false;
}

function saveProjectDraft() {
  getActiveProject().description = drafts.projectDescription;
  drafts.dirtyProject = false;
  captureRevision("Saved project brief");
  persistState();
  render();
}

function saveFileDraft() {
  const file = getActiveFile();
  if (!file) {
    return;
  }
  file.content = drafts.fileContent;
  file.type = inferType(file.name, true, file.type);
  drafts.dirtyFile = false;
  captureRevision(`Saved file ${file.name}`);
  persistState();
  render();
  refreshPreview();
}

function saveAssetDraft() {
  const asset = getActiveAsset();
  if (!asset) {
    return;
  }
  asset.content = drafts.assetContent;
  asset.type = inferType(asset.name, false, asset.type);
  drafts.dirtyAsset = false;
  captureRevision(`Saved asset ${asset.name}`);
  persistState();
  render();
  refreshPreview();
}

function onProjectChange(event) {
  if (!confirmDiscardUnsaved("project")) {
    els.projectSelect.value = getActiveProject().id;
    return;
  }
  state.activeProjectId = event.target.value;
  getActiveProject().activePanel = "filesPanel";
  syncDraftsFromProject();
  render();
  refreshPreview();
  updateStartupGate();
  persistState();
}

function onFileChange(event) {
  if (!confirmDiscardUnsaved("file")) {
    els.activeFileSelect.value = getActiveFile().id;
    return;
  }
  getActiveProject().activeFileId = event.target.value;
  syncFileDraft();
  renderFiles();
  renderEditors();
  updateDiffInfo();
}

function onAssetChange(event) {
  if (!confirmDiscardUnsaved("asset")) {
    els.activeAssetSelect.value = getActiveAsset()?.id || "";
    return;
  }
  getActiveProject().activeAssetId = event.target.value;
  syncAssetDraft();
  renderAssets();
  renderEditors();
}

function confirmDiscardUnsaved(scope) {
  if (scope === "project" && (drafts.dirtyProject || drafts.dirtyFile || drafts.dirtyAsset)) {
    return confirm("You have unsaved changes. Press OK to discard them or Cancel to keep editing.");
  }
  if (scope === "file" && drafts.dirtyFile) {
    return confirm("You have unsaved file edits. Press OK to discard them or Cancel to save first.");
  }
  if (scope === "asset" && drafts.dirtyAsset) {
    return confirm("You have unsaved asset edits. Press OK to discard them or Cancel to save first.");
  }
  return true;
}

function createProject() {
  const name = prompt("Project name?", "Genesis Project");
  if (!name) {
    return;
  }
  const project = defaultProject();
  project.name = name;
  project.ai.apiKey = getActiveProject().ai.apiKey;
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  syncDraftsFromProject();
  render();
  refreshPreview();
  updateStartupGate();
  persistState();
}

function renameProject() {
  const project = getActiveProject();
  const nextName = prompt("Rename project", project.name);
  if (!nextName) {
    return;
  }
  project.name = nextName;
  captureRevision(`Renamed project to ${nextName}`);
  render();
  persistState();
}

function duplicateProject() {
  const source = getActiveProject();
  const project = normalizeProject(structuredClone(source));
  project.id = crypto.randomUUID();
  project.name = `${source.name} Copy`;
  project.activePanel = "filesPanel";
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  syncDraftsFromProject();
  render();
  refreshPreview();
  persistState();
}

function deleteProject() {
  if (state.projects.length === 1) {
    alert("Genesis needs at least one project.");
    return;
  }

  const project = getActiveProject();
  if (!confirm(`Delete project "${project.name}"? This removes its files, assets, and revision history from local storage.`)) {
    return;
  }

  state.projects = state.projects.filter((entry) => entry.id !== project.id);
  state.activeProjectId = state.projects[0].id;
  syncDraftsFromProject();
  render();
  refreshPreview();
  updateStartupGate();
  persistState();
}

function createEntity(kind) {
  const isFile = kind === "file";
  const name = prompt(`New ${kind} name?`, isFile ? "styles.css" : "logo.svg");
  if (!name) {
    return;
  }
  const item = { id: crypto.randomUUID(), name, type: inferType(name, isFile), content: "" };
  const project = getActiveProject();
  if (isFile) {
    project.files.push(item);
    project.activeFileId = item.id;
    syncFileDraft();
  } else {
    project.assets.push(item);
    project.activeAssetId = item.id;
    syncAssetDraft();
  }
  captureRevision(`Created ${kind} ${name}`);
  render();
  refreshPreview();
  persistState();
}

function renameEntity(kind) {
  const item = kind === "file" ? getActiveFile() : getActiveAsset();
  if (!item) {
    return;
  }
  const nextName = prompt(`Rename ${kind}`, item.name);
  if (!nextName) {
    return;
  }
  item.name = nextName;
  item.type = inferType(nextName, kind === "file", item.type);
  kind === "file" ? syncFileDraft() : syncAssetDraft();
  captureRevision(`Renamed ${kind} to ${nextName}`);
  render();
  refreshPreview();
  persistState();
}

function deleteEntity(kind) {
  const isFile = kind === "file";
  const project = getActiveProject();
  const collection = isFile ? project.files : project.assets;
  const active = isFile ? getActiveFile() : getActiveAsset();
  if (!active) {
    return;
  }
  if (isFile && collection.length === 1) {
    alert("Every project needs at least one file.");
    return;
  }
  if (!confirm(`Delete ${active.name}?`)) {
    return;
  }
  const remaining = collection.filter((entry) => entry.id !== active.id);
  if (isFile) {
    project.files = remaining;
    project.activeFileId = remaining[0].id;
    syncFileDraft();
  } else {
    project.assets = remaining;
    project.activeAssetId = remaining[0]?.id || null;
    syncAssetDraft();
  }
  captureRevision(`Deleted ${kind} ${active.name}`);
  render();
  refreshPreview();
  persistState();
}

function captureRevision(label) {
  const project = getActiveProject();
  const snapshot = {
    description: project.description,
    files: project.files.map((file) => ({ ...file })),
    assets: project.assets.map((asset) => ({ ...asset })),
    activeFileId: project.activeFileId,
    activeAssetId: project.activeAssetId
  };
  const latest = project.revisions[0];
  if (latest && JSON.stringify(latest.snapshot) === JSON.stringify(snapshot)) {
    return;
  }
  project.revisions.unshift({
    id: crypto.randomUUID(),
    label,
    createdAt: new Date().toISOString(),
    snapshot
  });
  project.revisions = project.revisions.slice(0, MAX_REVISIONS);
}

function restoreSelectedRevision() {
  const revision = getSelectedRevision();
  if (!revision) {
    return;
  }
  if (!confirm("Jump to this revision? Current unsaved drafts will be discarded.")) {
    return;
  }
  const project = getActiveProject();
  project.description = revision.snapshot.description;
  project.files = revision.snapshot.files.map((file) => ({ ...file }));
  project.assets = revision.snapshot.assets.map((asset) => ({ ...asset }));
  project.activeFileId = revision.snapshot.activeFileId || project.files[0]?.id;
  project.activeAssetId = revision.snapshot.activeAssetId || project.assets[0]?.id || null;
  project.previewErrors = [];
  syncDraftsFromProject();
  captureRevision(`Jumped to revision from ${formatDateTime(revision.createdAt)}`);
  render();
  refreshPreview();
  persistState();
}

function refreshPreview() {
  const project = getActiveProject();
  project.previewErrors = collectStaticErrors(project);
  renderErrors();
  els.previewStatus.textContent = drafts.dirtyFile || drafts.dirtyAsset || drafts.dirtyProject ? "Preview shows last saved state" : "Preview refreshed";

  if (!projectHasCode(project)) {
    els.previewFrame.srcdoc = `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:linear-gradient(180deg,#faf5ff 0%,#ffffff 100%);display:grid;place-items:center;min-height:100vh;color:#1f2937;">
          <main style="width:min(720px,92vw);padding:40px;border:1px solid rgba(124,58,237,.18);border-radius:28px;background:white;box-shadow:0 30px 80px rgba(124,58,237,.08);">
            <div style="display:inline-flex;min-height:30px;align-items:center;padding:0 12px;border-radius:999px;background:rgba(124,58,237,.08);color:#7c3aed;font:700 12px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;">New Project</div>
            <h1 style="margin:16px 0 10px;font-size:40px;line-height:1;">Your site starts empty</h1>
            <p style="margin:0;color:#6b7280;font-size:16px;line-height:1.7;">Write HTML, CSS, or JavaScript in the Project tab, or import assets and ask Genesis AI Editor to scaffold the first version for you.</p>
          </main>
        </body>
      </html>`;
    return;
  }

  const entry = pickEntryHtmlFile(project);
  const assetUrls = buildPreviewAssetUrls(project.assets);
  const html = resolveAssetReferencesInHtml(
    entry?.content || "<main style='font-family:system-ui;padding:40px'>Add an index.html file to preview your site.</main>",
    assetUrls
  );
  const css = project.files
    .filter(isCssFile)
    .map((file) => `\n/* ${file.name} */\n${resolveAssetReferencesInCss(file.content, assetUrls)}`)
    .join("\n");
  const js = project.files.filter(isJsFile).map((file) => `\n// ${file.name}\n${file.content}`).join("\n");
  const assets = Object.fromEntries(project.assets.map((asset) => [asset.name, asset.content]));

  const bridge = `
<script>
window.__GENESIS_ASSETS__ = ${JSON.stringify(assets)};
window.__GENESIS_ASSET_URLS__ = ${JSON.stringify(assetUrls)};
window.getGenesisAsset = function(name) { return window.__GENESIS_ASSETS__[name] || ""; };
window.getGenesisAssetUrl = function(name) { return window.__GENESIS_ASSET_URLS__[name] || ""; };
function postGenesisError(title, message) {
  parent.postMessage({ source: "genesis-preview", title: title, message: message }, "*");
}
window.addEventListener("error", function(event) {
  postGenesisError("Runtime Error", event.message + (event.filename ? " @ " + event.filename : ""));
});
window.addEventListener("unhandledrejection", function(event) {
  const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
  postGenesisError("Unhandled Promise Rejection", reason);
});
window.addEventListener("DOMContentLoaded", function() {
  document.querySelectorAll("[src],[href],[poster]").forEach(function(node) {
    ["src","href","poster"].forEach(function(attr) {
      var value = node.getAttribute(attr);
      if (value && window.__GENESIS_ASSET_URLS__[value]) {
        node.setAttribute(attr, window.__GENESIS_ASSET_URLS__[value]);
      }
    });
  });
});
</script>`;

  let srcdoc = html;
  if (srcdoc.includes("</head>")) {
    srcdoc = srcdoc.replace("</head>", `<style>${css}</style>${bridge}</head>`);
  } else {
    srcdoc = `<style>${css}</style>${bridge}${srcdoc}`;
  }
  if (srcdoc.includes("</body>")) {
    srcdoc = srcdoc.replace("</body>", `<script>${js}<\/script></body>`);
  } else {
    srcdoc += `<script>${js}<\/script>`;
  }
  els.previewFrame.srcdoc = srcdoc;
}

function collectStaticErrors(project) {
  const errors = [];
  project.files.forEach((file) => {
    try {
      if (isJsFile(file)) {
        new Function(file.content);
      }
      if (isJsonFile(file)) {
        JSON.parse(file.content || "{}");
      }
    } catch (error) {
      errors.push({
        id: crypto.randomUUID(),
        title: `Static error in ${file.name}`,
        message: error.message
      });
    }
  });
  return errors;
}

function handlePreviewMessage(event) {
  const data = event.data;
  if (!data || data.source !== "genesis-preview") {
    return;
  }
  const project = getActiveProject();
  const exists = project.previewErrors.some((error) => error.title === data.title && error.message === data.message);
  if (!exists) {
    project.previewErrors.push({
      id: crypto.randomUUID(),
      title: data.title || "Preview Error",
      message: data.message || "Unknown preview error"
    });
    renderErrors();
    persistState();
  }
}

function clearPreviewErrors() {
  getActiveProject().previewErrors = [];
  renderErrors();
  persistState();
}

function enterWithStartupKey() {
  const key = els.startupApiKeyInput.value.trim();
  if (!key) {
    els.startupMessage.textContent = "Paste a Gemini API key to enter Genesis.";
    return;
  }
  getActiveProject().ai.apiKey = key;
  els.apiKeyInput.value = key;
  els.startupApiKeyInput.value = "";
  persistState();
  updateStartupGate();
}

function updateStartupGate() {
  const hasKey = Boolean(getActiveProject().ai.apiKey);
  els.startupGate.classList.toggle("hidden", hasKey);
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  renderTheme();
  updateDiffInfo();
  persistState();
}

async function runGemini() {
  if (drafts.dirtyProject) {
    saveProjectDraft();
  }
  if (drafts.dirtyFile) {
    saveFileDraft();
  }
  if (drafts.dirtyAsset) {
    saveAssetDraft();
  }

  const project = getActiveProject();
  if (!project.ai.apiKey) {
    updateStartupGate();
    return;
  }
  const promptToSend = (project.ai.lastPrompt || "").trim();
  if (!promptToSend) {
    alert("Add a prompt first.");
    return;
  }
  project.ai.lastSubmittedPrompt = promptToSend;
  appendAiMessage("user", promptToSend);
  appendAiMessage("assistant", "AI thinking...", true);
  project.ai.lastPrompt = "";
  els.promptInput.value = "";
  renderAiThread();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(project.settings.model)}:generateContent?key=${encodeURIComponent(project.ai.apiKey)}`;
  els.runAiBtn.disabled = true;
  els.previewStatus.textContent = "Talking to Genesis AI Editor";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGeminiBody(project, promptToSend))
    });
    if (!response.ok) {
      throw new Error(await response.text() || `Request failed with ${response.status}`);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "No response text returned.";
    project.ai.lastResponse = text;
    removeThinkingMessage();
    appendAiMessage("assistant", summarizeAssistantText(text));
    renderAi();
    persistState();
    const applied = applyAiCommands(text, false);
    els.previewStatus.textContent = applied ? "Genesis AI applied edits" : "AI response ready";
  } catch (error) {
    removeThinkingMessage();
    els.previewStatus.textContent = "Genesis AI request failed";
    alert(`Genesis AI error: ${error.message}`);
  } finally {
    els.runAiBtn.disabled = false;
  }
}

function buildGeminiBody(project, prompt) {
  const instruction = [
    "You are the Genesis AI editor for a multi-file website builder.",
    "You are operating inside Genesis, a browser-based editor with files, assets, preview, revisions, and export.",
    "Genesis projects can contain multiple HTML, CSS, JS, JSON, and asset files.",
    "The preview opens the main entry HTML file, usually index.html.",
    "If you create multiple HTML pages, you must stitch them together yourself with correct relative links such as <a href=\"about.html\"> or <a href=\"pages/about.html\"> depending on file location.",
    "If you create multiple pages, update every affected page so navigation works both ways and shared CSS/JS is linked correctly.",
    "Do not assume a framework or build step. Output plain browser-ready files unless the existing project clearly uses something else.",
    "Assets are stored separately from files. When referencing an imported asset in project code, use its filename such as logo.png or images/hero.png if that is the asset name.",
    "For CSS backgrounds, use normal url(...) references to asset filenames.",
    "When editing multiple HTML files, keep structure consistent and make sure menus, links, buttons, and script/style references all line up across files.",
    "If you add a new page, also update index.html or the current navigation so the page is reachable.",
    "You may edit any project file or asset by emitting one fenced code block named genesis-commands.",
    "Only emit commands inside that fence if Genesis should apply changes automatically.",
    "Use version 1.0 JSON with a commands array.",
    "Allowed commands: write_file, create_file, delete_file, rename_file, write_asset, create_asset, delete_asset, rename_asset, set_project_description.",
    "For write_* and create_* commands, always send the full contents in the content field.",
    "Never emit partial diffs, never omit required fields, and do not emit a command block unless you intend it to be applied.",
    "When changing one file in a multi-file flow, include every other file that must change for the feature to actually work."
  ].join("\n");

  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              instruction,
              "Example:",
              "```genesis-commands",
              "{",
              "  \"version\": \"1.0\",",
              "  \"commands\": [",
              "    { \"type\": \"write_file\", \"target\": \"index.html\", \"content\": \"<html>...</html>\" }",
              "  ]",
              "}",
              "```",
              JSON.stringify({
                project: {
                  name: project.name,
                  description: project.description,
                  files: project.files.map(({ name, type, content }) => ({ name, type, content })),
                  assets: project.assets.map(({ name, type, content }) => ({ name, type, content }))
                },
                previewErrors: project.previewErrors,
                request: prompt
              }, null, 2)
            ].join("\n\n")
          }
        ]
      }
    ]
  };
}

function applyAiCommands(responseText, silent) {
  const parsed = parseAiCommandBlock(responseText);
  if (!parsed) {
    return false;
  }

  const project = getActiveProject();
  const changedTargets = new Set();
  parsed.commands.forEach((command) => applySingleCommand(project, command));
  parsed.commands.forEach((command) => {
    if (command.target) {
      changedTargets.add(command.target);
    }
    if (command.to) {
      changedTargets.add(command.to);
    }
    if (command.type === "set_project_description") {
      changedTargets.add("project description");
    }
  });
  syncDraftsFromProject();
  captureRevision("Applied AI command set");
  render();
  refreshPreview();
  persistState();
  const filesChanged = changedTargets.size;
  appendAiMessage("system", `${filesChanged} ${filesChanged === 1 ? "file" : "files"} changed`);
  renderAiThread();
  return true;
}

function parseAiCommandBlock(text) {
  const match = text.match(COMMAND_BLOCK_REGEX);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed.version !== "1.0" || !Array.isArray(parsed.commands)) {
      return null;
    }
    return parsed.commands.every(isValidCommand) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function isValidCommand(command) {
  const allowed = new Set([
    "write_file",
    "create_file",
    "delete_file",
    "rename_file",
    "write_asset",
    "create_asset",
    "delete_asset",
    "rename_asset",
    "set_project_description"
  ]);
  if (!command || typeof command !== "object" || !allowed.has(command.type)) {
    return false;
  }
  for (const field of ["target", "content", "from", "to"]) {
    if (field in command && typeof command[field] !== "string") {
      return false;
    }
  }
  return true;
}

function applySingleCommand(project, command) {
  switch (command.type) {
    case "write_file":
      upsertEntry(project.files, command.target, command.content, true);
      setActiveFileByName(project, command.target);
      break;
    case "create_file":
      createNamedEntry(project.files, command.target, command.content, true);
      setActiveFileByName(project, command.target);
      break;
    case "delete_file":
      deleteEntryByName(project.files, command.target);
      project.activeFileId = project.files[0]?.id || null;
      break;
    case "rename_file":
      renameEntryByName(project.files, command.from, command.to, true);
      setActiveFileByName(project, command.to);
      break;
    case "write_asset":
      upsertEntry(project.assets, command.target, command.content, false);
      setActiveAssetByName(project, command.target);
      break;
    case "create_asset":
      createNamedEntry(project.assets, command.target, command.content, false);
      setActiveAssetByName(project, command.target);
      break;
    case "delete_asset":
      deleteEntryByName(project.assets, command.target);
      project.activeAssetId = project.assets[0]?.id || null;
      break;
    case "rename_asset":
      renameEntryByName(project.assets, command.from, command.to, false);
      setActiveAssetByName(project, command.to);
      break;
    case "set_project_description":
      project.description = command.content;
      break;
    default:
      break;
  }
}

function upsertEntry(collection, name, content, isFile) {
  const existing = collection.find((entry) => entry.name === name);
  if (existing) {
    existing.content = content;
    existing.type = inferType(name, isFile, existing.type);
    return;
  }
  collection.push({ id: crypto.randomUUID(), name, type: inferType(name, isFile), content });
}

function createNamedEntry(collection, name, content, isFile) {
  if (!collection.some((entry) => entry.name === name)) {
    collection.push({ id: crypto.randomUUID(), name, type: inferType(name, isFile), content });
  }
}

function deleteEntryByName(collection, name) {
  const index = collection.findIndex((entry) => entry.name === name);
  if (index >= 0) {
    collection.splice(index, 1);
  }
}

function renameEntryByName(collection, from, to, isFile) {
  const entry = collection.find((item) => item.name === from);
  if (entry) {
    entry.name = to;
    entry.type = inferType(to, isFile, entry.type);
  }
}

function setActiveFileByName(project, name) {
  const file = project.files.find((entry) => entry.name === name);
  if (file) {
    project.activeFileId = file.id;
  }
}

function setActiveAssetByName(project, name) {
  const asset = project.assets.find((entry) => entry.name === name);
  if (asset) {
    project.activeAssetId = asset.id;
  }
}

async function debugErrorsWithAi() {
  const project = getActiveProject();
  if (!project.previewErrors.length) {
    return;
  }
  project.activePanel = "aiPanel";
  project.ai.lastPrompt = [
    "Debug this Genesis project and fix the preview errors.",
    "Return a genesis-commands block if file changes are needed.",
    "Errors:",
    project.previewErrors.map((error) => `${error.title}: ${error.message}`).join("\n")
  ].join("\n\n");
  render();
  persistState();
  await runGemini();
}

async function exportProjectZip() {
  const project = getActiveProject();
  const manifest = {
    name: project.name,
    description: project.description,
    settings: project.settings,
    revisions: project.revisions
  };
  const entries = [createZipEntry("manifest.json", JSON.stringify(manifest, null, 2))];
  project.files.forEach((file) => {
    const exportAssetPaths = buildExportAssetPathsForFile(file.name, project.assets);
    const content = prepareFileForExport(file, exportAssetPaths);
    entries.push(createZipEntry(`files/${file.name}`, content));
  });
  project.assets.forEach((asset) => entries.push(createZipEntry(`assets/${asset.name}`, asset.content)));

  const bytes = buildZip(entries);
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(project.name)}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importProjectZip(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries = parseZip(bytes);
    const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
    const manifest = manifestEntry ? JSON.parse(decodeUtf8(manifestEntry.data)) : {};
    const project = defaultProject();
    project.name = manifest.name || file.name.replace(/\.zip$/i, "") || "Imported Project";
    project.description = manifest.description || "";
    project.settings.model = MODELS.includes(manifest.settings?.model) ? manifest.settings.model : "gemini-2.5-flash";
    project.revisions = Array.isArray(manifest.revisions) ? manifest.revisions.slice(0, MAX_REVISIONS) : [];
    project.files = entries.filter((entry) => entry.name.startsWith("files/")).map((entry) => ({
      id: crypto.randomUUID(),
      name: entry.name.slice("files/".length),
      type: inferType(entry.name.slice("files/".length), true),
      content: decodeUtf8(entry.data)
    }));
    project.assets = entries.filter((entry) => entry.name.startsWith("assets/")).map((entry) => ({
      id: crypto.randomUUID(),
      name: entry.name.slice("assets/".length),
      type: inferType(entry.name.slice("assets/".length), false),
      content: decodeUtf8(entry.data)
    }));
    if (!project.files.length) {
      project.files = [defaultFile()];
    }
    project.activeFileId = project.files[0].id;
    project.activeAssetId = project.assets[0]?.id || null;
    project.ai.apiKey = getActiveProject().ai.apiKey;
    state.projects.unshift(project);
    state.activeProjectId = project.id;
    syncDraftsFromProject();
    render();
    refreshPreview();
    updateStartupGate();
    persistState();
  } catch (error) {
    alert("That ZIP could not be imported. Genesis expects a ZIP exported from Genesis.");
  } finally {
    event.target.value = "";
  }
}

async function importAssetFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const content = file.type.startsWith("image/") ? await readFileAsDataUrl(file) : await file.text();
    const asset = {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || inferType(file.name, false),
      content
    };
    const project = getActiveProject();
    project.assets.push(asset);
    project.activeAssetId = asset.id;
    syncAssetDraft();
    captureRevision(`Imported asset ${file.name}`);
    render();
    refreshPreview();
    persistState();
  } catch (error) {
    alert("That asset could not be imported.");
  } finally {
    event.target.value = "";
  }
}

function loadImageIntoEditor(dataUrl) {
  const asset = getActiveAsset();
  if (!asset || !isImageAsset(asset) || !dataUrl) {
    return;
  }
  if (imageEditorState.image?.src === dataUrl) {
    renderImageEditorPreview();
    return;
  }
  const image = new Image();
  image.onload = () => {
    imageEditorState.image = image;
    renderImageEditorPreview();
  };
  image.src = dataUrl;
}

function renderImageEditorPreview() {
  if (!imageEditorState.image) {
    return;
  }
  const canvas = els.imageEditorCanvas;
  const ctx = canvas.getContext("2d");
  const image = imageEditorState.image;
  const radians = (Number(els.imageRotation.value || 0) * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const width = image.width;
  const height = image.height;
  canvas.width = Math.max(1, Math.round(width * cos + height * sin));
  canvas.height = Math.max(1, Math.round(width * sin + height * cos));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.filter = `brightness(${els.imageBrightness.value}%) contrast(${els.imageContrast.value}%) saturate(${els.imageSaturation.value}%)`;
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function applyImageEdits() {
  const asset = getActiveAsset();
  if (!asset || !isImageAsset(asset) || !imageEditorState.image) {
    return;
  }
  drafts.assetContent = els.imageEditorCanvas.toDataURL(asset.type === "image/jpeg" ? "image/jpeg" : "image/png");
  asset.type = asset.type === "image/jpeg" ? "image/jpeg" : "image/png";
  drafts.dirtyAsset = true;
  els.assetEditor.value = drafts.assetContent;
  updateSaveButtons();
}

function removeThinkingMessage() {
  const project = getActiveProject();
  project.ai.messages = (project.ai.messages || []).filter((message) => !message.isThinking);
}

function appendAiMessage(role, text, isThinking = false) {
  const project = getActiveProject();
  project.ai.messages = [...(project.ai.messages || []), { role, text, isThinking }].slice(-24);
}

function closeAiSettingsModal() {
  els.aiSettingsModal.classList.add("hidden");
}

function summarizeAssistantText(text) {
  const parsed = parseAiCommandBlock(text);
  if (parsed) {
    return `Prepared ${parsed.commands.length} edit ${parsed.commands.length === 1 ? "command" : "commands"} for Genesis.`;
  }
  return text;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function createZipEntry(name, text) {
  return { name, data: encodeUtf8(text) };
}

function buildZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encodeUtf8(entry.name);
    const dataBytes = entry.data;
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localChunks.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + dataBytes.length;
  });

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return concatBytes([...localChunks, ...centralChunks, end]);
}

function parseZip(bytes) {
  const entries = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const signature = view.getUint32(0, true);
    if (signature !== 0x04034b50) {
      break;
    }
    const compression = view.getUint16(8, true);
    if (compression !== 0) {
      throw new Error("Compressed ZIP entries are not supported.");
    }
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decodeUtf8(bytes.slice(nameStart, nameStart + nameLength));
    const data = bytes.slice(dataStart, dataStart + size);
    entries.push({ name, data });
    offset = dataStart + size;
  }
  return entries;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function encodeUtf8(text) {
  return new TextEncoder().encode(text);
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createEntityButton(name, meta, active) {
  const template = document.querySelector("#entityItemTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".entity-name").textContent = name;
  node.querySelector(".entity-meta").textContent = meta;
  if (active) {
    node.classList.add("active");
  }
  return node;
}

function getActiveProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
}

function getActiveFile() {
  const project = getActiveProject();
  return project.files.find((file) => file.id === project.activeFileId) || project.files[0] || null;
}

function getActiveAsset() {
  const project = getActiveProject();
  return project.assets.find((asset) => asset.id === project.activeAssetId) || project.assets[0] || null;
}

function getSelectedRevision() {
  return getActiveProject().revisions.find((revision) => revision.id === els.revisionSelect.value) || getActiveProject().revisions[0] || null;
}

function pickEntryHtmlFile(project) {
  return project.files.find((file) => file.name.toLowerCase() === "index.html")
    || project.files.find((file) => file.name.toLowerCase().endsWith(".html"))
    || project.files[0];
}

function projectHasCode(project) {
  return project.files.some((file) => String(file.content || "").trim().length > 0);
}

function inferType(name, isFile, fallback = "text/plain") {
  const ext = name.split(".").pop()?.toLowerCase();
  const types = {
    html: "html",
    css: "css",
    js: "javascript",
    mjs: "javascript",
    ts: "typescript",
    json: "json",
    txt: "text/plain",
    md: "markdown",
    svg: isFile ? "svg" : "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp"
  };
  return types[ext] || fallback;
}

function isCssFile(file) {
  return file.type === "css" || file.name.toLowerCase().endsWith(".css");
}

function isJsFile(file) {
  return file.type === "javascript" || file.name.toLowerCase().endsWith(".js") || file.name.toLowerCase().endsWith(".mjs");
}

function isJsonFile(file) {
  return file.type === "json" || file.name.toLowerCase().endsWith(".json");
}

function isImageAsset(asset) {
  return Boolean(asset && (asset.type.startsWith("image/") || asset.content.startsWith("data:image/")));
}

function buildPreviewAssetUrls(assets) {
  return Object.fromEntries(
    assets.map((asset) => [asset.name, toPreviewAssetUrl(asset)])
  );
}

function buildExportAssetPathsForFile(fileName, assets) {
  return Object.fromEntries(
    assets.map((asset) => [asset.name, toExportAssetPath(fileName, asset.name)])
  );
}

function toExportAssetPath(fileName, assetName) {
  const fileSegments = String(fileName).split("/").filter(Boolean);
  const depth = Math.max(0, fileSegments.length - 1);
  const up = "../".repeat(depth + 1);
  return `${up}assets/${assetName}`;
}

function prepareFileForExport(file, assetPaths) {
  if (isCssFile(file)) {
    return resolveAssetReferencesInCss(file.content, assetPaths);
  }
  if (file.type === "html" || file.name.toLowerCase().endsWith(".html")) {
    return resolveAssetReferencesInHtml(file.content, assetPaths);
  }
  return file.content;
}

function toPreviewAssetUrl(asset) {
  if (!asset || !asset.content) {
    return "";
  }
  if (asset.content.startsWith("data:")) {
    return asset.content;
  }
  const mimeType = asset.type || inferType(asset.name, false, "text/plain");
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(asset.content)}`;
}

function resolveAssetReferencesInHtml(html, assetUrls) {
  let output = html;
  Object.entries(assetUrls).forEach(([name, url]) => {
    const escapedName = escapeRegExp(name);
    output = output.replace(new RegExp(`(["'])${escapedName}\\1`, "g"), `"${url}"`);
  });
  return output;
}

function resolveAssetReferencesInCss(css, assetUrls) {
  let output = css;
  Object.entries(assetUrls).forEach(([name, url]) => {
    const escapedName = escapeRegExp(name);
    output = output.replace(new RegExp(`url\\((['"]?)${escapedName}\\1\\)`, "g"), `url("${url}")`);
  });
  return output;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function diffLineStats(beforeText, afterText) {
  const before = beforeText.split("\n");
  const after = afterText.split("\n");
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let endBefore = before.length - 1;
  let endAfter = after.length - 1;
  while (endBefore >= start && endAfter >= start && before[endBefore] === after[endAfter]) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return {
    removed: Math.max(0, endBefore - start + 1),
    added: Math.max(0, endAfter - start + 1)
  };
}

function detectColors(text) {
  const matches = text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g) || [];
  return [...new Set(matches)].slice(0, 12);
}

function formatSize(chars) {
  const bytes = chars * 2;
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  }
  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function updateStorageUsage() {
  if (!state) {
    els.storageUsage.textContent = "Measuring IndexedDB usage...";
    return;
  }

  const serializedLength = JSON.stringify(state).length;
  els.storageUsage.textContent = `${formatSize(serializedLength)} in IndexedDB`;
}

function clearLegacyStorageNamespace() {
  Object.keys(localStorage)
    .filter((key) => key === LEGACY_STORAGE_KEY || key.startsWith(LEGACY_STORAGE_CHUNK_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}
