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
var types_exports = {};
__export(types_exports, {
  ExpenseFrame: () => ExpenseFrame,
  ExpenseView: () => ExpenseView,
  RecipeVisibility: () => RecipeVisibility
});
module.exports = __toCommonJS(types_exports);
var RecipeVisibility = /* @__PURE__ */ ((RecipeVisibility2) => {
  RecipeVisibility2[RecipeVisibility2["Private"] = 0] = "Private";
  RecipeVisibility2[RecipeVisibility2["Link"] = 1] = "Link";
  RecipeVisibility2[RecipeVisibility2["Public"] = 2] = "Public";
  return RecipeVisibility2;
})(RecipeVisibility || {});
var ExpenseFrame = /* @__PURE__ */ ((ExpenseFrame2) => {
  ExpenseFrame2[ExpenseFrame2["Daily"] = 0] = "Daily";
  ExpenseFrame2[ExpenseFrame2["Weekly"] = 1] = "Weekly";
  ExpenseFrame2[ExpenseFrame2["Monthly"] = 2] = "Monthly";
  ExpenseFrame2[ExpenseFrame2["Yearly"] = 3] = "Yearly";
  return ExpenseFrame2;
})(ExpenseFrame || {});
var ExpenseView = /* @__PURE__ */ ((ExpenseView2) => {
  ExpenseView2[ExpenseView2["Household"] = 0] = "Household";
  ExpenseView2[ExpenseView2["Personal"] = 1] = "Personal";
  return ExpenseView2;
})(ExpenseView || {});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ExpenseFrame,
  ExpenseView,
  RecipeVisibility
});
//# sourceMappingURL=types.js.map
