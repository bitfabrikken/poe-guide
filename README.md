# poe-guide

Small CLI tool to help with Path of Exile 2 Leveling

![Screenshot](screenshot.png?raw=true "POE Guide Screenshot")

This app reads from the game's log file and will update what it's showing you
based on the zones you travel to. It supports auto moving forward and backward
from the current location automatically. If it gets stuck there are controls
to move back and forward by act or step.

## Installing

You can install a windows .exe file from the [releases](releases) page on
github, or globally install from a node.js installation:

```sh
npm install -g poe-guide
```

If you use the windows .exe you need to run it once with the `-l` flag
(described below) and after that you can just double click to run as long as the
default non-polling behavior works for you. If not make a shortcut with the `-p`
flag added as described below.

## Usage

You run the tool once with the location of your game log as the `-l` parameter.
After that it remembers this setting and doesn't require it again. Depending on
your system you might need to run with polling in order for it to accurately
watch your game file.

So run something like this once, with the path to your game log. Note this is
the **Path of Exile 2** log file, found under the game's own `logs` folder
(not the `Documents/My Games/Path of Exile 2` folder, which only holds
save/config data, not the log):

```sh
# Windows
poe-guide.exe -l "D:\SteamLibrary\steamapps\common\Path of Exile 2\logs\Client.txt"
```

```sh
# Native Linux (Steam)
poe-guide -l ~/.local/share/Steam/steamapps/common/"Path of Exile 2"/logs/Client.txt
```

After that you can run without the `-l` parameter. Add the `-p` parameter if
it's not recognizing your zone changes:

```sh
poe-guide.exe -p
```

## Controls

The following keybindings are available when the app is running:

| Key | Use |
|-----|-----|
| b | Go to beginning |
| e | Go to end |
| h | Go backward one act |
| l | Go forward one act |
| k | Go backward one step |
| j | Go forward one step |
| r | Reset death counter |
| q | Quit |

## Changes

This fork targets **Path of Exile 2** (currently Early Access patch 0.5.x),
not the original Path of Exile. It covers Acts 1-4 (Normal) and the three
Interlude chapters that follow Act 4, built from community leveling guides
and cross-referenced against a real Client.txt. Patch 0.5 removed Cruel
difficulty entirely and replaced it with the Interludes, so there's no
separate "Cruel" pass anymore. Zone changes are auto-detected from the
game's own `[LOADING SCREEN] (<zone name>)` log line, matched directly
against each step's zone name. Zone-to-zone travel notes should be solid,
but exact zone levels are approximate estimates rather than confirmed
values. Steps also call out optional minibosses worth detouring for when
they drop a permanent buff or an uncut gem. Acts 5-6 aren't in the data yet
since they don't exist in the game until the 1.0 full release (December
2026).

If you have any suggestions for changes please let me know either as issues
on [github](https://github.com/kelsin/poe-guide/issues).

I would love to eventually provide options where you can turn on or off
different options (Such as "Do trials" or "All quests" or "Only passive quests"
or "No extra quests") but for now it's just hardcoded to include all passive
quests and the easiest of the non passive optionals.

## Developing

You need [Node.js](https://nodejs.org/en/) to run this app from source:

```sh
# Install yarn if you don't have it
npm install -g yarn

# Install dependencies
yarn

# Run the app
./cli.js
```

I build the release exe files with [nexe](https://github.com/nexe/nexe).
