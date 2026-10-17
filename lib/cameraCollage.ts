// Ghép nhiều ảnh camera thành 1 ảnh PNG (có tên + giờ trên từng ô) để copy/dán gửi đi.
// Clipboard của hệ điều hành chỉ giữ được 1 ảnh, nên copy nhiều cam = copy 1 ảnh ghép.
import { Camera, cameraImgUrl } from "@/lib/cameras";

const CELL_W = 640;
const CELL_H = 480;
const TITLE_H = 34;
const GAP = 6;

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed"));
    img.src = src;
  });
}

/** Thử tải thẳng (nếu web Sở cho phép CORS), không được thì lấy qua server của app. */
async function loadCameraImage(camId: string): Promise<HTMLImageElement | null> {
  try {
    return await loadImage(cameraImgUrl(camId), true);
  } catch {
    try {
      return await loadImage(`/api/camera-image?id=${encodeURIComponent(camId)}&t=${Date.now()}`, false);
    } catch {
      return null;
    }
  }
}

export async function buildCollage(cams: Camera[]): Promise<{ blob: Blob; failed: string[] }> {
  const n = cams.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL_W + (cols + 1) * GAP;
  canvas.height = rows * (CELL_H + TITLE_H) + (rows + 1) * GAP;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const imgs = await Promise.all(cams.map((c) => loadCameraImage(c.camId)));
  const time = new Date().toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const failed: string[] = [];

  cams.forEach((cam, i) => {
    const x = GAP + (i % cols) * (CELL_W + GAP);
    const y = GAP + Math.floor(i / cols) * (CELL_H + TITLE_H + GAP);
    // Thanh tiêu đề
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(x, y, CELL_W, TITLE_H);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 18px 'Segoe UI', Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(cam.name, x + 10, y + TITLE_H / 2, CELL_W - 90);
    ctx.fillStyle = "#d1d5db";
    ctx.font = "15px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(time, x + CELL_W - 10, y + TITLE_H / 2);
    // Ảnh (giữ tỉ lệ, căn giữa ô)
    const iy = y + TITLE_H;
    ctx.fillStyle = "#000";
    ctx.fillRect(x, iy, CELL_W, CELL_H);
    const img = imgs[i];
    if (img && img.naturalWidth) {
      const s = Math.min(CELL_W / img.naturalWidth, CELL_H / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.drawImage(img, x + (CELL_W - w) / 2, iy + (CELL_H - h) / 2, w, h);
    } else {
      failed.push(cam.name);
      ctx.fillStyle = "#9ca3af";
      ctx.textAlign = "center";
      ctx.fillText("Không tải được ảnh", x + CELL_W / 2, iy + CELL_H / 2);
    }
  });

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
  return { blob, failed };
}
