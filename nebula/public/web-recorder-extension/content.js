// Content script for QAI Web Recorder - runs on every page

let isCapturing = false;
let typingBuffer = "";
let typingTimeout = null;
const TYPING_DEBOUNCE = 500;
const SCROLL_THROTTLE = 300;
let lastScrollTime = 0;
let scrollTimeout = null;
const SCROLL_STOP_DELAY = 500;
let lastInputValues = new WeakMap();

// Get initial state
chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
  if (response) {
    isCapturing = response.isCapturing;
    if (isCapturing && response.isTargeted !== false) {
      showCapturingIndicator();
    }
  }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURING_STARTED") {
    isCapturing = true;
    showCapturingIndicator();
  } else if (message.type === "CAPTURING_STOPPED") {
    isCapturing = false;
    flushTypingBuffer();
    hideCapturingIndicator();
  }
});

// Get element selector/description
function getElementInfo(element) {
  if (!element) return null;

  const info = {
    tagName: element.tagName?.toLowerCase() || "",
    id: element.id || null,
    className: element.className || null,
    text: element.textContent?.slice(0, 100)?.trim() || null,
    placeholder: element.placeholder || null,
    name: element.name || null,
    type: element.type || null,
    href: element.href || null,
    value: element.value?.slice(0, 50) || null,
  };

  // Build a simple selector
  let selector = info.tagName;
  if (info.id) {
    selector = `#${info.id}`;
  } else if (info.className && typeof info.className === "string") {
    const firstClass = info.className.split(" ")[0];
    if (firstClass) {
      selector = `${info.tagName}.${firstClass}`;
    }
  }
  info.selector = selector;

  return info;
}

// Send action to background
function sendAction(type, details) {
  if (!isCapturing) return;

  chrome.runtime.sendMessage({
    type: "ACTION",
    action: { type, details },
  });
}

function scheduleScrollAction(deltaX, deltaY) {
  const now = Date.now();

  if (now - lastScrollTime < SCROLL_THROTTLE) return;
  lastScrollTime = now;

  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  scrollTimeout = setTimeout(() => {
    sendAction("scroll", {
      scrollX: Math.round(window.scrollX),
      scrollY: Math.round(window.scrollY),
      deltaX: Math.round(deltaX) || 0,
      deltaY: Math.round(deltaY) || 0,
    });
  }, SCROLL_STOP_DELAY);
}

// Flush typing buffer
function flushTypingBuffer() {
  if (typingBuffer.length > 0) {
    sendAction("type", { text: typingBuffer });
    typingBuffer = "";
  }
}

// Click handler
document.addEventListener(
  "click",
  (e) => {
    if (!isCapturing) return;

    if (indicatorElement && indicatorElement.contains(e.target)) {
      return;
    }

    const element = e.target;
    const rect = element.getBoundingClientRect();

    sendAction("click", {
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      pageX: Math.round(e.pageX),
      pageY: Math.round(e.pageY),
      element: getElementInfo(element),
    });
  },
  true,
);

// Scroll handler
document.addEventListener(
  "scroll",
  (e) => {
    if (!isCapturing) return;
    scheduleScrollAction(0, 0);
  },
  true,
);

// Wheel handler for more precise scroll tracking
document.addEventListener(
  "wheel",
  (e) => {
    if (!isCapturing) return;
    scheduleScrollAction(e.deltaX, e.deltaY);
  },
  true,
);

// Keyboard handler
document.addEventListener(
  "keydown",
  (e) => {
    if (!isCapturing) return;

    // Special keys
    if (e.key === "Enter") {
      flushTypingBuffer();
      sendAction("type", { text: "[ENTER]", key: "Enter" });
      return;
    }

    if (e.key === "Backspace") {
      if (typingBuffer.length > 0) {
        typingBuffer = typingBuffer.slice(0, -1);
      } else {
        sendAction("type", { text: "[BACKSPACE]", key: "Backspace" });
      }
      return;
    }

    if (e.key === "Tab") {
      flushTypingBuffer();
      sendAction("type", { text: "[TAB]", key: "Tab" });
      return;
    }

    if (e.key === "Escape") {
      flushTypingBuffer();
      sendAction("type", { text: "[ESC]", key: "Escape" });
      return;
    }

    // Regular character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      typingBuffer += e.key;

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(flushTypingBuffer, TYPING_DEBOUNCE);
    }
  },
  true,
);

