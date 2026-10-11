/**
 * Geo API - 国家/地区与行政区划数据
 *
 * - GET /api/geo/countries：全量国家列表（CN/HK/MO/TW 置顶）
 * - GET /api/geo/subdivisions?country={iso2}：该国行政区划树（未收录国家 items=[]）
 * - GET /api/geo/detect：按 IP 探测当前国家（iso2，失败为 null）
 */
import { apiFetch } from "./client";
import type { GeoCountry, SubdivisionsResponse } from "@/types/api";

/** 全量国家/地区列表（接口顺序即展示顺序：CN,HK,MO,TW 置顶） */
export function fetchGeoCountries() {
  return apiFetch<GeoCountry[]>("/api/geo/countries");
}

/** 某国家的行政区划；未收录国家 items=[]，前端转自由文本 */
export function fetchGeoSubdivisions(iso2: string) {
  return apiFetch<SubdivisionsResponse>(
    `/api/geo/subdivisions?country=${encodeURIComponent(iso2)}`
  );
}

/** 按 IP 探测当前国家/地区代码（可能为 null） */
export function detectCountry() {
  return apiFetch<{ iso2: string | null }>("/api/geo/detect");
}
