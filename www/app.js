"use strict";

const STORAGE_KEY = "anxin-reminder-v1";
const RETENTION_DAYS = 14;
const DEFAULT_MEDICATIONS = [
  { name: "示例早间药（请修改）", dose: "按医生处方填写", time: "08:00" },
  { name: "示例午间药（请修改）", dose: "按医生处方填写", time: "12:30" },
  { name: "示例晚间药（请修改）", dose: "按医生处方填写", time: "20:00" },
];

const elements = {
  liveTime: document.querySelector("#liveTime"),
  liveDate: document.querySelector("#liveDate"),
  notifyButton: document.querySelector("#notifyButton"),
  settingsButton: document.querySelector("#settingsButton"),
  setupBanner: document.querySelector("#setupBanner"),
  setupButton: document.querySelector("#setupButton"),
  statusPanel: document.querySelector("#statusPanel"),
  statusEyebrow: document.querySelector("#statusEyebrow"),
  mainStatus: document.querySelector("#mainStatus"),
  mainDetail: document.querySelector("#mainDetail"),
  mainAction: document.querySelector("#mainAction"),
  progressNumber: document.querySelector("#progressNumber"),
  medicationProgress: document.querySelector("#medicationProgress"),
  medicationList: document.querySelector("#medicationList"),
  activityCard: document.querySelector("#activityCard"),
  activityStatus: document.querySelector("#activityStatus"),
  activityCountdown: document.querySelector("#activityCountdown"),
  activityHint: document.querySelector("#activityHint"),
  activityDoneButton: document.querySelector("#activityDoneButton"),
  activitySnoozeButton: document.querySelector("#activitySnoozeButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  settingsNotice: document.querySelector("#settingsNotice"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  cancelSettingsButton: document.querySelector("#cancelSettingsButton"),
  medEditorList: document.querySelector("#medEditorList"),
  addMedicationButton: document.querySelector("#addMedicationButton"),
  activityInterval: document.querySelector("#activityInterval"),
  sittingEnabled: document.querySelector("#sittingEnabled"),
  voiceEnabled: document.querySelector("#voiceEnabled"),
  soundEnabled: document.querySelector("#soundEnabled"),
  notificationsEnabled: document.querySelector("#notificationsEnabled"),
  permissionButton: document.querySelector("#permissionButton"),
  resetTodayButton: document.querySelector("#resetTodayButton"),
  resetAllButton: document.querySelector("#resetAllButton"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmYesButton: document.querySelector("#confirmYesButton"),
  confirmNoButton: document.querySelector("#confirmNoButton"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toastMessage"),
  toastAction: document.querySelector("#toastAction"),
  toastClose: document.querySelector("#toastClose"),
};

let state = loadState();
let lastRenderedMinute = "";
let toastTimer = null;
let toastActionHandler = null;
let confirmResolver = null;
let audioContext = null;

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `med-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultState() {
  const now = Date.now();
  return {
    version: 1,
    configured: false,
    medications: DEFAULT_MEDICATIONS.map((medication) => ({
      id: makeId(),
      ...medication,
    })),
    records: {},
    activity: {
      lastDoneAt: now,
      snoozeUntil: 0,
    },
    settings: {
      activityInterval: 45,
      sittingEnabled: true,
      voiceEnabled: true,
      soundEnabled: true,
      notificationsEnabled: false,
    },
    notificationsSent: {},
  };
}

function loadState() {
  const defaults = createDefaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") {
      return defaults;
    }

    const medications = Array.isArray(saved.medications)
      ? saved.medications
          .filter((item) => item && typeof item.name === "string" && typeof item.time === "string")
          .map((item) => ({
            id: typeof item.id === "string" && item.id ? item.id : makeId(),
            name: item.name.slice(0, 60),
            dose: String(item.dose || "按医生处方填写").slice(0, 80),
            time: isValidTime(item.time) ? item.time : "08:00",
          }))
      : defaults.medications;

    return {
      ...defaults,
      ...saved,
      configured: Boolean(saved.configured),
      medications: medications.length ? medications : defaults.medications,
      records: saved.records && typeof saved.records === "object" ? saved.records : {},
      activity: {
        ...defaults.activity,
        ...(saved.activity && typeof saved.activity === "object" ? saved.activity : {}),
      },
      settings: {
        ...defaults.settings,
        ...(saved.settings && typeof saved.settings === "object" ? saved.settings : {}),
      },
      notificationsSent:
        saved.notificationsSent && typeof saved.notificationsSent === "object"
          ? saved.notificationsSent
          : {},
    };
  } catch (error) {
    console.warn("无法读取已保存的提醒设置，将使用默认设置。", error);
    return defaults;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("无法保存提醒设置。", error);
    showToast("浏览器未能保存数据，请检查隐私设置。", "error", null, 6000);
  }
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAtTime(time, date = new Date()) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function getTodayRecords() {
  const today = localDateKey();
  if (!state.records[today] || typeof state.records[today] !== "object") {
    state.records[today] = {};
  }
  return state.records[today];
}

function pruneOldRecords() {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  Object.keys(state.records).forEach((key) => {
    const date = new Date(`${key}T00:00:00`);
    if (Number.isNaN(date.getTime()) || date < cutoff) {
      delete state.records[key];
    }
  });

  const notificationKeys = Object.keys(state.notificationsSent);
  if (notificationKeys.length > 80) {
    notificationKeys.slice(0, notificationKeys.length - 80).forEach((key) => {
      delete state.notificationsSent[key];
    });
  }
}

function orderedMedications() {
  return state.medications
    .map((medication, index) => ({ ...medication, originalIndex: index }))
    .sort((a, b) => {
      if (a.time === b.time) {
        return a.originalIndex - b.originalIndex;
      }
      return a.time.localeCompare(b.time);
    });
}

function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes < 60) {
    return `${safeMinutes} 分钟`;
  }
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function formatClockDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(Math.abs(milliseconds) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateClock() {
  const now = new Date();
  elements.liveTime.textContent = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  elements.liveDate.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
}

function renderMedication() {
  const ordered = orderedMedications();
  const records = getTodayRecords();
  const takenCount = ordered.filter((medication) => records[medication.id]).length;
  const firstUntakenIndex = ordered.findIndex((medication) => !records[medication.id]);
  const firstUntaken = firstUntakenIndex >= 0 ? ordered[firstUntakenIndex] : null;
  const now = new Date();

  elements.progressNumber.textContent = `${takenCount}/${ordered.length}`;
  elements.medicationProgress.textContent = `${takenCount} / ${ordered.length} 已完成`;
  elements.setupBanner.hidden = state.configured;
  elements.statusPanel.classList.remove("is-waiting", "is-due", "is-late", "is-complete");
  elements.mainAction.replaceChildren();

  if (!state.configured) {
    elements.statusPanel.classList.add("is-waiting");
    elements.statusEyebrow.textContent = "尚未完成设置";
    elements.mainStatus.textContent = "请先填写您的用药计划";
    elements.mainDetail.textContent =
      "填写真实药品、剂量和服药时间后，页面才会开始提醒。请按照医生处方设置。";
    const setupAction = makeButton("现在设置", "button button-light", () => openSettings(true));
    elements.mainAction.append(setupAction);
  } else if (!firstUntaken) {
    elements.statusPanel.classList.add("is-complete");
    elements.statusEyebrow.textContent = "今天全部完成";
    elements.mainStatus.textContent = "今天的药都按顺序记录好了";
    elements.mainDetail.textContent =
      "请保持记录准确，不要因为再次收到提醒而重复服药。久坐提醒仍会继续工作。";
  } else {
    const dueAt = dateAtTime(firstUntaken.time, now);
    const differenceMinutes = (now.getTime() - dueAt.getTime()) / 60000;
    const step = firstUntakenIndex + 1;

    if (differenceMinutes < 0) {
      elements.statusPanel.classList.add("is-waiting");
      elements.statusEyebrow.textContent = "下一次服药";
      elements.mainStatus.textContent = `${step}．${firstUntaken.time} 服用「${firstUntaken.name}」`;
      elements.mainDetail.textContent = `还有 ${formatMinutes(-differenceMinutes)}。剂量：${firstUntaken.dose}。未到时间前请先不用确认。`;
    } else if (differenceMinutes >= 120) {
      elements.statusPanel.classList.add("is-late");
      elements.statusEyebrow.textContent = "服药时间已超过 2 小时";
      elements.mainStatus.textContent = `「${firstUntaken.name}」还未记录`;
      elements.mainDetail.textContent =
        "请先核对医生或药师的说明，再确认是否已经服用。不要为了让提醒通过而随意补记。";
      const lateAction = makeButton(
        "我已按医嘱服用，确认记录",
        "button button-primary",
        () => recordMedication(firstUntaken.id),
      );
      elements.mainAction.append(lateAction);
    } else {
      elements.statusPanel.classList.add("is-due");
      elements.statusEyebrow.textContent =
        differenceMinutes < 1
          ? "到服药时间了"
          : `已超过计划时间 ${formatMinutes(differenceMinutes)}`;
      elements.mainStatus.textContent = `请服用第 ${step} 种药：${firstUntaken.name}`;
      elements.mainDetail.textContent = `剂量：${firstUntaken.dose}。服完后，请点下方按钮记录，再继续下一种药。`;
      const dueAction = makeButton(
        "我已服用，确认记录",
        "button button-primary",
        () => recordMedication(firstUntaken.id),
      );
      elements.mainAction.append(dueAction);
    }
  }

  renderMedicationList(ordered, records, firstUntaken, now);
}

function renderMedicationList(ordered, records, firstUntaken, now) {
  elements.medicationList.replaceChildren();

  if (!ordered.length) {
    elements.medicationList.append(
      makeEmptyState("还没有用药计划", "请打开“提醒设置”，添加一种药。"),
    );
    return;
  }

  ordered.forEach((medication, index) => {
    const record = records[medication.id];
    const isCurrent = firstUntaken?.id === medication.id;
    const dueAt = dateAtTime(medication.time, now);
    const isLate = isCurrent && now >= dueAt;
    const item = document.createElement("li");
    item.className = "medication-item";
    if (record) {
      item.classList.add("is-taken");
    } else if (isCurrent) {
      item.classList.add("is-current");
      if (isLate) {
        item.classList.add("is-late");
      }
    }

    let tagText = "等待按顺序";
    let tagClass = "";
    if (record) {
      tagText = "已记录";
      tagClass = "taken";
    } else if (isCurrent && isLate) {
      tagText = "现在需要记录";
      tagClass = "late";
    } else if (isCurrent) {
      tagText = "下一步";
      tagClass = "current";
    }

    let actionHTML = "";
    if (isCurrent && isLate) {
      actionHTML = `
        <button class="button button-primary take-button" type="button" data-take-id="${escapeHTML(medication.id)}">
          确认已服用
        </button>
      `;
    } else if (record) {
      const takenTime = new Date(record).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      actionHTML = `
        <span class="status-tag taken">${takenTime} 记录</span>
        <button class="undo-button" type="button" data-undo-id="${escapeHTML(medication.id)}">
          误点？撤销记录
        </button>
      `;
    } else {
      actionHTML = `<span class="status-tag">请等待</span>`;
    }

    item.innerHTML = `
      <span class="medication-number" aria-hidden="true">${record ? "✓" : index + 1}</span>
      <div class="medication-main">
        <div class="medication-title-row">
          <h3 class="medication-name">${escapeHTML(medication.name)}</h3>
          <span class="status-tag ${tagClass}">${tagText}</span>
        </div>
        <p class="medication-meta">
          <span class="medication-time">${escapeHTML(medication.time)}</span>
          · ${escapeHTML(medication.dose)}
        </p>
      </div>
      <div class="medication-actions">${actionHTML}</div>
    `;
    elements.medicationList.append(item);
  });
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function makeEmptyState(title, message) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const paragraph = document.createElement("span");
  paragraph.textContent = message;
  wrapper.append(strong, paragraph);
  return wrapper;
}

function nextActivityTime() {
  const intervalMs = Number(state.settings.activityInterval || 45) * 60 * 1000;
  const regularReminder = Number(state.activity.lastDoneAt || Date.now()) + intervalMs;
  return Math.max(regularReminder, Number(state.activity.snoozeUntil || 0));
}

function renderActivity() {
  const now = Date.now();
  const enabled = Boolean(state.settings.sittingEnabled);
  const nextAt = nextActivityTime();
  const remaining = nextAt - now;
  const due = enabled && remaining <= 0;

  elements.activityCard.classList.toggle("is-due", due);
  elements.activityDoneButton.disabled = false;

  if (!enabled) {
    elements.activityStatus.textContent = "久坐提醒已关闭，可在提醒设置中重新开启。";
    elements.activityCountdown.textContent = "已关闭";
    elements.activityHint.textContent = "即使提醒关闭，也可以随时起来走动。";
    elements.activitySnoozeButton.disabled = true;
    return;
  }

  elements.activitySnoozeButton.disabled = due;
  if (due) {
    const overdue = -remaining;
    elements.activityStatus.textContent =
      overdue > 60 * 1000
        ? `已经超过提醒时间 ${formatMinutes(overdue / 60000)}`
        : "该起来活动一下了";
    elements.activityCountdown.textContent = "请起身活动";
    elements.activityHint.textContent = "慢慢站起来，走动几分钟或伸展腿脚。";
  } else {
    elements.activityStatus.textContent = "距离下一次起身活动还有";
    elements.activityCountdown.textContent = formatClockDuration(remaining);
    elements.activityHint.textContent =
      Number(state.activity.snoozeUntil) > Number(state.activity.lastDoneAt)
        ? "已为你推迟 10 分钟。"
        : `每隔 ${state.settings.activityInterval} 分钟提醒一次，活动后重新计时。`;
  }
}

function renderAll() {
  updateClock();
  renderMedication();
  renderActivity();
  updateNotificationButton();
}

function recordMedication(id) {
  if (!state.configured) {
    showToast("请先完成用药计划设置。", "error");
    return;
  }

  const ordered = orderedMedications();
  const records = getTodayRecords();
  const firstUntaken = ordered.find((medication) => !records[medication.id]);
  const medication = ordered.find((item) => item.id === id);

  if (!medication) {
    showToast("没有找到这条用药计划，请刷新页面。", "error");
    return;
  }

  if (records[id]) {
    showToast("这顿药已经记录过了，请勿重复服用。", "error", null, 7000);
    return;
  }

  if (!firstUntaken || firstUntaken.id !== id) {
    showToast(`请先记录「${firstUntaken?.name || "上一项"}」，再记录下一种药。`, "error", null, 7000);
    return;
  }

  records[id] = Date.now();
  pruneOldRecords();
  saveState();
  renderMedication();
  updateDocumentTitle();
  showToast(
    `已记录：${medication.name}。请不要重复服用。`,
    "success",
    {
      label: "误点撤销",
      onClick: () => undoMedication(id, true),
    },
    10000,
  );
}

async function undoMedication(id, skipConfirm = false) {
  const medication = state.medications.find((item) => item.id === id);
  if (!medication || !getTodayRecords()[id]) {
    return;
  }

  if (!skipConfirm) {
    const confirmed = await askForConfirmation({
      title: "撤销服药记录？",
      message: `仅当您确实还没有服用「${medication.name}」时才撤销。如果已经服用，请保留记录，避免重复吃药。`,
      confirmLabel: "确实未服用，撤销",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
  }

  delete getTodayRecords()[id];
  saveState();
  renderMedication();
  updateDocumentTitle();
  showToast(`已撤销「${medication.name}」的服药记录。`, "info");
}

function recordActivity() {
  const previousLastDone = Number(state.activity.lastDoneAt || 0);
  state.activity.lastDoneAt = Date.now();
  state.activity.snoozeUntil = 0;
  Object.keys(state.notificationsSent).forEach((key) => {
    if (key.startsWith("activity") && key.includes(String(previousLastDone))) {
      delete state.notificationsSent[key];
    }
  });
  saveState();
  renderActivity();
  updateDocumentTitle();
  showToast("活动记录好了，下一次计时从现在开始。", "success");
  if (state.settings.voiceEnabled) {
    speak("活动记录好了，真不错。");
  }
}

function snoozeActivity() {
  if (!state.settings.sittingEnabled) {
    return;
  }
  state.activity.snoozeUntil = Date.now() + 10 * 60 * 1000;
  saveState();
  renderActivity();
  showToast("好的，10 分钟后再提醒您活动。", "info");
}

function openSettings(showSetupNotice = false) {
  renderSettingsEditor();
  elements.settingsNotice.textContent =
    showSetupNotice || !state.configured
      ? "请按医生处方填写真实药品、剂量和时间。示例内容不会生效，保存后才会开始提醒。"
      : "修改后请点“保存设置”。药品提醒不会提供剂量建议。";
  openDialog(elements.settingsDialog);
  if (!state.configured) {
    elements.medEditorList.querySelector("input")?.focus();
  }
}

function closeSettings() {
  closeDialog(elements.settingsDialog);
}

function renderSettingsEditor(medications = state.medications) {
  elements.medEditorList.replaceChildren();
  medications.forEach((medication, index) => {
    elements.medEditorList.append(createMedicationEditorRow(medication, index));
  });
  elements.activityInterval.value = String(state.settings.activityInterval || 45);
  elements.sittingEnabled.checked = Boolean(state.settings.sittingEnabled);
  elements.voiceEnabled.checked = Boolean(state.settings.voiceEnabled);
  elements.soundEnabled.checked = Boolean(state.settings.soundEnabled);
  elements.notificationsEnabled.checked = Boolean(state.settings.notificationsEnabled);
}

function createMedicationEditorRow(medication = {}, index = 0) {
  const row = document.createElement("div");
  row.className = "med-editor-row";
  const id = medication.id || makeId();
  row.dataset.id = id;
  row.innerHTML = `
    <span class="editor-order">第 ${index + 1} 项</span>
    <div class="field-group">
      <label>药品名称</label>
      <input class="field-input med-name" type="text" maxlength="60" autocomplete="off"
        value="${escapeHTML(medication.name || "")}" placeholder="例如：晨间药" />
    </div>
    <div class="field-group">
      <label>剂量 / 用法</label>
      <input class="field-input med-dose" type="text" maxlength="80" autocomplete="off"
        value="${escapeHTML(medication.dose || "")}" placeholder="按医生处方填写" />
    </div>
    <div class="field-group">
      <label>时间</label>
      <input class="field-input med-time" type="time" value="${escapeHTML(medication.time || "08:00")}" />
    </div>
    <button class="remove-med" type="button" aria-label="删除第 ${index + 1} 种药" title="删除">×</button>
  `;
  row.querySelector(".remove-med").addEventListener("click", () => {
    const count = elements.medEditorList.children.length;
    if (count <= 1) {
      showToast("至少需要保留一种药。", "error");
      return;
    }
    row.remove();
    renumberMedicationRows();
  });
  return row;
}

function renumberMedicationRows() {
  Array.from(elements.medEditorList.children).forEach((row, index) => {
    row.querySelector(".editor-order").textContent = `第 ${index + 1} 项`;
    row.querySelector(".remove-med").setAttribute("aria-label", `删除第 ${index + 1} 种药`);
  });
}

function addMedicationEditorRow() {
  const row = createMedicationEditorRow({ time: "12:00" }, elements.medEditorList.children.length);
  elements.medEditorList.append(row);
  row.querySelector(".med-name").focus();
}

function collectSettings() {
  const rows = Array.from(elements.medEditorList.children);
  const medications = rows.map((row) => ({
    id: row.dataset.id,
    name: row.querySelector(".med-name").value.trim(),
    dose: row.querySelector(".med-dose").value.trim() || "按医生处方填写",
    time: row.querySelector(".med-time").value,
  }));

  if (!medications.length) {
    throw new Error("请至少添加一种药。");
  }
  if (medications.some((medication) => !medication.name)) {
    throw new Error("请填写每一种药的名称。");
  }
  if (medications.some((medication) => medication.name.startsWith("示例"))) {
    throw new Error("请把示例药品名称替换成医生处方中的真实药名。");
  }
  if (medications.some((medication) => !isValidTime(medication.time))) {
    throw new Error("请为每一种药选择有效时间。");
  }

  return {
    medications,
    activityInterval: Number(elements.activityInterval.value),
    sittingEnabled: elements.sittingEnabled.checked,
    voiceEnabled: elements.voiceEnabled.checked,
    soundEnabled: elements.soundEnabled.checked,
    notificationsEnabled: elements.notificationsEnabled.checked,
  };
}

async function saveSettings(event) {
  event.preventDefault();
  let settings;
  try {
    settings = collectSettings();
  } catch (error) {
    showToast(error.message, "error", null, 6500);
    return;
  }

  const oldInterval = Number(state.settings.activityInterval);
  state.medications = settings.medications;
  state.settings.activityInterval = settings.activityInterval;
  state.settings.sittingEnabled = settings.sittingEnabled;
  state.settings.voiceEnabled = settings.voiceEnabled;
  state.settings.soundEnabled = settings.soundEnabled;
  state.settings.notificationsEnabled = settings.notificationsEnabled;
  state.configured = true;

  if (settings.activityInterval !== oldInterval && state.activity.lastDoneAt) {
    state.activity.lastDoneAt = Date.now();
    state.activity.snoozeUntil = 0;
  }

  if (
    settings.notificationsEnabled &&
    "Notification" in window &&
    Notification.permission === "default"
  ) {
    await requestNotificationPermission();
  }

  saveState();
  closeSettings();
  renderAll();
  checkDueReminders();
  showToast("设置已保存，提醒从现在开始。", "success", null, 4500);
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showToast("当前浏览器不支持弹窗通知，请保持页面打开。", "error", null, 6500);
    updateNotificationButton();
    return false;
  }

  if (Notification.permission === "granted") {
    state.settings.notificationsEnabled = true;
    saveState();
    elements.notificationsEnabled.checked = true;
    showToast("浏览器通知已经开启。", "success");
    updateNotificationButton();
    return true;
  }

  if (Notification.permission === "denied") {
    showToast("通知权限已被浏览器关闭，请在浏览器的网站设置中重新允许。", "error", null, 7500);
    updateNotificationButton();
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      state.settings.notificationsEnabled = true;
      saveState();
      elements.notificationsEnabled.checked = true;
      showToast("浏览器通知已经开启。", "success");
      updateNotificationButton();
      return true;
    }
    showToast("未开启通知。网页打开时仍会显示大字提醒。", "info", null, 6000);
  } catch (error) {
    console.warn("请求通知权限失败。", error);
    showToast("无法开启浏览器通知，请保持页面打开。", "error");
  }
  updateNotificationButton();
  return false;
}

function updateNotificationButton() {
  if (!("Notification" in window)) {
    elements.notifyButton.textContent = "通知不可用";
    elements.notifyButton.disabled = true;
    return;
  }

  elements.notifyButton.disabled = false;
  if (Notification.permission === "granted") {
    elements.notifyButton.textContent = state.settings.notificationsEnabled
      ? "通知已开启"
      : "开启通知";
  } else if (Notification.permission === "denied") {
    elements.notifyButton.textContent = "通知被浏览器关闭";
  } else {
    elements.notifyButton.textContent = "开启通知";
  }
}

function playChime() {
  if (!state.settings.soundEnabled) {
    return;
  }
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    [0, 0.32].forEach((offset, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = index === 0 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.28);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.3);
    });
  } catch (error) {
    console.warn("无法播放提示音。", error);
  }
}

function speak(text) {
  if (!state.settings.voiceEnabled || !("speechSynthesis" in window)) {
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.88;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn("无法朗读提醒。", error);
  }
}

function sendBrowserNotification(title, body, tag) {
  if (
    !state.settings.notificationsEnabled ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }
  try {
    const notification = new Notification(title, {
      body,
      tag,
      requireInteraction: true,
      icon:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#15583f"/><path d="M28 23h44v12H28zm0 22h44v12H28zm0 22h30v12H28z" fill="#fff"/></svg>',
        ),
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.warn("无法显示浏览器通知。", error);
  }
}

function checkDueReminders() {
  if (!state.configured) {
    return;
  }

  const now = new Date();
  const records = getTodayRecords();
  const firstUntaken = orderedMedications().find((medication) => !records[medication.id]);
  let changed = false;

  if (firstUntaken && now >= dateAtTime(firstUntaken.time, now)) {
    const notificationKey = `medication-${localDateKey(now)}-${firstUntaken.id}`;
    if (!state.notificationsSent[notificationKey]) {
      state.notificationsSent[notificationKey] = Date.now();
      sendBrowserNotification(
        "该吃药了",
        `${firstUntaken.name} · ${firstUntaken.dose}。服完后请在网页中确认记录。`,
        notificationKey,
      );
      speak(`提醒您，按时服用${firstUntaken.name}。服完后请确认记录。`);
      playChime();
      changed = true;
    }
  }

  if (state.settings.sittingEnabled && Date.now() >= nextActivityTime()) {
    const activityKey = `activity-${localDateKey(now)}-${state.activity.lastDoneAt}-${state.activity.snoozeUntil}`;
    if (!state.notificationsSent[activityKey]) {
      state.notificationsSent[activityKey] = Date.now();
      sendBrowserNotification(
        "该起来活动了",
        "您已经坐了一段时间，请起身走动或伸展几分钟。",
        activityKey,
      );
      speak("您已经坐了一段时间，请起来活动一下。");
      playChime();
      changed = true;
    }
  }

  if (changed) {
    saveState();
  }
  updateDocumentTitle();
}

function updateDocumentTitle() {
  if (!state.configured) {
    document.title = "请先设置｜安心提醒";
    return;
  }

  const records = getTodayRecords();
  const firstUntaken = orderedMedications().find((medication) => !records[medication.id]);
  if (firstUntaken && new Date() >= dateAtTime(firstUntaken.time)) {
    document.title = `该吃药了：${firstUntaken.name}｜安心提醒`;
  } else if (state.settings.sittingEnabled && Date.now() >= nextActivityTime()) {
    document.title = "该起来活动了｜安心提醒";
  } else {
    document.title = "安心提醒｜吃药与活动提醒";
  }
}

function showToast(message, type = "info", action = null, duration = 5000) {
  window.clearTimeout(toastTimer);
  if (toastActionHandler) {
    elements.toastAction.removeEventListener("click", toastActionHandler);
    toastActionHandler = null;
  }

  elements.toast.classList.remove("is-error", "is-success");
  if (type === "error") {
    elements.toast.classList.add("is-error");
  } else if (type === "success") {
    elements.toast.classList.add("is-success");
  }
  elements.toastMessage.textContent = message;
  elements.toast.hidden = false;

  if (action) {
    elements.toastAction.textContent = action.label;
    elements.toastAction.hidden = false;
    toastActionHandler = () => {
      hideToast();
      action.onClick();
    };
    elements.toastAction.addEventListener("click", toastActionHandler);
  } else {
    elements.toastAction.hidden = true;
  }

  if (duration > 0) {
    toastTimer = window.setTimeout(hideToast, duration);
  }
}

function hideToast() {
  window.clearTimeout(toastTimer);
  elements.toast.hidden = true;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function askForConfirmation({ title, message, confirmLabel, danger = false }) {
  if (typeof elements.confirmDialog.showModal !== "function") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmYesButton.textContent = confirmLabel || "确认";
  elements.confirmYesButton.className = danger
    ? "button button-danger"
    : "button button-primary";
  openDialog(elements.confirmDialog);

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function resolveConfirmation(value) {
  closeDialog(elements.confirmDialog);
  if (confirmResolver) {
    confirmResolver(value);
    confirmResolver = null;
  }
}

async function resetTodayRecords() {
  const confirmed = await askForConfirmation({
    title: "清空今天的记录？",
    message:
      "清空后，今天已经确认过的药会重新出现在待服用列表中。请确认这样做不会让您重复服药。",
    confirmLabel: "清空今天记录",
    danger: true,
  });
  if (!confirmed) {
    return;
  }

  state.records[localDateKey()] = {};
  Object.keys(state.notificationsSent).forEach((key) => {
    if (key.startsWith("medication-")) {
      delete state.notificationsSent[key];
    }
  });
  saveState();
  closeSettings();
  renderAll();
  checkDueReminders();
  showToast("今天的服药记录已清空。", "info");
}

async function resetAllData() {
  const confirmed = await askForConfirmation({
    title: "清除全部数据？",
    message: "用药计划、服药记录和活动设置都会被删除。此操作无法恢复。",
    confirmLabel: "清除全部",
    danger: true,
  });
  if (!confirmed) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  state = createDefaultState();
  closeSettings();
  renderAll();
  showToast("全部数据已清除，请重新填写用药计划。", "info", null, 6500);
  window.setTimeout(() => openSettings(true), 250);
}

function bindEvents() {
  elements.settingsButton.addEventListener("click", () => openSettings());
  elements.setupButton.addEventListener("click", () => openSettings(true));
  elements.closeSettingsButton.addEventListener("click", closeSettings);
  elements.cancelSettingsButton.addEventListener("click", closeSettings);
  elements.settingsForm.addEventListener("submit", saveSettings);
  elements.addMedicationButton.addEventListener("click", addMedicationEditorRow);
  elements.notifyButton.addEventListener("click", requestNotificationPermission);
  elements.permissionButton.addEventListener("click", requestNotificationPermission);
  elements.activityDoneButton.addEventListener("click", recordActivity);
  elements.activitySnoozeButton.addEventListener("click", snoozeActivity);
  elements.resetTodayButton.addEventListener("click", resetTodayRecords);
  elements.resetAllButton.addEventListener("click", resetAllData);

  elements.medicationList.addEventListener("click", (event) => {
    const takeButton = event.target.closest("[data-take-id]");
    if (takeButton) {
      recordMedication(takeButton.dataset.takeId);
      return;
    }
    const undoButton = event.target.closest("[data-undo-id]");
    if (undoButton) {
      undoMedication(undoButton.dataset.undoId);
    }
  });

  elements.confirmYesButton.addEventListener("click", () => resolveConfirmation(true));
  elements.confirmNoButton.addEventListener("click", () => resolveConfirmation(false));
  elements.confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveConfirmation(false);
  });
  elements.settingsDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSettings();
  });
  elements.toastClose.addEventListener("click", hideToast);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      renderAll();
      checkDueReminders();
    }
  });

  document.addEventListener(
    "pointerdown",
    () => {
      if (audioContext?.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    },
    { once: true },
  );
}

function tick() {
  updateClock();
  renderActivity();

  const now = new Date();
  const currentMinute = `${localDateKey(now)}-${now.getHours()}-${now.getMinutes()}`;
  if (currentMinute !== lastRenderedMinute) {
    lastRenderedMinute = currentMinute;
    renderMedication();
    checkDueReminders();
  }
}

function initialize() {
  pruneOldRecords();
  saveState();
  bindEvents();
  renderAll();
  checkDueReminders();
  window.setInterval(tick, 1000);

  if (!state.configured) {
    window.setTimeout(() => openSettings(true), 350);
  }
}

initialize();
