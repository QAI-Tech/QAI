// Background service worker for QAI Web Recorder Extension

// Graph editor URL patterns (production and localhost)
const GRAPH_EDITOR_URLS = [
  "https://app.qaitech.ai/*",
  "https://nebula-236141506463.europe-west3.run.app/*",
  "http://localhost:3000/*",
];

async function ensureGraphEditorBridgeInjected(tabId) {
  if (!tabId) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["graph-editor-bridge.js"],
    });
    return true;
  } catch (error) {
    console.warn("Failed to inject graph editor bridge:", error);
    return false;
  }
}

async function injectBridgeIntoAllMatchingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: GRAPH_EDITOR_URLS });
    for (const tab of tabs) {
      if (tab.id) {
        await ensureGraphEditorBridgeInjected(tab.id);
        console.log(`Injected bridge into tab ${tab.id}: ${tab.url}`);
      }
    }
  } catch (error) {
    console.warn("Failed to inject bridge into existing tabs:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("QAI Web Recorder extension installed/updated");
  injectBridgeIntoAllMatchingTabs();
});

let isCapturing = false;
let capturedActions = [];
let connectedPorts = new Set();
let graphEditorTabId = null;
let recordingWindowId = null;

let globalCounter = 0;
let screenshotQueue = [];
const MAX_QUEUE_SIZE = 3;
let screenshotInterval = null;
const SCREENSHOT_INTERVAL_MS = 1000;
const UI_STABILIZATION_DELAY_MS = 1200;

let lastAfterScreenshotByTab = new Map();
let capturedTabs = new Set();

async function moveTabToCapturedWindow(tab) {
  try {
    if (!isCapturing) return;
    if (!tab?.id) return;

    const openerTabId = tab.openerTabId;
    if (!openerTabId) return;
    if (!capturedTabs.has(openerTabId)) return;

    const openerTab = await chrome.tabs.get(openerTabId);
    const openerWindowId = openerTab?.windowId;
    if (!openerWindowId) return;

    if (tab.windowId && tab.windowId !== openerWindowId) {
      await chrome.tabs.move(tab.id, { windowId: openerWindowId, index: -1 });
    }
  } catch (error) {
    console.warn("Failed to move spawned tab into capture window:", error);
  }
}

chrome.tabs.onCreated.addListener((tab) => {
  void moveTabToCapturedWindow(tab);
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (
    isCapturing &&
    recordingWindowId !== null &&
    windowId === recordingWindowId
  ) {
    console.log("Recording window closed, stopping capture");
    stopCapturingSession();
  }
});

// Listen for connections from popup and content scripts
chrome.runtime.onConnect.addListener((port) => {
  connectedPorts.add(port);

  port.onDisconnect.addListener(() => {
    connectedPorts.delete(port);
  });

  port.onMessage.addListener((message) => {
    if (message.type === "GET_STATE") {
      port.postMessage({
        type: "STATE",
        isCapturing,
        actions: capturedActions,
      });
    }
  });
});

// Capture screenshot of the active tab
async function captureScreenshot(tabId) {
  try {
    // Get the tab's window
    const tab = await chrome.tabs.get(tabId);
    if (!tab.windowId) return null;

    // Capture the visible area
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
      quality: 80,
    });

    return dataUrl;
  } catch (error) {
    console.error("Failed to capture screenshot:", error);
    return null;
  }
}

function startScreenshotCapture() {
  if (screenshotInterval) return;

  screenshotInterval = setInterval(async () => {
    if (!isCapturing) {
      stopScreenshotCapture();
      return;
    }

    let tabs = [];
    if (recordingWindowId !== null) {
      tabs = await chrome.tabs.query({
        windowId: recordingWindowId,
        active: true,
      });
    } else {
      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    }

    if (tabs.length === 0) return;

    const activeTab = tabs[0];
    if (!activeTab.id) return;

    globalCounter++;
    const screenshot = await captureScreenshot(activeTab.id);

    if (screenshot) {
      screenshotQueue.push({
        counter: globalCounter,
        screenshot: screenshot,
        tabId: activeTab.id,
        timestamp: Date.now(),
      });

      if (screenshotQueue.length > MAX_QUEUE_SIZE) {
        screenshotQueue.shift();
      }

      console.log(
        `📸 Screenshot captured (counter: ${globalCounter}, queue size: ${screenshotQueue.length})`,
      );
    }
  }, SCREENSHOT_INTERVAL_MS);
}

function stopScreenshotCapture() {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
  screenshotQueue = [];
  globalCounter = 0;
  lastAfterScreenshotByTab.clear();
}

