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
var instance_exports = {};
__export(instance_exports, {
  connectionOptions: () => connectionOptions,
  selectHouseholds: () => selectHouseholds
});
module.exports = __toCommonJS(instance_exports);
function selectHouseholds(all, configured) {
  const wanted = (configured != null ? configured : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (wanted.length === 0) {
    return { selected: all, missing: [] };
  }
  return {
    selected: all.filter((household) => wanted.includes(household.id)),
    missing: wanted.filter((id) => !all.some((household) => household.id === id))
  };
}
function connectionOptions(message, defaults) {
  var _a, _b, _c;
  const payload = typeof message === "object" && message !== null ? message : {};
  const text = (value, fallback) => (typeof value === "string" ? value : fallback).trim();
  const url = text(payload.url, (_a = defaults.url) != null ? _a : "");
  const token = text(payload.token, (_b = defaults.token) != null ? _b : "");
  if (!url || !token) {
    throw new Error("Please enter the server URL and an API token first");
  }
  return {
    url,
    token,
    timeout: Number(payload.requestTimeout) || defaults.requestTimeout || 1e4,
    rejectUnauthorized: typeof payload.rejectUnauthorized === "boolean" ? payload.rejectUnauthorized : (_c = defaults.rejectUnauthorized) != null ? _c : true
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  connectionOptions,
  selectHouseholds
});
//# sourceMappingURL=instance.js.map
