// ============ Camera barcode scanner (uses the browser's built-in BarcodeDetector) ============

(function () {

  const WANTED_FORMATS = [
    "code_128", "code_39", "code_93", "ean_13", "ean_8", "upc_a", "upc_e",
    "itf", "codabar", "qr_code", "data_matrix"
  ];

  let overlay = null;
  let video = null;
  let statusText = null;
  let stream = null;
  let timer = null;
  let detector = null;
  let onCode = null;
  let busy = false;
  let lastValue = "";
  let lastTime = 0;


  function isSupported() {
    return "BarcodeDetector" in window && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }


  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.className = "scanner-overlay hidden";
    overlay.innerHTML = `
      <div class="scanner-box" role="dialog" aria-modal="true" aria-label="Scan barcode">
        <div class="scanner-header">
          <strong id="scanner-title">Scan barcode</strong>
          <button type="button" class="btn-secondary" id="scanner-close">Close</button>
        </div>
        <div class="scanner-video-wrap">
          <video id="scanner-video" playsinline muted></video>
          <div class="scanner-frame"></div>
        </div>
        <p class="scanner-status" id="scanner-status">Starting camera...</p>
      </div>
    `;

    document.body.appendChild(overlay);
    video = overlay.querySelector("#scanner-video");
    statusText = overlay.querySelector("#scanner-status");

    overlay.querySelector("#scanner-close").addEventListener("click", close);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        close();
      }
    });
  }


  async function open(callback, title) {
    if (!window.isSecureContext) {
      window.alert("Camera scanning needs a secure (HTTPS) connection. It works on localhost and on the live HTTPS site. You can still type serial numbers or use a USB barcode scanner.");
      return;
    }

    if (!isSupported()) {
      window.alert("This browser can't scan barcodes with the camera. Try Chrome on an Android phone, or type the serial numbers or use a USB barcode scanner.");
      return;
    }

    if (!overlay) {
      buildOverlay();
    }

    onCode = callback;
    overlay.querySelector("#scanner-title").textContent = title || "Scan barcode";
    overlay.classList.remove("hidden");
    statusText.textContent = "Starting camera...";

    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = [];
      for (const format of WANTED_FORMATS) {
        if (supported.includes(format)) {
          formats.push(format);
        }
      }

      detector = formats.length > 0 ? new window.BarcodeDetector({ formats: formats }) : new window.BarcodeDetector();

      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      video.srcObject = stream;
      await video.play();

      statusText.textContent = "Point the camera at a barcode. Keep scanning; each device is added as it's read.";
      timer = setInterval(scanFrame, 250);
    } catch (error) {
      console.error(error);
      if (error.name === "NotAllowedError") {
        statusText.textContent = "Camera permission was denied. Allow camera access in the browser settings and try again.";
      } else {
        statusText.textContent = "Could not start the camera. Close this window and type the serial number instead.";
      }
    }
  }


  async function scanFrame() {
    if (busy || !detector || !video || video.readyState < 2) {
      return;
    }

    busy = true;
    try {
      const codes = await detector.detect(video);

      if (codes.length > 0) {
        const value = String(codes[0].rawValue || "").trim();
        const now = Date.now();
        const isRepeat = value === lastValue && now - lastTime < 2500;

        if (value !== "" && !isRepeat) {
          lastValue = value;
          lastTime = now;
          statusText.textContent = `Read: ${value}`;
          if (onCode) {
            onCode(value);
          }
        }
      }
    } catch (error) {
      // A single frame failed to scan; the next one will try again
    } finally {
      busy = false;
    }
  }


  function close() {
    clearInterval(timer);
    timer = null;

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      stream = null;
    }

    if (video) {
      video.srcObject = null;
    }
    if (overlay) {
      overlay.classList.add("hidden");
    }
  }


  window.CameraScanner = {
    isSupported: isSupported,
    open: open,
    close: close
  };

})();