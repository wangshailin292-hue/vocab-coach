// app-core.js - State, init, data loading, save/load

const storageKey = 'vocab-writing-coach-state-v1';
const settingsKey = 'vocab-writing-coach-settings-v2';
const srsKey = 'vocab-writing-coach-srs-v1';

const todayKey = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const presetBanks = window.VOCAB_PRESETS?.banks || {};
const presetVersion = window.VOCAB_PRESETS?.version || 'local';
const seedItems = buildInitialItems();

const state = loadState();
const settings = loadSettings();
const srsConfig = loadSrsConfig();

let currentView = 'study';
let studyMode = 'meaning';
let libraryFilter = 'all';
let essayMode = 'text';
let currentCardId = null;
let editingItemId = null;
let essayImageDataUrl = '';
let serverConfig = { providers: {} };
let lastAutoSpokenCardId = '';
let pendingAutoSpeakId = '';
let autoSpeakTimer = 0;
let speechUnlocked = false;
let currentPassage = null;
let selectedPassageWord = null;

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return { items: seedItems, sessions: [], reviews: [] };
    const parsed = JSON.parse(saved);
    return {
      items: parsed.items?.length ? parsed.items : seedItems,
      sessions: parsed.sessions || [],
      reviews: parsed.reviews || []
    };
  } catch (_) { return { items: seedItems, sessions: [], reviews: [] }; }
}

function saveState() { localStorage.setItem(storageKey, JSON.stringify(state)); }

function loadSettings() {
  try {
    return {
      provider: 'deepseek',
      apiKey: '',
      model: 'deepseek-chat',
      ...(JSON.parse(localStorage.getItem(settingsKey)) || {})
    };
  } catch (_) { return { provider: 'deepseek', apiKey: '', model: 'deepseek-chat' }; }
}

function saveSettings() { localStorage.setItem(settingsKey, JSON.stringify(settings)); }

function loadSrsConfig() {
  try {
    return {
      mode: 'ebbinghaus',
      intervals: [1, 2, 4, 7, 14, 30, 60],
      ...(JSON.parse(localStorage.getItem(srsKey)) || {})
    };
  } catch (_) { return { mode: 'ebbinghaus', intervals: [1, 2, 4, 7, 14, 30, 60] }; }
}

function saveSrsConfig() { localStorage.setItem(srsKey, JSON.stringify(srsConfig)); }

function migrateState() {
  state.items = state.items.map(normalizeItem);
  state.sessions = state.sessions || [];
  state.reviews = state.reviews || [];
  saveState();
}

function buildInitialItems() {
  const defaultBank = presetBanks.cet4;
  if (defaultBank?.items?.length) {
    return defaultBank.items.map(entry => presetToItem(defaultBank.id, entry));
  }
  return [
    normalizeItem({ id: crypto.randomUUID(), type: 'word', term: 'improve', meaning: '提高，改善', examMeaning: '常考义：提高能力、质量或水平', collocations: ['improve writing', 'improve ability'], example: 'I want to improve my writing.', source: 'seed' }),
    normalizeItem({ id: crypto.randomUUID(), type: 'phrase', term: 'as a result', meaning: '因此，结果', examMeaning: '常考义：表示结果，可用于作文衔接', collocations: ['as a result of'], example: 'I practiced every day. As a result, I became more confident.', source: 'seed' })
  ];
}

function presetToItem(bankId, entry) {
  const bank = presetBanks[bankId];
  return normalizeItem({ ...entry, id: crypto.randomUUID(), type: entry.type || (entry.term.includes(' ') ? 'phrase' : 'word'), source: 'preset', bankId, bankName: bank?.name || bankId, presetKey: bankId + ':' + entry.term.toLowerCase(), presetVersion: bank?.version || presetVersion });
}

