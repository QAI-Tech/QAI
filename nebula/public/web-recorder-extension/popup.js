// Popup script for QAI Web Recorder Extension

let isCapturing = false;
let actions = [];
let isAuthenticated = false;
let isCheckingAuth = true;

const captureBtn = document.getElementById("captureBtn");
const captureIcon = document.getElementById("captureIcon");
const captureText = document.getElementById("captureText");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const actionsList = document.getElementById("actionsList");
const actionsCount = document.getElementById("actionsCount");
const emptyState = document.getElementById("emptyState");
const clearBtn = document.getElementById("clearBtn");
const loginPrompt = document.getElementById("loginPrompt");
const loginBtn = document.getElementById("loginBtn");
const authStatus = document.getElementById("authStatus");

function checkAuth() {
  isCheckingAuth = true;
  chrome.runtime.sendMessage({ type: "CHECK_AUTH" }, (response) => {
    isCheckingAuth = false;
    if (chrome.runtime.lastError) {
      isAuthenticated = false;
      updateAuthUI();
      return;
    }

    isAuthenticated = !!response?.authenticated;
    updateAuthUI();
  });
}

function updateAuthUI() {
  if (isCheckingAuth) {
    authStatus.textContent = "Checking connection...";
    authStatus.style.color = "#94a3b8";
    captureBtn.disabled = true;
    return;
  }

  if (isAuthenticated) {
    loginPrompt.style.display = "none";
    captureBtn.style.display = "flex";
    captureBtn.disabled = false;
    authStatus.textContent = "Connected to QAI";
    authStatus.style.color = "#22c55e";
  } else {
    loginPrompt.style.display = "block";
    captureBtn.style.display = "none";
    captureBtn.disabled = true;
    authStatus.textContent = "Not connected to QAI";
    authStatus.style.color = "#ef4444";
  }
}

loginBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://app.qaitech.ai" });
  setTimeout(checkAuth, 2000);
});

updateAuthUI();
checkAuth();

// Get initial state
chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
  if (response) {
    isCapturing = response.isCapturing;
    actions = isCapturing ? response.actions || [] : [];
    if (isCapturing) {
      isAuthenticated = true;
      isCheckingAuth = false;
    }
    updateUI();
    renderActions();
  }
});

// Connect to background for real-time updates
const port = chrome.runtime.connect({ name: "popup" });
port.onMessage.addListener((message) => {
  if (message.type === "NEW_ACTION") {
    actions.unshift(message.action);
    renderActions();
  } else if (message.type === "STATE") {
    isCapturing = message.isCapturing;
    actions = isCapturing ? message.actions || [] : [];
    updateUI();
    renderActions();
  } else if (message.type === "AUTH_FAILED") {
    isCapturing = false;
    isAuthenticated = false;
    updateUI();
    updateAuthUI();
    alert("Please log in to QAI platform to use this extension.");
    chrome.tabs.create({ url: "https://app.qaitech.ai" });
  }
});

// Toggle capturing
captureBtn.addEventListener("click", () => {
  // Don't allow action while checking authentication
  if (isCheckingAuth) {
    return;
  }

  if (!isAuthenticated) {
    chrome.tabs.create({ url: "https://app.qaitech.ai" });
    return;
  }

  if (isCapturing) {
    chrome.runtime.sendMessage({ type: "STOP_CAPTURING" }, (response) => {
      if (response?.success) {
        isCapturing = false;
        actions = [];
        updateUI();
        renderActions();
      }
    });
  } else {
    isCapturing = true;
    updateUI();

    chrome.runtime.sendMessage({ type: "START_CAPTURING" }, (response) => {
      if (response?.success) {
      }
    });
  }
});

// Clear actions
clearBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_ACTIONS" }, () => {
    actions = [];
    renderActions();
  });
});

function updateUI() {
  if (isCapturing) {
    captureBtn.classList.add("capturing");
    captureIcon.textContent = "⏹️";
    captureText.textContent = "Stop Capturing";
    statusDot.classList.add("capturing");
    statusText.textContent = "Capturing...";
  } else {
    captureBtn.classList.remove("capturing");
    captureIcon.textContent = "⏺️";
    captureText.textContent = "Start Capturing";
    statusDot.classList.remove("capturing");
    statusText.textContent = "Ready";
  }
}

function renderActions() {
  actionsCount.textContent = actions.length;

  if (actions.length === 0) {
    emptyState.style.display = "block";
    actionsList.innerHTML = "";
    actionsList.appendChild(emptyState);
    return;
  }

  emptyState.style.display = "none";
  actionsList.innerHTML = actions
    .slice(0, 50)
    .map((action) => {
      let details = "";

      switch (action.type) {
        case "click":
          details = `(${action.details.x}, ${action.details.y})`;
          if (action.details.element?.selector) {
            details += ` <span>${action.details.element.selector}</span>`;
          }
          break;
        case "scroll":
          details = `Position: <span>(${action.details.scrollX}, ${action.details.scrollY})</span>`;
          break;
        case "type":
          details = `"<span>${escapeHtml(action.details.text || "")}</span>"`;
          break;
        case "focus":
          details = action.details.element?.selector
            ? `<span>${action.details.element.selector}</span>`
            : "element";
          break;
        default:
          details = JSON.stringify(action.details);
      }

      return `
      <div class="action-item ${action.type}">
        <div class="action-header">
          <span class="action-type">${action.type}</span>
          <span class="action-time">${action.time || ""}</span>
        </div>
        <div class="action-details">${details}</div>
      </div>
    `;
    })
    .join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
