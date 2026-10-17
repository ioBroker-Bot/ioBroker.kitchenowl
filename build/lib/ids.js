"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ids_exports = {};
__export(ids_exports, {
  memberId: () => memberId,
  round2: () => round2,
  toId: () => toId,
  toTimestamp: () => toTimestamp
});
module.exports = __toCommonJS(ids_exports);
const ALLOWED_CHARS = /[^A-Za-z0-9_-]/g;
const COMBINING_MARKS = /[̀-ͯ]/g;
function toId(value, fallback = "unknown") {
  const normalized = value.normalize("NFKD").replace(COMBINING_MARKS, "").replace(ALLOWED_CHARS, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}
function memberId(member) {
  return toId(member.username || member.name || "", `user_${member.id}`);
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
function toTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  memberId,
  round2,
  toId,
  toTimestamp
});
//# sourceMappingURL=ids.js.map