function normalizeItem(item) {
  const collocations = Array.isArray(item.collocations) ? item.collocations : String(item.collocations || '').split(/[\r\n,;，；]+/).map(v => v.trim()).filter(Boolean);
  return {
    id: item.id || crypto.randomUUID(),
    type: item.type || (item.term?.includes(' ') ? 'phrase' : 'word'),
    term: item.term || '',
    meaning: item.meaning || '',
    examMeaning: item.examMeaning || item.meaning || '',
    collocations,
    example: item.example || '',
    mastery: Number.isFinite(Number(item.mastery)) ? Number(item.mastery) : 0,
    due: item.due || todayKey(),
    stats: { seen: Number(item.stats?.seen || 0), right: Number(item.stats?.right || 0), wrong: Number(item.stats?.wrong || 0) },
    source: item.source || 'manual',
    bankId: item.bankId || '',
    bankName: item.bankName || '',
    presetKey: item.presetKey || '',
    presetVersion: item.presetVersion || '',
    userEdited: Boolean(item.userEdited),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

const els = {
  // Tab bar
  tabItems: document.querySelectorAll('.tab-item'),
  // Study
  studyCount: document.querySelector('#studyCount'),
  studySegments: document.querySelectorAll('[data-study-mode]'),
  cardType: document.querySelector('#cardType'),
  cardPrompt: document.querySelector('#cardPrompt'),
  frontSpeakButton: document.querySelector('#frontSpeakButton'),
  frontTermHint: document.querySelector('#frontTermHint'),
  studyCardFront: document.querySelector('#studyCardFront'),
  studyCardBack: document.querySelector('#studyCardBack'),
  autoSpeakButton: document.querySelector('#autoSpeakButton'),
  revealButton: document.querySelector('#revealButton'),
  cardAnswer: document.querySelector('#cardAnswer'),
  studyActions: document.querySelector('.study-actions'),
  qualityButtons: document.querySelectorAll('.act-btn[data-quality]'),
  studyProgressBar: document.querySelector('#studyProgressBar'),
  // Library
  librarySegments: document.querySelectorAll('[data-library-filter]'),
  presetBankSelect: document.querySelector('#presetBankSelect'),
  presetDescription: document.querySelector('#presetDescription'),
  presetStats: document.querySelector('#presetStats'),
  importPresetButton: document.querySelector('#importPresetButton'),
  updatePresetButton: document.querySelector('#updatePresetButton'),
  updateAllPresetsButton: document.querySelector('#updateAllPresetsButton'),
  addItemForm: document.querySelector('#addItemForm'),
  itemType: document.querySelector('#itemType'),
  itemTerm: document.querySelector('#itemTerm'),
  itemMeaning: document.querySelector('#itemMeaning'),
  itemExamMeaning: document.querySelector('#itemExamMeaning'),
  itemCollocations: document.querySelector('#itemCollocations'),
  itemExample: document.querySelector('#itemExample'),
  formSubmitButton: document.querySelector('#formSubmitButton'),
  cancelEditButton: document.querySelector('#cancelEditButton'),
  libraryList: document.querySelector('#libraryList'),
  globalSearch: document.querySelector('#globalSearch'),
  exportButton: document.querySelector('#exportButton'),
  // Read
  readWordSource: document.querySelector('#readWordSource'),
  readLength: document.querySelector('#readLength'),
  generatePassageBtn: document.querySelector('#generatePassageBtn'),
  passageState: document.querySelector('#passageState'),
  passageResult: document.querySelector('#passageResult'),
  passageTitle: document.querySelector('#passageTitle'),
  passageText: document.querySelector('#passageText'),
  passageTranslation: document.querySelector('#passageTranslation'),
  toggleTranslationBtn: document.querySelector('#toggleTranslationBtn'),
  passageVocabList: document.querySelector('#passageVocabList'),
  passageWordDetail: document.querySelector('#passageWordDetail'),
  // Essay
  essaySegments: document.querySelectorAll('[data-essay-mode]'),
  essayTextArea: document.querySelector('#essayTextArea'),
  essayImageArea: document.querySelector('#essayImageArea'),
  essayTextInput: document.querySelector('#essayTextInput'),
  dropZone: document.querySelector('#dropZone'),
  essayImageInput: document.querySelector('#essayImageInput'),
  essayPreview: document.querySelector('#essayPreview'),
  dropEmpty: document.querySelector('#dropEmpty'),
  essayPrompt: document.querySelector('#essayPrompt'),
  targetLevel: document.querySelector('#targetLevel'),
  reviewEssayButton: document.querySelector('#reviewEssayButton'),
  reviewState: document.querySelector('#reviewState'),
  reviewResult: document.querySelector('#reviewResult'),
  // Settings
  providerSelect: document.querySelector('#providerSelect'),
  apiKeyInput: document.querySelector('#apiKeyInput'),
  modelSelect: document.querySelector('#modelSelect'),
  saveSettingsButton: document.querySelector('#saveSettingsButton'),
  clearSettingsButton: document.querySelector('#clearSettingsButton'),
  srsModeEbbinghaus: document.querySelector('#srsModeEbbinghaus'),
  srsModeCustom: document.querySelector('#srsModeCustom'),
  srsIntervalsInput: document.querySelector('#srsIntervalsInput'),
  saveSrsSettingsBtn: document.querySelector('#saveSrsSettingsBtn'),
  // Connection
  connectionTitle: document.querySelector('#connectionTitle'),
  connectionDetail: document.querySelector('#connectionDetail'),
};

function init() {
  hydrateSettingsForm();
  renderPresetBankOptions();
  migrateState();
  bindEvents();
  fetchConfig();
  const initialView = location.hash.replace('#', '');
  if (['study','library','read','essay','settings'].includes(initialView)) {
    setView(initialView);
  } else {
    renderAll();
  }
}

﻿// app-views.js - View switching, rendering, connection, stats

function setView(view) {
  currentView = view;
  if (view === 'study') lastAutoSpokenCardId = '';
  if (location.hash.replace('#', '') !== view) history.replaceState(null, '', '#' + view);
  els.tabItems.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  // mobileTabs removed(t => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === view + 'View'));
  renderAll();
}

function renderAll() {
  document.body.dataset.view = currentView;
  renderStudy();
  renderStats();
  renderPresetSummary();
  renderLibrary();
  if (currentView === 'read') renderRead();
  if (currentView === 'habit') renderHabits();
  renderConnection();
}

function renderConnection() {
  var provId = settings.provider || 'deepseek';
  var hasKey = Boolean(settings.apiKey);
  var ready = hasKey;
  if (els.connectionTitle) els.connectionTitle.textContent = ready ? provId.toUpperCase() + ' 已连接' : '演示模式';
  if (els.connectionDetail) els.connectionDetail.textContent = ready ? '模型：' + settings.model : '在设置中填写 API Key 后启用 AI';
}

function renderStats() { var due = getDueItems().length; var mastered = state.items.filter(function(i){return i.mastery>=5}).length; var todayR = state.sessions.filter(function(s){return s.date===todayKey()}).length; if(document.getElementById('dueCount'))document.getElementById('dueCount').textContent=due; if(document.getElementById('masteredCount'))document.getElementById('masteredCount').textContent=mastered; if(document.getElementById('reviewCount'))document.getElementById('reviewCount').textContent=todayR; }

﻿// app-events.js - Event binding

function bindEvents() {
  document.addEventListener('pointerdown', flushPendingAutoSpeak, { capture: true });
  document.addEventListener('keydown', flushPendingAutoSpeak, { capture: true });

  // Nav
  els.tabItems.forEach(function(b){b.addEventListener("click",function(){setView(b.dataset.view)})});
  // mobile-tabs removed;

  // Study
  els.studySegments.forEach(b => b.addEventListener('click', () => {
    studyMode = b.dataset.studyMode;
    els.studySegments.forEach(s => s.classList.toggle('active', s === b));
    currentCardId = null;
    renderStudy();
  }));
  els.librarySegments.forEach(b => b.addEventListener('click', () => {
    libraryFilter = b.dataset.libraryFilter;
    els.librarySegments.forEach(s => s.classList.toggle('active', s === b));
    renderLibrary();
  }));
  els.globalSearch.addEventListener('input', () => { renderLibrary(); renderStudy(); });
  els.exportButton.addEventListener('click', exportData);
  els.frontSpeakButton.addEventListener('click', () => speakItem(currentCardId, 'uk'));
  els.autoSpeakButton.addEventListener('click', unlockAutoSpeak);
  els.revealButton.addEventListener('click', revealAnswer);
  els.qualityButtons.forEach(b => b.addEventListener('click', () => markCard(b.dataset.quality)));

  // Library
  els.presetBankSelect.addEventListener('change', renderPresetSummary);
  els.importPresetButton.addEventListener('click', () => {
    const r = importPresetBank(els.presetBankSelect.value, { overwriteUserEdits: false });
    showToast('已导入 ' + r.added + ' 个，更新 ' + r.updated + ' 个');
  });
  els.updatePresetButton.addEventListener('click', () => {
    const r = importPresetBank(els.presetBankSelect.value, { overwriteUserEdits: true });
    showToast('已更新 ' + r.updated + ' 个，新增 ' + r.added + ' 个');
  });
  els.updateAllPresetsButton.addEventListener('click', () => {
    const r = Object.keys(presetBanks).reduce((t, id) => { const o = importPresetBank(id, { overwriteUserEdits: false, silent: true }); t.added += o.added; t.updated += o.updated; t.kept += o.kept; return t; }, { added: 0, updated: 0, kept: 0 });
    saveState(); renderAll();
    showToast('全部词库已检查：新增 ' + r.added + ' 个，更新 ' + r.updated + ' 个');
  });
  els.addItemForm.addEventListener('submit', e => {
    e.preventDefault();
    const wasEditing = Boolean(editingItemId);
    addLibraryItem({ type: els.itemType.value, term: els.itemTerm.value, meaning: els.itemMeaning.value, examMeaning: els.itemExamMeaning.value, collocations: parseCollocations(els.itemCollocations.value), example: els.itemExample.value, source: editingItemId ? state.items.find(i => i.id === editingItemId)?.source || 'manual' : 'manual' });
    clearEditor();
    showToast(wasEditing ? '已保存修改' : '已加入词库');
  });
  els.cancelEditButton.addEventListener('click', clearEditor);

  // Read
  els.generatePassageBtn.addEventListener('click', generatePassage);
  els.toggleTranslationBtn.addEventListener('click', toggleTranslation);

  // Essay
  els.essaySegments.forEach(b => b.addEventListener('click', () => {
    essayMode = b.dataset.essayMode;
    els.essaySegments.forEach(s => s.classList.toggle('active', s === b));
    els.essayTextArea.hidden = essayMode !== 'text';
    els.essayImageArea.hidden = essayMode !== 'image';
  }));
  els.dropZone.addEventListener('click', () => els.essayImageInput.click());
  els.dropZone.addEventListener('dragover', e => { e.preventDefault(); els.dropZone.classList.add('dragging'); });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragging'));
  els.dropZone.addEventListener('drop', e => { e.preventDefault(); els.dropZone.classList.remove('dragging'); if (e.dataTransfer.files[0]) readEssayImage(e.dataTransfer.files[0]); });
  els.essayImageInput.addEventListener('change', () => { if (els.essayImageInput.files[0]) readEssayImage(els.essayImageInput.files[0]); });
  els.reviewEssayButton.addEventListener('click', reviewEssay);

  // Settings
  els.saveSettingsButton.addEventListener('click', () => {
    settings.provider = els.providerSelect.value;
    settings.apiKey = els.apiKeyInput.value.trim();
    settings.model = els.modelSelect.value;
    saveSettings();
    renderConnection();
    showToast(settings.apiKey ? '已保存 ' + settings.provider + ' 设置' : '已保存设置，未填写 API Key 时使用演示模式');
  });
  els.clearSettingsButton.addEventListener('click', () => {
    settings.apiKey = '';
    settings.provider = 'deepseek';
    settings.model = 'deepseek-chat';
    localStorage.removeItem(settingsKey);
    hydrateSettingsForm();
    renderConnection();
    showToast('已清除本机模型配置');
  });
  els.providerSelect.addEventListener('change', () => {
    const provId = els.providerSelect.value;
    const prov = serverConfig.providers?.[provId];
    if (prov) {
      settings.provider = provId;
      settings.model = prov.defaultModel;
      updateModelDropdown();
    }
  });
  els.srsModeEbbinghaus.addEventListener('change', () => { els.srsIntervalsInput.hidden = true; });
  els.srsModeCustom.addEventListener('change', () => { els.srsIntervalsInput.hidden = false; });
  els.saveSrsSettingsBtn.addEventListener('click', () => {
    const mode = els.srsModeEbbinghaus.checked ? 'ebbinghaus' : 'custom';
    let intervals = [1, 2, 4, 7, 14, 30, 60];
    if (mode === 'custom') {
      const raw = els.srsIntervalsInput.value.trim();
      intervals = raw.split(/[,，\s]+/).map(Number).filter(n => n >= 0 && Number.isFinite(n));
      if (!intervals.length) intervals = [1, 2, 4, 7, 14, 30, 60];
    }
    srsConfig.mode = mode;
    srsConfig.intervals = intervals;
    saveSrsConfig();
    showToast('复习间隔已保存');
  });
}

﻿// app-study.js - Study / flashcard logic (bubei-style)

function getFilteredItems() {
  const query = els.globalSearch.value.trim().toLowerCase();
  return state.items.filter(i => {
    const matchesFilter = libraryFilter === 'all' || i.type === libraryFilter;
    const haystack = (i.term + ' ' + i.meaning + ' ' + i.examMeaning + ' ' + i.collocations.join(' ') + ' ' + i.example + ' ' + i.bankName).toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function getDueItems() {
  const today = todayKey();
  const query = els.globalSearch.value.trim().toLowerCase();
  return state.items
    .filter(i => i.due <= today || i.stats.seen === 0)
    .filter(i => { if (!query) return true; return (i.term + ' ' + i.meaning + ' ' + i.examMeaning + ' ' + i.collocations.join(' ') + ' ' + i.example + ' ' + i.bankName).toLowerCase().includes(query); })
    .sort((a, b) => { const d = (b.stats.wrong || 0) - (a.stats.wrong || 0); return d !== 0 ? d : a.mastery - b.mastery; });
}

function renderStudy() {
  const dueItems = getDueItems();
  const fallbackItems = state.items.length ? state.items : seedItems;
  const card = dueItems.find(i => i.id === currentCardId) || dueItems[0] || fallbackItems.find(i => i.id === currentCardId) || fallbackItems[0];
  if (!card) {
    els.cardPrompt.textContent = '先添加一个单词或短语';
    return;
  }
  currentCardId = card.id;

  // Update count
  const totalDue = dueItems.length || fallbackItems.length;
  const activeList = dueItems.length ? dueItems : fallbackItems;
  const idx = Math.max(0, activeList.findIndex(i => i.id === currentCardId));
  const countEl = document.getElementById('studyCount');
  if (countEl) countEl.textContent = (idx + 1) + ' / ' + totalDue;

  // Progress bar
  const bar = document.getElementById('studyProgressBar');
  if (bar) bar.style.width = (totalDue ? ((idx + 1) / totalDue * 100) : 0) + '%';

  // Card type tag
  els.cardType.textContent = card.type === 'phrase' ? '短语' : '单词';

  // Front prompt
  els.cardPrompt.textContent = studyMode === 'meaning' ? card.term : card.meaning;
  els.frontTermHint.textContent = card.term;

  // Reset to front
  const front = document.getElementById('studyCardFront');
  const back = document.getElementById('studyCardBack');
  if (front) front.hidden = false;
  if (back) back.hidden = true;
  els.cardAnswer.innerHTML = '';
  if (els.studyActions) els.studyActions.hidden = true;

  // Re-enable buttons
  els.revealButton.disabled = false;
  els.revealButton.textContent = '看答案';
  els.qualityButtons.forEach(b => b.disabled = false);
  updateAutoSpeakButton();

  scheduleAutoSpeak(card.id);
}

function revealAnswer() {
  const card = state.items.find(i => i.id === currentCardId);
  if (!card) return;

  const collocations = card.collocations || [];
  els.cardAnswer.innerHTML =
    '<div class="answer-word-block">' +
      '<strong>' + escapeHtml(card.term) + '</strong>' +
      '<div class="study-sound-line answer-sound-line"><button data-speak="' + card.id + '" data-accent="uk" class="study-sound-pill" type="button">英</button><button data-speak="' + card.id + '" data-accent="us" class="study-sound-pill" type="button">美</button></div>' +
    '</div>' +
    '<div class="answer-choice-card"><span>' + escapeHtml(card.type === 'phrase' ? 'phr.' : '释义') + '</span><p>' + escapeHtml(card.meaning) + '</p></div>' +
    '<div class="answer-choice-card"><span>常考</span><p>' + escapeHtml(card.examMeaning || card.meaning) + '</p></div>' +
    (collocations.length ? '<div class="answer-choice-card"><span>搭配</span><p>' + escapeHtml(collocations.join('；')) + '</p></div>' : '') +
    (card.example ? '<div class="answer-choice-card"><span>例句</span><p>' + escapeHtml(card.example) + '</p></div>' : '');

  bindSpeakButtons(els.cardAnswer);

  // Flip to back
  const front = document.getElementById('studyCardFront');
  const back = document.getElementById('studyCardBack');
  if (front) front.hidden = true;
  if (back) back.hidden = false;
  if (els.studyActions) els.studyActions.hidden = false;

  els.revealButton.disabled = true;
}

function markCard(quality) {
  const card = state.items.find(i => i.id === currentCardId);
  if (!card) return;

  // If answer not yet revealed, reveal it first
  const back = document.getElementById('studyCardBack');
  if (back && back.hidden) {
    revealAnswer();
  }

  const intervals = srsConfig.intervals;
  card.stats.seen += 1;
  if (quality === 'again') { card.stats.wrong += 1; card.mastery = Math.max(0, card.mastery - 1); card.due = todayKey(); }
  if (quality === 'hard') { card.stats.right += 1; card.mastery = Math.min(intervals.length - 1, card.mastery + 0.5); card.due = daysFromNow(1); }
  if (quality === 'easy') { card.stats.right += 1; card.mastery = Math.min(intervals.length - 1, card.mastery + 1); card.due = daysFromNow(intervals[Math.ceil(card.mastery)] || intervals[intervals.length - 1] || 30); }
  state.sessions.push({ id: crypto.randomUUID(), itemId: card.id, term: card.term, quality, date: todayKey(), at: new Date().toISOString() });
  saveState();

  // Disable buttons and advance after 2s
  els.qualityButtons.forEach(b => b.disabled = true);
  els.revealButton.disabled = true;
  window.setTimeout(() => {
    currentCardId = null;
    renderStudy();
    renderStats();
  }, 2000);
}

﻿// app-library.js - Library management

function renderPresetBankOptions() {
  const banks = Object.values(presetBanks);
  if (!banks.length) { els.presetBankSelect.innerHTML = '<option value=\"\">未找到内置词库</option>'; return; }
  els.presetBankSelect.innerHTML = banks.map(b => '<option value=\"' + b.id + '\">' + escapeHtml(b.name) + ' · ' + escapeHtml(b.exam) + '</option>').join('');
}

function renderPresetSummary() {
  const bank = presetBanks[els.presetBankSelect.value] || Object.values(presetBanks)[0];
  if (!bank) { els.presetDescription.textContent = '没有可用的内置词库。'; els.presetStats.innerHTML = ''; return; }
  if (els.presetBankSelect.value !== bank.id) els.presetBankSelect.value = bank.id;
  const owned = state.items.filter(i => i.bankId === bank.id).length;
  const edited = state.items.filter(i => i.bankId === bank.id && i.userEdited).length;
  els.presetDescription.textContent = bank.description + ' 当前版本：' + bank.version;
  els.presetStats.innerHTML = '<span>' + bank.items.length + ' 个内置词</span><span>已在我的词库：' + owned + '</span><span>已手动改过：' + edited + '</span>';
}

function importPresetBank(bankId, options = {}) {
  const bank = presetBanks[bankId];
  const result = { added: 0, updated: 0, kept: 0 };
  if (!bank) return result;
  bank.items.forEach(entry => {
    const presetKey = bank.id + ':' + entry.term.toLowerCase();
    const existing = state.items.find(i => i.presetKey === presetKey || i.term.toLowerCase() === entry.term.toLowerCase());
    const next = presetToItem(bank.id, entry);
    if (!existing) { state.items.push(next); result.added += 1; return; }
    const shouldOverwrite = options.overwriteUserEdits || !existing.userEdited;
    if (!shouldOverwrite) { existing.bankId = existing.bankId || bank.id; existing.bankName = existing.bankName || bank.name; existing.presetKey = existing.presetKey || presetKey; existing.presetVersion = existing.presetVersion || bank.version; result.kept += 1; return; }
    Object.assign(existing, { type: next.type, meaning: next.meaning, examMeaning: next.examMeaning, collocations: next.collocations, example: next.example, source: existing.source === 'manual' ? 'preset' : existing.source, bankId: bank.id, bankName: bank.name, presetKey, presetVersion: bank.version, updatedAt: new Date().toISOString() });
    result.updated += 1;
  });
  if (!options.silent) { saveState(); renderAll(); }
  return result;
}

function renderLibrary() {
  const items = getFilteredItems();
  if (!items.length) { els.libraryList.innerHTML = '<div class=\"empty-state\"><strong>没有匹配内容</strong><span>换个关键词，或添加新的单词和短语。</span></div>'; return; }
  els.libraryList.innerHTML = items.map(i => {
    const accuracy = i.stats.seen ? Math.round((i.stats.right / i.stats.seen) * 100) : 0;
    return '<article class=\"lib-card\"><div class=\"lib-head\"><strong>' + escapeHtml(i.term) + '</strong><span class=\"lib-tag\">' + (i.type === 'phrase' ? '短语' : '单词') + ' · 熟练' + Math.round(i.mastery) + '/7</span></div><p class=\"lib-meaning\">' + escapeHtml(i.meaning) + '</p><div class=\"exam-meaning-block\"><span class=\"exam-label\">常考</span><span>' + escapeHtml(i.examMeaning || i.meaning) + '</span></div>' + renderCollocationTags(i.collocations) + '<p class=\"mini-note\">' + escapeHtml(i.example) + '</p><div class=\"small-acts\"><button data-action=\"study\" data-id=\"' + i.id + '\" type=\"button\">复习</button><button data-action=\"speak-us\" data-id=\"' + i.id + '\" type=\"button\">美式</button><button data-action=\"speak-uk\" data-id=\"' + i.id + '\" type=\"button\">英式</button><button data-action=\"edit\" data-id=\"' + i.id + '\" type=\"button\">编辑</button><button data-action=\"reset\" data-id=\"' + i.id + '\" type=\"button\">重置</button><button data-action=\"delete\" data-id=\"' + i.id + '\" type=\"button\">删除</button></div></article>';
  }).join('');
  els.libraryList.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const { action, id } = b.dataset;
      if (action === 'study') { currentCardId = id; setView('study'); }
      if (action === 'speak-us') speakItem(id, 'us');
      if (action === 'speak-uk') speakItem(id, 'uk');
      if (action === 'edit') startEditing(id);
      if (action === 'reset') resetItem(id);
      if (action === 'delete') deleteItem(id);
    });
  });
}

function addLibraryItem(item) {
  const term = item.term.trim(), meaning = item.meaning.trim(), examMeaning = item.examMeaning.trim() || meaning, collocations = Array.isArray(item.collocations) ? item.collocations : parseCollocations(item.collocations), example = item.example.trim();
  if (!term || !meaning || !example) return;
  const existing = editingItemId ? state.items.find(e => e.id === editingItemId) : state.items.find(e => e.term.toLowerCase() === term.toLowerCase());
  if (existing) {
    Object.assign(existing, { type: item.type, term, meaning, examMeaning, collocations, example, due: todayKey(), userEdited: true, updatedAt: new Date().toISOString() });
  } else {
    state.items.unshift({ id: crypto.randomUUID(), type: item.type, term, meaning, examMeaning, collocations, example, mastery: 0, due: todayKey(), stats: { seen: 0, right: 0, wrong: 0 }, source: item.source || 'manual', bankId: '', bankName: '', presetKey: '', presetVersion: '', userEdited: true, updatedAt: new Date().toISOString() });
  }
  saveState(); renderAll();
}

function resetItem(id) { const item = state.items.find(e => e.id === id); if (!item) return; item.mastery = 0; item.due = todayKey(); item.stats = { seen: 0, right: 0, wrong: 0 }; saveState(); renderAll(); }
function deleteItem(id) { const idx = state.items.findIndex(i => i.id === id); if (idx >= 0) { state.items.splice(idx, 1); saveState(); renderAll(); } }

function startEditing(id) {
  const item = state.items.find(e => e.id === id); if (!item) return;
  editingItemId = id;
  els.itemType.value = item.type; els.itemTerm.value = item.term; els.itemMeaning.value = item.meaning; els.itemExamMeaning.value = item.examMeaning || item.meaning; els.itemCollocations.value = item.collocations.join('\n'); els.itemExample.value = item.example;
  els.formSubmitButton.textContent = '保存修改'; els.cancelEditButton.hidden = false; els.itemTerm.focus();
}

function clearEditor() { editingItemId = null; els.addItemForm.reset(); els.formSubmitButton.textContent = '加入词库'; els.cancelEditButton.hidden = true; }

function parseCollocations(value) {
  if (Array.isArray(value)) return value.map(i => String(i).trim()).filter(Boolean);
  return String(value || '').split(/[\r\n,;，；]+/).map(i => i.trim()).filter(Boolean);
}

function renderCollocationTags(collocations = []) {
  if (!collocations.length) return '<p class=\"mini-note\"><b>搭配：</b>暂无</p>';
  return '<div class=\"collocation-row\" aria-label=\"常用搭配\">' + collocations.map(i => '<span>' + escapeHtml(i) + '</span>').join('') + '</div>';
}

﻿// app-speak.js - Speech synthesis

function bindSpeakButtons(root) {
  root.querySelectorAll('[data-speak]').forEach(b => b.addEventListener('click', () => speakItem(b.dataset.speak, b.dataset.accent)));
}

function supportsSpeech() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function mobileNeedsSpeechGesture() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
}

