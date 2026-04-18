import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, getRequestHeaders } from "../../../../script.js";

const extensionName = "zitui-st-wechat-bridge";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    local_base_dir: "~/WechatAI/openclaw-weixin",
    enable_http_mode: false,
    remote_base_url: "http://127.0.0.1:7860",
};

let 当前主配置 = null;
let 当前运行配置 = null;
let 当前记忆列表 = null;
let 当前记忆文件数据 = null;
let 当前传感映射 = {};
let 当前备份列表 = [];

function 获取设置() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    return extension_settings[extensionName];
}

function 保存设置() {
    saveSettingsDebounced();
}

function 获取请求配置() {
    const settings = 获取设置();
    return {
        local_base_dir: settings.local_base_dir || defaultSettings.local_base_dir,
        enable_http_mode: Boolean(settings.enable_http_mode),
        remote_base_url: settings.remote_base_url || defaultSettings.remote_base_url,
    };
}

function 获取服务端基础地址() {
    return "/api/plugins/zitui-st-wechat-bridge";
}

async function 请求接口(pathname, options = {}) {
    const response = await fetch(`${获取服务端基础地址()}${pathname}`, {
        method: options.method || "POST",
        headers: {
            "Content-Type": "application/json",
            ...getRequestHeaders(),
            ...(options.headers || {}),
        },
        body: JSON.stringify({
            ...获取请求配置(),
            ...(options.body || {}),
        }),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "请求失败");
        throw new Error(text || `请求失败: ${response.status}`);
    }

    return response.json();
}

function 渲染设置到界面() {
    const settings = 获取设置();
    $("#zwb_local_base_dir").val(settings.local_base_dir || defaultSettings.local_base_dir);
    $("#zwb_enable_http_mode").prop("checked", Boolean(settings.enable_http_mode));
    $("#zwb_remote_base_url").val(settings.remote_base_url || defaultSettings.remote_base_url);
}

function 绑定设置事件() {
    $("#zwb_local_base_dir").on("input", function () {
        获取设置().local_base_dir = String($(this).val() || "").trim();
        保存设置();
    });

    $("#zwb_enable_http_mode").on("input", function () {
        获取设置().enable_http_mode = Boolean($(this).prop("checked"));
        保存设置();
    });

    $("#zwb_remote_base_url").on("input", function () {
        获取设置().remote_base_url = String($(this).val() || "").trim();
        保存设置();
    });
}

function 解析键路径(obj, segments, defaultValue = undefined) {
    let current = obj;
    for (const segment of segments) {
        if (current == null || !(segment in current)) return defaultValue;
        current = current[segment];
    }
    return current;
}

function 设置键路径(obj, pathText, value) {
    const segments = pathText.split(".");
    let current = obj;
    segments.forEach((segment, index) => {
        if (index === segments.length - 1) {
            current[segment] = value;
            return;
        }
        if (typeof current[segment] !== "object" || current[segment] === null || Array.isArray(current[segment])) {
            current[segment] = {};
        }
        current = current[segment];
    });
}

function 创建基础输入块(labelText, keyPath, value, type = "text", placeholder = "") {
    const wrapper = $('<div class="zwb-form-item"></div>');
    wrapper.append(`<label>${labelText}</label>`);

    if (type === "checkbox") {
        const input = $(`<label class="checkbox_label"><input type="checkbox" data-key="${keyPath}" /><span>${labelText}</span></label>`);
        input.find("input").prop("checked", Boolean(value));
        wrapper.empty().append(input);
        return wrapper;
    }

    const inputType = type === "number" ? "number" : "text";
    const input = $(`<input class="text_pole" type="${inputType}" data-key="${keyPath}" placeholder="${placeholder}" />`);
    input.val(value ?? "");
    wrapper.append(input);
    return wrapper;
}

function 创建文本域块(labelText, keyPath, value, placeholder = "") {
    const wrapper = $('<div class="zwb-form-item zwb-form-item-full"></div>');
    wrapper.append(`<label>${labelText}</label>`);
    const textarea = $(`<textarea class="text_pole zwb-json-textarea" data-key="${keyPath}" placeholder="${placeholder}"></textarea>`);
    textarea.val(value ?? "");
    wrapper.append(textarea);
    return wrapper;
}

