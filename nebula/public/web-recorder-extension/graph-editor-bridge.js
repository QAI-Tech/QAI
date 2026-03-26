// This script bridges the extension to the graph editor page
// It forwards messages from the extension to the page's window
console.log("QAI Web Recorder bridge loading...");

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type !== "QAI_WEB_RECORDER_COMMAND") return;

  const command = data.command;
  const respond = (payload) => {
    window.postMessage(
      {
        type: "QAI_WEB_RECORDER_COMMAND_RESPONSE",
        command,
        ...payload,
      },
      window.location.origin,
    );
  };

  const safeSend = (msg, cb) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
          respond({
            success: false,
            error: chrome.runtime.lastError.message || "Extension error",
          });
          return;
        }
        cb?.(resp);
      });
    } catch (err) {
      respond({ success: false, error: String(err) });
    }
  };

  if (command === "GET_STATE") {
    safeSend({ type: "GET_STATE" }, (resp) => {
      respond({ success: true, state: resp || null });
    });
    return;
  }

  if (command === "START_CAPTURING") {
    safeSend({ type: "START_CAPTURING" }, (resp) => {
      respond({ success: !!resp?.success });
    });
    return;
  }

  if (command === "START_CAPTURING_IF_IDLE") {
    safeSend({ type: "GET_STATE" }, (state) => {
      if (state?.isCapturing) {
        respond({ success: true, alreadyCapturing: true });
        return;
      }
      safeSend({ type: "START_CAPTURING" }, (resp) => {
        respond({ success: !!resp?.success, alreadyCapturing: false });
      });
    });
    return;
  }

  if (command === "STOP_CAPTURING") {
    safeSend({ type: "STOP_CAPTURING" }, (resp) => {
      respond({ success: !!resp?.success });
    });
    return;
  }

  if (command === "OPEN_RECORDING_WINDOW") {
    safeSend(
      {
        type: "OPEN_RECORDING_WINDOW",
        url: data.url,
        width: data.width,
        height: data.height,
        left: data.left,
        top: data.top,
      },
      (resp) => {
        respond({ success: !!resp?.success, windowId: resp?.windowId });
      },
    );
    return;
  }
});

// Listen for messages from the extension background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Bridge received message:", message.type);

  if (message.type === "QAI_CHECK_AUTH") {
    const checkAuth = () => {
      const AUTH_CHECK_TIMEOUT = 1000;

      const QAI_DOMAINS = [
        "app.qaitech.ai",
        "nebula-236141506463.europe-west3.run.app",
        "localhost:3000",
      ];

      const PUBLIC_AUTH_ROUTES = [
        "/sign-in",
        "/sign-up",
        "/sso-callback",
        "/verify",
      ];

      return new Promise((resolve) => {
        let timeoutId = null;

        const responseHandler = (event) => {
          if (
            event.source === window &&
            event.data?.type === "QAI_CHECK_AUTH_RESPONSE"
          ) {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            window.removeEventListener("message", responseHandler);
            resolve(event.data.authenticated || false);
          }
        };

        timeoutId = setTimeout(() => {
          window.removeEventListener("message", responseHandler);

          let isAuthenticated = false;
          try {
            const href = window.location?.href;
            if (!href) {
              resolve(false);
              return;
            }

            const url = new URL(href);
            const origin = url.origin || "";
            const pathname = url.pathname || "";

            const isQaiDomain = QAI_DOMAINS.some((domain) =>
              origin.includes(domain),
            );

            const isPublicAuthRoute = PUBLIC_AUTH_ROUTES.some((route) =>
              pathname.startsWith(route),
            );

            isAuthenticated = isQaiDomain && !isPublicAuthRoute;
          } catch (error) {
            console.error("Error parsing URL for auth check:", error);
            isAuthenticated = false;
          }

          resolve(isAuthenticated);
        }, AUTH_CHECK_TIMEOUT);

        window.addEventListener("message", responseHandler);

        window.postMessage(
          { type: "QAI_CHECK_AUTH_REQUEST" },
          window.location.origin,
        );
      });
    };

    checkAuth().then((authenticated) => {
      sendResponse({ authenticated: authenticated });
    });

    return true;
  }

  if (message.type === "QAI_RECORDER_ACTION") {
    // Forward to the page
    window.postMessage(
      {
        type: "QAI_RECORDER_ACTION",
        action: message.action,
      },
      window.location.origin,
    );
    console.log("Forwarded action to page:", message.action.type);
    sendResponse({ received: true });
  } else if (
    message.type === "CAPTURING_STARTED" ||
    message.type === "CAPTURING_STOPPED"
  ) {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
      window.postMessage(
        {
          type: "QAI_CAPTURER_STATE",
          isCapturing: message.type === "CAPTURING_STARTED",
          actionCount: state?.actions?.length || 0,
        },
        window.location.origin,
      );
    });
    sendResponse({ received: true });
  }
  return true;
});

// Check connection and notify page
function notifyPageOfConnection() {
  // Get current capturing state
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("Extension not ready yet");
      return;
    }

    window.postMessage(
      {
        type: "QAI_CAPTURER_STATE",
        isCapturing: response?.isCapturing || false,
        actionCount: response?.actions?.length || 0,
        connected: true,
      },
      window.location.origin,
    );
    console.log(
      "Notified page of extension connection, capturing:",
      response?.isCapturing,
      "actions:",
      response?.actions?.length || 0,
    );
  });
}

// Notify immediately and periodically
notifyPageOfConnection();
setInterval(notifyPageOfConnection, 2000);

console.log("QAI Web Recorder bridge loaded for graph editor");