function updateAutoSpeakButton() {
  if (!els.autoSpeakButton) return;
  if (!supportsSpeech()) {
    els.autoSpeakButton.hidden = false;
    els.autoSpeakButton.disabled = true;
    els.autoSpeakButton.textContent = '当前浏览器不支持朗读';
    return;
  }
  const needsUnlock = currentView === 'study' && mobileNeedsSpeechGesture() && !speechUnlocked;
  els.autoSpeakButton.hidden = !needsUnlock;
  els.autoSpeakButton.disabled = false;
  els.autoSpeakButton.textContent = pendingAutoSpeakId ? '开启自动朗读' : '开启朗读';
}

function unlockAutoSpeak() {
  pendingAutoSpeakId = currentCardId || pendingAutoSpeakId;
  flushPendingAutoSpeak();
}

function scheduleAutoSpeak(id) {
  if (currentView !== 'study' || id === lastAutoSpokenCardId) return;
  window.clearTimeout(autoSpeakTimer);
  if (mobileNeedsSpeechGesture() && !speechUnlocked) {
    pendingAutoSpeakId = id;
    updateAutoSpeakButton();
    return;
  }
  autoSpeakTimer = window.setTimeout(() => {
    const spoken = speakItem(id, 'us', { silent: true, auto: true });
    if (spoken) { lastAutoSpokenCardId = id; pendingAutoSpeakId = ''; } else { pendingAutoSpeakId = id; }
    updateAutoSpeakButton();
  }, 260);
}

