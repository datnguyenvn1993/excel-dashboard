export const REGIONS: Record<string, string[]> = {
  "Hồ Chí Minh": [
    "Thành Phố Hồ Chí Minh",
  ],
  "Hà Nội": [
    "Thành phố Hà Nội",
  ],
  "Miền Nam": [
    "Tỉnh Trà Vinh","Tỉnh Bình Dương","Tỉnh Bến Tre","Tỉnh Bình Phước",
    "Tỉnh Đồng Nai","Tỉnh Gia Lai","Tỉnh Tây Ninh","Tỉnh Đồng Tháp",
    "Tỉnh Tiền Giang","Tỉnh Lâm Đồng","Tỉnh Bà Rịa - Vũng Tàu","Tỉnh Bình Thuận",
    "Tỉnh Vĩnh Long","Tỉnh Long An","Tỉnh Quảng Nam","Tỉnh Khánh Hòa",
    "Tỉnh Kiên Giang","Tỉnh Đắk Nông","Tỉnh Thừa Thiên Huế","Tỉnh Bình Định",
    "Tỉnh An Giang","Tỉnh Đắk Lắk","Tỉnh Quảng Ngãi","Tỉnh Ninh Thuận",
    "Tỉnh Sóc Trăng","Tỉnh Bạc Liêu","Tỉnh Cà Mau","Thành phố Cần Thơ",
    "Tỉnh Hậu Giang","Tỉnh Kon Tum",
  ],
  "Miền Bắc": [
    "Tỉnh Quảng Ninh","Thành phố Đà Nẵng","Tỉnh Bắc Ninh","Tỉnh Quảng Bình",
    "Tỉnh Thanh Hóa","Tỉnh Phú Thọ","Tỉnh Vĩnh Phúc","Tỉnh Hà Tĩnh",
    "Thành phố Hải Phòng","Tỉnh Tuyên Quang","Tỉnh Sơn La","Tỉnh Hưng Yên",
    "Tỉnh Hà Nam","Tỉnh Lạng Sơn","Tỉnh Thái Nguyên","Tỉnh Thái Bình",
    "Tỉnh Nghệ An","Tỉnh Hải Dương","Tỉnh Hòa Bình","Tỉnh Hà Giang",
    "Tỉnh Điện Biên","Tỉnh Nam Định","Tỉnh Lai Châu","Sapa - Lào Cai",
    "Tỉnh Quảng Trị","Tỉnh Ninh Bình","Tỉnh Cao Bằng","Tỉnh Yên Bái","Tỉnh Lào Cai",
  ],
};

export const REGION_ORDER = ["Hồ Chí Minh", "Hà Nội", "Miền Nam", "Miền Bắc"] as const;
export type RegionName = typeof REGION_ORDER[number];

/** All cities for the given region names */
export function citiesForRegions(names: string[]): string[] {
  return names.flatMap(n => REGIONS[n] ?? []);
}

/** Build SQL CASE expression: pickup_city → region name (NULL if unknown) */
export function buildRegionSql(col: string): string {
  const cases = Object.entries(REGIONS).map(([region, cities]) => {
    const list = cities.map(c => `'${c.toLowerCase().replace(/'/g, "''").trim()}'`).join(", ");
    return `WHEN LOWER(TRIM(${col})) IN (${list}) THEN '${region}'`;
  });
  return `CASE \n  ${cases.join("\n  ")}\n  ELSE NULL\nEND`;
}

/** Safe region names only (validated against known list) */
export function parseRegions(param: string | null): string[] {
  if (!param) return [];
  const valid = new Set<string>(REGION_ORDER);
  return param.split(",").map(r => r.trim()).filter(r => valid.has(r));
}
