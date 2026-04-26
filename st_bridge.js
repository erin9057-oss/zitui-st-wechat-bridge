import { getContext } from "../../../extensions.js";
import { substituteParams } from "../../../../script.js";

export function 获取酒馆上下文() {
    if (typeof getContext === "function") return getContext();
    if (typeof window.getContext === "function") return window.getContext();
    if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") return window.SillyTavern.getContext();
    if (typeof globalThis.getContext === "function") return globalThis.getContext();
    return null;
}

export function 获取稳定接口(fnName) {
    if (typeof window !== 'undefined' && typeof window[fnName] === "function") return window[fnName];
    if (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern[fnName] === "function") return window.SillyTavern[fnName];
    if (typeof window !== 'undefined' && window.TavernHelper && typeof window.TavernHelper[fnName] === "function") return window.TavernHelper[fnName];
    return null;
}

export function 获取当前聊天消息列表() {
    const context = 获取酒馆上下文();
    if (context && Array.isArray(context.chat) && context.chat.length > 0) return context.chat;
    if (window.SillyTavern && Array.isArray(window.SillyTavern.chat) && window.SillyTavern.chat.length > 0) return window.SillyTavern.chat;
    const getter = 获取稳定接口("getChatMessages");
    if (getter) {
        try {
            const result = getter("0-{{lastMessageId}}", { include_swipes: false });
            if (Array.isArray(result)) return result;
        } catch (e) {}
    }
    return [];
}

export async function 读取世界书名称列表() {
    const names = new Set();
    const getAll = 获取稳定接口("getWorldbookNames");
    const getGlobal = 获取稳定接口("getGlobalWorldbookNames");
    const getChar = 获取稳定接口("getCharWorldbookNames");
    const getChat = 获取稳定接口("getChatWorldbookName");

    const pushNames = (value) => {
        if (Array.isArray(value)) value.filter(Boolean).forEach(n => names.add(String(n)));
        else if (value && typeof value === "object") {
            if (value.primary) names.add(String(value.primary));
            if (Array.isArray(value.additional)) value.additional.filter(Boolean).forEach(n => names.add(String(n)));
        }
        else if (value) names.add(String(value));
    };

    if (getAll) pushNames(await getAll());
    if (getGlobal) pushNames(await getGlobal());
    if (getChar) try { pushNames(await getChar("current")); } catch(e) { pushNames(await getChar()); }
    if (getChat) try { pushNames(await getChat("current")); } catch(e) { pushNames(await getChat()); }
    return Array.from(names);
}

export async function 读取世界书条目(worldbookName) {
    const getter = 获取稳定接口("getWorldbook");
    if (!getter || !worldbookName) return [];
    const result = await getter(worldbookName);
    return Array.isArray(result) ? result : [];
}

export function 格式化世界书条目(entry) {
    const title = entry.comment || entry.name || entry.key || entry.uid || "未命名条目";
    const keys = Array.isArray(entry.key) ? entry.key.join("、") : (entry.key || "");
    const content = entry.content || entry.entry || entry.text || "";
    return `## ${title}\n\n关键词：${keys || "未填写"}\n\n${content}`.trim();
}

export function 提取当前角色信息() {
    const fnSub = 获取稳定接口("substituteParams");
    if (fnSub) {
        return {
            name: fnSub('{{char}}') || "未命名角色", description: fnSub('{{description}}') || "",
            personality: fnSub('{{personality}}') || "", scenario: fnSub('{{scenario}}') || "",
            mes_example: fnSub('{{mesExamples}}') || "", first_mes: fnSub('{{firstMessage}}') || "",
        };
    }
    const context = 获取酒馆上下文();
    if (!context) return null;
    const character = context.characters?.[context.characterId] || context.character || null;
    if (!character) return null;
    return {
        name: character.name || "未命名角色", description: character.description || character.desc || "",
        personality: character.personality || "", scenario: character.scenario || "",
        mes_example: character.mes_example || character.example_dialogue || "", first_mes: character.first_mes || character.firstMessage || "",
    };
}

export function 提取当前User信息() {
    if (typeof substituteParams === "function") {
        return { name: substituteParams('{{user}}') || "User", description: substituteParams('{{persona}}') || "" };
    }
    const context = 获取酒馆上下文();
    if (!context) return null;
    const persona = context.persona || context.user || context.userPersona || {};
    const candidateParts = [
        context.persona_description, context.user_description, context.description,
        context.chatMetadata?.persona, context.chatMetadata?.persona_description,
        persona.description, persona.persona_description, persona.note, persona.content, persona.text,
    ].filter(Boolean);
    return {
        name: context.name1 || context.user_name || persona.name || persona.persona_name || "User",
        description: candidateParts.join("\n\n").trim(),
    };
}

export function 生成Identity候选文本(role) {
    if (!role) return "未能从当前酒馆上下文读取角色信息。";
    return `# IDENTITY.md - 自动生成候选\n\n- **Name:** {{char}}\n- **Creature:** 待补充\n- **Vibe:** 待补充\n\n---\n\n## Core Identity\n${role.description || ""}\n\n## Personality Notes\n${role.personality || ""}`.trim();
}

export function 生成Soul候选文本(role) {
    if (!role) return "未能从当前酒馆上下文读取角色信息。";
    return `# SOUL.md - 自动生成候选\n\n- **Name:** {{char}}\n\n---\n\n## 角色设定\n${role.description || ""}\n\n## 性格倾向\n${role.personality || ""}\n\n## 场景设定\n${role.scenario || ""}\n\n## 首条消息参考\n${role.first_mes || ""}\n\n## 示例对话参考\n${role.mes_example || ""}`.trim();
}

export function 生成User候选文本(userInfo) {
    if (!userInfo) return "未能从当前酒馆上下文读取 User 描述。";
    return `# USER.md - 自动生成候选\n\n- **Name:** {{user}}\n\n---\n\n## 你的基础设定\n${userInfo.description || ""}\n\n## 他的参考备注\n这里可以补充你的习惯、边界、称呼偏好、作息、雷点等。`.trim();
}