function flushPendingAutoSpeak() {
  if (!pendingAutoSpeakId || currentView !== 'study') return;
  const spoken = speakItem(pendingAutoSpeakId, 'us', { silent: true, auto: true });
  if (spoken) {
    speechUnlocked = true;
    lastAutoSpokenCardId = pendingAutoSpeakId;
    pendingAutoSpeakId = '';
  }
  updateAutoSpeakButton();
}

function speakItem(id, accent, options = {}) {
  const item = state.items.find(e => e.id === id);
  if (!item) return false;
  if (!supportsSpeech()) { if (!options.silent) showToast('当前浏览器不支持朗读'); return false; }
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(item.term);
  utterance.lang = accent === 'uk' ? 'en-GB' : 'en-US';
  utterance.rate = 0.9;
  utterance.volume = 1;
  utterance.onstart = () => {
    speechUnlocked = true;
    updateAutoSpeakButton();
  };
  utterance.onerror = () => {
    if (options.auto) pendingAutoSpeakId = id;
    updateAutoSpeakButton();
    if (!options.silent) showToast('朗读失败，请换 Safari 或 Chrome 打开');
  };
  const voices = synth.getVoices();
  const preferred = voices.find(v => v.lang === utterance.lang);
  if (preferred) utterance.voice = preferred;
  try {
    synth.cancel();
    if (typeof synth.resume === 'function') synth.resume();
    synth.speak(utterance);
    return true;
  } catch (_) {
    if (options.auto) pendingAutoSpeakId = id;
    updateAutoSpeakButton();
    if (!options.silent) showToast('朗读被浏览器拦截，请点开启自动朗读');
    return false;
  }
}

