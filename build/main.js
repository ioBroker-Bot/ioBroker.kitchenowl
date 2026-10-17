"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_api = require("./lib/api");
var import_commands = require("./lib/commands");
var import_objects = require("./lib/objects");
var import_sync = require("./lib/sync");
class Kitchenowl extends utils.Adapter {
  client;
  pollTimer;
  refreshTimer;
  unloading = false;
  /** True while a poll runs, so a manual refresh cannot start a second one. */
  polling = false;
  /** Last known meal plan per household, so `days.<n>.remove` can find its recipe. */
  plannerCache = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super({
      ...options,
      name: "kitchenowl"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    var _a, _b;
    await this.setState("info.connection", false, true);
    const url = ((_a = this.config.url) != null ? _a : "").trim();
    const token = ((_b = this.config.token) != null ? _b : "").trim();
    if (!url || !token) {
      this.log.error("Please configure the server URL and an API token in the instance settings.");
      await this.setState("info.lastError", "Server URL or API token is missing", true);
      return;
    }
    this.client = new import_api.KitchenOwlClient({
      url,
      token,
      timeout: this.config.requestTimeout,
      retries: this.config.retries,
      retryDelay: this.config.retryDelay,
      rejectUnauthorized: this.config.rejectUnauthorized,
      log: (message) => this.log.debug(message)
    });
    this.subscribeStates("commands.refresh");
    if (this.config.enableWrite) {
      this.subscribeStates("households.*");
      this.log.info("Write access is enabled: writable states will change data in KitchenOwl.");
    }
    await this.poll();
  }
  /** Reads everything that is enabled and writes it into the object tree. */
  async poll() {
    if (!this.client || this.unloading || this.polling) {
      return;
    }
    this.polling = true;
    try {
      const health = await this.client.health();
      await this.setStateChangedAsync("info.serverVersion", { val: health.version, ack: true });
      await this.setStateChangedAsync("info.minFrontendVersion", {
        val: health.min_frontend_version,
        ack: true
      });
      const households = await this.selectHouseholds();
      if (households.length === 0) {
        this.log.warn("No matching household was found for the configured token.");
      }
      const writer = new import_objects.ObjectWriter(this);
      writer.channel("households", "Households", "folder");
      for (const household of households) {
        await this.syncOneHousehold(writer, household);
      }
      await writer.flush();
      if (this.config.deleteStaleObjects) {
        const deleted = await writer.prune(["households"]);
        if (deleted > 0) {
          this.log.debug(`Removed ${deleted} object(s) that no longer exist in KitchenOwl`);
        }
      }
      await this.setState("info.connection", true, true);
      await this.setState("info.lastUpdate", Date.now(), true);
      await this.setStateChangedAsync("info.lastError", { val: "", ack: true });
      this.log.debug(`Poll finished for ${households.length} household(s)`);
    } catch (error) {
      const message = error.message;
      await this.setState("info.connection", false, true);
      await this.setStateChangedAsync("info.lastError", { val: message, ack: true });
      if (error instanceof import_api.KitchenOwlApiError && error.isAuthError) {
        this.log.error(`The API token was rejected by the server: ${message}`);
      } else {
        this.log.error(`Poll failed: ${message}`);
      }
    } finally {
      this.polling = false;
      this.schedulePoll();
    }
  }
  /**
   * Reads and writes every enabled branch of a single household.
   *
   * @param writer - Collector the states are added to
   * @param household - Household being written
   */
  async syncOneHousehold(writer, household) {
    var _a;
    const client = this.client;
    const base = (0, import_sync.householdBase)(household);
    const config = this.syncConfig();
    (0, import_sync.syncHousehold)(writer, client, base, household);
    if (config.syncMembers) {
      (0, import_sync.syncMembers)(writer, client, base, household);
    }
    if (config.syncShoppingLists) {
      (0, import_sync.syncShoppingLists)(writer, base, await client.shoppingLists(household.id), config);
    }
    if (config.syncRecipes) {
      (0, import_sync.syncRecipes)(writer, client, base, await client.recipes(household.id), config);
    }
    if (config.syncPlanner && household.planner_feature) {
      const entries = await client.planner(household.id);
      this.plannerCache.set(household.id, entries);
      (0, import_sync.syncPlanner)(writer, base, entries, config);
    }
    if (config.syncExpenses && household.expenses_feature) {
      const memberNames = new Map(((_a = household.member) != null ? _a : []).map((member) => [member.id, member.name]));
      const [expenses, categories, overview] = await Promise.all([
        client.expenses(household.id, config.expenseView, config.expensePages),
        client.expenseCategories(household.id),
        client.expenseOverview(
          household.id,
          config.expenseOverviewFrame,
          config.expenseOverviewSteps,
          config.expenseView
        )
      ]);
      (0, import_sync.syncExpenses)(writer, base, expenses, categories, overview, config, memberNames);
    }
    if (config.syncCatalog) {
      const [items, categories, tags] = await Promise.all([
        client.items(household.id),
        client.categories(household.id),
        client.tags(household.id)
      ]);
      (0, import_sync.syncCatalog)(writer, base, items, categories, tags);
    }
  }
  /** The households to synchronise, filtered by the instance configuration. */
  async selectHouseholds() {
    var _a;
    const all = await this.client.households();
    const configured = ((_a = this.config.householdIds) != null ? _a : []).map((id) => Number(id)).filter(Number.isFinite);
    if (configured.length === 0) {
      return all;
    }
    const selected = all.filter((household) => configured.includes(household.id));
    for (const id of configured) {
      if (!selected.some((household) => household.id === id)) {
        this.log.warn(`Configured household ${id} is not visible to this token and will be skipped.`);
      }
    }
    return selected;
  }
  syncConfig() {
    return {
      syncMembers: this.config.syncMembers,
      syncShoppingLists: this.config.syncShoppingLists,
      syncRecipes: this.config.syncRecipes,
      syncPlanner: this.config.syncPlanner,
      syncExpenses: this.config.syncExpenses,
      syncCatalog: this.config.syncCatalog,
      createRecipeObjects: this.config.createRecipeObjects,
      createShoppingItemObjects: this.config.createShoppingItemObjects,
      enableWrite: this.config.enableWrite,
      expenseOverviewFrame: this.config.expenseOverviewFrame,
      expenseOverviewSteps: this.config.expenseOverviewSteps,
      expenseView: this.config.expenseView,
      expensePages: this.config.expensePages
    };
  }
  /** Arms the next poll, unless the adapter is shutting down. */
  schedulePoll() {
    if (this.unloading) {
      return;
    }
    const interval = Math.max(30, this.config.pollInterval || 300) * 1e3;
    this.pollTimer = this.setTimeout(() => {
      this.pollTimer = void 0;
      void this.poll();
    }, interval);
  }
  /**
   * Is called if a subscribed state changes
   *
   * @param id - State ID
   * @param state - State object
   */
  onStateChange(id, state) {
    if (!state || state.ack) {
      return;
    }
    const relativeId = id.startsWith(`${this.namespace}.`) ? id.slice(this.namespace.length + 1) : id;
    if (relativeId === "commands.refresh") {
      this.log.info("Manual refresh requested");
      void this.refreshNow();
      return;
    }
    void this.handleWrite(relativeId, state);
  }
  /**
   * Runs a write command and re-reads the data afterwards.
   *
   * @param relativeId - State id without the adapter namespace
   * @param state - The state that changed
   */
  async handleWrite(relativeId, state) {
    if (!this.config.enableWrite || !this.client) {
      return;
    }
    const command = (0, import_commands.parseCommand)(relativeId);
    if (!command) {
      return;
    }
    try {
      await (0, import_commands.runCommand)(
        { client: this.client, log: this.log },
        command,
        state.val,
        (householdId, day) => {
          var _a, _b;
          return (_b = (_a = this.plannerCache.get(householdId)) == null ? void 0 : _a.find((entry) => entry.day === day)) == null ? void 0 : _b.recipe_id;
        }
      );
      this.log.info(`Command ${command.kind} succeeded for household ${command.householdId}`);
      await this.setState(relativeId, { val: state.val, ack: true });
      this.scheduleRefresh();
    } catch (error) {
      this.log.error(`Command ${command.kind} failed: ${error.message}`);
      await this.setStateChangedAsync("info.lastError", { val: error.message, ack: true });
    }
  }
  /** Re-reads the server shortly after a write, so the tree catches up. */
  scheduleRefresh() {
    var _a;
    if (this.unloading || this.refreshTimer) {
      return;
    }
    const delay = Math.max(0, (_a = this.config.writeRefreshDelay) != null ? _a : 1500);
    this.refreshTimer = this.setTimeout(() => {
      this.refreshTimer = void 0;
      void this.refreshNow();
    }, delay);
  }
  /** Cancels the pending poll and runs one immediately. */
  async refreshNow() {
    if (this.pollTimer) {
      this.clearTimeout(this.pollTimer);
      this.pollTimer = void 0;
    }
    await this.poll();
  }
  /**
   * Some message was sent to this instance over message box.
   * Requires "common.messagebox" to be true in io-package.json.
   *
   * @param obj - The incoming message
   */
  async onMessage(obj) {
    if (typeof obj !== "object" || !obj.command) {
      return;
    }
    const respond = (payload) => {
      if (obj.callback) {
        this.sendTo(obj.from, obj.command, payload, obj.callback);
      }
    };
    try {
      switch (obj.command) {
        case "getHouseholds": {
          const client = this.clientFromMessage(obj.message);
          const households = await client.households();
          await client.destroy();
          respond(households.map((household) => ({ value: String(household.id), label: household.name })));
          return;
        }
        case "testConnection": {
          const client = this.clientFromMessage(obj.message);
          try {
            const health = await client.health();
            const households = await client.households();
            respond({
              result: `Connected. Server version ${health.version}, ${households.length} household(s) available: ${households.map((household) => household.name).join(", ")}`
            });
          } finally {
            await client.destroy();
          }
          return;
        }
        case "refresh":
          await this.refreshNow();
          respond({ result: "Refresh finished" });
          return;
        default:
          respond({ error: `Unknown command: ${obj.command}` });
      }
    } catch (error) {
      this.log.warn(`Message ${obj.command} failed: ${error.message}`);
      respond({ error: error.message });
    }
  }
  /**
   * Builds a client from a message payload, falling back to the saved config.
   *
   * @param message - Payload sent with the message
   */
  clientFromMessage(message) {
    var _a, _b;
    const payload = typeof message === "object" && message !== null ? message : {};
    const text = (value, fallback) => (typeof value === "string" ? value : fallback).trim();
    const url = text(payload.url, (_a = this.config.url) != null ? _a : "");
    const token = text(payload.token, (_b = this.config.token) != null ? _b : "");
    if (!url || !token) {
      throw new Error("Please enter the server URL and an API token first");
    }
    return new import_api.KitchenOwlClient({
      url,
      token,
      timeout: Number(payload.requestTimeout) || this.config.requestTimeout || 1e4,
      // One attempt is enough while someone waits in front of the admin UI.
      retries: 0,
      rejectUnauthorized: payload.rejectUnauthorized !== false,
      log: (message2) => this.log.debug(message2)
    });
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback - Callback function
   */
  onUnload(callback) {
    var _a;
    try {
      this.unloading = true;
      if (this.pollTimer) {
        this.clearTimeout(this.pollTimer);
        this.pollTimer = void 0;
      }
      if (this.refreshTimer) {
        this.clearTimeout(this.refreshTimer);
        this.refreshTimer = void 0;
      }
      void ((_a = this.client) == null ? void 0 : _a.destroy());
      this.client = void 0;
      callback();
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Kitchenowl(options);
} else {
  (() => new Kitchenowl())();
}
//# sourceMappingURL=main.js.map
