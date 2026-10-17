// Camera giao thông TP.HCM: ảnh lấy trực tiếp từ web Sở GTVT.
export const CAMERA_IMG_BASE = "https://giaothong.hochiminhcity.gov.vn/render/ImageHandler.ashx";

export function cameraImgUrl(camId: string, t: number = Date.now()): string {
  return `${CAMERA_IMG_BASE}?id=${encodeURIComponent(camId)}&t=${t}`;
}

export interface Camera {
  camId: string;
  name: string;
  sortOrder: number;
}

// Danh sách ban đầu (từ file camera-view.html) — chỉ dùng để khởi tạo DB lần đầu.
export const DEFAULT_CAMERAS: { name: string; camId: string }[] = [
  { name: "sân bay", camId: "56f8d743025e9511002786c5" },
  { name: "Phú Nhuận", camId: "58ad69c4bd82540010390be7" },
  { name: "Hoàng Văn Thụ", camId: "587c8d97b807da0011e33d49" },
  { name: "Lê Văn Sỹ - Quận 3", camId: "662b872d1afb9c00172dd36a" },
  { name: "Nam Kỳ Khởi Nghĩa - Quận 1", camId: "58af8eb2bd82540010390c30" },
  { name: "TTH 404", camId: "662b86551afb9c00172dd227" },
  { name: "3/2 - Sư Vạn Hạnh Quận 10", camId: "63ae7a50bfd3d90017e8f2b2" },
  { name: "Nguyễn Tri Phương - Quận 5", camId: "5deb576d1dc17d7c5515ad21" },
  { name: "Quận 4", camId: "5deb576d1dc17d7c5515ad1c" },
  { name: "Huỳnh Tấn Phát - Quận 7", camId: "665861d864f11e00173c73a9" },
  { name: "Huỳnh Tấn Phát - Quận 7 (2)", camId: "662a8cfe1afb9c00172d296e" },
  { name: "Tân Kỳ Tân Quý", camId: "662b5c981afb9c00172d94c0" },
  { name: "Âu Cơ - Tân Phú", camId: "6623f0246f998a001b252797" },
  { name: "Quận 8", camId: "5875d4f8b807da0011e33d1a" },
  { name: "Điện Biên Phủ - Quận 3", camId: "5deb576d1dc17d7c5515acfc" },
  { name: "Lê Đại Hành - Quận 10", camId: "63ae7c12bfd3d90017e8f3c0" },
];