﻿// app-read.js - AI-generated reading passages

async function generatePassage() {
  els.generatePassageBtn.disabled = true;
  els.generatePassageBtn.textContent = '生成中...';
  els.passageState.hidden = true;
  els.passageResult.hidden = true;

  // Select words based on source
  let words = [];
  const source = els.readWordSource.value;
  if (source === 'due') words = getDueItems().slice(0, 15);
  else if (source === 'weak') words = [...state.items].sort((a, b) => b.stats.wrong - a.stats.wrong || a.mastery - b.mastery).slice(0, 15);
  else if (source === 'mastered') words = state.items.filter(i => i.mastery >= 5).sort(() => Math.random() - 0.5).slice(0, 15);
  else words = [...state.items].sort(() => Math.random() - 0.5).slice(0, 15);

  if (!words.length) {
    els.passageState.hidden = false;
    els.passageState.innerHTML = '<strong>没有可用的词</strong><span>请先在词库中添加一些单词或短语。</span>';
    els.generatePassageBtn.disabled = false;
    els.generatePassageBtn.textContent = 'AI 生成文章';
    return;
  }

  const wordPayload = words.map(w => ({ term: w.term, meaning: w.meaning, type: w.type }));
  const lengthMap = { sentence: 'Write exactly ONE sentence.', short: 'Write a short passage of 80-120 words.', medium: 'Write a passage of 150-200 words.' };
  const lengthHint = lengthMap[els.readLength.value] || lengthMap.short;

  try {
    const resp = await fetch('/api/generate-passage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': settings.apiKey || '' },
      body: JSON.stringify({
        provider: settings.provider || 'deepseek',
        model: settings.model || 'deepseek-chat',
        words: wordPayload,
        lengthHint
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '生成失败');

    currentPassage = data;
    renderPassage(data);
    showToast(data.demo ? '演示模式：配置 API Key 后使用真实 AI' : '文章生成完成');
  } catch (err) {
    els.passageState.hidden = false;
    els.passageState.innerHTML = '<strong>生成失败</strong><span>' + escapeHtml(err.message) + '</span>';
  } finally {
    els.generatePassageBtn.disabled = false;
    els.generatePassageBtn.textContent = 'AI 生成文章';
  }
}

function renderPassage(data) {
  els.passageState.hidden = true;
  els.passageResult.hidden = false;
  els.passageTitle.textContent = data.title || '阅读文章';
  els.passageTranslation.textContent = data.translationCn || '';
  els.passageTranslation.hidden = true;
  els.toggleTranslationBtn.textContent = '显示翻译';

  // Build clickable text
  const words = data.highlightedWords || [];
  const wordMap = {};
  words.forEach(w => { wordMap[w.word.toLowerCase()] = w; });

  // Tokenize text into clickable spans
  let html = '';
  const text = data.text || '';
  // Split by words, preserving punctuation
  const tokens = text.match(/[\w'']+|[^\w\s'']+|\s+/g) || [text];
  tokens.forEach(token => {
    if (/^\s+$/.test(token)) { html += token; return; }
    const clean = token.replace(/[^a-zA-Z'']/g, '').toLowerCase();
    const info = wordMap[clean];
    if (info && /^[a-zA-Z'']+$/.test(token.trim())) {
      html += '<span class=\"passage-word\" data-word=\"' + escapeHtml(clean) + '\" data-meaning=\"' + escapeHtml(info.meaningCn) + '\" data-pos=\"' + escapeHtml(info.pos || '') + '\" title=\"' + escapeHtml(info.meaningCn) + '\">' + escapeHtml(token) + '</span>';
    } else {
      html += escapeHtml(token);
    }
  });

  els.passageText.innerHTML = html;

  // Click on word
  els.passageText.querySelectorAll('.passage-word').forEach(span => {
    span.addEventListener('click', () => selectPassageWord(span.dataset.word, span.dataset.meaning, span.dataset.pos));
  });

  // Build vocab list
  renderPassageVocabList(words);
}

function selectPassageWord(word, meaning, pos) {
  selectedPassageWord = { word, meaning, pos };

  // Highlight in text
  els.passageText.querySelectorAll('.passage-word').forEach(s => {
    s.classList.toggle('selected', s.dataset.word === word);
  });

  // Show detail
  const existing = state.items.find(i => i.term.toLowerCase() === word.toLowerCase());
  const isNew = !existing;
  const isMastered = existing && existing.mastery >= 5;
  const isWeak = existing && existing.stats.wrong > existing.stats.right;

  els.passageWordDetail.hidden = false;
  els.passageWordDetail.innerHTML =
    '<div class=\"word-detail-header\"><strong>' + escapeHtml(word) + '</strong><span class=\"pos-tag\">' + escapeHtml(pos || 'word') + '</span></div>' +
    '<p>' + escapeHtml(meaning) + '</p>' +
    (existing ? '<p class=\"mini-note\">已在词库 · 熟练度 ' + Math.round(existing.mastery) + '/7 · 正确 ' + existing.stats.right + ' 次 / 错误 ' + existing.stats.wrong + ' 次</p>' : '<p class=\"mini-note\">不在你的词库中</p>') +
    '<div class=\"word-actions\">' +
    '<button data-mark=\"new\" type=\"button\">' + (isNew ? '标记为生词' : '加入词库') + '</button>' +
    (existing ? '<button data-mark=\"known\" type=\"button\">' + (isMastered ? '已经是熟词' : '标记为熟词') + '</button>' : '') +
    '</div>';

  els.passageWordDetail.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.mark === 'new') markWordAsNew(word, meaning, pos);
      if (b.dataset.mark === 'known') markWordAsKnown(word);
    });
  });
}

