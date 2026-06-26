export const DEPOTS: Record<string, string[]> = {
    "Hồ Chí Minh": ["1032"],
    "Hà Nội": ["1031"],
    "Miền Bắc": [
        "1017",
        "PFHDU",
        "PFHNA",
        "PFHBI",
        "1015",
        "PFLSN",
        "PFLCI",
        "PFNBI",
        "PFQBI",
        "1016",
        "PFQTR",
        "PFTBI",
        "PFTNG",
        "1000",
        "PFTQU",
        "1018",
        "PLFYBI"
    ],
    "Miền Nam": [
        "PFBLU",
        "1109",
        "PFBDI",
        "1107",
        "1019",
        "PFBTN",
        "2000",
        "PFCMU",
        "PFDLA",
        "PFĐắk Nông",
        "2010",
        "1108",
        "1022",
        "PFGLA",
        "2012",
        "2011",
        "PFKGG",
        "PFLDG",
        "2013",
        "PFNTN",
        "3002",
        "PFPYE",
        "2014",
        "1041",
        "PFSTG",
        "PFTNI",
        "1110",
        "PFTVH",
        "PFVLG"
    ],
};

export const DEPOT_ORDER = [
    "Hồ Chí Minh",
    "Hà Nội",
    "Miền Bắc",
    "Miền Nam",
] as const;

export type DepotGroup = typeof DEPOT_ORDER[number];

export function buildDepotGroupSql(col: string): string {
    const cases = Object.entries(DEPOTS).map(([group, depots]) => {
        const conditions = depots
            .map((d) => `SPLIT_PART(TRIM(CAST(${col} AS TEXT)), '.', 1) = '${d}'`)
            .join(" OR ");
        return `WHEN ${conditions} THEN '${group}'`;
    });
    return `CASE \n  ${cases.join("\n  ")}\n  ELSE 'Khác'\nEND`;
}