async function getBeforeAfterScreenshots(actionTabId) {
  const actionCounter = globalCounter;

  const previousAfterScreenshot = lastAfterScreenshotByTab.get(actionTabId);

  let beforeScreen = null;

  if (previousAfterScreenshot) {
    beforeScreen = previousAfterScreenshot;
    console.log(
      `📸 Using previous after_screenshot as before_screenshot for tab ${actionTabId}`,
    );
  } else {
    const tabScreenshots = screenshotQueue.filter(
      (item) => item.tabId === actionTabId,
    );

    if (tabScreenshots.length >= 3) {
      beforeScreen = tabScreenshots[2].screenshot;
    } else if (tabScreenshots.length >= 2) {
      beforeScreen = tabScreenshots[tabScreenshots.length - 2].screenshot;
    } else if (tabScreenshots.length >= 1) {
      beforeScreen = tabScreenshots[0].screenshot;
    }
    console.log(
      `📸 Using queue screenshot as before_screenshot for first action on tab ${actionTabId}`,
    );
  }

  await new Promise((resolve) =>
    setTimeout(resolve, UI_STABILIZATION_DELAY_MS),
  );

  const updatedTabScreenshots = screenshotQueue.filter(
    (item) => item.tabId === actionTabId,
  );

  let afterScreen = null;
  if (updatedTabScreenshots.length >= 1) {
    const latestScreenshot =
      updatedTabScreenshots[updatedTabScreenshots.length - 1];
    afterScreen = latestScreenshot.screenshot;
  } else {
    afterScreen = await captureScreenshot(actionTabId);
    if (!afterScreen) {
      afterScreen = beforeScreen;
    }
  }

  const finalAfterScreen = afterScreen || beforeScreen;
  if (finalAfterScreen) {
    lastAfterScreenshotByTab.set(actionTabId, finalAfterScreen);
  }

  return {
    before_screenshot: beforeScreen,
    after_screenshot: finalAfterScreen,
    actionCounter: actionCounter,
  };
}

// Send action to graph editor
async function sendToGraphEditor(action) {
  const activeTabs = await chrome.tabs.query({
    url: GRAPH_EDITOR_URLS,
    active: true,
  });

  const allTabs =
    activeTabs.length > 0
      ? activeTabs
      : await chrome.tabs.query({
          url: GRAPH_EDITOR_URLS,
        });

  if (allTabs.length > 0) {
    let targetTab = allTabs[0];
    if (activeTabs.length > 0) {
      targetTab = activeTabs[0];
    } else {
      const prodTab = allTabs.find((tab) =>
        tab.url?.includes("app.qaitech.ai"),
      );
      targetTab = prodTab || allTabs[0];
    }

    try {
      await chrome.tabs.sendMessage(targetTab.id, {
        type: "QAI_RECORDER_ACTION",
        action: action,
      });
      console.log("Sent action to graph editor tab:", targetTab.url);
    } catch (e) {
      console.log("Graph editor tab found but couldn't send message:", e);
    }
  }

  // Also broadcast via ports (for popup)
  broadcastToConnectedPorts({ type: "NEW_ACTION", action });
}

async function checkAuthentication() {
  try {
    const activeTabs = await chrome.tabs.query({
      url: GRAPH_EDITOR_URLS,
      active: true,
    });

    const allTabs =
      activeTabs.length > 0
        ? activeTabs
        : await chrome.tabs.query({
            url: GRAPH_EDITOR_URLS,
          });

    if (allTabs.length === 0) {
      return { authenticated: false, reason: "no_tab" };
    }

    let targetTab = allTabs[0];
    if (activeTabs.length > 0) {
      targetTab = activeTabs[0];
    } else {
      const prodTab = allTabs.find((tab) =>
        tab.url?.includes("app.qaitech.ai"),
      );
      targetTab = prodTab || allTabs[0];
    }

    try {
      const response = await chrome.tabs.sendMessage(targetTab.id, {
        type: "QAI_CHECK_AUTH",
      });
      if (response && typeof response.authenticated === "boolean") {
        return response;
      }
      return { authenticated: false, reason: "bad_response" };
    } catch (e) {
      const injected = await ensureGraphEditorBridgeInjected(targetTab.id);
      if (injected) {
        try {
          const retryResponse = await chrome.tabs.sendMessage(targetTab.id, {
            type: "QAI_CHECK_AUTH",
          });
          if (
            retryResponse &&
            typeof retryResponse.authenticated === "boolean"
          ) {
            return retryResponse;
          }
          return { authenticated: false, reason: "bad_response" };
        } catch (_retryError) {
          return { authenticated: false, reason: "no_response" };
        }
      }

      return { authenticated: false, reason: "no_response" };
    }
  } catch (error) {
    console.error("Error checking authentication:", error);
    return { authenticated: false, reason: "error" };
  }
}