function markWordAsNew(word, meaning, pos) {
  const existing = state.items.find(i => i.term.toLowerCase() === word.toLowerCase());
  if (existing) { existing.due = todayKey(); existing.mastery = Math.max(0, existing.mastery - 2); saveState(); renderAll(); showToast('已将 \"' + word + '\" 重新加入待复习'); }
  else {
    addLibraryItem({ type: pos === 'phrase' ? 'phrase' : 'word', term: word, meaning: meaning, examMeaning: meaning, collocations: [], example: '', source: 'passage' });
    showToast('已将 \"' + word + '\" 加入词库');
  }
  if (selectedPassageWord) selectPassageWord(word, meaning, pos);
}

function markWordAsKnown(word) {
  const existing = state.items.find(i => i.term.toLowerCase() === word.toLowerCase());
  if (existing) { existing.mastery = Math.min(7, existing.mastery + 3); existing.due = daysFromNow(30); existing.stats.right += 3; saveState(); renderAll(); showToast('已将 \"' + word + '\" 标记为熟词'); }
  if (selectedPassageWord) selectPassageWord(selectedPassageWord.word, selectedPassageWord.meaning, selectedPassageWord.pos);
}

function renderPassageVocabList(words) {
  if (!words.length) { els.passageVocabList.innerHTML = '<div class=\"empty-state\"><strong>无生词</strong><span>这篇文章中没有需要特别注意的词。</span></div>'; return; }
  els.passageVocabList.innerHTML = words.map(w =>
    '<div class=\"vocab-chip\" data-word=\"' + escapeHtml(w.word) + '\" data-meaning=\"' + escapeHtml(w.meaningCn) + '\" data-pos=\"' + escapeHtml(w.pos || '') + '\">' +
    '<strong>' + escapeHtml(w.word) + '</strong><span>' + escapeHtml(w.meaningCn) + '</span><span class=\"pos-tag\">' + escapeHtml(w.pos || '') + '</span>' +
    '</div>'
  ).join('');
  els.passageVocabList.querySelectorAll('.vocab-chip').forEach(chip => {
    chip.addEventListener('click', () => selectPassageWord(chip.dataset.word, chip.dataset.meaning, chip.dataset.pos));
  });
}