function 渲染主配置表单() {
    if (!当前主配置) return;
    const container = $("#zwb_config_form");
    container.empty();

    const 字段定义 = [
        ["对话 API Base URL", "chat_llm.api_base_url", 解析键路径(当前主配置, ["chat_llm", "api_base_url"], "")],
        ["对话 API Key", "chat_llm.api_key", 解析键路径(当前主配置, ["chat_llm", "api_key"], "")],
        ["对话模型名", "chat_llm.model_name", 解析键路径(当前主配置, ["chat_llm", "model_name"], "")],
        ["图片服务地址", "services.image_server_url", 解析键路径(当前主配置, ["services", "image_server_url"], "")],
        ["语音服务地址", "services.voice_server_url", 解析键路径(当前主配置, ["services", "voice_server_url"], "")],
        ["TTS URL", "tts.url", 解析键路径(当前主配置, ["tts", "url"], "")],
        ["图片生成 API Key", "image_generation.api_key", 解析键路径(当前主配置, ["image_generation", "api_key"], "")],
        ["图片生成模型", "image_generation.model_name", 解析键路径(当前主配置, ["image_generation", "model_name"], "")],
        ["参考图路径", "image_generation.reference_image_path", 解析键路径(当前主配置, ["image_generation", "reference_image_path"], "")],
        ["语音封面图路径", "voice_generation.cover_image_path", 解析键路径(当前主配置, ["voice_generation", "cover_image_path"], "")],
        ["字体路径", "voice_generation.font_path", 解析键路径(当前主配置, ["voice_generation", "font_path"], "")],
        ["Miio 设备 IP", "miio.ip", 解析键路径(当前主配置, ["miio", "ip"], "")],
        ["Miio Token", "miio.token", 解析键路径(当前主配置, ["miio", "token"], "")],
    ];

    for (const [label, key, value] of 字段定义) {
        container.append(创建基础输入块(label, key, value));
    }

    const ttsBlock = $('<div class="zwb-form-item-full zwb-tts-block"></div>');
    ttsBlock.append('<label>语音轮询节点（最多 10 个）</label>');
    ttsBlock.append('<div id="zwb_tts_credentials_editor" class="zwb-tts-editor"></div>');
    ttsBlock.append('<div class="zwb-panel-actions"><button id="zwb_add_tts_cred_btn" class="menu_button" type="button">新增语音节点</button><button id="zwb_save_main_config_btn" class="menu_button" type="button">保存基础配置</button><button id="zwb_reload_main_config_btn" class="menu_button" type="button">重新读取</button></div>');
    container.append(ttsBlock);

    渲染语音节点编辑器();
}

function 渲染语音节点编辑器() {
    const editor = $("#zwb_tts_credentials_editor");
    if (!editor.length) return;
    editor.empty();

    const list = Array.isArray(当前主配置?.tts?.credentials) ? 当前主配置.tts.credentials : [];
    if (!list.length) {
        editor.append('<div class="zwb-list-box">当前尚未配置语音节点。</div>');
        return;
    }

    list.forEach((item, index) => {
        const row = $(
            `<div class="zwb-tts-row">
                <div class="zwb-tts-row-head">节点 ${index + 1}</div>
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="appid" placeholder="appid" />
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="token" placeholder="token" />
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="voiceId" placeholder="voiceId" />
                <button class="menu_button zwb-delete-tts-btn" type="button" data-tts-index="${index}">删除</button>
            </div>`
        );
        row.find('[data-tts-key="appid"]').val(item.appid || "");
        row.find('[data-tts-key="token"]').val(item.token || "");
        row.find('[data-tts-key="voiceId"]').val(item.voiceId || "");
        editor.append(row);
    });
}

function 读取主配置表单() {
    const result = structuredClone(当前主配置 || {});
    $("#zwb_config_form [data-key]").each(function () {
        const keyPath = $(this).data("key");
        if (!keyPath) return;
        let value = $(this).val();
        if ($(this).attr("type") === "number") {
            value = Number(value || 0);
        }
        设置键路径(result, keyPath, value);
    });

    result.tts = result.tts || {};
    result.tts.credentials = [];
    $("#zwb_tts_credentials_editor .zwb-tts-row").each(function () {
        const appid = String($(this).find('[data-tts-key="appid"]').val() || "").trim();
        const token = String($(this).find('[data-tts-key="token"]').val() || "").trim();
        const voiceId = String($(this).find('[data-tts-key="voiceId"]').val() || "").trim();
        if (!appid && !token && !voiceId) return;
        result.tts.credentials.push({ appid, token, voiceId });
    });

    return result;
}

