# Bus Split Planner

A planner for [Alchemy Factory](https://store.steampowered.com/app/3669570/Alchemy_Factory/) bases built around a wagon bus and one-tile modules.

- **What goes on the bus:** every item gets a yes (own wagons), yes (shared wagon), maybe or no, with the reason.
- **Build a module:** machine counts, what comes off the bus, what the coins buy, how many bus connections it uses, and whether it fits in your tile.
- **Machine rates:** every recipe's in and out per minute for one machine, to check against the game.

Settings and choices are remembered in the browser. Nothing is sent anywhere.

## Changing it

The page is `index.html`, built from the files in `src/`. Needs Node.js, no packages.

```bash
node tools/build.js
```

That checks the page script still runs and rewrites `index.html`. Commit and push, and GitHub Pages serves the new version.

## Updating the recipes

Recipe numbers come from [starfi5h's Alchemy Factory Calculator](https://github.com/starfi5h/AlchemyFactoryCalculator). Its database is downloaded, not stored here.

```bash
node tools/fetch-data.js
node tools/gen-data.js
node tools/build.js
```

`fetch-data.js` pins one commit of that repository; change `COMMIT` in it to pick up newer recipes. `gen-data.js` rewrites `src/data.json` and refuses to if the numbers stop matching modules that have been built and measured in game.
