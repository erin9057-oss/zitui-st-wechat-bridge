![banner](https://github.com/user-attachments/assets/f199318c-2d14-4ed6-9ef8-646e17f3040d)

# 自推酒馆桥接插件

[English](./README.md) | 简体中文

这是自推微信 chatbot 的配套酒馆管理插件。

---

插件本体其实可以独立使用，  
这个酒馆套件只是提供一个 UI 方便管理配置。

---

## 能做什么

可以直接在前端改：

- API key
- 模型参数
- 各种开关

---

也可以查看他的日记，  
和酒馆互相导入聊天记录。

---

酒馆里的角色设定、用户设定，  
也可以导入到插件里用。

---

如果你接了 MacroDroid 之类的手机行为，  
这里可以给不同 app 单独写一些额外提示词。

比如告诉他，  
你打开闲鱼是在买他的谷子。

---

这只是一个配件，  
必须配合插件本体使用。

插件本体在这里：

https://github.com/erin9057-oss/zitui-Wechat-bot

---

## 安装

先确保你已经装了插件本体。

然后安装酒馆后端：

```bash
bash <(curl -sSL https://raw.githubusercontent.com/erin9057-oss/zitui-st-wechat-bridge/main/install-server-plugin.sh)
```

后端装完之后，  
再像普通酒馆插件一样安装前端。

前端插件地址：

```text
https://github.com/erin9057-oss/zitui-st-wechat-bridge
```

---

## 先这样

这个插件不是必装。

如果你愿意直接改 `config.json`、`workspace/` 或者代码，  
完全可以不装。

如果不想一直改文件，  
装这个会更像人能用的。
