![Logo](admin/kitchenowl.png)

# ioBroker.kitchenowl

[![NPM version](https://img.shields.io/npm/v/iobroker.kitchenowl.svg)](https://www.npmjs.com/package/iobroker.kitchenowl)
[![Downloads](https://img.shields.io/npm/dm/iobroker.kitchenowl.svg)](https://www.npmjs.com/package/iobroker.kitchenowl)
![Number of Installations](https://iobroker.live/badges/kitchenowl-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/kitchenowl-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.kitchenowl.png?downloads=true)](https://nodei.co/npm/iobroker.kitchenowl/)

**Tests:** ![Test and Release](https://github.com/n1tr0-5urf3r/ioBroker.kitchenowl/workflows/Test%20and%20Release/badge.svg)

## KitchenOwl adapter for ioBroker

Brings the data of a self-hosted [KitchenOwl](https://kitchenowl.org/) server into ioBroker: households and their
members, shopping lists and their items, recipes, the meal planner, expenses with per-member balances, and the item
catalog. With write access enabled it can also change that data from ioBroker.

KitchenOwl is a free, self-hosted grocery list and recipe manager. The project lives at
[github.com/TomBursch/kitchenowl](https://github.com/TomBursch/kitchenowl); this adapter is not affiliated with it.

Tested against KitchenOwl v0.7.10 (backend version 124). Household-scoped API paths have been stable since backend
version 57, so v0.4 and newer should work; the adapter reads the server version at startup and writes it to
`info.serverVersion`.

## Getting started

1. Install the adapter and create an instance.
2. In KitchenOwl, create a long-lived API token: open your profile, go to the settings and add an access token.
3. Enter the base URL of your server (for example `https://kitchenowl.example.com`, **without** a trailing `/api`) and
   the token on the **Connection** tab, then press **Test connection**.
4. On the **Households and sync** tab, pick the households to synchronize. Leaving the field empty synchronizes every
   household the token can see.

The token belongs to a user, not to a household, and grants everything that user can do in every household they are a
member of. It does not expire until you revoke it in KitchenOwl.

## Configuration

### Connection

| Setting | Default | Description |
| --- | --- | --- |
| Server URL | — | Base URL of the instance, without `/api` |
| API token | — | Long-lived token; stored encrypted in the instance configuration |
| Request timeout | 10000 ms | How long a single request may take |
| Retries per request | 2 | Server and network errors are retried; 4xx responses are not |
| Delay between retries | 2000 ms | Grows linearly with the attempt number |
| Verify TLS certificate | on | Turn off only for a self-signed certificate |

### Households and sync

| Setting | Default | Description |
| --- | --- | --- |
| Households to synchronize | all | Empty means every household visible to the token |
| Poll interval | 300 s | Minimum 30 s |
| Members and expense balances | on | |
| Shopping lists | on | |
| Recipes | on | |
| Meal planner | on | Skipped for households with the planner feature disabled |
| Expenses | on | Skipped for households with the expenses feature disabled |
| Item catalog, categories and tags | off | Can be several hundred entries per household |
| Create a state tree per recipe | on | Off leaves only the `recipes.json` state |
| Create a state tree per shopping list item | on | Off leaves only the per-list `json` state |
| Delete objects that disappeared in KitchenOwl | on | Prunes states for removed lists, recipes and members |

### Expenses

| Setting | Default | Description |
| --- | --- | --- |
| Perspective | Whole household | Personal reports only your share of each expense |
| Pages of recent expenses | 1 | The server returns 30 expenses per page |
| Time frame | Monthly | Bucket size of the statistics overview |
| Number of periods | 5 | How many periods the overview covers, including the current one |

### Write access

Off by default. When enabled, the adapter creates additional writable states and buttons; see
[Writing back to KitchenOwl](#writing-back-to-kitchenowl).

## Object tree

```
kitchenowl.<instance>
├── info
│   ├── connection              adapter reached the server on the last poll
│   ├── lastUpdate              timestamp of the last successful poll
│   ├── lastError               message of the last failure, empty when healthy
│   ├── serverVersion           KitchenOwl backend version
│   └── minFrontendVersion      minimum frontend version the server expects
├── commands
│   └── refresh                 button, polls immediately
└── households.<id>
    ├── id, name, description, language, photoUrl, viewOrdering, json
    ├── expensesFeature, plannerFeature, defaultShoppingListId
    ├── members
    │   ├── count, balancesJson
    │   └── <username>          id, name, username, balance, isHouseholdAdmin,
    │                           isOwner, lastSeen, photoUrl
    ├── shoppingLists
    │   ├── count, json
    │   └── <listId>            name, itemCount, itemNames, json, recentItemsJson
    │       └── items.<itemId>  id, name, category, icon, description
    ├── recipes
    │   ├── count, json
    │   └── <recipeId>          id, name, description, time, prepTime, cookTime,
    │                           yields, source, photoUrl, tags, planned,
    │                           plannedDays, visibility, itemsJson
    ├── planner
    │   ├── count, json, nextRecipeName, nextRecipeId, nextCookingDate
    │   └── days.<0-6>          date, recipeId, recipeName, yields
    ├── expenses
    │   ├── count, recentJson, overviewJson, currentPeriodTotal
    │   ├── newestName, newestAmount, newestDate, newestPaidBy
    │   └── categories.<id>     id, name, budget, color, currentPeriodSum
    │       └── uncategorized   currentPeriodSum for expenses with no category
    └── catalog
        └── itemsJson, itemCount, categoriesJson, categoryCount, tagsJson, tagCount
```

Weekday `0` is Monday. Timestamps are epoch milliseconds, matching what the KitchenOwl API returns. Expense balances
are rounded to two decimals; the API returns them as raw floats.

## Writing back to KitchenOwl

Enable **Write access** to get these additional states. Writing to one of them sends the change to KitchenOwl and then
re-reads the affected household.

| State | Type | Effect |
| --- | --- | --- |
| `households.<id>.shoppingLists.<listId>.addItemByName` | string | Adds an item with that name to the list |
| `households.<id>.shoppingLists.<listId>.clear` | button | Removes every item from the list |
| `households.<id>.shoppingLists.<listId>.items.<itemId>.remove` | button | Removes that item from the list |
| `households.<id>.shoppingLists.<listId>.items.<itemId>.description` | string | Changes the item description, for example the amount |
| `households.<id>.expenses.add` | JSON | Books an expense, e.g. `{"name": "Groceries", "amount": 12.5, "paid_by_id": 1}` |
| `households.<id>.expenses.recalculateBalances` | button | Asks the server to recompute member balances |
| `households.<id>.planner.addRecipe` | JSON | Plans a recipe, e.g. `{"recipe_id": 20, "cooking_date": 1700000000000}` |
| `households.<id>.planner.days.<0-6>.remove` | button | Removes the meal planned on that weekday |
| `households.<id>.recipes.scrapeUrl` | string | Imports a recipe from a URL; the result lands in `recipes.scrapeResult` |

### Messages

The instance also answers `sendTo` messages, which is handy from scripts:

```javascript
sendTo('kitchenowl.0', 'getHouseholds', {}, result => log(JSON.stringify(result)));
sendTo('kitchenowl.0', 'testConnection', {}, result => log(JSON.stringify(result)));
sendTo('kitchenowl.0', 'refresh', {}, result => log(JSON.stringify(result)));
```

## Troubleshooting

- **`info.connection` stays false** — check `info.lastError`. A rejected token is reported explicitly; the adapter keeps
  retrying rather than stopping.
- **The household dropdown stays empty** — the admin UI asks the running instance for the list, so the URL and token
  have to be valid. Use **Test connection** to see the exact error.
- **A household has no expenses or planner branch** — those features are enabled per household inside KitchenOwl, and
  the adapter mirrors that.
- **Self-signed certificate** — turn off **Verify TLS certificate** on the Connection tab.

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**

- (Fabian Ihle) initial release

## License

MIT License

Copyright (c) 2026 Fabian Ihle <fabian.ihle@uni-tuebingen.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
