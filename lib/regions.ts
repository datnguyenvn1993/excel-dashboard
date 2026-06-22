export const REGIONS: Record<string, string[]> = {
  "Hồ Chí Minh": [
    "Thành Phố Hồ Chí Minh",
  ],
  "Hà Nội": [
    "Thành phố Hà Nội",
  ],
  "Miền Nam": [
    "Thành phố Đà Nẵng",
    "Tỉnh Long An",
    "Tỉnh Bà Rịa - Vũng Tàu",
    "Tỉnh Khánh Hòa",
    "Tỉnh Đồng Nai",
    "Tỉnh Tây Ninh",
    "Tỉnh Thừa Thiên Huế",
    "Tỉnh Kon Tum",
    "Thành phố Cần Thơ",
    "Tỉnh Đồng Tháp",
    "Tỉnh Quảng Ngãi",
    "Tỉnh Bình Phước",
    "Tỉnh Bình Dương",
    "Tỉnh Kiên Giang",
    "Tỉnh Phú Yên",
    "Tỉnh Bến Tre",
    "Tỉnh Tiền Giang",
    "Tỉnh Gia Lai",
    "Tỉnh Trà Vinh",
    "Tỉnh Ninh Thuận",
    "Tỉnh Bình Thuận",
    "Tỉnh Lâm Đồng",
    "Tỉnh Bạc Liêu",
    "Tỉnh Sóc Trăng",
    "Tỉnh Đắk Nông",
    "Tỉnh Đắk Lắk",
  ],
  "Miền Bắc": [
    "Tỉnh Quảng Nam",
    "Tỉnh Quảng Bình",
    "Tỉnh Hưng Yên",
    "Tỉnh Quảng Ninh",
    "Tỉnh Thanh Hóa",
    "Tỉnh Vĩnh Phúc",
    "Tỉnh Hà Nam",
    "Tỉnh Thái Nguyên",
    "Tỉnh Bắc Ninh",
    "Tỉnh Hòa Bình",
    "Tỉnh Thái Bình",
    "Tỉnh Nam Định",
    "Tỉnh Ninh Bình",
    "Tỉnh Hải Dương",
    "Tỉnh Quảng Trị",
    "Tỉnh Hà Giang",
    "Tỉnh Lào Cai",
    "Sapa - Lào Cai",
    "Tỉnh Phú Thọ",
    "Tỉnh Yên Bái",
    "Tỉnh Lạng Sơn",
    "Tỉnh Tuyên Quang",
    "Thành phố Hải Phòng",
  ],
};

export const REGION_ORDER = ["Hồ Chí Minh", "Hà Nội", "Miền Nam", "Miền Bắc"] as const;
export type RegionName = typeof REGION_ORDER[number];

export function citiesForRegions(names: string[]): string[] {
  return names.flatMap(n => REGIONS[n] ?? []);
}

export function buildRegionSql(col: string): string {
  const cases = Object.entries(REGIONS).map(([region, cities]) => {
    const conditions = cities.map(c => `LOWER(TRIM(${col})) LIKE '%${c.toLowerCase().replace(/'/g, "''").trim()}%'`).join(" OR ");
    return `WHEN ${conditions} THEN '${region}'`;
  });
  return `CASE \n  ${cases.join("\n  ")}\n  ELSE NULL\nEND`;
}

export function parseRegions(param: string | null): string[] {
  if (!param) return [];
  const valid = new Set<string>(REGION_ORDER);
  return param.split(",").map(r => r.trim()).filter(r => valid.has(r));
}