function 渲染运行配置表单() {
    if (!当前运行配置) return;
    const container = $("#zwb_runtime_form");
    container.empty();

    container.append(创建基础输入块("等待用户打字时间（毫秒）", "wait_time_ms", 当前运行配置.wait_time_ms || 7000, "number"));
    container.append(创建基础输入块("主动联系阈值（毫秒）", "idle_limit_ms", 当前运行配置.idle_limit_ms || 1800000, "number"));
    container.append(创建基础输入块("唤醒开始小时", "wake_window.start_hour", 解析键路径(当前运行配置, ["wake_window", "start_hour"], 9), "number"));
    container.append(创建基础输入块("唤醒结束小时", "wake_window.end_hour", 解析键路径(当前运行配置, ["wake_window", "end_hour"], 3), "number"));
    container.append(创建基础输入块("Sensor 密钥", "sensor.secret_token", 解析键路径(当前运行配置, ["sensor", "secret_token"], "")));
    container.append(创建基础输入块("Sensor 端口", "sensor.port", 解析键路径(当前运行配置, ["sensor", "port"], 7860), "number"));
    container.append(创建基础输入块("事件防抖窗口（毫秒）", "sensor.duplicate_window_ms", 解析键路径(当前运行配置, ["sensor", "duplicate_window_ms"], 300000), "number"));
    container.append(创建基础输入块("事件保留时长（小时）", "sensor.retention_hours", 解析键路径(当前运行配置, ["sensor", "retention_hours"], 24), "number"));
    container.append(创建文本域块("高危应用名单（每行一个）", "sensor.urgent_apps", (解析键路径(当前运行配置, ["sensor", "urgent_apps"], []) || []).join("\n")));

    const buttons = $('<div class="zwb-form-item-full zwb-panel-actions"><button id="zwb_save_runtime_config_btn" class="menu_button" type="button">保存运行策略</button><button id="zwb_reload_runtime_config_btn" class="menu_button" type="button">重新读取</button></div>');
    container.append(buttons);
}

function 读取运行配置表单() {
    const result = structuredClone(当前运行配置 || {});
    $("#zwb_runtime_form [data-key]").each(function () {
        const keyPath = $(this).data("key");
        if (!keyPath) return;
        let value = $(this).val();
        if (keyPath === "sensor.urgent_apps") {
            value = String(value || "").split("\n").map(v => v.trim()).filter(Boolean);
        } else if ($(this).attr("type") === "number") {
            value = Number(value || 0);
        }
        设置键路径(result, keyPath, value);
    });
    return result;
}

function 获取酒馆上下文() {
    if (typeof window.getContext === "function") return window.getContext();
    if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") return window.SillyTavern.getContext();
    if (typeof globalThis.getContext === "function") return globalThis.getContext();
    return null;
}

function 获取稳定接口(fnName) {
    const context = 获取酒馆上下文();
    if (context && typeof context[fnName] === "function") return context[fnName].bind(context);
    if (window.SillyTavern && typeof window.SillyTavern[fnName] === "function") return window.SillyTavern[fnName].bind(window.SillyTavern);
    if (typeof window[fnName] === "function") return window[fnName].bind(window);
    if (typeof globalThis[fnName] === "function") return globalThis[fnName].bind(globalThis);
    return null;
}

async function 读取世界书名称列表() {
    const getter = 获取稳定接口("getWorldbookNames");
    if (!getter) return [];
    const result = await getter();
    return Array.isArray(result) ? result : [];
}

async function 读取世界书条目(worldbookName) {
    const getter = 获取稳定接口("getWorldbook");
    if (!getter || !worldbookName) return [];
    const result = await getter(worldbookName);
    return Array.isArray(result) ? result : [];
}

function 格式化世界书条目(entry) {
    const title = entry.comment || entry.name || entry.key || entry.uid || "未命名条目";
    const keys = Array.isArray(entry.key) ? entry.key.join("、") : (entry.key || "");
    const content = entry.content || entry.entry || entry.text || "";
    return `## ${title}\n\n关键词：${keys || "未填写"}\n\n${content}`.trim();
}

async function 刷新MEMORYMarkdown与世界书() {
    const memoryMarkdownResult = await 请求接口("/workspace/read", { body: { file_key: "memory_markdown" } });
    $("#zwb_memory_markdown_editor").val(memoryMarkdownResult.data || "");

    const names = await 读取世界书名称列表();
    const select = $("#zwb_worldbook_select");
    select.empty();
    if (!names.length) {
        select.append('<option value="">未检测到可用世界书</option>');
        $("#zwb_worldbook_entries").text("尚未检测到世界书条目接口，或当前没有可用世界书。");
        return;
    }

    names.forEach(name => {
        select.append(`<option value="${name}">${name}</option>`);
    });

    await 刷新世界书条目显示(select.val());
}

