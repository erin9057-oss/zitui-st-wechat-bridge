// =========================================================================
// 微信 Bot 桥接中心 - 模块化极致性能重构版 (Modular & High-Performance)
// =========================================================================
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, getRequestHeaders, substituteParams } from "../../../../script.js";

const EXT_NAME = "zitui-st-wechat-bridge";
const EXT_PATH = `scripts/extensions/third-party/${EXT_NAME}`;
const DEFAULT_SETTINGS = {
    local_base_dir: "~/WechatAI/openclaw-weixin",
    enable_http_mode: false,
    remote_base_url: "http://127.0.0.1:7860",
};

// ==========================================
// [模块 1] 状态与存储管理 (State)
// ==========================================
const State = {
    mainConfig: null,
    runtimeConfig: null,
    memoryList: { full_logs: [], summary_logs: [] },
    memoryData: null,
    sensorMap: {},
    backupList: [],

    getSettings() {
        extension_settings[EXT_NAME] = extension_settings[EXT_NAME] || {};
        if (Object.keys(extension_settings[EXT_NAME]).length === 0) {
            Object.assign(extension_settings[EXT_NAME], DEFAULT_SETTINGS);
        }
        return extension_settings[EXT_NAME];
    },
    saveSettings() {
        saveSettingsDebounced();
    },
    getRequestConfig() {
        const s = this.getSettings();
        return {
            local_base_dir: s.local_base_dir || DEFAULT_SETTINGS.local_base_dir,
            enable_http_mode: Boolean(s.enable_http_mode),
            remote_base_url: s.remote_base_url || DEFAULT_SETTINGS.remote_base_url,
        };
    }
};

