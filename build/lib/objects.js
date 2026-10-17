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
var objects_exports = {};
__export(objects_exports, {
  ObjectWriter: () => ObjectWriter
});
module.exports = __toCommonJS(objects_exports);
var import_i18n = require("./i18n");
class ObjectWriter {
  /**
   * @param adapter - Adapter instance the objects belong to
   */
  constructor(adapter) {
    this.adapter = adapter;
  }
  channels = [];
  states = [];
  /** Every id this run touched, used to find objects that disappeared upstream. */
  seen = /* @__PURE__ */ new Set();
  /**
   * Declares a grouping node.
   *
   * @param id - Namespace-relative object id
   * @param name - Human readable name shown in the object tree
   * @param type - Channel, device or folder
   */
  channel(id, name, type = "channel") {
    this.channels.push({ id, name, type });
    this.seen.add(id);
  }
  /**
   * Declares a state and, when the definition carries one, its value.
   *
   * @param def - State description to create and write
   */
  state(def) {
    this.states.push(def);
    this.seen.add(def.id);
  }
  /**
   * Convenience for a read-only state carrying a value.
   *
   * @param id - Namespace-relative object id
   * @param name - Human readable name shown in the object tree
   * @param type - ioBroker state or channel type
   * @param role - ioBroker state role
   * @param value - Value to publish
   * @param unit - Optional unit shown next to the value
   */
  value(id, name, type, role, value, unit) {
    this.state({ id, name, type, role, value, unit, read: true, write: false });
  }
  /**
   * Convenience for a read-only state holding a JSON document.
   *
   * @param id - Namespace-relative object id
   * @param name - Human readable name shown in the object tree
   * @param payload - Value to serialise into the state
   */
  json(id, name, payload) {
    this.state({
      id,
      name,
      type: "string",
      role: "json",
      value: JSON.stringify(payload != null ? payload : null),
      read: true,
      write: false
    });
  }
  /**
   * Convenience for a writable command button.
   *
   * @param id - Namespace-relative object id
   * @param name - Human readable name shown in the object tree
   */
  button(id, name) {
    this.state({ id, name, type: "boolean", role: "button", value: void 0, read: false, write: true });
  }
  /**
   * Marks an id as still alive without writing to it, so pruning leaves it alone.
   *
   * @param id - Namespace-relative object id
   */
  keep(id) {
    this.seen.add(id);
  }
  /**
   * Whether this run already touched an id.
   *
   * @param id - Namespace-relative object id
   */
  has(id) {
    return this.seen.has(id);
  }
  /** Creates any missing objects and writes every collected value. */
  async flush() {
    var _a, _b, _c;
    for (const channel of this.channels) {
      await this.adapter.setObjectNotExistsAsync(channel.id, {
        type: (_a = channel.type) != null ? _a : "channel",
        common: { name: (0, import_i18n.localize)(channel.name) },
        native: {}
      });
    }
    for (const def of this.states) {
      await this.adapter.setObjectNotExistsAsync(def.id, {
        type: "state",
        common: {
          name: (0, import_i18n.localize)(def.name),
          type: def.type,
          role: def.role,
          read: (_b = def.read) != null ? _b : true,
          write: (_c = def.write) != null ? _c : false,
          ...def.unit ? { unit: def.unit } : {},
          ...def.states ? { states: def.states } : {}
        },
        native: {}
      });
      if (def.value !== void 0) {
        await this.adapter.setStateChangedAsync(def.id, { val: def.value, ack: true });
      }
    }
  }
  /**
   * Deletes objects below `prefix` that this run did not touch.
   *
   * This is what keeps the tree honest when a shopping list, recipe or member
   * is removed in KitchenOwl. Only branches the adapter manages are considered.
   *
   * @param prefixes - Namespace-relative prefixes to prune within
   */
  async prune(prefixes) {
    const existing = await this.adapter.getAdapterObjectsAsync();
    const namespacePrefix = `${this.adapter.namespace}.`;
    const stale = [];
    for (const fullId of Object.keys(existing)) {
      if (!fullId.startsWith(namespacePrefix)) {
        continue;
      }
      const relativeId = fullId.slice(namespacePrefix.length);
      if (!prefixes.some((prefix) => relativeId === prefix || relativeId.startsWith(`${prefix}.`))) {
        continue;
      }
      if (this.seen.has(relativeId)) {
        continue;
      }
      stale.push(relativeId);
    }
    stale.sort((a, b) => a.length - b.length);
    let deleted = 0;
    for (const id of stale) {
      if (stale.some((other) => other !== id && id.startsWith(`${other}.`) && id.length > other.length)) {
        continue;
      }
      try {
        await this.adapter.delObjectAsync(id, { recursive: true });
        deleted++;
      } catch (error) {
        this.adapter.log.warn(`Could not delete stale object ${id}: ${error.message}`);
      }
    }
    return deleted;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ObjectWriter
});
//# sourceMappingURL=objects.js.map