async function 刷新世界书条目显示(worldbookName) {
    const container = $("#zwb_worldbook_entries");
    container.empty();

    if (!worldbookName) {
        container.text("请先选择世界书。");
        return;
    }

    const entries = await 读取世界书条目(worldbookName);
    if (!entries.length) {
        container.text("当前世界书没有可用条目。");
        return;
    }

    entries.forEach((entry, index) => {
        const title = entry.comment || entry.name || entry.key || `条目 ${index + 1}`;
        const item = $(
            `<div class="zwb-worldbook-entry">
                <div class="zwb-worldbook-entry-title">${title}</div>
                <div class="zwb-worldbook-entry-preview"></div>
                <button class="menu_button zwb-append-worldbook-btn" type="button">追加到 MEMORY.md</button>
            </div>`
        );
        item.find(".zwb-worldbook-entry-preview").text((entry.content || entry.entry || entry.text || "").slice(0, 220) || "无正文");
        item.find(".zwb-append-worldbook-btn").attr("data-entry-json", encodeURIComponent(JSON.stringify(entry)));
        container.append(item);
    });
}

function 提取当前角色信息() {
    const context = 获取酒馆上下文();
    if (!context) return null;
    const character = context.characters?.[context.characterId] || context.character || null;
    if (!character) return null;

    return {
        name: character.name || "未命名角色",
        description: character.description || character.desc || "",
        personality: character.personality || "",
        scenario: character.scenario || "",
        mes_example: character.mes_example || character.example_dialogue || "",
        first_mes: character.first_mes || character.firstMessage || "",
    };
}

function 提取当前User信息() {
    const context = 获取酒馆上下文();
    if (!context) return null;
    return {
        name: context.name1 || context.user_name || "User",
        description: context.persona_description || context.user_description || context.persona?.description || "",
    };
}

function 注入Name行(text, name) {
    const safeName = String(name || "").trim() || "未命名";
    if (String(text || "").match(/-\s*\*\*Name:\*\*\s*.*/i)) {
        return String(text).replace(/-\s*\*\*Name:\*\*\s*.*/i, `- **Name:** ${safeName}`);
    }
    return `- **Name:** ${safeName}\n\n${String(text || "").trim()}`.trim();
}

function 生成Identity候选文本(role) {
    if (!role) return "未能从当前酒馆上下文读取角色信息。";
    return `# IDENTITY.md - 自动生成候选\n\n- **Name:** ${role.name || "未命名角色"}\n- **Creature:** 待补充\n- **Vibe:** 待补充\n\n---\n\n## Core Identity\n${role.description || ""}\n\n## Personality Notes\n${role.personality || ""}`.trim();
}

function 生成Soul候选文本(role) {
    if (!role) return "未能从当前酒馆上下文读取角色信息。";
    return `# SOUL.md - 自动生成候选\n\n- **Name:** ${role.name || "未命名角色"}\n\n---\n\n## 角色设定\n${role.description || ""}\n\n## 性格倾向\n${role.personality || ""}\n\n## 场景设定\n${role.scenario || ""}\n\n## 首条消息参考\n${role.first_mes || ""}\n\n## 示例对话参考\n${role.mes_example || ""}`.trim();
}

function 生成User候选文本(userInfo) {
    if (!userInfo) return "未能从当前酒馆上下文读取 User 描述。";
    return `# USER.md - 自动生成候选\n\n- **Name:** ${userInfo.name || "User"}\n\n---\n\n## User Profile\n${userInfo.description || ""}`.trim();
}

function 友好化Jsonl内容(payload) {
    const metadataText = JSON.stringify(payload?.metadata || {}, null, 2);
    const itemTexts = (payload?.items || []).map((item, index) => {
        const head = `---ITEM ${index + 1}---`;
        const body = [
            `name: ${item.name ?? ""}`,
            `is_user: ${item.is_user ?? false}`,
            `is_system: ${item.is_system ?? false}`,
            `send_date: ${item.send_date ?? ""}`,
            "mes:",
            item.mes ?? item.raw ?? "",
            "---END ITEM---",
        ].join("\n");
        return `${head}\n${body}`;
    });
    return [`#METADATA`, metadataText, `#MESSAGES`, ...itemTexts].join("\n\n");
}