function stopCapturingSession() {
  const specificWindowId = recordingWindowId;
  isCapturing = false;
  recordingWindowId = null;
  stopScreenshotCapture();
  capturedActions = [];

  if (specificWindowId !== null) {
    chrome.windows.remove(specificWindowId).catch(() => {
      // Ignore error if window is already closed
    });
    capturedTabs.clear();
  } else {
    // Manual mode: Keep existing behavior (cleanup tabs)
    (async () => {
      const graphEditorTabs = await chrome.tabs.query({
        url: GRAPH_EDITOR_URLS,
      });
      const graphEditorTabIds = new Set(
        graphEditorTabs.map((tab) => tab.id).filter(Boolean),
      );

      for (const tabId of capturedTabs) {
        if (tabId && !graphEditorTabIds.has(tabId)) {
          try {
            await chrome.tabs.remove(tabId);
            console.log(`Closed captured tab: ${tabId}`);
          } catch (error) {
            console.error(`Failed to close tab ${tabId}:`, error);
          }
        }
      }
      capturedTabs.clear();
    })();
  }

  broadcastToAllTabs({ type: "CAPTURING_STOPPED" });
  broadcastToConnectedPorts({
    type: "STATE",
    isCapturing: false,
    actions: [],
  });
}

function startCapturingSession() {
  isCapturing = true;
  capturedActions = [];
  globalCounter = 0;
  screenshotQueue = [];
  lastAfterScreenshotByTab.clear();
  capturedTabs.clear();
  startScreenshotCapture();
  broadcastToAllTabs({ type: "CAPTURING_STARTED" });

  checkAuthentication().then((authResult) => {
    if (!authResult.authenticated && isCapturing) {
      stopCapturingSession();
      broadcastToConnectedPorts({
        type: "AUTH_FAILED",
        reason: authResult.reason,
      });
    }
  });
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "CHECK_AUTH":
      checkAuthentication().then((result) => {
        sendResponse(result);
      });
      return true;

    case "START_CAPTURING":
      // If manually starting, clear any specific window restriction
      recordingWindowId = null;
      startCapturingSession();
      sendResponse({ success: true });
      return true;

    case "STOP_CAPTURING":
      stopCapturingSession();
      sendResponse({ success: true, actions: [] });
      break;

    case "GET_STATE":
      const isTargeted =
        !sender.tab ||
        recordingWindowId === null ||
        sender.tab.windowId === recordingWindowId;
      sendResponse({ isCapturing, actions: capturedActions, isTargeted });
      break;

    case "ACTION":
      if (isCapturing && sender.tab?.id) {
        if (
          recordingWindowId !== null &&
          sender.tab.windowId !== recordingWindowId
        ) {
          return true;
        }

        capturedTabs.add(sender.tab.id);

        // Get before/after screenshots using queue system
        (async () => {
          const { before_screenshot, after_screenshot, actionCounter } =
            await getBeforeAfterScreenshots(sender.tab.id);

          const action = {
            ...message.action,
            timestamp: new Date().toISOString(),
            time: new Date().toLocaleTimeString(),
            url: sender.tab?.url || "unknown",
            tabId: sender.tab?.id,
            actionCounter: actionCounter,
            before_screenshot: before_screenshot,
            after_screenshot: after_screenshot,
            screenshot: after_screenshot, //this is for backward compatibility
          };

          capturedActions.unshift(action);

          // Send to graph editor
          await sendToGraphEditor(action);
        })();
      }
      sendResponse({ success: true });
      break;

    case "CLEAR_ACTIONS":
      capturedActions = [];
      sendResponse({ success: true });
      break;

    case "EXPORT_ACTIONS":
      sendResponse({ actions: capturedActions });
      break;

    case "OPEN_RECORDING_WINDOW":
      chrome.windows.create(
        {
          url: message.url,
          type: "normal",
          width: message.width || 1024,
          height: message.height || 768,
          left: Math.round(message.left || 0),
          top: Math.round(message.top || 0),
          focused: true,
        },
        (window) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            recordingWindowId = window.id;
            startCapturingSession();
            sendResponse({ success: true, windowId: window.id });
          }
        },
      );
      return true;

    case "SET_GRAPH_EDITOR_TAB":
      graphEditorTabId = sender.tab?.id;
      sendResponse({ success: true });
      break;
  }

  return true; // Keep message channel open for async response
});

function broadcastToAllTabs(message) {
  const query =
    recordingWindowId !== null ? { windowId: recordingWindowId } : {};
  chrome.tabs.query(query, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab might not have content script loaded
        });
      }
    });
  });
}

function broadcastToConnectedPorts(message) {
  connectedPorts.forEach((port) => {
    try {
      port.postMessage(message);
    } catch (e) {
      connectedPorts.delete(port);
    }
  });
}

console.log("QAI Web Recorder background script loaded");
