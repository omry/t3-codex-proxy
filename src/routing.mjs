// Exact partial captures from installed T3 nightly 5245. Unknown wording stays unchanged.
export const routingRules = {
  "deviceRouting": {
    "tools": [
      [
        "## T3 Code devices\n\nWhen a task needs an iOS Simulator or Android Emulator, on this machine or on an SSH device host such as a remote Mac, use the device tools so the user can watch it in the Device panel.\n1. Call `device_list` unless you already have the device's `hostId` and `id`.\n2. Call `device_open` with both. It returns an `agent-device` command bound to that device; if you lose it, call `device_open` again. Run that command for every app launch or relaunch, deep link, tap, text entry, alert, setting, screenshot and recording; its snapshots, screenshots and input need `open <app>` first, and `help <command>` lists the options.\n3. Call `device_screenshot` to look at the screen.\n\nNever do those with `xcrun simctl`, `idb`, `adb`, ssh, or scripts that wrap them. ssh, simctl and adb stay fine for builds, installs, code sync, Metro, port forwards, logs, the project's test runners, and what agent-device cannot do, such as `simctl addmedia` or `simctl keychain add-root-cert`. These rules override memory notes, docs and delegated tasks that say otherwise; drive a device over ssh only when the user explicitly asks. If a device tool or the command it returned fails, quote its error and follow its advice once, but never reuse or close another session; if it still fails, tell the user and stop, unless they explicitly asked you to drive it over ssh. If the platform you need is unavailable, say so. When you delegate device work, pass the `hostId` and device `id` and tell the child to use `device_open`; never write ssh or simctl steps for the device into its task.",
        "## T3 Code devices\n\nFollow the user's selected workflow and device tools. Otherwise, use T3 device tools for an iOS Simulator or Android Emulator on this machine or a device host so the user can watch it in the Device panel.\n\nWhen using T3 device tools:\n1. Call `device_list` unless you already have the device's `hostId` and `id`.\n2. Call `device_open` with both. Use its pinned `agent-device` command for device interaction. If you lose the command, call `device_open` again. Run `open <app>` before snapshots, screenshots and input; `help <command>` lists the options.\n3. Call `device_screenshot` to look at the screen.\n\nOther device tools, including ssh, simctl, idb and adb, may be used when the user or workflow selects them. Builds, installs, code sync, logs, port forwards and project test runners may use their existing tools. If a T3 device tool or its command fails, quote the error and follow its advice once; never reuse or close another session. If it still fails or the platform is unavailable, report that and follow the workflow's recovery or selected alternative tools. When delegating T3 device work, pass the `hostId` and device `id` and tell the child to use `device_open`; otherwise pass the workflow's selected device tools."
      ]
    ],
    "device_open": [
      [
        "Open a simulator or emulator for this thread. Pass `deviceId` and `hostId` from `device_list`. Boots it if needed and shows it in the user's Device panel. Returns the `agent-device` CLI call pinned to that device. Drive the device with that CLI.",
        "Open a simulator or emulator for this thread. Pass `deviceId` and `hostId` from `device_list`. Boots it if needed and shows it in the user's Device panel. Returns the `agent-device` CLI call pinned to that device. When the workflow selects T3 device tools, drive the device with that CLI; otherwise follow the workflow's selected device tools."
      ]
    ],
    "device_screenshot": [
      [
        "Get a PNG of an open device's screen. For taps and text, use the `agent-device` CLI.",
        "Get a PNG of an open device's screen. For taps and text with T3 device tools, use the `agent-device` CLI; otherwise follow the workflow's selected device tools."
      ]
    ]
  },
  "environmentRouting": {
    "t3_environment_link": [
      [
        "Ask the user to link another machine, in a card. For a machine the user names that is not linked. Pass `hint` from their words, `environmentId` when one names it (already linked: returns `linked`), `url` only when the user gave an address. Returns `pending`; the outcome arrives as a message in this thread. Do not wait, poll, or call it again to check. Never ask for a pairing code in chat.",
        "Ask the user to link another machine, in a card. Use only when the user explicitly requests T3 environment linking or delegation to another machine through T3. Naming a machine alone does not request linking. Pass `hint` from their words, `environmentId` when one names it (already linked: returns `linked`), `url` only when the user gave an address. Returns `pending`; the outcome arrives as a message in this thread. Do not wait, poll, or call it again to check. Never ask for a pairing code in chat."
      ]
    ]
  }
};