function 解析友好Jsonl文本(text) {
    const source = String(text || "");
    const metadataMatch = source.match(/#METADATA\s+([\s\S]*?)\s+#MESSAGES/);
    let metadata = {};
    if (metadataMatch) {
        metadata = JSON.parse(metadataMatch[1].trim() || "{}");
    }

    const messageBlocks = source.split("---ITEM ").slice(1);
    const items = messageBlocks.map(block => {
        const content = block.replace(/^\d+---\n/, "");
        const endIndex = content.lastIndexOf("---END ITEM---");
        const raw = endIndex >= 0 ? content.slice(0, endIndex).trim() : content.trim();
        const lines = raw.split("\n");
        const nameLine = lines.find(line => line.startsWith("name:")) || "name: ";
        const userLine = lines.find(line => line.startsWith("is_user:")) || "is_user: false";
        const systemLine = lines.find(line => line.startsWith("is_system:")) || "is_system: false";
        const dateLine = lines.find(line => line.startsWith("send_date:")) || "send_date: ";
        const mesIndex = lines.findIndex(line => line === "mes:");
        const mes = mesIndex >= 0 ? lines.slice(mesIndex + 1).join("\n") : "";
        return {
            name: nameLine.replace(/^name:\s*/, ""),
            is_user: userLine.replace(/^is_user:\s*/, "") === "true",
            is_system: systemLine.replace(/^is_system:\s*/, "") === "true",
            send_date: dateLine.replace(/^send_date:\s*/, ""),
            mes,
        };
    });
    return { metadata, items };
}

async function 检测连接状态() {
    const statusElement = $("#zwb_status_hint");
    statusElement.text("当前状态：正在检测...");

    try {
        const result = await 请求接口("/health");
        const text = `当前状态：${result.message || "连接正常"}`;
        statusElement.text(text);
        $("#zwb_modal_runtime").text(text);
    } catch (error) {
        const text = `当前状态：检测失败 - ${error.message}`;
        statusElement.text(text);
        $("#zwb_modal_runtime").text(text);
        throw error;
    }
}

async function 刷新总览信息() {
    const result = await 请求接口("/overview");
    $("#zwb_mode_badge").text(result.mode_label || "未配置");
    $("#zwb_active_memory").text(result.active_memory || "未设置");
    $("#zwb_overview_status").text(result.summary || "暂无状态信息");
    $("#zwb_accounts_notice").text(result.accounts_notice || "accounts/ 将被视为最高优先级备份对象。");
}

async function 读取基础配置() {
    const result = await 请求接口("/config/main/read");
    当前主配置 = result.data || {};
    渲染主配置表单();
}

async function 读取运行配置() {
    const result = await 请求接口("/config/runtime/read");
    当前运行配置 = result.data || {};
    渲染运行配置表单();
}

async function 读取角色相关内容() {
    const [identityResult, soulResult, userResult] = await Promise.all([
        请求接口("/workspace/read", { body: { file_key: "identity" } }),
        请求接口("/workspace/read", { body: { file_key: "soul" } }),
        请求接口("/workspace/read", { body: { file_key: "user" } }),
    ]);

    $("#zwb_character_current").text(`【当前 IDENTITY.md】\n${identityResult.data || ""}\n\n【当前 SOUL.md】\n${soulResult.data || ""}`);
    $("#zwb_user_current").text(userResult.data || "");

    const role = 提取当前角色信息();
    const userInfo = 提取当前User信息();
    $("#zwb_character_name_input").val(role?.name || "");
    $("#zwb_user_name_input").val(userInfo?.name || "");
    $("#zwb_character_preview_editor").val(生成Identity候选文本(role));
    $("#zwb_user_preview_editor").val(生成User候选文本(userInfo));
}

function 渲染记忆列表(data) {
    当前记忆列表 = data || { full_logs: [], summary_logs: [] };

    const memoryContainer = $("#zwb_memory_list");
    memoryContainer.empty();
    const fullLogs = 当前记忆列表.full_logs || [];
    if (!fullLogs.length) {
        memoryContainer.text("暂无 full log 文件。");
    } else {
        fullLogs.forEach(item => {
            const button = $(`<button class="menu_button zwb-memory-open-btn" type="button" data-file-name="${item.name}">${item.is_active ? '【当前】' : '【备用】'} ${item.name}</button>`);
            memoryContainer.append(button);
        });
    }

    const summaryContainer = $("#zwb_summary_list");
    summaryContainer.empty();
    const summaryLogs = 当前记忆列表.summary_logs || [];
    if (!summaryLogs.length) {
        summaryContainer.text("暂无 Summary 文件。");
    } else {
        summaryLogs.forEach(item => {
            const button = $(`<button class="menu_button zwb-summary-open-btn" type="button" data-file-name="${item.name}">${item.name}</button>`);
            summaryContainer.append(button);
        });
    }
}

async function 读取记忆列表() {
    const result = await 请求接口("/memory/list");
    渲染记忆列表(result.data || {});
}

async function 打开记忆文件(fileName) {
    const result = await 请求接口("/memory/read", { body: { file_name: fileName } });
    当前记忆文件数据 = result.data?.content || { metadata: {}, items: [] };
    $("#zwb_memory_file_input").val(fileName);
    $("#zwb_memory_preview_editor").val(友好化Jsonl内容(当前记忆文件数据));
}

async function 打开Summary文件(fileName) {
    const result = await 请求接口("/memory/read", { body: { file_name: fileName } });
    const payload = result.data?.content || { metadata: {}, items: [] };
    const previewLines = (payload.items || []).map(item => `【${item.send_date || '无时间'}】\n${item.mes || item.raw || ''}`);
    $("#zwb_summary_preview_editor").val(previewLines.join("\n\n"));
}

function 渲染传感映射编辑器() {
    const container = $("#zwb_sensor_map_editor");
    container.empty();

    const entries = Object.entries(当前传感映射 || {});
    if (!entries.length) {
        container.append('<div class="zwb-sensor-row"><input class="text_pole" data-sensor-key="name" type="text" placeholder="APP 名称" /><textarea class="text_pole zwb-sensor-desc" data-sensor-key="prompt" placeholder="附加解释提示词"></textarea></div>');
        return;
    }

    entries.forEach(([appName, prompt]) => {
        const row = $(
            `<div class="zwb-sensor-row">
                <input class="text_pole" data-sensor-key="name" type="text" placeholder="APP 名称" />
                <textarea class="text_pole zwb-sensor-desc" data-sensor-key="prompt" placeholder="附加解释提示词"></textarea>
                <button class="menu_button zwb-delete-sensor-row-btn" type="button">删除</button>
            </div>`
        );
        row.find('[data-sensor-key="name"]').val(appName);
        row.find('[data-sensor-key="prompt"]').val(prompt || "");
        container.append(row);
    });
}

function 收集传感映射表单() {
    const result = {};
    $("#zwb_sensor_map_editor .zwb-sensor-row").each(function () {
        const appName = String($(this).find('[data-sensor-key="name"]').val() || "").trim();
        const prompt = String($(this).find('[data-sensor-key="prompt"]').val() || "").trim();
        if (!appName || !prompt) return;
        result[appName] = prompt;
    });
    return result;
}

async function 读取传感映射() {
    const result = await 请求接口("/sensor/map/read");
    当前传感映射 = result.data || {};
    渲染传感映射编辑器();
}

async function 刷新备份列表() {
    const result = await 请求接口("/backup/list");
    当前备份列表 = result.items || [];
    const lines = 当前备份列表.map(item => `- ${item.name}（${item.created_at}，最高优先级：${item.highest_priority}）`);
    $("#zwb_backup_list").text(lines.length ? lines.join("\n") : "暂无备份。");

    const select = $("#zwb_backup_restore_select");
    select.empty();
    if (!当前备份列表.length) {
        select.append('<option value="">暂无可恢复备份</option>');
        return;
    }
    当前备份列表.forEach(item => {
        select.append(`<option value="${item.name}">${item.name}</option>`);
    });
}

async function 加载全部核心数据() {
    await 检测连接状态();
    await 刷新总览信息();
    await 读取基础配置();
    await 读取运行配置();
    await 读取角色相关内容();
    await 读取记忆列表();
    await 刷新MEMORYMarkdown与世界书();
    await 读取传感映射();
    if (当前记忆列表?.full_logs?.length) {
        await 打开记忆文件(当前记忆列表.full_logs[0].name);
    }
    if (当前记忆列表?.summary_logs?.length) {
        await 打开Summary文件(当前记忆列表.summary_logs[0].name);
    }
    await 刷新备份列表();
}

function 绑定模态框事件() {
    $("body").on("click", "#zwb_open_modal_btn", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        $("#zwb_modal_container").css("display", "flex").hide().fadeIn("fast");
        try {
            await 加载全部核心数据();
            toastr.success("桥接中心已加载");
        } catch (error) {
            toastr.error(`桥接中心加载失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_modal_close", () => $("#zwb_modal_container").fadeOut("fast"));
    $("body").on("click", "#zwb_modal_container", function (event) {
        if (event.target === this) $(this).fadeOut("fast");
    });


    $("body").on("click", ".zwb-tab-btn", function () {
        const tabId = $(this).data("tab");
        $(".zwb-tab-btn").removeClass("active");
        $(this).addClass("active");
        $(".zwb-tab-content").removeClass("active");
        $(`#${tabId}`).addClass("active");
    });
}

function 绑定按钮事件() {
    $("body").on("click", "#zwb_ping_btn", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            await 检测连接状态();
            toastr.success("连接检测成功");
        } catch (error) {
            toastr.error(`连接检测失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_add_tts_cred_btn", () => {
        当前主配置 = 当前主配置 || {};
        当前主配置.tts = 当前主配置.tts || {};
        当前主配置.tts.credentials = Array.isArray(当前主配置.tts.credentials) ? 当前主配置.tts.credentials : [];
        if (当前主配置.tts.credentials.length >= 10) {
            toastr.warning("语音轮询节点最多只能添加 10 个");
            return;
        }
        当前主配置.tts.credentials.push({ appid: "", token: "", voiceId: "" });
        渲染语音节点编辑器();
    });

    $("body").on("click", ".zwb-delete-tts-btn", function () {
        const index = Number($(this).data("tts-index"));
        当前主配置.tts.credentials.splice(index, 1);
        渲染语音节点编辑器();
    });

    $("body").on("click", "#zwb_save_main_config_btn", async () => {
        try {
            当前主配置 = 读取主配置表单();
            await 请求接口("/workspace/save", { body: { file_key: "config", format: "json", data: 当前主配置 } });
            toastr.success("基础配置已保存");
        } catch (error) {
            toastr.error(`保存基础配置失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_reload_main_config_btn", async () => {
        try {
            await 读取基础配置();
            toastr.success("基础配置已重新读取");
        } catch (error) {
            toastr.error(`重新读取基础配置失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_save_runtime_config_btn", async () => {
        try {
            当前运行配置 = 读取运行配置表单();
            await 请求接口("/workspace/save", { body: { file_key: "runtime", format: "json", data: 当前运行配置 } });
            toastr.success("运行策略已保存");
        } catch (error) {
            toastr.error(`保存运行策略失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_reload_runtime_config_btn", async () => {
        try {
            await 读取运行配置();
            toastr.success("运行策略已重新读取");
        } catch (error) {
            toastr.error(`重新读取运行策略失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_generate_identity_btn", () => {
        const role = 提取当前角色信息();
        $("#zwb_character_target_select").val("identity");
        $("#zwb_character_name_input").val(role?.name || "");
        $("#zwb_character_preview_editor").val(生成Identity候选文本(role));
        toastr.success("已生成 IDENTITY 候选文本");
    });

    $("body").on("click", "#zwb_generate_soul_btn", () => {
        const role = 提取当前角色信息();
        $("#zwb_character_target_select").val("soul");
        $("#zwb_character_name_input").val(role?.name || "");
        $("#zwb_character_preview_editor").val(生成Soul候选文本(role));
        toastr.success("已生成 SOUL 候选文本");
    });

    $("body").on("click", "#zwb_save_character_btn", async () => {
        try {
            const fileKey = $("#zwb_character_target_select").val();
            const name = $("#zwb_character_name_input").val();
            const content = 注入Name行($("#zwb_character_preview_editor").val(), name);
            await 请求接口("/workspace/save", { body: { file_key: fileKey, data: content } });
            await 读取角色相关内容();
            toastr.success(`已写入 ${fileKey === 'identity' ? 'IDENTITY.md' : 'SOUL.md'}`);
        } catch (error) {
            toastr.error(`写入角色文件失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_generate_user_btn", () => {
        const userInfo = 提取当前User信息();
        $("#zwb_user_name_input").val(userInfo?.name || "");
        $("#zwb_user_preview_editor").val(生成User候选文本(userInfo));
        toastr.success("已生成 USER 候选文本");
    });

    $("body").on("click", "#zwb_save_user_btn", async () => {
        try {
            const name = $("#zwb_user_name_input").val();
            const content = 注入Name行($("#zwb_user_preview_editor").val(), name);
            await 请求接口("/workspace/save", { body: { file_key: "user", data: content } });
            await 读取角色相关内容();
            toastr.success("已写入 USER.md");
        } catch (error) {
            toastr.error(`写入 USER.md 失败：${error.message}`);
        }
    });

    $("body").on("click", ".zwb-memory-open-btn", async function () {
        try {
            await 打开记忆文件($(this).data("file-name"));
        } catch (error) {
            toastr.error(`读取记忆文件失败：${error.message}`);
        }
    });

    $("body").on("click", ".zwb-summary-open-btn", async function () {
        try {
            await 打开Summary文件($(this).data("file-name"));
        } catch (error) {
            toastr.error(`读取 Summary 文件失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_reload_memory_btn", async () => {
        try {
            await 读取记忆列表();
            await 刷新MEMORYMarkdown与世界书();
            toastr.success("记忆列表已刷新");
        } catch (error) {
            toastr.error(`刷新记忆列表失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_activate_memory_btn", async () => {
        try {
            const fileName = String($("#zwb_memory_file_input").val() || "").trim();
            if (!fileName) {
                return toastr.warning("请先选择一个 Memory 文件");
            }
            await 请求接口("/memory/activate", { body: { file_name: fileName } });
            await 读取记忆列表();
            await 刷新总览信息();
            toastr.success("当前启用的 Memory 文件已更新");
        } catch (error) {
            toastr.error(`设置当前启用文件失败：${error.message}`);
        }
    });

    $("body").on("change", "#zwb_worldbook_select", async function () {
        try {
            await 刷新世界书条目显示($(this).val());
        } catch (error) {
            toastr.error(`读取世界书条目失败：${error.message}`);
        }
    });

    $("body").on("click", ".zwb-append-worldbook-btn", function () {
        try {
            const entry = JSON.parse(decodeURIComponent($(this).attr("data-entry-json") || "{}"));
            const currentText = String($("#zwb_memory_markdown_editor").val() || "").trim();
            const entryText = 格式化世界书条目(entry);
            $("#zwb_memory_markdown_editor").val([currentText, entryText].filter(Boolean).join("\n\n"));
            toastr.success("已将世界书条目追加到 MEMORY.md 编辑区");
        } catch (error) {
            toastr.error(`追加世界书条目失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_save_memory_btn", async () => {
        try {
            const fileName = String($("#zwb_memory_file_input").val() || "").trim();
            if (!fileName) {
                return toastr.warning("请先选择要保存的 Memory 文件");
            }
            const parsed = 解析友好Jsonl文本($("#zwb_memory_preview_editor").val());
            await 请求接口("/memory/save", { body: { file_name: fileName, metadata: parsed.metadata, items: parsed.items } });
            toastr.success("记忆文件已保存");
        } catch (error) {
            toastr.error(`保存记忆文件失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_save_memory_markdown_btn", async () => {
        try {
            await 请求接口("/workspace/save", { body: { file_key: "memory_markdown", data: $("#zwb_memory_markdown_editor").val() } });
            toastr.success("MEMORY.md 已保存");
        } catch (error) {
            toastr.error(`保存 MEMORY.md 失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_add_sensor_row_btn", () => {
        const container = $("#zwb_sensor_map_editor");
        container.append('<div class="zwb-sensor-row"><input class="text_pole" data-sensor-key="name" type="text" placeholder="APP 名称" /><textarea class="text_pole zwb-sensor-desc" data-sensor-key="prompt" placeholder="附加解释提示词"></textarea><button class="menu_button zwb-delete-sensor-row-btn" type="button">删除</button></div>');
    });

    $("body").on("click", ".zwb-delete-sensor-row-btn", function () {
        $(this).closest('.zwb-sensor-row').remove();
    });

    $("body").on("click", "#zwb_save_sensor_map_btn", async () => {
        try {
            当前传感映射 = 收集传感映射表单();
            await 请求接口("/sensor/map/save", { body: { data: 当前传感映射 } });
            toastr.success("sensor_map.json 已保存");
        } catch (error) {
            toastr.error(`保存 sensor_map.json 失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_reload_sensor_map_btn", async () => {
        try {
            await 读取传感映射();
            toastr.success("sensor_map.json 已重新读取");
        } catch (error) {
            toastr.error(`读取 sensor_map.json 失败：${error.message}`);
        }
    });

    $("#zwb_backup_now_btn").on("click", async () => {
        try {
            const result = await 请求接口("/backup/create");
            toastr.success(result.message || "备份已创建");
            await 刷新备份列表();
        } catch (error) {
            toastr.error(`创建备份失败：${error.message}`);
        }
    });

    $("#zwb_refresh_backup_btn").on("click", async () => {
        try {
            await 刷新备份列表();
            toastr.success("备份列表已刷新");
        } catch (error) {
            toastr.error(`读取备份列表失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_restore_backup_btn", async () => {
        try {
            const backupName = String($("#zwb_backup_restore_select").val() || "").trim();
            if (!backupName) {
                return toastr.warning("请先选择要恢复的备份");
            }
            const result = await 请求接口("/backup/restore", { body: { backup_name: backupName } });
            toastr.success(result.message || "备份已恢复");
            await 刷新备份列表();
            await 刷新总览信息();
        } catch (error) {
            toastr.error(`恢复备份失败：${error.message}`);
        }
    });
}

async function 初始化界面() {
    const panelHtml = await $.get(`${extensionFolderPath}/templates/panel.html`);
    const modalHtml = await $.get(`${extensionFolderPath}/templates/modal.html`);
    $("#extensions_settings").append(panelHtml);
    $("body").append(modalHtml);
    渲染设置到界面();
    绑定设置事件();
    绑定模态框事件();
    绑定按钮事件();
}

jQuery(async () => {
    try {
        获取设置();
        await 初始化界面();
        await 检测连接状态();
    } catch (error) {
        console.error("微信 Bot 桥接中心初始化失败:", error);
        toastr.error(`微信 Bot 桥接中心初始化失败：${error.message}`);
    }
});