function toggleTranslation() {
  const hidden = els.passageTranslation.hidden;
  els.passageTranslation.hidden = !hidden;
  els.toggleTranslationBtn.textContent = hidden ? '隐藏翻译' : '显示翻译';
}

function renderRead() {
  // Re-render if we have a current passage
  if (currentPassage) renderPassage(currentPassage);
}

﻿// app-essay.js - Essay review (text + image)

function readEssayImage(file) {
  if (!file.type.startsWith('image/')) { showToast('请上传图片文件'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    essayImageDataUrl = reader.result;
    els.essayPreview.src = essayImageDataUrl;
    els.essayPreview.hidden = false;
    els.dropEmpty.hidden = true;
  };
  reader.readAsDataURL(file);
}

async function reviewEssay() {
  const essayText = els.essayTextInput.value.trim();
  if (essayMode === 'text' && !essayText) { showToast('请输入作文内容'); return; }
  if (essayMode === 'image' && !essayImageDataUrl) { showToast('请先上传作文图片'); return; }

  els.reviewEssayButton.disabled = true;
  els.reviewEssayButton.textContent = '批改中...';
  els.reviewState.hidden = false;
  els.reviewState.innerHTML = '<strong>正在批改</strong><span>AI 正在分析你的作文，检查语法、结构和用词。</span>';
  els.reviewResult.hidden = true;

  const provId = settings.provider || 'deepseek';
  const usedModel = settings.model || 'deepseek-chat';

  try {
    const resp = await fetch('/api/essay-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey || ''
      },
      body: JSON.stringify({
        provider: provId,
        model: usedModel,
        apiKey: settings.apiKey,
        essayText: essayMode === 'text' ? essayText : '',
        imageDataUrl: essayMode === 'image' ? essayImageDataUrl : '',
        prompt: els.essayPrompt.value.trim(),
        targetLevel: els.targetLevel.value,
        userStats: buildUserProfile()
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '批改失败');
    state.reviews.unshift(data);
    saveState();
    renderReview(data);
    renderAll();
    showToast(data.demo ? '演示模式：配置 API Key 后使用真实 AI' : '批改完成');
  } catch (err) {
    els.reviewState.hidden = false;
    els.reviewResult.hidden = true;
    els.reviewState.innerHTML = '<strong>批改失败</strong><span>' + escapeHtml(err.message) + '</span>';
  } finally {
    els.reviewEssayButton.disabled = false;
    els.reviewEssayButton.textContent = '开始批改';
  }
}

function buildUserProfile() {
  const weakVocabulary = [...state.items].sort((a, b) => b.stats.wrong - a.stats.wrong || a.mastery - b.mastery).slice(0, 8).map(i => ({ term: i.term, meaning: i.meaning, wrong: i.stats.wrong, seen: i.stats.seen }));
  const recentReviews = state.reviews.slice(0, 5).map(r => ({ score: r.score, repeated: r.repetitionReductions?.map(i => i.overused) || [], habits: r.userHabitSummary || [] }));
  return { weakVocabulary, recentReviews, localHabits: deriveHabits().slice(0, 8) };
}

function renderReview(review) {
  const score = Math.max(0, Math.min(100, Number(review.score) || 0));
  els.reviewState.hidden = true;
  els.reviewResult.hidden = false;
  els.reviewResult.innerHTML =
    '<div class=\"score-row\" style=\"--score: ' + score + '%\"><div class=\"score-circle\"><strong>' + score + '</strong></div><div><h3>' + escapeHtml(review.level || '未评级') + (review.demo ? ' · 演示' : '') + '</h3><p>' + escapeHtml(review.teacherCommentCn) + '</p></div></div>' +
    resultBlock('识别原文', paragraph(review.extractedText)) +
    resultBlock('保留原意的修改版', paragraph(review.correctedEssay)) +
    resultBlock('更简单可背的版本', paragraph(review.simpleRewrite)) +
    resultBlock('语法纠错', renderFixes(review.grammarFixes)) +
    resultBlock('结构优化', renderTips(review.structureTips)) +
    resultBlock('减少重复', renderRepetitions(review.repetitionReductions)) +
    resultBlock('加入词库', renderWordChips(review.wordsToLearn)) +
    (review.nextPractice ? resultBlock('下一步练习', renderTips(review.nextPractice)) : '');

  els.reviewResult.querySelectorAll('[data-add-word]').forEach(b => {
    b.addEventListener('click', () => {
      const idx = Number(b.dataset.addWord);
      const w = review.wordsToLearn[idx];
      if (!w) return;
      addLibraryItem({ type: w.term.includes(' ') ? 'phrase' : 'word', term: w.term, meaning: w.meaningCn, examMeaning: w.meaningCn, collocations: [], example: w.example, source: 'essay' });
      showToast('已加入词库');
    });
  });
}

function resultBlock(title, body) { return '<section class=\"result-block\"><h3>' + escapeHtml(title) + '</h3>' + body + '</section>'; }
function paragraph(text) { return '<p>' + escapeHtml(text || '暂无') + '</p>'; }

function renderFixes(items = []) {
  items = Array.isArray(items) ? items : [];
  if (!items.length) return '<p class=\"mini-note\">没有明显语法问题。</p>';
  return '<ul class=\"fix-list\">' + items.map(i => '<li><strong>' + escapeHtml(i.original) + '</strong><p>' + escapeHtml(i.revised) + '</p><p class=\"mini-note\">' + escapeHtml(i.reasonCn) + '</p></li>').join('') + '</ul>';
}

function renderTips(items = []) {
  items = Array.isArray(items) ? items : [];
  if (!items.length) return '<p class=\"mini-note\">暂无建议。</p>';
  return '<ul class=\"tips-list\">' + items.map(i => '<li>' + escapeHtml(i) + '</li>').join('') + '</ul>';
}

function renderRepetitions(items = []) {
  items = Array.isArray(items) ? items : [];
  if (!items.length) return '<p class=\"mini-note\">没有明显重复用词。</p>';
  return '<ul class=\"repeat-list\">' + items.map(i => {
    const replacements = Array.isArray(i.replacements) ? i.replacements : [];
    return '<li><strong>' + escapeHtml(i.overused) + '</strong><p>' + escapeHtml(replacements.join(' / ')) + '</p><p class=\"mini-note\">' + escapeHtml(i.noteCn) + '</p></li>';
  }).join('') + '</ul>';
}

function renderWordChips(items = []) {
  items = Array.isArray(items) ? items : [];
  if (!items.length) return '<p class=\"mini-note\">这次没有推荐新表达。</p>';
  return '<div class=\"tag-row\">' + items.map((i, idx) => '<span class=\"word-chip\">' + escapeHtml(i.term) + '<button data-add-word=\"' + idx + '\" type=\"button\">加入</button></span>').join('') + '</div>';
}

﻿// app-habit.js - Habit analysis and utilities

function deriveHabits() {
  const reviewText = state.reviews.map(r => (r.extractedText || '') + ' ' + (r.correctedEssay || '')).join(' ').toLowerCase();
  const commonWords = ['good', 'very', 'many', 'thing', 'things', 'people', 'important', 'also', 'so', 'because'];
  const habits = commonWords.map(w => ({ label: w, count: (reviewText.match(new RegExp('\\\\b' + w + '\\\\b', 'g')) || []).length })).filter(i => i.count > 0).sort((a, b) => b.count - a.count).map(i => '常用 ' + i.label + '，最近出现 ' + i.count + ' 次，可以准备 2 到 3 个替换表达。');
  const modelHabits = state.reviews.flatMap(r => r.userHabitSummary || []);
  const weak = state.items.filter(i => i.stats.wrong > i.stats.right).slice(0, 3).map(i => i.term + ' 还不稳，建议放进今天复习。');
  return [...habits, ...modelHabits, ...weak];
}

function renderHabits() {
  const habits = deriveHabits();
  els.habitSummary.innerHTML = habits.length
    ? habits.slice(0, 10).map(i => '<div class=\"habit-item\">' + escapeHtml(i) + '</div>').join('')
    : '<div class=\"empty-state\"><strong>还没有足够数据</strong><span>背词和批改几次作文后，这里会总结你的常用词、薄弱语法和重复表达。</span></div>';

  const latest = state.reviews[0];
  const practice = latest?.nextPractice?.length ? latest.nextPractice : ['复习今天到期的单词和短语。', '写 5 句简单句，每句只表达一个清楚意思。'];
  els.practiceList.innerHTML = practice.map(i => '<div class=\"practice-item\">' + escapeHtml(i) + '</div>').join('');
}

﻿// app-utils.js - Utility functions and settings hydration

async function fetchConfig() {
  try {
    const resp = await fetch("/api/config");
    serverConfig = await resp.json();
  } catch (_) { serverConfig = { providers: {} }; }
  // Populate model dropdown
  updateModelDropdown();
  renderConnection();
}

function updateModelDropdown() {
  const provId = settings.provider || "deepseek";
  const prov = serverConfig.providers?.[provId];
  if (prov && els.modelSelect) {
    els.modelSelect.innerHTML = prov.models.map(m => "<option value=\"" + m + "\"" + (m === settings.model ? " selected" : "") + ">" + m + "</option>").join("");
    if (els.providerSelect) els.providerSelect.value = provId;
  }
}

function hydrateSettingsForm() {
  if (els.providerSelect) els.providerSelect.value = settings.provider || "deepseek";
  if (els.apiKeyInput) els.apiKeyInput.value = settings.apiKey || "";
  if (els.modelSelect) updateModelDropdown();
  // SRS
  if (els.srsModeEbbinghaus && els.srsModeCustom) {
    if (srsConfig.mode === "custom") {
      els.srsModeCustom.checked = true;
      els.srsIntervalsInput.hidden = false;
    } else {
      els.srsModeEbbinghaus.checked = true;
      els.srsIntervalsInput.hidden = true;
    }
    if (els.srsIntervalsInput) els.srsIntervalsInput.value = srsConfig.intervals.join(", ");
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "vocab-writing-coach-" + todayKey() + ".json"; a.click();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast"; toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#039;");
}

init();
