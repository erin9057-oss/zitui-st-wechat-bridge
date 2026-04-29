![banner](https://github.com/user-attachments/assets/f199318c-2d14-4ed6-9ef8-646e17f3040d)

# Zitui SillyTavern Bridge

[简体中文](./README.zh_CN.md) | English

This is the SillyTavern management plugin for Zitui WeChat Bot.

---

The main plugin can run on its own.  
This bridge just provides a UI for managing configuration.

---

## What it can do

You can change these directly from the frontend:

- API keys
- model parameters
- switches

---

You can also view his diary,  
and import/export chat history with SillyTavern.

---

SillyTavern character settings and user settings  
can also be imported into the plugin.

---

If you are using MacroDroid or other phone activity tools,  
you can write extra prompts for different apps here.

For example, telling him that when you open Xianyu,  
you are buying merch of him.

---

This is just an accessory.  
It must be used together with the main plugin.

Main plugin:

https://github.com/erin9057-oss/zitui-Wechat-bot

---

## Installation

Make sure the main plugin is already installed.

Then install the SillyTavern backend:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/erin9057-oss/zitui-st-wechat-bridge/main/install-server-plugin.sh)
```

After the backend is installed,  
install the frontend like a normal SillyTavern extension.

Frontend plugin URL:

```text
https://github.com/erin9057-oss/zitui-st-wechat-bridge
```

---

## That’s it

This plugin is optional.

If you are fine editing `config.json`, `workspace/`, or the code directly,  
you don’t have to install it.

If you don’t want to keep editing files,  
this will feel more like something a human can use.