// Input handler for form fields (handles paste events)
document.addEventListener(
  "input",
  (e) => {
    if (!isCapturing) return;

    const element = e.target;
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const currentValue = element.value || "";
      const lastValue = lastInputValues.get(element) || "";

      const valueDiff = currentValue.length - lastValue.length;
      const isPaste =
        valueDiff > 1 || (valueDiff > 0 && !currentValue.startsWith(lastValue));

      if (isPaste) {
        flushTypingBuffer();
        const pastedText = currentValue.slice(lastValue.length);
        if (pastedText.length > 0) {
          sendAction("type", {
            text: pastedText,
            element: getElementInfo(element),
          });
        }
      }

      lastInputValues.set(element, currentValue);
    }
  },
  true,
);

// Focus handler
document.addEventListener(
  "focus",
  (e) => {
    if (!isCapturing) return;

    const element = e.target;
    if (
      element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA" ||
      element.tagName === "SELECT"
    ) {
      sendAction("focus", {
        element: getElementInfo(element),
      });
    }
  },
  true,
);

// Capturing indicator
let indicatorElement = null;
let isDraggingIndicator = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let indicatorMouseMoveHandler = null;
let indicatorMouseUpHandler = null;

function showCapturingIndicator() {
  if (indicatorElement) return;

  indicatorElement = document.createElement("div");
  indicatorElement.id = "qai-capturing-indicator";
  indicatorElement.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 2147483647;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
      pointer-events: auto;
      cursor: grab;
      user-select: none;
    ">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: qai-pulse 1s infinite;
        "></span>
        QAI Capturing
      </div>
      <button id="qai-stop-capture-btn" style="
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        pointer-events: auto;
      " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
        Stop Capturing
      </button>
    </div>
    <style>
      @keyframes qai-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
  `;
  document.body.appendChild(indicatorElement);

  const innerDiv = indicatorElement.querySelector("div");

  innerDiv.addEventListener("mousedown", (e) => {
    if (
      e.target.id === "qai-stop-capture-btn" ||
      e.target.closest("#qai-stop-capture-btn")
    ) {
      return;
    }

    const rect = innerDiv.getBoundingClientRect();
    isDraggingIndicator = true;
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    innerDiv.style.cursor = "grabbing";
  });

  indicatorMouseMoveHandler = (e) => {
    if (!isDraggingIndicator) return;

    innerDiv.style.left = e.clientX - dragOffsetX + "px";
    innerDiv.style.top = e.clientY - dragOffsetY + "px";
    innerDiv.style.right = "auto";
  };

  indicatorMouseUpHandler = () => {
    if (!isDraggingIndicator) return;
    isDraggingIndicator = false;
    innerDiv.style.cursor = "grab";
  };

  document.addEventListener("mousemove", indicatorMouseMoveHandler, true);
  document.addEventListener("mouseup", indicatorMouseUpHandler, true);

  const stopBtn = document.getElementById("qai-stop-capture-btn");
  if (stopBtn) {
    stopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "STOP_CAPTURING" });
    });
  }
}

function hideCapturingIndicator() {
  if (indicatorElement) {
    indicatorElement.remove();
    indicatorElement = null;
  }

  if (indicatorMouseMoveHandler) {
    document.removeEventListener("mousemove", indicatorMouseMoveHandler, true);
    indicatorMouseMoveHandler = null;
  }

  if (indicatorMouseUpHandler) {
    document.removeEventListener("mouseup", indicatorMouseUpHandler, true);
    indicatorMouseUpHandler = null;
  }
}

console.log("QAI Web Recorder content script loaded");