// ==========================================
// [模块 2] 工具函数与格式化转换 (Utils)
// ==========================================
const Utils = {
    parsePath(obj, segments, defaultValue = undefined) {
        let current = obj;
        for (const segment of segments) {
            if (current == null || !(segment in current)) return defaultValue;
            current = current[segment];
        }
        return current;
    },
    setPath(obj, pathText, value) {
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
    },
    msToSec(value, fallbackSeconds) {
        const ms = Number(value);
        return (Number.isFinite(ms) && ms >= 0) ? Math.round(ms / 1000) : fallbackSeconds;
    },
    injectName(text, name) {
        const safeName = String(name || "").trim() || "未命名";
        if (String(text || "").match(/-\s*\*\*Name:\*\*\s*.*/i)) {
            return String(text).replace(/-\s*\*\*Name:\*\*\s*.*/i, `- **Name:** ${safeName}`);
        }
        return `- **Name:** ${safeName}\n\n${String(text || "").trim()}`.trim();
    },
    mergeSoul(newText, currentSoulText, name) {
        const withName = this.injectName(newText, name);
        const marker = "# 动态视觉反馈系统";
        const normalizedCurrent = String(currentSoulText || "");
        const markerIndex = normalizedCurrent.indexOf(marker);
        if (markerIndex === -1) return withName;
        return [withName.split(marker)[0].trim(), normalizedCurrent.slice(markerIndex).trim()].filter(Boolean).join("\n\n");
    },
    genIdentity(role) {
        if (!role) return "未能从当前酒馆上下文读取角色信息。";
        return `# IDENTITY.md - 自动生成候选\n\n- **Name:** ${role.name || "未命名角色"}\n- **Creature:** 待补充\n- **Vibe:** 待补充\n\n---\n\n## Core Identity\n${role.description || ""}\n\n## Personality Notes\n${role.personality || ""}`.trim();
    },
    genSoul(role) {
        if (!role) return "未能从当前酒馆上下文读取角色信息。";
        return `# SOUL.md - 自动生成候选\n\n- **Name:** ${role.name || "未命名角色"}\n\n---\n\n## 角色设定\n${role.description || ""}\n\n## 性格倾向\n${role.personality || ""}\n\n## 场景设定\n${role.scenario || ""}\n\n## 首条消息参考\n${role.first_mes || ""}\n\n## 示例对话参考\n${role.mes_example || ""}`.trim();
    },
    genUser(userInfo) {
        if (!userInfo) return "未能从当前酒馆上下文读取 User 描述。";
        return `# USER.md - 自动生成候选\n\n- **Name:** ${userInfo.name || "User"}\n\n---\n\n## 你的基础设定\n${userInfo.description || ""}\n\n## 他的参考备注\n这里可以补充你的习惯、边界、称呼偏好、作息、雷点等。`.trim();
    },
    formatMsg(item, index) {
        let role = "NPC";
        if (item.is_system) role = "System";
        else if (item.is_user) role = "User";
        let d = new Date(item.send_date || Date.now());
        if (isNaN(d.getTime())) d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        return `# ${index}\n${dateStr}\n${timeStr}\n${item.name || "未命名"} (${role})：\n${item.mes || item.raw || ""}`;
    },
    formatJsonl(payload) {
        const metaText = JSON.stringify(payload?.metadata || {}, null, 2);
        const itemsText = (payload?.items || []).map((item, i) => this.formatMsg(item, i + 1));
        return [`#METADATA\n${metaText}`, `#MESSAGES`, ...itemsText].join("\n\n");
    },
    parseJsonl(text) {
        const source = String(text || "");
        let metadata = {};
        const metaMatch = source.match(/#METADATA\s+([\s\S]*?)\s+#MESSAGES/);
        if (metaMatch) {
            try { metadata = JSON.parse(metaMatch[1].trim() || "{}"); } catch(e) {}
        }
        const msgsText = source.includes('#MESSAGES') ? source.split('#MESSAGES')[1] : source;
        const blocks = msgsText.split(/\n?(?:^# \d+\r?\n)/m).filter(b => b.trim());
        const items = blocks.map(block => {
            const lines = block.trim().split('\n');
            let send_date = new Date().toISOString(), name = "未命名", is_user = false, is_system = false, mesLines = lines;
            if (lines.length >= 4) {
                try { send_date = new Date(`${lines[0].trim()}T${lines[1].trim()}:00`).toISOString(); } catch(e) {}
                const roleMatch = lines[2].trim().match(/(.*?)\s*\((NPC|User|System)\)[\:：]?$/);
                if (roleMatch) {
                    name = roleMatch[1].trim();
                    is_user = roleMatch[2] === 'User';
                    is_system = roleMatch[2] === 'System';
                } else {
                    name = lines[2].replace(/[\:：]$/, '').trim();
                }
                mesLines = lines.slice(3);
            }
            return { name, is_user, is_system, send_date, mes: mesLines.join('\n').trim() };
        });
        return { metadata, items };
    },
    stToWechat(messages) {
        return (messages || []).map(m => ({
            name: m.name || (m.is_user ? "用户" : "角色"),
            is_user: Boolean(m.is_user || m.role === "user"),
            is_system: Boolean(m.is_system || m.role === "system"),
            send_date: m.send_date || new Date().toISOString(),
            mes: m.message || m.mes || m.raw || ""
        })).filter(i => i.mes);
    },
    wechatToSt(items) {
        return (items || []).map(i => ({
            name: i.name || (i.is_user ? "用户" : "角色"),
            is_user: Boolean(i.is_user),
            is_system: Boolean(i.is_system),
            role: i.is_system ? "system" : (i.is_user ? "user" : "assistant"),
            message: i.mes || i.raw || ""
        })).filter(i => i.message);
    },
    formatWbEntry(entry) {
        const title = entry.comment || entry.name || entry.key || entry.uid || "未命名条目";
        const keys = Array.isArray(entry.key) ? entry.key.join("、") : (entry.key || "");
        const content = entry.content || entry.entry || entry.text || "";
        return `## ${title}\n\n关键词：${keys || "未填写"}\n\n${content}`.trim();
    }
};

// ==========================================
// [模块 3] 酒馆原生 API 桥接层 (STBridge)
// ==========================================
const STBridge = {
    getContext() {
        if (typeof getContext === "function") return getContext();
        if (typeof window.getContext === "function") return window.getContext();
        if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") return window.SillyTavern.getContext();
        return null;
    },
    getApi(fnName) {
        if (typeof window !== 'undefined' && typeof window[fnName] === "function") return window[fnName];
        if (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern[fnName] === "function") return window.SillyTavern[fnName];
        if (typeof window !== 'undefined' && window.TavernHelper && typeof window.TavernHelper[fnName] === "function") return window.TavernHelper[fnName];
        return null;
    },
    getChatList() {
        const context = this.getContext();
        if (context && Array.isArray(context.chat) && context.chat.length > 0) return context.chat;
        if (window.SillyTavern && Array.isArray(window.SillyTavern.chat) && window.SillyTavern.chat.length > 0) return window.SillyTavern.chat;
        const getter = this.getApi("getChatMessages");
        if (getter) {
            try {
                const result = getter("0-{{lastMessageId}}", { include_swipes: false });
                if (Array.isArray(result)) return result;
            } catch (e) {}
        }
        return [];
    },
    async getWbNames() {
        const names = new Set();
        const fns = ["getWorldbookNames", "getGlobalWorldbookNames", "getCharWorldbookNames", "getChatWorldbookName"];
        for (const fn of fns) {
            const getter = this.getApi(fn);
            if (getter) {
                try {
                    const res = (fn.includes("Char") || fn.includes("Chat")) ? await getter("current") : await getter();
                    if (Array.isArray(res)) res.forEach(n => names.add(String(n)));
                    else if (res && typeof res === "object") {
                        if (res.primary) names.add(String(res.primary));
                        if (Array.isArray(res.additional)) res.additional.forEach(n => names.add(String(n)));
                    } else if (res) names.add(String(res));
                } catch(e) {}
            }
        }
        return Array.from(names);
    },
    async getWbEntries(wbName) {
        const getter = this.getApi("getWorldbook");
        if (!getter || !wbName) return [];
        const res = await getter(wbName);
        return Array.isArray(res) ? res : [];
    },
    getCharInfo() {
        const fnSub = this.getApi("substituteParams");
        if (fnSub) {
            return {
                name: fnSub('{{char}}') || "未命名",
                description: fnSub('{{description}}') || "",
                personality: fnSub('{{personality}}') || "",
                scenario: fnSub('{{scenario}}') || "",
                mes_example: fnSub('{{mesExamples}}') || "",
                first_mes: fnSub('{{firstMessage}}') || "",
            };
        }
        const ctx = this.getContext();
        const character = ctx?.characters?.[ctx.characterId] || ctx?.character || null;
        if (!character) return null;
        return {
            name: character.name || "未命名角色",
            description: character.description || character.desc || "",
            personality: character.personality || "",
            scenario: character.scenario || "",
            mes_example: character.mes_example || character.example_dialogue || "",
            first_mes: character.first_mes || character.firstMessage || "",
        };
    },
    getUserInfo() {
        const fnSub = this.getApi("substituteParams");
        if (fnSub) {
            return { name: fnSub('{{user}}') || "User", description: fnSub('{{persona}}') || "" };
        }
        const ctx = this.getContext();
        if (!ctx) return null;
        const p = ctx.persona || ctx.user || ctx.userPersona || {};
        const parts = [
            ctx.persona_description, ctx.user_description, ctx.description,
            ctx.chatMetadata?.persona, ctx.chatMetadata?.persona_description,
            p.description, p.persona_description, p.note, p.content, p.text
        ].filter(Boolean);
        return {
            name: ctx.name1 || ctx.user_name || p.name || p.persona_name || "User",
            description: parts.join("\n\n").trim(),
        };
    }
};

// ==========================================
// [模块 4] 后端网络通信层 (Backend)
// ==========================================
const Backend = {
    async request(pathname, options = {}) {
        const response = await fetch(`/api/plugins/zitui-st-wechat-bridge${pathname}`, {
            method: options.method || "POST",
            headers: { "Content-Type": "application/json", ...getRequestHeaders(), ...(options.headers || {}) },
            body: JSON.stringify({ ...State.getRequestConfig(), ...(options.body || {}) }),
        });
        if (!response.ok) throw new Error(await response.text().catch(() => `请求失败: ${response.status}`));
        return response.json();
    },
    async checkHealth() { return this.request("/health"); },
    async getOverview() { return this.request("/overview"); },
    async readMainConfig() { return this.request("/config/main/read"); },
    async saveMainConfig(data) { return this.request("/workspace/save", { body: { file_key: "config", format: "json", data } }); },
    async readRuntimeConfig() { return this.request("/config/runtime/read"); },
    async saveRuntimeConfig(data) { return this.request("/workspace/save", { body: { file_key: "runtime", format: "json", data } }); },
    async readWorkspace(fileKey) { return this.request("/workspace/read", { body: { file_key: fileKey } }); },
    async saveWorkspace(fileKey, data) { return this.request("/workspace/save", { body: { file_key: fileKey, data } }); },
    async getMemoryList() { return this.request("/memory/list"); },
    async readMemoryFile(name) { return this.request("/memory/read", { body: { file_name: name } }); },
    async saveMemoryFile(name, metadata, items) { return this.request("/memory/save", { body: { file_name: name, metadata, items } }); },
    async activateMemory(name) { return this.request("/memory/activate", { body: { file_name: name } }); },
    async readSensorMap() { return this.request("/sensor/map/read"); },
    async saveSensorMap(data) { return this.request("/sensor/map/save", { body: { data } }); },
    async getBackupList() { return this.request("/backup/list"); },
    async createBackup() { return this.request("/backup/create"); },
    async restoreBackup(name) { return this.request("/backup/restore", { body: { backup_name: name } }); }
};

// ==========================================
// [模块 5] DOM 渲染与 UI 交互 (UI)
// ==========================================
const UI = {
    createInputBlock(labelText, keyPath, value, type = "text", placeholder = "") {
        const wrapper = $('<div class="zwb-form-item"></div>');
        wrapper.append(`<label>${labelText}</label>`);
        if (type === "checkbox") {
            const input = $(`<label class="checkbox_label"><input type="checkbox" data-key="${keyPath}" /><span>${labelText}</span></label>`);
            input.find("input").prop("checked", Boolean(value));
            return wrapper.append(input);
        }
        const input = $(`<input class="text_pole" type="${type === "number" ? "number" : "text"}" data-key="${keyPath}" placeholder="${placeholder}" />`);
        input.val(value ?? "");
        return wrapper.append(input);
    },
    createTextareaBlock(labelText, keyPath, value, placeholder = "") {
        const wrapper = $('<div class="zwb-form-item zwb-form-item-full"></div>');
        wrapper.append(`<label>${labelText}</label>`);
        const textarea = $(`<textarea class="text_pole zwb-json-textarea" data-key="${keyPath}" placeholder="${placeholder}"></textarea>`);
        textarea.val(value ?? "");
        return wrapper.append(textarea);
    },
    createHourSelect(labelText, keyPath, value) {
        const wrapper = $('<div class="zwb-form-item"></div>');
        wrapper.append(`<label>${labelText}</label>`);
        const select = $(`<select class="text_pole" data-key="${keyPath}"></select>`);
        for (let hour = 0; hour <= 24; hour++) select.append(`<option value="${hour}">${hour}</option>`);
        select.val(String(value ?? 0));
        return wrapper.append(select);
    },

    renderSettingsPanel() {
        const s = State.getSettings();
        $("#zwb_local_base_dir").val(s.local_base_dir);
        $("#zwb_enable_http_mode").prop("checked", s.enable_http_mode);
        $("#zwb_remote_base_url").val(s.remote_base_url);
    },

    renderMainConfig() {
        if (!State.mainConfig) return;
        const container = $("#zwb_config_form").empty();
        const conf = State.mainConfig;
        
        const fields = [
            ["对话 API Base URL", "chat_llm.api_base_url", Utils.parsePath(conf, ["chat_llm", "api_base_url"], "")],
            ["对话 API Key", "chat_llm.api_key", Utils.parsePath(conf, ["chat_llm", "api_key"], "")],
            ["对话模型名", "chat_llm.model_name", Utils.parsePath(conf, ["chat_llm", "model_name"], "")],
            ["图片服务地址", "services.image_server_url", Utils.parsePath(conf, ["services", "image_server_url"], "")],
            ["语音服务地址", "services.voice_server_url", Utils.parsePath(conf, ["services", "voice_server_url"], "")],
            ["TTS URL", "tts.url", Utils.parsePath(conf, ["tts", "url"], "")],
            ["图片生成 API Key", "image_generation.api_key", Utils.parsePath(conf, ["image_generation", "api_key"], "")],
            ["图片生成模型", "image_generation.model_name", Utils.parsePath(conf, ["image_generation", "model_name"], "")],
            ["参考图路径", "image_generation.reference_image_path", Utils.parsePath(conf, ["image_generation", "reference_image_path"], "")],
            ["语音封面图路径", "voice_generation.cover_image_path", Utils.parsePath(conf, ["voice_generation", "cover_image_path"], "")],
            ["字体路径", "voice_generation.font_path", Utils.parsePath(conf, ["voice_generation", "font_path"], "")],
            ["Miio 设备 IP", "miio.ip", Utils.parsePath(conf, ["miio", "ip"], "")],
            ["Miio Token", "miio.token", Utils.parsePath(conf, ["miio", "token"], "")]
        ];
        fields.forEach(([label, key, val]) => container.append(this.createInputBlock(label, key, val)));

        const ttsBlock = $('<div class="zwb-form-item-full zwb-tts-block"></div>');
        ttsBlock.append('<label style="display:block;margin:10px 0;">语音轮询节点（最多 10 个）</label>');
        ttsBlock.append('<div id="zwb_tts_credentials_editor" class="zwb-tts-editor" style="margin: 10px 0;"></div>');
        ttsBlock.append('<div class="zwb-panel-actions"><button id="zwb_add_tts_cred_btn" class="menu_button" type="button">新增节点</button><button id="zwb_save_main_config_btn" class="menu_button" type="button">保存配置</button><button id="zwb_reload_main_config_btn" class="menu_button" type="button">重新读取</button></div>');
        container.append(ttsBlock);
        this.renderTtsEditor();
    },

    renderTtsEditor() {
        const editor = $("#zwb_tts_credentials_editor").empty();
        const list = Array.isArray(State.mainConfig?.tts?.credentials) ? State.mainConfig.tts.credentials : [];
        if (!list.length) return editor.append('<div style="font-size:13px; color:#aaa;">当前尚未配置语音节点。</div>');
        
        list.forEach((item, index) => {
            const row = $(`
                <div style="display:flex;gap:5px;margin-bottom:5px;align-items:center;">
                    <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="appid" placeholder="appid" style="flex:1;" />
                    <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="token" placeholder="token" style="flex:1;" />
                    <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="voiceId" placeholder="voiceId" style="flex:1;" />
                    <button class="menu_button zwb-delete-tts-btn" type="button" data-tts-index="${index}" style="margin:0; min-width:auto; padding:8px;">删</button>
                </div>
            `);
            row.find('[data-tts-key="appid"]').val(item.appid || "");
            row.find('[data-tts-key="token"]').val(item.token || "");
            row.find('[data-tts-key="voiceId"]').val(item.voiceId || "");
            editor.append(row);
        });
    },

    readMainConfigForm() {
        const result = structuredClone(State.mainConfig || {});
        $("#zwb_config_form [data-key]").each(function () {
            let val = $(this).val();
            if ($(this).attr("type") === "number") val = Number(val || 0);
            Utils.setPath(result, $(this).data("key"), val);
        });
        result.tts = result.tts || {}; result.tts.credentials = [];
        $("#zwb_tts_credentials_editor > div").each(function () {
            const appid = String($(this).find('[data-tts-key="appid"]').val() || "").trim();
            const token = String($(this).find('[data-tts-key="token"]').val() || "").trim();
            const voiceId = String($(this).find('[data-tts-key="voiceId"]').val() || "").trim();
            if (appid || token || voiceId) result.tts.credentials.push({ appid, token, voiceId });
        });
        return result;
    },

    renderRuntimeConfig() {
        if (!State.runtimeConfig) return;
        const container = $("#zwb_runtime_form").empty();
        const conf = State.runtimeConfig;

        container.append(this.createInputBlock("等你输入时，最多等几秒再发出去", "wait_time_seconds", Utils.msToSec(conf.wait_time_ms, 7), "number"));
        container.append(this.createInputBlock("多久没收到消息后才允许他主动联系你（秒）", "idle_limit_seconds", Utils.msToSec(conf.idle_limit_ms, 1800), "number"));
        container.append(this.createHourSelect("你的他几点开始可以主动发消息（24 时制）", "wake_window.start_hour", Utils.parsePath(conf, ["wake_window", "start_hour"], 9)));
        container.append(this.createHourSelect("你的他几点之后不再主动发消息（24 时制）", "wake_window.end_hour", Utils.parsePath(conf, ["wake_window", "end_hour"], 3)));
        container.append(this.createTextareaBlock("一用他就响起警报的应用（每行一个）", "sensor.urgent_apps", (Utils.parsePath(conf, ["sensor", "urgent_apps"], []) || []).join("\n"), "例如：爱发电"));

        const buttons = $('<div class="zwb-form-item-full zwb-panel-actions"><button id="zwb_save_runtime_config_btn" class="menu_button" type="button">保存运行策略</button><button id="zwb_reload_runtime_config_btn" class="menu_button" type="button">重新读取</button></div>');
        container.append($('<div class="zwb-form-item-full" style="font-size:12px;color:#888;margin:10px 0;">支持跨夜，如23到9。</div>')).append(buttons);
    },

    readRuntimeConfigForm() {
        const result = structuredClone(State.runtimeConfig || {});
        const wait = Number($("#zwb_runtime_form [data-key='wait_time_seconds']").val() || 0);
        const idle = Number($("#zwb_runtime_form [data-key='idle_limit_seconds']").val() || 0);
        result.wait_time_ms = Math.max(0, wait) * 1000;
        result.idle_limit_ms = Math.max(0, idle) * 1000;
        result.wake_window = {
            start_hour: Math.min(24, Math.max(0, Number($("#zwb_runtime_form [data-key='wake_window.start_hour']").val() || 0))),
            end_hour: Math.min(24, Math.max(0, Number($("#zwb_runtime_form [data-key='wake_window.end_hour']").val() || 0)))
        };
        result.sensor = { urgent_apps: String($("#zwb_runtime_form [data-key='sensor.urgent_apps']").val() || "").split("\n").map(v => v.trim()).filter(Boolean) };
        return result;
    },

    renderMemoryList() {
        const mCon = $("#zwb_memory_list").empty();
        if (!State.memoryList.full_logs.length) {
            mCon.text("暂无 full log 文件。");
        } else {
            const actions = $('<div style="display:flex; flex-wrap:wrap; gap:5px;"></div>');
            State.memoryList.full_logs.forEach(item => {
                actions.append(`<button class="menu_button zwb-memory-open-btn" type="button" data-file-name="${item.name}" style="margin:0; padding:6px 10px;">${item.is_active ? '★ ' : ''}${item.name}</button>`);
            });
            mCon.append(actions);
        }

        const sCon = $("#zwb_summary_list").empty();
        if (!State.memoryList.summary_logs.length) {
            sCon.text("暂无 Summary 文件。");
        } else {
            const actions = $('<div style="display:flex; flex-wrap:wrap; gap:5px;"></div>');
            State.memoryList.summary_logs.forEach(item => {
                actions.append(`<button class="menu_button zwb-summary-open-btn" type="button" data-file-name="${item.name}" style="margin:0; padding:6px 10px;">${item.name}</button>`);
            });
            sCon.append(actions);
        }
    },

    updateStChatDisplay() {
        const editor = $("#zwb_st_chat_preview_editor");
        if (!editor.length) return;
        const messages = STBridge.getChatList();
        if (!messages || messages.length === 0) {
            editor.val("当前酒馆聊天记录为空，或未选中任何对话。");
            return;
        }
        editor.val(Utils.formatJsonl({ items: Utils.stToWechat(messages) }));
    },

    renderSensorMap() {
        const container = $("#zwb_sensor_map_editor").empty();
        const entries = Object.entries(State.sensorMap || {});
        if (!entries.length) {
            container.append('<div style="display:flex;gap:5px;margin-bottom:5px;"><input class="text_pole" data-sensor-key="name" type="text" placeholder="APP" style="flex:1;" /><textarea class="text_pole zwb-json-textarea" data-sensor-key="prompt" placeholder="附加解释" style="flex:2;min-height:40px;"></textarea></div>');
            return;
        }
        entries.forEach(([appName, prompt]) => {
            const row = $(`
                <div style="display:flex;gap:5px;margin-bottom:5px;align-items:flex-start;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;">
                    <input class="text_pole" data-sensor-key="name" type="text" placeholder="APP" style="flex:1;" />
                    <textarea class="text_pole zwb-json-textarea" data-sensor-key="prompt" placeholder="附加解释" style="flex:2;min-height:40px;"></textarea>
                    <button class="menu_button zwb-delete-sensor-row-btn" type="button" style="margin:0;padding:6px;">删</button>
                </div>
            `);
            row.find('[data-sensor-key="name"]').val(appName);
            row.find('[data-sensor-key="prompt"]').val(prompt || "");
            container.append(row);
        });
    },

    readSensorMapForm() {
        const result = {};
        $("#zwb_sensor_map_editor > div").each(function () {
            const appName = String($(this).find('[data-sensor-key="name"]').val() || "").trim();
            const prompt = String($(this).find('[data-sensor-key="prompt"]').val() || "").trim();
            if (appName && prompt) result[appName] = prompt;
        });
        return result;
    },

    async renderWbNames() {
        const names = await STBridge.getWbNames();
        const cbContainer = $("#zwb_worldbook_names_container").empty();
        
        if (!names.length) {
            cbContainer.html('<div style="padding:10px; color:#888; font-size:13px;">未检测到可用世界书。</div>');
            $("#zwb_worldbook_entries_wrapper").html('<div style="padding:10px; color:#888; font-size:13px;">无内容。</div>');
            return;
        }

        let htmlStr = "";
        names.forEach(name => {
            htmlStr += `
                <label style="display:inline-block; margin:0 12px 8px 0; cursor:pointer; font-size:13px; color:#ddd;">
                    <input type="checkbox" class="zwb-wb-name-checkbox" value="${name}" style="vertical-align:middle; margin-right:4px;">
                    <span style="color:#7aa2ff;">[书]</span> ${name}
                </label>`;
        });
        cbContainer.html(htmlStr);
        $("#zwb_worldbook_entries_wrapper").html('<div style="padding:10px; color:#888; font-size:13px;">请先在上方勾选世界书。</div>');
    },

    async renderWbEntries(selectedNames) {
        const wrapper = $("#zwb_worldbook_entries_wrapper");
        if (!selectedNames || selectedNames.length === 0) {
            wrapper.html('<div style="padding:10px; color:#888; font-size:13px;">请先在上方勾选世界书。</div>');
            return;
        }
        wrapper.html('<div style="padding:10px; color:#888; font-size:13px;">正在读取所选世界书条目...</div>');
        
        let allEntries = [];
        for (const name of selectedNames) {
            const entries = await STBridge.getWbEntries(name);
            entries.forEach(e => e._sourceWB = name); 
            allEntries = allEntries.concat(entries);
        }

        if (!allEntries.length) {
            wrapper.html('<div style="padding:10px; color:#888; font-size:13px;">所选的世界书中没有任何条目。</div>');
            return;
        }

        let cbHtml = '<div style="max-height:180px; overflow-y:auto; padding:10px;">';
        allEntries.forEach((entry, index) => {
            const keys = Array.isArray(entry.key) ? entry.key.join('、') : (entry.key || '');
            const title = entry.comment || entry.name || keys || '无名条目';
            const safeTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;
            cbHtml += `
                <label style="display:flex; align-items:flex-start; margin-bottom:8px; cursor:pointer; font-size:13px; color:#ddd;">
                    <input type="checkbox" class="zwb-wb-entry-checkbox" data-index="${index}" style="margin-right:8px; margin-top:3px;">
                    <div>
                        <span style="color:#4CAF50; font-weight:bold;">[${entry._sourceWB}]</span> ${safeTitle}
                        <div style="font-size:11px; color:#aaa; margin-top:2px;">关键词: ${keys || '无'}</div>
                    </div>
                </label>
            `;
        });
        cbHtml += '</div>';

        wrapper.html(cbHtml);
        
        const previewArea = $('<textarea class="text_pole zwb-json-textarea" style="margin:10px; width:calc(100% - 20px); height:120px; display:none;" readonly></textarea>');
        const actionBtn = $('<button class="menu_button full-width" type="button" style="display:none; margin:0 10px 10px 10px; width:calc(100% - 20px); background:#5e5c8a; color:white;">👇 追加选中的设定到 MEMORY.md 👇</button>');
        wrapper.append(previewArea).append(actionBtn);

        wrapper.off('change', '.zwb-wb-entry-checkbox').on('change', '.zwb-wb-entry-checkbox', function() {
            const idxs = [];
            wrapper.find('.zwb-wb-entry-checkbox:checked').each(function() { idxs.push(Number($(this).data('index'))); });
            if (idxs.length > 0) {
                previewArea.val(idxs.map(idx => Utils.formatWbEntry(allEntries[idx])).join("\n\n")).show();
                actionBtn.show().data('selected-entries', idxs.map(idx => allEntries[idx]));
            } else {
                previewArea.hide(); actionBtn.hide();
            }
        });

        actionBtn.off('click').on('click', function() {
            const entries = $(this).data('selected-entries') || [];
            if (!entries.length) return;
            const currentText = String($("#zwb_memory_markdown_editor").val() || "").trim();
            const newTexts = entries.map(e => Utils.formatWbEntry(e));
            $("#zwb_memory_markdown_editor").val([currentText, ...newTexts].filter(Boolean).join("\n\n"));
            toastr.success(`已追加 ${entries.length} 个条目到 MEMORY 编辑区！`);
        });
    }
};

// ==========================================
// [模块 6] 生命周期控制器与事件分发 (App Core)
// ==========================================
const App = {
    async init() {
        const panelHtml = await $.get(`${EXT_PATH}/templates/panel.html`);
        const modalHtml = await $.get(`${EXT_PATH}/templates/modal.html`);
        
        if (!$("#zwb_open_modal_btn").length) {
            $("#extensions_settings").append(panelHtml);
        }
        
        $("#zwb_modal_container").remove();
        $("body").append(modalHtml);
        
        UI.renderSettingsPanel();
        this.bindExtensionSettingsEvents();
        this.bindModalEvents();
        this.bindActionEvents();
    },

    bindExtensionSettingsEvents() {
        $("#zwb_local_base_dir, #zwb_remote_base_url").on("input", function () {
            State.getSettings()[this.id.replace("zwb_", "")] = String($(this).val()).trim();
            State.saveSettings();
        });
        $("#zwb_enable_http_mode").on("input", function () {
            State.getSettings().enable_http_mode = Boolean($(this).prop("checked"));
            State.saveSettings();
        });
    },

    bindModalEvents() {
        // 核心解耦点：点击打开弹窗时，先执行毫秒级 CSS 过渡，等弹窗稳住了再去进行高压网络请求与渲染
        $("body").on("click", "#zwb_open_modal_btn", (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            $("html, body").addClass("zwb-modal-open");
            $("#zwb_modal_container").css("display", "flex").hide().fadeIn(200, async () => {
                try {
                    await this.loadCoreData();
                    toastr.success("桥接中心加载完毕", "加载成功");
                } catch (error) {
                    toastr.error(`加载异常：${error.message}`);
                }
            });
        });

        $("body").on("click", "#zwb_modal_close", () => {
            $("#zwb_modal_container").fadeOut(200, () => $("html, body").removeClass("zwb-modal-open"));
        });
        
        $("body").on("click", "#zwb_modal_container", function (e) {
            if (e.target === this) $("#zwb_modal_close").trigger("click");
        });

        $("body").on("click", ".zwb-tab-btn", function () {
            $(".zwb-tab-btn, .zwb-tab-content").removeClass("active");
            $(this).addClass("active");
            $(`#${$(this).data("tab")}`).addClass("active");
        });
    },

    async loadCoreData() {
        // 轻量级的并发数据获取，遇到报错静默处理，避免一个接口挂掉导致整个面板白板
        const safeFetch = async (fn) => { try { await fn(); } catch(e) { console.warn(e); } };

        await Promise.all([
            safeFetch(async () => {
                const health = await Backend.checkHealth();
                $("#zwb_status_hint, #zwb_modal_runtime").text(`当前状态：${health.message}`);
            }),
            safeFetch(async () => {
                const overview = await Backend.getOverview();
                $("#zwb_mode_badge").text(overview.mode_label || "未配置");
                $("#zwb_active_memory").text(overview.active_memory || "未设置");
                $("#zwb_overview_status").text(overview.summary || "暂无信息");
            }),
            safeFetch(async () => {
                State.mainConfig = (await Backend.readMainConfig()).data || {};
                UI.renderMainConfig();
            }),
            safeFetch(async () => {
                State.runtimeConfig = (await Backend.readRuntimeConfig()).data || {};
                UI.renderRuntimeConfig();
            }),
            safeFetch(async () => {
                const [idRes, soulRes, userRes] = await Promise.all([
                    Backend.readWorkspace("identity"), Backend.readWorkspace("soul"), Backend.readWorkspace("user")
                ]);
                $("#zwb_character_current").val(`【当前 IDENTITY.md】\n${idRes.data || ""}\n\n【当前 SOUL.md】\n${soulRes.data || ""}`);
                $("#zwb_user_current").val(userRes.data || "");
                
                const role = STBridge.getCharInfo();
                const userInfo = STBridge.getUserInfo();
                $("#zwb_character_name_input").val(role?.name || "");
                $("#zwb_user_name_input").val(userInfo?.name || "");
                $("#zwb_character_preview_editor").val(Utils.genIdentity(role));
                $("#zwb_user_preview_editor").val(Utils.genUser(userInfo));
            }),
            safeFetch(async () => {
                State.sensorMap = (await Backend.readSensorMap()).data || {};
                UI.renderSensorMap();
            }),
            safeFetch(async () => {
                State.backupList = (await Backend.getBackupList()).items || [];
                const lines = State.backupList.map(item => `- ${item.name} (${item.created_at})`);
                $("#zwb_backup_list").text(lines.length ? lines.join("\n") : "暂无备份。");
                const select = $("#zwb_backup_restore_select").empty();
                if (!State.backupList.length) select.append('<option value="">无可用备份</option>');
                else State.backupList.forEach(i => select.append(`<option value="${i.name}">${i.name}</option>`));
            })
        ]);

        // 读取记忆相关（有严格的顺序依赖）
        await safeFetch(async () => {
            State.memoryList = (await Backend.getMemoryList()).data || { full_logs: [], summary_logs: [] };
            UI.renderMemoryList();
            
            if (State.memoryList.full_logs.length) {
                const fn = State.memoryList.full_logs[0].name;
                const d = await Backend.readMemoryFile(fn);
                State.memoryData = d.data?.content || { metadata: {}, items: [] };
                $("#zwb_memory_file_input").val(fn);
                $("#zwb_memory_preview_editor").val(Utils.formatJsonl(State.memoryData));
            }
            if (State.memoryList.summary_logs.length) {
                const fn = State.memoryList.summary_logs[0].name;
                const d = await Backend.readMemoryFile(fn);
                const payload = d.data?.content || { items: [] };
                const pLines = (payload.items || []).map(i => `【${i.send_date || '无时间'}】\n${i.name || (i.is_user ? '你' : '他')}：${i.mes || i.raw || ''}`);
                $("#zwb_summary_preview_editor").val(pLines.join("\n\n"));
            }
        });

        await safeFetch(async () => {
            const mdRes = await Backend.readWorkspace("memory_markdown");
            $("#zwb_memory_markdown_editor").val(mdRes.data || "");
            await UI.renderWbNames();
        });

        // 强行同步抓取酒馆聊天以防止错位
        UI.updateStChatDisplay();
    },

    bindActionEvents() {
        $("body").on("click", "#zwb_ping_btn", async () => {
            await Backend.checkHealth(); toastr.success("连接检测完成");
        });

        // 配置存储
        $("body").on("click", "#zwb_add_tts_cred_btn", () => {
            State.mainConfig = State.mainConfig || {}; State.mainConfig.tts = State.mainConfig.tts || {};
            State.mainConfig.tts.credentials = Array.isArray(State.mainConfig.tts.credentials) ? State.mainConfig.tts.credentials : [];
            if (State.mainConfig.tts.credentials.length >= 10) return toastr.warning("最多10个节点");
            State.mainConfig.tts.credentials.push({ appid: "", token: "", voiceId: "" });
            UI.renderTtsEditor();
        });
        $("body").on("click", ".zwb-delete-tts-btn", function () {
            State.mainConfig.tts.credentials.splice(Number($(this).data("tts-index")), 1);
            UI.renderTtsEditor();
        });
        $("body").on("click", "#zwb_save_main_config_btn", async () => {
            State.mainConfig = UI.readMainConfigForm();
            await Backend.saveMainConfig(State.mainConfig); toastr.success("配置已保存");
        });
        $("body").on("click", "#zwb_reload_main_config_btn", async () => {
            State.mainConfig = (await Backend.readMainConfig()).data || {};
            UI.renderMainConfig(); toastr.success("重新读取成功");
        });
        $("body").on("click", "#zwb_save_runtime_config_btn", async () => {
            State.runtimeConfig = UI.readRuntimeConfigForm();
            await Backend.saveRuntimeConfig(State.runtimeConfig); toastr.success("策略已保存");
        });
        $("body").on("click", "#zwb_reload_runtime_config_btn", async () => {
            State.runtimeConfig = (await Backend.readRuntimeConfig()).data || {};
            UI.renderRuntimeConfig(); toastr.success("重新读取成功");
        });

        // 角色生成导入
        $("body").on("click", "#zwb_generate_identity_btn", () => {
            $("#zwb_character_target_select").val("identity");
            $("#zwb_character_preview_editor").val(Utils.genIdentity(STBridge.getCharInfo()));
            toastr.success("已生成 IDENTITY");
        });
        $("body").on("click", "#zwb_generate_soul_btn", () => {
            $("#zwb_character_target_select").val("soul");
            $("#zwb_character_preview_editor").val(Utils.genSoul(STBridge.getCharInfo()));
            toastr.success("已生成 SOUL");
        });
        $("body").on("click", "#zwb_save_character_btn", async () => {
            const fileKey = $("#zwb_character_target_select").val();
            let content = Utils.injectName($("#zwb_character_preview_editor").val(), $("#zwb_character_name_input").val());
            if (fileKey === "soul") {
                const currentSoul = String($("#zwb_character_current").val().split("【当前 SOUL.md】\n")[1] || "");
                content = Utils.mergeSoul(content, currentSoul, $("#zwb_character_name_input").val());
            }
            await Backend.saveWorkspace(fileKey, content);
            toastr.success(`已写入 ${fileKey.toUpperCase()}.md`);
        });
        $("body").on("click", "#zwb_generate_user_btn", () => {
            $("#zwb_user_preview_editor").val(Utils.genUser(STBridge.getUserInfo()));
            toastr.success("已生成 User 文本");
        });
        $("body").on("click", "#zwb_save_user_btn", async () => {
            const content = Utils.injectName($("#zwb_user_preview_editor").val(), $("#zwb_user_name_input").val());
            await Backend.saveWorkspace("user", content);
            toastr.success("已写入 USER.md");
        });

        // 双向同步与记忆管理
        $("body").on("click", ".zwb-memory-open-btn", async function () {
            const fn = $(this).data("file-name");
            const d = await Backend.readMemoryFile(fn);
            State.memoryData = d.data?.content || { metadata: {}, items: [] };
            $("#zwb_memory_file_input").val(fn);
            $("#zwb_memory_preview_editor").val(Utils.formatJsonl(State.memoryData));
            toastr.success(`已读取: ${fn}`);
        });
        $("body").on("click", ".zwb-summary-open-btn", async function () {
            const d = await Backend.readMemoryFile($(this).data("file-name"));
            const pLines = (d.data?.content?.items || []).map(i => `【${i.send_date || '无时间'}】\n${i.name || (i.is_user ? '你' : '他')}：${i.mes || i.raw || ''}`);
            $("#zwb_summary_preview_editor").val(pLines.join("\n\n"));
            toastr.success(`已读取日记`);
        });
        $("body").on("click", "#zwb_reload_memory_btn", async () => {
            State.memoryList = (await Backend.getMemoryList()).data || { full_logs: [], summary_logs: [] };
            UI.renderMemoryList(); await UI.renderWbNames(); toastr.success("列表已刷新");
        });
        $("body").on("click", "#zwb_activate_memory_btn", async () => {
            const fn = String($("#zwb_memory_file_input").val() || "").trim();
            if (!fn) return toastr.warning("请选择文件");
            await Backend.activateMemory(fn);
            State.memoryList = (await Backend.getMemoryList()).data || { full_logs: [], summary_logs: [] };
            UI.renderMemoryList(); toastr.success("活跃文件已更新");
        });
        
        $("body").on("click", "#zwb_refresh_st_chat_btn", () => {
            UI.updateStChatDisplay(); toastr.success("下区已提取最新酒馆聊天");
        });
        $("body").on("click", "#zwb_import_st_to_wechat_btn", async () => {
            const fn = String($("#zwb_memory_file_input").val() || "").trim();
            if (!fn) return toastr.warning("请在左侧选择微信文件");
            const parsed = Utils.parseJsonl($("#zwb_st_chat_preview_editor").val());
            if (!parsed.items.length) return toastr.warning("下区没有可识别的消息格式");
            const meta = State.memoryData?.metadata || {};
            meta.imported_from = "sillytavern_current_chat";
            meta.imported_at = new Date().toISOString();
            
            await Backend.saveMemoryFile(fn, meta, parsed.items);
            const d = await Backend.readMemoryFile(fn);
            State.memoryData = d.data?.content || { metadata: {}, items: [] };
            $("#zwb_memory_preview_editor").val(Utils.formatJsonl(State.memoryData));
            toastr.success(`成功覆盖 ${parsed.items.length} 条记录到微信文件`);
        });
        $("body").on("click", "#zwb_import_wechat_memory_to_st_btn", async () => {
            const creator = STBridge.getApi("createChatMessages");
            if (!creator) return toastr.error("酒馆写入接口不可用");
            const parsed = Utils.parseJsonl($("#zwb_memory_preview_editor").val());
            if (!parsed.items.length) return toastr.warning("上区没有可识别的消息");
            
            const converted = Utils.wechatToSt(parsed.items);
            await creator(converted, { insert_before: "end", refresh: "all" });
            UI.updateStChatDisplay(); toastr.success(`成功追加 ${converted.length} 条消息到酒馆`);
        });
        $("body").on("click", "#zwb_save_memory_btn", async () => {
            const fn = String($("#zwb_memory_file_input").val() || "").trim();
            if (!fn) return toastr.warning("请选择文件");
            const parsed = Utils.parseJsonl($("#zwb_memory_preview_editor").val());
            await Backend.saveMemoryFile(fn, parsed.metadata, parsed.items); toastr.success("修改已保存");
        });

        // 联动世界书
        $("body").on("change", ".zwb-wb-name-checkbox", async function () {
            const sel = [];
            $(".zwb-wb-name-checkbox:checked").each(function() { sel.push($(this).val()); });
            await UI.renderWbEntries(sel);
        });
        $("body").on("click", "#zwb_save_memory_markdown_btn", async () => {
            await Backend.saveWorkspace("memory_markdown", $("#zwb_memory_markdown_editor").val()); toastr.success("MEMORY 设定已保存");
        });

        // Sensor映射
        $("body").on("click", "#zwb_add_sensor_row_btn", () => {
            $("#zwb_sensor_map_editor").append('<div style="display:flex;gap:5px;margin-bottom:5px;align-items:flex-start;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;"><input class="text_pole" data-sensor-key="name" type="text" placeholder="APP" style="flex:1;" /><textarea class="text_pole zwb-json-textarea" data-sensor-key="prompt" placeholder="附加解释" style="flex:2;min-height:40px;"></textarea><button class="menu_button zwb-delete-sensor-row-btn" type="button" style="margin:0;padding:6px;">删</button></div>');
        });
        $("body").on("click", ".zwb-delete-sensor-row-btn", function () { $(this).parent().remove(); });
        $("body").on("click", "#zwb_save_sensor_map_btn", async () => {
            await Backend.saveSensorMap(UI.readSensorMapForm()); toastr.success("保存成功");
        });
        $("body").on("click", "#zwb_reload_sensor_map_btn", async () => {
            State.sensorMap = (await Backend.readSensorMap()).data || {};
            UI.renderSensorMap(); toastr.success("读取成功");
        });

        // 备份管理
        $("body").on("click", "#zwb_backup_now_btn", async () => {
            const r = await Backend.createBackup(); toastr.success(r.message || "备份已创建");
            $("#zwb_refresh_backup_btn").trigger("click");
        });
        $("body").on("click", "#zwb_refresh_backup_btn", async () => {
            State.backupList = (await Backend.getBackupList()).items || [];
            const lines = State.backupList.map(item => `- ${item.name} (${item.created_at})`);
            $("#zwb_backup_list").text(lines.length ? lines.join("\n") : "暂无备份。");
            const select = $("#zwb_backup_restore_select").empty();
            if (!State.backupList.length) select.append('<option value="">无可用备份</option>');
            else State.backupList.forEach(i => select.append(`<option value="${i.name}">${i.name}</option>`));
            toastr.success("备份列表已刷新");
        });
        $("body").on("click", "#zwb_restore_backup_btn", async () => {
            const bn = String($("#zwb_backup_restore_select").val() || "").trim();
            if (!bn) return toastr.warning("请选择备份");
            const r = await Backend.restoreBackup(bn); toastr.success(r.message || "恢复成功");
            $("#zwb_refresh_backup_btn").trigger("click");
        });
    }
};

// 启动执行入口
jQuery(async () => {
    try {
        if (window.toastr) {
            toastr.options = { newestOnTop: true, timeOut: 2000, positionClass: "toast-top-center" };
        }
        State.getSettings();
        await App.init();
    } catch (error) {
        console.error("微信 Bot 桥接中心初始化失败:", error);
    }
});
