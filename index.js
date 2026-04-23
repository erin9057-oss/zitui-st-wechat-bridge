import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, getRequestHeaders, substituteParams } from "../../../../script.js";

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

// 核心修复：引入 _t 时间戳，防止浏览器缓存 GET 请求，导致备份刷新无效
async function 请求接口(pathname, options = {}) {
    const url = pathname.includes('?') ? `${获取服务端基础地址()}${pathname}&_t=${Date.now()}` : `${获取服务端基础地址()}${pathname}?_t=${Date.now()}`;
    
    const response = await fetch(url, {
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

function 创建小时选择块(labelText, keyPath, value) {
    const wrapper = $('<div class="zwb-form-item"></div>');
    wrapper.append(`<label>${labelText}</label>`);
    const select = $(`<select class="text_pole" data-key="${keyPath}"></select>`);
    for (let hour = 0; hour <= 24; hour += 1) {
        select.append(`<option value="${hour}">${hour}</option>`);
    }
    select.val(String(value ?? 0));
    wrapper.append(select);
    return wrapper;
}

function 毫秒转秒输入值(value, fallbackSeconds) {
    const ms = Number(value);
    if (Number.isFinite(ms) && ms >= 0) {
        return Math.round(ms / 1000);
    }
    return fallbackSeconds;
}

// === 生图高阶控制区字典 ===
const igModelDict = {
    api: [
        { value: "gemini-3-pro-image-preview", text: "Gemini 3 Pro (大香蕉)" },
        { value: "gemini-3.1-flash-image-preview", text: "Gemini 3.1 Flash (小香蕉2)" }
    ],
    bridge: [
        { value: "gemini-2.5-flash", text: "Gemini 2.5 Flash (AI Studio 专用)" }
    ],
    luma: [
        { value: "nano-banana-pro-3x4", text: "Gemini 3 Pro 竖屏 (适配微信)" },
        { value: "nano-banana-pro", text: "Gemini 3 Pro 默认" },
        { value: "nano-banana-pro-9x16", text: "Gemini 3 Pro 9:16" },
        { value: "nano-banana-pro-1x1", text: "Gemini 3 Pro 正方形 (1:1)" }
    ]
};

// === 生成配置 UI 块 ===
function 创建生图高阶控制区(主配置) {
    const mode = 解析键路径(主配置, ["image_generation", "mode"], "bridge");
    const model = 解析键路径(主配置, ["image_generation", "model_name"], "");
    const url = 解析键路径(主配置, ["image_generation", "api_base_url"], "");
    const key = 解析键路径(主配置, ["image_generation", "api_key"], "");
    const ref = 解析键路径(主配置, ["image_generation", "reference_image_path"], "");
    
    const luma_realm = 解析键路径(主配置, ["image_generation", "luma_realm_id"], "");
    const luma_wos = 解析键路径(主配置, ["image_generation", "luma_wos_session"], "");

    const wrapper = $(`
        <div class="zwb-form-item-full" style="background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; margin: 10px 0; border: 1px solid #444;">
            <div style="margin-bottom: 10px; color: #a855f7; font-weight: bold;">生图配置</div>
            
            <input type="hidden" data-key="image_generation.mode" id="zwb_ig_mode_hidden" value="${mode}">
            
            <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                <label style="cursor:pointer; font-size:13px; color:#ddd; display:flex; align-items:center; gap:5px;">
                    <input type="radio" name="zwb_ig_mode_radio" value="api" ${mode === 'api' ? 'checked' : ''}> 付费官key/公益站
                </label>
                <label style="cursor:pointer; font-size:13px; color:#ddd; display:flex; align-items:center; gap:5px;">
                    <input type="radio" name="zwb_ig_mode_radio" value="bridge" ${mode === 'bridge' ? 'checked' : ''}> AI Studio (仅能使用2.5F)
                </label>
                <label style="cursor:pointer; font-size:13px; color:#ddd; display:flex; align-items:center; gap:5px;">
                    <input type="radio" name="zwb_ig_mode_radio" value="luma" ${mode === 'luma' ? 'checked' : ''}> 本地LUMA反代
                </label>
            </div>

            <div class="zwb-form-item" style="margin-bottom: 10px;">
                <label>模型</label>
                <select class="text_pole" data-key="image_generation.model_name" id="zwb_ig_model_select" data-initial="${model}"></select>
            </div>

            <div class="zwb-form-item" id="zwb_ig_url_block" style="margin-bottom: 10px;">
                <label id="zwb_ig_url_label">URL 地址</label>
                <input class="text_pole" type="text" data-key="image_generation.api_base_url" id="zwb_ig_url" value="${url}" placeholder="https://..." />
            </div>

            <div class="zwb-form-item" id="zwb_ig_key_block" style="margin-bottom: 10px;">
                <label>API 密钥</label>
                <input class="text_pole" type="password" data-key="image_generation.api_key" value="${key}" placeholder="sk-..." />
            </div>

            <div id="zwb_ig_luma_auth" style="margin-bottom: 10px; display: none; background: rgba(168, 85, 247, 0.1); padding: 10px; border-radius: 4px; border: 1px dashed #a855f7;">
                <div class="zwb-form-item" style="margin-bottom: 5px;">
                    <label>👤 Luma Realm ID</label>
                    <input class="text_pole" type="text" data-key="image_generation.luma_realm_id" value="${luma_realm}" placeholder="输入网页上的 Realm ID" />
                </div>
                <div class="zwb-form-item" style="margin-bottom: 0;">
                    <label>🍪 Luma WOS Session</label>
                    <input class="text_pole" type="password" data-key="image_generation.luma_wos_session" value="${luma_wos}" placeholder="输入 F12 抓取的 Cookie" />
                </div>
            </div>

            <div class="zwb-form-item" style="margin-bottom: 0;">
                <label>自推参考图路径</label>
                <input class="text_pole" type="text" data-key="image_generation.reference_image_path" value="${ref}" />
            </div>
        </div>
    `);
    return wrapper;
}

function 渲染主配置表单() {
    if (!当前主配置) return;
    const container = $("#zwb_config_form");
    container.empty();
    
    // 🌟 核心UI重组：先把名字和洗盘按钮放在最顶部
    container.append(创建基础输入块("他的名字", "profile.char_name", 解析键路径(当前主配置, ["profile", "char_name"], "")));
    container.append(创建基础输入块("你的名字", "profile.user_name", 解析键路径(当前主配置, ["profile", "user_name"], "")));
    container.append('<div class="zwb-panel-actions"><div id="zwb_migrate_data_btn" class="menu_button" style="background:#a855f7; color:white; width:100%; max-width:none; justify-content:center;">🔥 一键清理预设名字 (转化为占位符)</div></div>');

    // 然后再渲染其余配置
    const 字段定义 = [
        ["对话 API Base URL", "chat_llm.api_base_url", 解析键路径(当前主配置, ["chat_llm", "api_base_url"], "")],
        ["对话 API Key", "chat_llm.api_key", 解析键路径(当前主配置, ["chat_llm", "api_key"], "")],
        ["对话模型名", "chat_llm.model_name", 解析键路径(当前主配置, ["chat_llm", "model_name"], "")],
        ["图片服务地址", "services.image_server_url", 解析键路径(当前主配置, ["services", "image_server_url"], "")],
        ["语音服务地址", "services.voice_server_url", 解析键路径(当前主配置, ["services", "voice_server_url"], "")],
        ["TTS URL", "tts.url", 解析键路径(当前主配置, ["tts", "url"], "")],
        ["语音封面图路径", "voice_generation.cover_image_path", 解析键路径(当前主配置, ["voice_generation", "cover_image_path"], "")],
        ["字体路径", "voice_generation.font_path", 解析键路径(当前主配置, ["voice_generation", "font_path"], "")],
        ["智能家居设备 IP", "miio.ip", 解析键路径(当前主配置, ["miio", "ip"], "")],
        ["智能家居Token", "miio.token", 解析键路径(当前主配置, ["miio", "token"], "")],
    ];

    for (const [label, key, value] of 字段定义) {
        container.append(创建基础输入块(label, key, value));
    }
    container.append(创建生图高阶控制区(当前主配置));

    const ttsBlock = $('<div class="zwb-form-item-full zwb-tts-block"></div>');
    ttsBlock.append('<label>语音轮询节点（最多 10 个）</label>');
    ttsBlock.append('<div id="zwb_tts_credentials_editor" class="zwb-tts-editor" style="margin: 10px 0;"></div>');
    ttsBlock.append('<div class="zwb-panel-actions"><div id="zwb_add_tts_cred_btn" class="menu_button">新增节点</div><div id="zwb_save_main_config_btn" class="menu_button" style="background:#4CAF50;">保存基础配置</div><div id="zwb_reload_main_config_btn" class="menu_button">重新读取</div></div>');
    
    container.append(ttsBlock);
    渲染语音节点编辑器();

    $('input[name="zwb_ig_mode_radio"]:checked').trigger('change');
}

function 渲染语音节点编辑器() {
    const editor = $("#zwb_tts_credentials_editor");
    if (!editor.length) return;
    editor.empty();

    const list = Array.isArray(当前主配置?.tts?.credentials) ? 当前主配置.tts.credentials : [];
    if (!list.length) {
        editor.append('<div style="font-size:13px; color:#aaa;">当前尚未配置语音节点。</div>');
        return;
    }

    list.forEach((item, index) => {
        const row = $(
            `<div style="display:flex;gap:5px;margin-bottom:5px;align-items:center;">
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="appid" placeholder="appid" style="flex:1;" />
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="token" placeholder="token" style="flex:1;" />
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="voiceId" placeholder="voiceId" style="flex:1;" />
                <div class="menu_button zwb-delete-tts-btn" data-tts-index="${index}" style="margin:0; min-width:auto; padding:8px;">删</div>
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
        if ($(this).attr("type") === "number") value = Number(value || 0);
        设置键路径(result, keyPath, value);
    });

    result.tts = result.tts || {};
    result.tts.credentials = [];
    $("#zwb_tts_credentials_editor > div").each(function () {
        const appid = String($(this).find('[data-tts-key="appid"]').val() || "").trim();
        const token = String($(this).find('[data-tts-key="token"]').val() || "").trim();
        const voiceId = String($(this).find('[data-tts-key="voiceId"]').val() || "").trim();
        if (appid || token || voiceId) result.tts.credentials.push({ appid, token, voiceId });
    });

    return result;
}

function 渲染运行配置表单() {
    if (!当前运行配置) return;
    const container = $("#zwb_runtime_form");
    container.empty();

    container.append(创建基础输入块("留给自己的打字时间，最多几秒没有新消息再发送给他", "wait_time_seconds", 毫秒转秒输入值(当前运行配置.wait_time_ms, 7), "number"));
    container.append(创建基础输入块("你多久没收到消息后，才允许他主动联系你（秒）", "idle_limit_seconds", 毫秒转秒输入值(当前运行配置.idle_limit_ms, 1800), "number"));
    container.append(创建小时选择块("睡眠守护：他几点开始可以主动发消息（24 时制）", "wake_window.start_hour", 解析键路径(当前运行配置, ["wake_window", "start_hour"], 9)));
    container.append(创建小时选择块("睡眠守护：他几点之后不再主动发消息（24 时制）", "wake_window.end_hour", 解析键路径(当前运行配置, ["wake_window", "end_hour"], 3)));
    container.append(创建文本域块("那些你一用他就响起警报的应用（每行一个）", "sensor.urgent_apps", (解析键路径(当前运行配置, ["sensor", "urgent_apps"], []) || []).join("\n"), "例如：爱发电"));

    const buttons = $('<div class="zwb-form-item-full zwb-panel-actions"><div id="zwb_save_runtime_config_btn" class="menu_button">保存运行策略</div><div id="zwb_reload_runtime_config_btn" class="menu_button">重新读取</div></div>');
    container.append(buttons);
}

function 读取运行配置表单() {
    const result = structuredClone(当前运行配置 || {});
    const waitSeconds = Number($("#zwb_runtime_form [data-key='wait_time_seconds']").val() || 0);
    const idleSeconds = Number($("#zwb_runtime_form [data-key='idle_limit_seconds']").val() || 0);
    const startHour = Number($("#zwb_runtime_form [data-key='wake_window.start_hour']").val() || 0);
    const endHour = Number($("#zwb_runtime_form [data-key='wake_window.end_hour']").val() || 0);
    const urgentApps = String($("#zwb_runtime_form [data-key='sensor.urgent_apps']").val() || "")
        .split("\n")
        .map(v => v.trim())
        .filter(Boolean);

    result.wait_time_ms = Math.max(0, waitSeconds) * 1000;
    result.idle_limit_ms = Math.max(0, idleSeconds) * 1000;
    result.wake_window = result.wake_window || {};
    result.wake_window.start_hour = Math.min(24, Math.max(0, startHour));
    result.wake_window.end_hour = Math.min(24, Math.max(0, endHour));
    result.sensor = result.sensor || {};
    result.sensor.urgent_apps = urgentApps;
    return result;
}

function 获取酒馆上下文() {
    if (typeof getContext === "function") return getContext();
    if (typeof window.getContext === "function") return window.getContext();
    if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") return window.SillyTavern.getContext();
    if (typeof globalThis.getContext === "function") return globalThis.getContext();
    return null;
}

function 获取稳定接口(fnName) {
    if (typeof window !== 'undefined' && typeof window[fnName] === "function") return window[fnName];
    if (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern[fnName] === "function") return window.SillyTavern[fnName];
    if (typeof window !== 'undefined' && window.TavernHelper && typeof window.TavernHelper[fnName] === "function") return window.TavernHelper[fnName];
    return null;
}

function 获取当前聊天消息列表() {
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

async function 读取世界书名称列表() {
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
    const container = $("#zwb_worldbook_names_container");
    
    if (!names.length) {
        container.html('<div style="padding:10px; color:#888; font-size:13px;">未检测到可用世界书。</div>');
        $("#zwb_worldbook_entries_wrapper").html('<div style="padding:10px; color:#888; font-size:13px;">无内容。</div>');
        return;
    }

    let htmlStr = "";
    names.forEach(name => {
        htmlStr += `
            <label style="display:inline-flex; align-items:center; gap:6px; margin:0 12px 8px 0; cursor:pointer; font-size:13px; color:#ddd;">
                <input type="checkbox" class="zwb-wb-name-checkbox" value="${name}" style="margin:0; padding:0; flex-shrink:0;">
                <span style="color:#7aa2ff; font-weight:bold; white-space:nowrap;">[书]</span> 
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${name}</span>
            </label>`;
    });
    container.html(htmlStr);
    $("#zwb_worldbook_entries_wrapper").html('<div style="padding:10px; color:#888; font-size:13px;">请先在上方勾选世界书。</div>');
}

async function 刷新多个世界书条目显示(worldbookNames) {
    const wrapper = $("#zwb_worldbook_entries_wrapper");

    if (!worldbookNames || worldbookNames.length === 0) {
        wrapper.html('<div style="padding:10px; color:#888; font-size:13px;">请先在上方勾选世界书。</div>');
        return;
    }

    wrapper.html('<div style="padding:10px; color:#888; font-size:13px;">正在读取所选世界书条目...</div>');
    
    let allEntries = [];
    for (const name of worldbookNames) {
        const entries = await 读取世界书条目(name);
        entries.forEach(e => e._sourceWB = name); 
        allEntries = allEntries.concat(entries);
    }

    if (!allEntries.length) {
        wrapper.html('<div style="padding:10px; color:#888; font-size:13px;">所选的世界书中没有任何条目。</div>');
        return;
    }

    let cbHtml = '<div style="max-height:220px; overflow-y:auto; padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:6px; background:rgba(0,0,0,0.2); display:flex; flex-direction:column; gap:8px;">';
    allEntries.forEach((entry, index) => {
        const keys = Array.isArray(entry.key) ? entry.key.join('、') : (entry.key || '');
        const title = entry.comment || entry.name || keys || '无名条目';
        
                cbHtml += `
            <label style="display:flex; align-items:flex-start; gap:8px; margin-bottom:4px; cursor:pointer; font-size:13px; color:#ddd; width:100%;">
                <input type="checkbox" class="zwb-wb-entry-checkbox" data-index="${index}" style="margin:0; padding:0; flex-shrink:0; margin-top:3px;">
                <div style="flex:1; min-width:0; word-break:break-word; white-space:normal; line-height:1.4;">
                    <span style="color:#4CAF50; font-weight:bold; white-space:nowrap;">[${entry._sourceWB}]</span>
                    <span>${title}</span>
                    <div style="font-size:11px; color:#aaa; margin-top:2px;">关键词: ${keys || '无'}</div>
                </div>
            </label>
        `;
    });
    cbHtml += '</div>';

    wrapper.html(cbHtml);
    
    const previewArea = $('<textarea class="text_pole zwb-json-textarea" style="margin-top:10px; width:100%; height:120px; display:none; box-sizing:border-box;" readonly></textarea>');
    const actionBtn = $('<div class="menu_button full-width" style="display:none; margin-top:10px; background:#5e5c8a; color:white; justify-content:center;">追加勾选设定到 MEMORY.md</div>');

    wrapper.append(previewArea).append(actionBtn);

    wrapper.off('change', '.zwb-wb-entry-checkbox').on('change', '.zwb-wb-entry-checkbox', function() {
        const selectedIndexes = [];
        wrapper.find('.zwb-wb-entry-checkbox:checked').each(function() {
            selectedIndexes.push(Number($(this).data('index')));
        });

        if (selectedIndexes.length > 0) {
            const previewText = selectedIndexes.map(idx => 格式化世界书条目(allEntries[idx])).join("\n\n");
            previewArea.val(previewText).show();
            actionBtn.show().data('selected-entries', selectedIndexes.map(idx => allEntries[idx]));
        } else {
            previewArea.hide();
            actionBtn.hide();
        }
    });

    actionBtn.off('click').on('click', function() {
        const entries = $(this).data('selected-entries') || [];
        if (!entries.length) return;
        const currentText = String($("#zwb_memory_markdown_editor").val() || "").trim();
        const newTexts = entries.map(e => 格式化世界书条目(e));
        $("#zwb_memory_markdown_editor").val([currentText, ...newTexts].filter(Boolean).join("\n\n"));
        toastr.success(`已追加 ${entries.length} 个条目到 MEMORY.md 编辑区！`);
    });
}

function 提取当前角色信息() {
    const fnSub = 获取稳定接口("substituteParams");
    if (fnSub) {
        return {
            name: fnSub('{{char}}') || "未命名角色",
            description: fnSub('{{description}}') || "",
            personality: fnSub('{{personality}}') || "",
            scenario: fnSub('{{scenario}}') || "",
            mes_example: fnSub('{{mesExamples}}') || "",
            first_mes: fnSub('{{firstMessage}}') || "",
        };
    }
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
    if (typeof substituteParams === "function") {
        return {
            name: substituteParams('{{user}}') || "User",
            description: substituteParams('{{persona}}') || "",
        };
    }

    const context = 获取酒馆上下文();
    if (!context) return null;

    const persona = context.persona || context.user || context.userPersona || {};
    const candidateParts = [
        context.persona_description,
        context.user_description,
        context.description,
        context.chatMetadata?.persona,
        context.chatMetadata?.persona_description,
        persona.description,
        persona.persona_description,
        persona.note,
        persona.content,
        persona.text,
    ].filter(Boolean);

    return {
        name: context.name1 || context.user_name || persona.name || persona.persona_name || "User",
        description: candidateParts.join("\n\n").trim(),
    };
}

// 🌟 核心清理：不再硬编码注入真名，永远生成占位符
function 合并Soul草稿与现有尾段(newText, currentSoulText) {
    const marker = "# 动态视觉反馈系统";
    const normalizedCurrent = String(currentSoulText || "");
    const markerIndex = normalizedCurrent.indexOf(marker);
    if (markerIndex === -1) return newText;
    const tail = normalizedCurrent.slice(markerIndex).trim();
    const head = String(newText || "").split(marker)[0].trim();
    return [head, tail].filter(Boolean).join("\n\n");
}

function 生成Identity候选文本(role) {
    if (!role) return "未能从当前酒馆上下文读取角色信息。";
    return `# IDENTITY.md - 自动生成候选\n\n- **Name:** {{char}}\n- **Creature:** 待补充\n- **Vibe:** 待补充\n\n---\n\n## Core Identity\n${role.description || ""}\n\n## Personality Notes\n${role.personality || ""}`.trim();
}

function 生成Soul候选文本(role) {
    if (!role) return "未能从当前酒馆上下文读取角色信息。";
    return `# SOUL.md - 自动生成候选\n\n- **Name:** {{char}}\n\n---\n\n## 角色设定\n${role.description || ""}\n\n## 性格倾向\n${role.personality || ""}\n\n## 场景设定\n${role.scenario || ""}\n\n## 首条消息参考\n${role.first_mes || ""}\n\n## 示例对话参考\n${role.mes_example || ""}`.trim();
}

function 生成User候选文本(userInfo) {
    if (!userInfo) return "未能从当前酒馆上下文读取 User 描述。";
    return `# USER.md - 自动生成候选\n\n- **Name:** {{user}}\n\n---\n\n## 你的基础设定\n${userInfo.description || ""}\n\n## 他的参考备注\n这里可以补充你的习惯、边界、称呼偏好、作息、雷点等。`.trim();
}

function 格式化单条消息(item, index) {
    let role = "NPC";
    if (item.is_system) role = "System";
    else if (item.is_user) role = "User";

    let d = new Date(item.send_date || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    
    return `# ${index}\n${dateStr}\n${timeStr}\n${item.name || "未命名"} (${role})：\n${item.mes || item.raw || ""}`;
}

function 友好化Jsonl内容(payload) {
    const metadataText = JSON.stringify(payload?.metadata || {}, null, 2);
    const itemTexts = (payload?.items || []).map((item, index) => 格式化单条消息(item, index + 1));
    return [`#METADATA\n${metadataText}`, `#MESSAGES`, ...itemTexts].join("\n\n");
}

function 解析友好Jsonl文本(text) {
    const source = String(text || "");
    const metadataMatch = source.match(/#METADATA\s+([\s\S]*?)\s+#MESSAGES/);
    let metadata = {};
    if (metadataMatch) {
        try { metadata = JSON.parse(metadataMatch[1].trim() || "{}"); } catch(e) {}
    }

    const messagesText = source.includes('#MESSAGES') ? source.split('#MESSAGES')[1] : source;
    const blocks = messagesText.split(/\n?(?:^# \d+\r?\n)/m).filter(b => b.trim());
    
    const items = blocks.map(block => {
        const lines = block.trim().split('\n');
        let send_date = new Date().toISOString();
        let name = "未命名", is_user = false, is_system = false, mesLines = [];

        if (lines.length >= 4) {
            const dateStr = lines[0].trim(), timeStr = lines[1].trim();
            try { send_date = new Date(`${dateStr}T${timeStr}:00`).toISOString(); } catch(e) {}
            
            const roleMatch = lines[2].trim().match(/(.*?)\s*\((NPC|User|System)\)[\:：]?$/);
            if (roleMatch) {
                name = roleMatch[1].trim();
                if (roleMatch[2] === 'User') is_user = true;
                if (roleMatch[2] === 'System') is_system = true;
            } else {
                name = lines[2].replace(/[\:：]$/, '').trim();
            }
            mesLines = lines.slice(3);
        } else {
            mesLines = lines;
        }
        return { name, is_user, is_system, send_date, mes: mesLines.join('\n').trim() };
    });

    return { metadata, items };
}

// 日记保存解析
function 解析Summary文本(text) {
    const blocks = String(text || "").split(/【(.*?)】\n/).filter(Boolean);
    const items = [];
    for (let i = 0; i < blocks.length; i += 2) {
        const send_date = blocks[i].trim();
        const contentBlock = blocks[i+1] || "";
        const lines = contentBlock.trim().split('\n');
        const nameLine = lines[0] || "";
        const nameMatch = nameLine.match(/^(.*?)：/);
        let name = "未命名";
        let mes = contentBlock;
        if (nameMatch) {
            name = nameMatch[1].trim();
            mes = contentBlock.substring(nameMatch[0].length).trim();
        }
        items.push({
            send_date: send_date,
            name: name,
            is_user: name === "你" || name === "用户",
            is_system: false,
            mes: mes
        });
    }
    return { metadata: {}, items: items };
}

async function 检测连接状态() {
    try {
        const result = await 请求接口("/health");
        $("#zwb_modal_runtime").text(`当前状态：${result.message || "连接正常"}`);
    } catch (e) {
        $("#zwb_modal_runtime").text(`当前状态：检测失败 - ${e.message}`);
    }
}

async function 刷新总览信息() {
    try {
        const result = await 请求接口("/overview");
        $("#zwb_mode_badge").text(result.mode_label || "未配置");
        $("#zwb_active_memory").text(result.active_memory || "未设置");
        $("#zwb_overview_status").text(result.summary || "暂无状态信息");
    } catch (e) {}
}

async function 读取基础配置() {
    try {
        const result = await 请求接口("/config/main/read");
        当前主配置 = result.data || {};
        渲染主配置表单();
    } catch (e) {}
}

async function 读取运行配置() {
    try {
        const result = await 请求接口("/config/runtime/read");
        当前运行配置 = result.data || {};
        渲染运行配置表单();
    } catch (e) {}
}

async function 读取角色相关内容() {
    try {
        const [identityResult, soulResult, userResult] = await Promise.all([
            请求接口("/workspace/read", { body: { file_key: "identity" } }),
            请求接口("/workspace/read", { body: { file_key: "soul" } }),
            请求接口("/workspace/read", { body: { file_key: "user" } }),
        ]);

        $("#zwb_character_current").val(`【当前 IDENTITY.md】\n${identityResult.data || ""}\n\n【当前 SOUL.md】\n${soulResult.data || ""}`);
        $("#zwb_user_current").val(userResult.data || "");

        const role = 提取当前角色信息();
        const userInfo = 提取当前User信息();
        
        // 🌟 已删除原有的硬编码读取真名逻辑
        $("#zwb_character_preview_editor").val(生成Identity候选文本(role));
        $("#zwb_user_preview_editor").val(生成User候选文本(userInfo));
    } catch (e) {}
}

function 渲染记忆列表(data) {
    当前记忆列表 = data || { full_logs: [], summary_logs: [] };

    const memoryContainer = $("#zwb_memory_list").empty();
    if (!当前记忆列表.full_logs.length) {
        memoryContainer.text("暂无 full log 文件。");
    } else {
        const actions = $('<div class="zwb-memory-btn-group"></div>');
        当前记忆列表.full_logs.forEach(item => {
            const activeClass = item.is_active ? 'active-memory' : '';
            const activeText = item.is_active ? '[已启用] ' : '';
            actions.append(`<div class="menu_button zwb-memory-open-btn ${activeClass}" data-file-name="${item.name}">${activeText}${item.name}</div>`);
        });
        memoryContainer.append(actions);
    }

    const summaryContainer = $("#zwb_summary_list").empty();
    if (!当前记忆列表.summary_logs.length) {
        summaryContainer.text("暂无 Summary 文件。");
    } else {
        const actions = $('<div class="zwb-memory-btn-group"></div>');
        当前记忆列表.summary_logs.forEach(item => {
            actions.append(`<div class="menu_button zwb-summary-open-btn" data-file-name="${item.name}">${item.name}</div>`);
        });
        summaryContainer.append(actions);
    }
}

async function 读取记忆列表() {
    try {
        const result = await 请求接口("/memory/list");
        渲染记忆列表(result.data || {});
    } catch (e) {}
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
    const previewLines = (payload.items || []).map(item => `【${item.send_date || '无时间'}】\n${item.name || (item.is_user ? '你' : '他')}：${item.mes || item.raw || ''}`);
    $("#zwb_summary_file_input").val(fileName);
    $("#zwb_summary_preview_editor").val(previewLines.join("\n\n"));
}

function 刷新酒馆聊天显示() {
    const editor = $("#zwb_st_chat_preview_editor");
    if (!editor.length) return;
    const messages = 获取当前聊天消息列表();
    if (!messages || messages.length === 0) {
        editor.val("当前酒馆聊天记录为空，或未选中任何对话。");
        return;
    }
    const items = (messages || []).map(m => ({
        name: m.name || (m.is_user ? "用户" : "角色"),
        is_user: Boolean(m.is_user || m.role === "user"),
        is_system: Boolean(m.is_system || m.role === "system"),
        send_date: m.send_date || new Date().toISOString(),
        mes: m.message || m.mes || m.raw || ""
    })).filter(i => i.mes);
    editor.val(items.map((item, index) => 格式化单条消息(item, index + 1)).join("\n\n"));
}

function 渲染传感映射编辑器() {
    const container = $("#zwb_sensor_map_editor").empty();
    const entries = Object.entries(当前传感映射 || {});
    
    if (!entries.length) {
        container.append('<div style="display:flex;gap:5px;margin-bottom:5px;"><input class="text_pole" data-sensor-key="name" type="text" placeholder="APP 名称" style="flex:1;" /><textarea class="text_pole zwb-json-textarea" data-sensor-key="prompt" placeholder="附加解释" style="flex:2;min-height:40px;"></textarea></div>');
        return;
    }

    entries.forEach(([appName, prompt]) => {
        const row = $(
            `<div style="display:flex;gap:5px;margin-bottom:5px;align-items:flex-start;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;">
                <input class="text_pole" data-sensor-key="name" type="text" placeholder="APP" style="flex:1;" />
                <textarea class="text_pole zwb-json-textarea" data-sensor-key="prompt" placeholder="附加解释" style="flex:2;min-height:40px;"></textarea>
                <div class="menu_button zwb-delete-sensor-row-btn" style="margin:0;padding:6px;display:flex;align-items:center;justify-content:center;">删</div>
            </div>`
        );
        row.find('[data-sensor-key="name"]').val(appName);
        row.find('[data-sensor-key="prompt"]').val(prompt || "");
        container.append(row);
    });
}

function 收集传感映射表单() {
    const result = {};
    $("#zwb_sensor_map_editor > div").each(function () {
        const appName = String($(this).find('[data-sensor-key="name"]').val() || "").trim();
        const prompt = String($(this).find('[data-sensor-key="prompt"]').val() || "").trim();
        if (appName && prompt) result[appName] = prompt;
    });
    return result;
}

async function 读取传感映射() {
    try {
        const result = await 请求接口("/sensor/map/read");
        当前传感映射 = result.data || {};
        渲染传感映射编辑器();
    } catch (e) {}
}

async function 刷新备份列表() {
    try {
        const result = await 请求接口("/backup/list");
        当前备份列表 = result.items || [];
        const lines = 当前备份列表.map(item => `- ${item.name} (${item.created_at})`);
        $("#zwb_backup_list").text(lines.length ? lines.join("\n") : "暂无备份。");

        const select = $("#zwb_backup_restore_select").empty();
        if (!当前备份列表.length) {
            select.append('<option value="">无可用备份</option>');
            return;
        }
        当前备份列表.forEach(item => select.append(`<option value="${item.name}">${item.name}</option>`));
    } catch (e) {}
}

async function 加载全部核心数据() {
    await Promise.all([
        检测连接状态(), 刷新总览信息(), 读取基础配置(), 读取运行配置(), 
        读取角色相关内容(), 读取传感映射(), 刷新备份列表()
    ].map(p => p.catch(e => console.warn(e))));

    await 读取记忆列表().catch(e => {});
    if (当前记忆列表?.full_logs?.length) {
        await 打开记忆文件(当前记忆列表.full_logs[0].name).catch(e => {});
    }
    if (当前记忆列表?.summary_logs?.length) {
        await 打开Summary文件(当前记忆列表.summary_logs[0].name).catch(e => {});
    }

    await 刷新MEMORYMarkdown与世界书().catch(e => {});
    刷新酒馆聊天显示();
}

function 配置提示层() {
    if (!window.toastr) return;
    toastr.options = { newestOnTop: true, timeOut: 2000, positionClass: "toast-top-center" };
}

function 绑定按钮事件() {
    $("body").on("click", "#zwb_open_modal_btn", async (e) => {
        e.preventDefault();
        $("#zwb_modal_container").show();
        try {
            await 加载全部核心数据();
            toastr.success("桥接中心加载完毕");
        } catch (error) {
            toastr.error(`加载异常：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_modal_close", () => $("#zwb_modal_container").hide());
    
    $("body").on("click", ".zwb-tab-btn", function () {
        $(".zwb-tab-btn, .zwb-tab-content").removeClass("active");
        $(this).addClass("active");
        $(`#${$(this).data("tab")}`).addClass("active");
    });

    // === 配置相关 ===
    $("body").on("click", "#zwb_ping_btn", async () => {
        await 检测连接状态(); toastr.success("检测完成");
    });

    $("body").on("click", "#zwb_add_tts_cred_btn", () => {
        当前主配置 = 当前主配置 || {}; 当前主配置.tts = 当前主配置.tts || {};
        当前主配置.tts.credentials = Array.isArray(当前主配置.tts.credentials) ? 当前主配置.tts.credentials : [];
        if (当前主配置.tts.credentials.length >= 10) return toastr.warning("最多10个节点");
        当前主配置.tts.credentials.push({ appid: "", token: "", voiceId: "" });
        渲染语音节点编辑器();
    });

    // === 生图引擎单选框联动事件 ===
    $("body").on("change", 'input[name="zwb_ig_mode_radio"]', function () {
        const mode = $(this).val();
        $("#zwb_ig_mode_hidden").val(mode);

        const $select = $("#zwb_ig_model_select");
        const currentModel = $select.data("initial") || $select.val();
        $select.empty();
        igModelDict[mode].forEach(m => {
            const isSelected = (m.value === currentModel) ? "selected" : "";
            $select.append(`<option value="${m.value}" ${isSelected}>${m.text}</option>`);
        });
        $select.data("initial", "");

        if (mode === 'api') {
            $("#zwb_ig_url_block, #zwb_ig_key_block").show();
            $("#zwb_ig_luma_auth").hide();
            $("#zwb_ig_url_label").text("API URL:");
        } else if (mode === 'bridge') {
            $("#zwb_ig_url_block, #zwb_ig_key_block, #zwb_ig_luma_auth").hide();
        } else if (mode === 'luma') {
            $("#zwb_ig_url_block, #zwb_ig_luma_auth").show();
            $("#zwb_ig_key_block").hide(); 
            $("#zwb_ig_url_label").text("Luma 反代地址 (端口通常为 8188):");
            if (!$("#zwb_ig_url").val()) $("#zwb_ig_url").val("http://127.0.0.1:8188/v1/chat/completions");
        }
    });

    // === 🌟 核心升级：清扫所有关联旧名字，保护图鉴链接 ===
    $("body").on("click", "#zwb_migrate_data_btn", async () => {
        const oldChar = prompt("【第一步】请输入文件中被写死的【旧】角色名（用于查找，如：小白）：");
        if (!oldChar) return;
        const oldUser = prompt("请输入文件中被写死的【旧】用户名（用于查找，如：用户）：");
        if (!oldUser) return;
        
        const newChar = prompt(`【第二步】请输入期望生效的【新】角色名（如不改名请重复输入 ${oldChar}）：`, oldChar);
        if (!newChar) return;
        const newUser = prompt(`请输入期望生效的【新】用户名（如不改名请重复输入 ${oldUser}）：`, oldUser);
        if (!newUser) return;

        if (!confirm(`即将执行预设和对话记录清理：\n1. 净化预设文件，将 ${oldChar} 替换为 {{char}}\n2. 对 SOUL.md 进行外科手术，保护图鉴链接\n3. 对话记录仅清理人名，绝不破坏语义\n\n建议先执行备份，确认开始吗？`)) return;

        try {
            // 🛡️ 1. 净化 IDENTITY 和 USER
            toastr.info("正在清理 IDENTITY 和 USER...");
            for (const key of ["identity", "user"]) {
                let res = await 请求接口("/workspace/read", { body: { file_key: key } });
                if (!res.data) continue;
                let text = res.data.split(oldChar).join("{{char}}").split(oldUser).join("{{user}}");
                await 请求接口("/workspace/save", { body: { file_key: key, data: text } });
            }

            // 🛡️ 2. 净化 SOUL.md 并引入【行级链接保护机制】
            toastr.info("正在清理 SOUL.md...");
            let soulRes = await 请求接口("/workspace/read", { body: { file_key: "soul" } });
            if (soulRes.data) {
                const marker = "# 动态视觉反馈系统";
                const parts = soulRes.data.split(marker);
                
                // 上半部分无脑替换
                let upper = parts[0].split(oldChar).join("{{char}}").split(oldUser).join("{{user}}");
                let finalSoul = upper;
                
                // 下半部分逐行透析
                if (parts.length > 1) {
                    const lowerLines = parts[1].split('\n').map(line => {
                        // 遇到含 http 的行，视作图鉴图片链接，原样放行，绝对不碰！
                        if (line.includes('http')) return line;
                        // 普通文本行（比如“某某是一个会发表情包的人”），执行替换
                        return line.split(oldChar).join("{{char}}").split(oldUser).join("{{user}}");
                    });
                    finalSoul += marker + lowerLines.join('\n');
                }
                
                await 请求接口("/workspace/save", { body: { file_key: "soul", data: finalSoul } });
            }

            // 🛡️ 3. 洗刷历史记忆 (JSONL)
            toastr.info("正在洗刷记忆数据库...");
            const listRes = await 请求接口("/memory/list");
            const allMemories = [...(listRes.data?.full_logs || []), ...(listRes.data?.summary_logs || [])];
            
            for (const file of allMemories) {
                const readRes = await 请求接口("/memory/read", { body: { file_name: file.name } });
                const payload = readRes.data?.content;
                if (!payload) continue;

                if (payload.metadata) {
                    if (payload.metadata.character_name === oldChar) payload.metadata.character_name = newChar;
                    if (payload.metadata.user_name === oldUser) payload.metadata.user_name = newUser;
                }
                
                for (const item of (payload.items || [])) {
                    if (item.name === oldChar) item.name = newChar;
                    if (item.name === oldUser) item.name = newUser;
                }
                
                await 请求接口("/memory/save", { body: { file_name: file.name, metadata: payload.metadata, items: payload.items } });
            }

            // 🛡️ 4. 将真名写入主配置
            toastr.info("正在写入新名字配置...");
            let cfgRes = await 请求接口("/config/main/read");
            let cfg = cfgRes.data || {};
            cfg.profile = cfg.profile || {};
            cfg.profile.char_name = newChar;
            cfg.profile.user_name = newUser;
            await 请求接口("/workspace/save", { body: { file_key: "config", format: "json", data: cfg } });

            toastr.success("🎉 预设与对话记录名字整理完美结束！");
            await 读取基础配置(); 
            await 读取角色相关内容();
            await 读取记忆列表();
        } catch (error) {
            toastr.error(`洗盘失败：${error.message}`);
        }
    });

    $("body").on("click", ".zwb-delete-tts-btn", function () {
        当前主配置.tts.credentials.splice(Number($(this).data("tts-index")), 1);
        渲染语音节点编辑器();
    });

    $("body").on("click", "#zwb_save_main_config_btn", async () => {
        当前主配置 = 读取主配置表单();
        await 请求接口("/workspace/save", { body: { file_key: "config", format: "json", data: 当前主配置 } });
        toastr.success("保存成功");
    });

    $("body").on("click", "#zwb_reload_main_config_btn", async () => {
        await 读取基础配置(); toastr.success("重新读取成功");
    });

    $("body").on("click", "#zwb_save_runtime_config_btn", async () => {
        当前运行配置 = 读取运行配置表单();
        await 请求接口("/workspace/save", { body: { file_key: "runtime", format: "json", data: 当前运行配置 } });
        toastr.success("策略已保存");
    });

    $("body").on("click", "#zwb_reload_runtime_config_btn", async () => {
        await 读取运行配置(); toastr.success("重新读取成功");
    });

    // === 角色与 User (全面拥抱占位符) ===
    $("body").on("click", "#zwb_generate_identity_btn", () => {
        $("#zwb_character_target_select").val("identity");
        $("#zwb_character_preview_editor").val(生成Identity候选文本(提取当前角色信息()));
        toastr.success("已生成 IDENTITY 文本");
    });

    $("body").on("click", "#zwb_generate_soul_btn", () => {
        $("#zwb_character_target_select").val("soul");
        $("#zwb_character_preview_editor").val(生成Soul候选文本(提取当前角色信息()));
        toastr.success("已生成 SOUL 文本");
    });

    $("body").on("click", "#zwb_save_character_btn", async () => {
        const fileKey = $("#zwb_character_target_select").val();
        let content = $("#zwb_character_preview_editor").val();
        if (fileKey === "soul") {
            const currentSoul = String($("#zwb_character_current").val().split("【当前 SOUL.md】\n")[1] || "");
            content = 合并Soul草稿与现有尾段(content, currentSoul);
        }
        await 请求接口("/workspace/save", { body: { file_key: fileKey, data: content } });
        await 读取角色相关内容();
        toastr.success(`已保存 ${fileKey.toUpperCase()}.md`);
    });

    $("body").on("click", "#zwb_generate_user_btn", () => {
        $("#zwb_user_preview_editor").val(生成User候选文本(提取当前User信息()));
        toastr.success("已提取 User 文本");
    });

    $("body").on("click", "#zwb_save_user_btn", async () => {
        const content = $("#zwb_user_preview_editor").val();
        await 请求接口("/workspace/save", { body: { file_key: "user", data: content } });
        await 读取角色相关内容(); toastr.success("已保存 USER.md");
    });

    // === 记忆与聊天双向 ===
    $("body").on("click", ".zwb-memory-open-btn", async function () {
        await 打开记忆文件($(this).data("file-name")); toastr.success("文件已读取");
    });

    $("body").on("click", ".zwb-summary-open-btn", async function () {
        await 打开Summary文件($(this).data("file-name")); toastr.success("日记已读取");
    });

    $("body").on("click", "#zwb_save_summary_btn", async () => {
        try {
            const fileName = String($("#zwb_summary_file_input").val() || "").trim();
            if (!fileName) return toastr.warning("请先选择要保存的日记文件");
            const parsed = 解析Summary文本($("#zwb_summary_preview_editor").val());
            await 请求接口("/memory/save", { body: { file_name: fileName, metadata: parsed.metadata, items: parsed.items } });
            toastr.success("日记修改已保存");
        } catch (error) {
            toastr.error(`保存失败：${error.message}`);
        }
    });

    $("body").on("click", "#zwb_reload_memory_btn", async () => {
        await 读取记忆列表(); await 刷新MEMORYMarkdown与世界书(); toastr.success("列表已刷新");
    });

    $("body").on("click", "#zwb_activate_memory_btn", async () => {
        const fn = String($("#zwb_memory_file_input").val() || "").trim();
        if (!fn) return toastr.warning("请选择文件");
        await 请求接口("/memory/activate", { body: { file_name: fn } });
        await 读取记忆列表(); await 刷新总览信息(); toastr.success("已设为生效记忆");
    });

    $("body").on("click", "#zwb_refresh_st_chat_btn", () => {
        刷新酒馆聊天显示(); toastr.success("下区已抓取最新聊天");
    });

    $("body").on("click", "#zwb_import_st_to_wechat_btn", async () => {
        const parsed = 解析友好Jsonl文本($("#zwb_st_chat_preview_editor").val());
        if (!parsed.items.length) return toastr.warning("下区没有可识别的消息格式");

        let defaultName = `ST_Import_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jsonl`;
        let fn = prompt("即将使用下区酒馆记录创建新微信文件\n请输入新文件名 (回车默认使用时间戳)：", defaultName);
        if (fn === null) return;
        fn = fn.trim() || defaultName;
        if (!fn.endsWith(".jsonl")) fn += ".jsonl";

        const meta = 当前记忆文件数据?.metadata || {};
        meta.imported_from = "sillytavern_current_chat";
        meta.imported_at = new Date().toISOString();
        meta.source_chat_id = 获取酒馆上下文()?.chatId || window.SillyTavern?.chatId || "unknown";
        
        await 请求接口("/memory/save", { body: { file_name: fn, metadata: meta, items: parsed.items } });
        await 打开记忆文件(fn); await 读取记忆列表();
        toastr.success(`成功创建并写入新微信文件：${fn}`);
    });

    $("body").on("click", "#zwb_import_wechat_memory_to_st_btn", async () => {
        const parsed = 解析友好Jsonl文本($("#zwb_memory_preview_editor").val());
        if (!parsed.items.length) return toastr.warning("上区没有可识别的消息");
        
        const converted = parsed.items.map(i => ({
            name: i.name, is_user: Boolean(i.is_user), is_system: Boolean(i.is_system),
            role: i.is_system ? "system" : (i.is_user ? "user" : "assistant"),
            message: i.mes
        }));

        if (!confirm(`将创建一个【新的酒馆聊天室】并导入 ${converted.length} 条消息。确认吗？`)) return;

        const newChatStarter = 获取稳定接口("startNewChat") || window.startNewChat;
        if (newChatStarter) {
            try { await newChatStarter(); } catch(e) {}
        } else {
            toastr.warning("未找到新建聊天接口，将强行追加到当前聊天末尾。");
        }

        setTimeout(async () => {
            const creator = 获取稳定接口("createChatMessages");
            if (!creator) return toastr.error("酒馆接口不可用");
            await creator(converted, { insert_before: "end", refresh: "all" });
            刷新酒馆聊天显示(); toastr.success(`成功创建新聊天并灌入消息`);
        }, 600);
    });

    $("body").on("click", "#zwb_save_memory_btn", async () => {
        const fn = String($("#zwb_memory_file_input").val() || "").trim();
        if (!fn) return toastr.warning("请选择文件");
        const parsed = 解析友好Jsonl文本($("#zwb_memory_preview_editor").val());
        await 请求接口("/memory/save", { body: { file_key: "config" /* just placeholder */, file_name: fn, metadata: parsed.metadata, items: parsed.items } });
        toastr.success("上区记忆修改已保存");
    });

    $("body").on("change", ".zwb-wb-name-checkbox", async function () {
        const sel = [];
        $(".zwb-wb-name-checkbox:checked").each(function() { sel.push($(this).val()); });
        await 刷新多个世界书条目显示(sel);
    });

    $("body").on("click", "#zwb_save_memory_markdown_btn", async () => {
        await 请求接口("/workspace/save", { body: { file_key: "memory_markdown", data: $("#zwb_memory_markdown_editor").val() } });
        toastr.success("MEMORY 设定已保存");
    });

    // === Sensor ===
    $("body").on("click", "#zwb_add_sensor_row_btn", () => {
        $("#zwb_sensor_map_editor").append('<div style="display:flex;gap:5px;margin-bottom:5px;align-items:flex-start;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;"><input class="text_pole" data-sensor-key="name" type="text" placeholder="APP" style="flex:1;" /><textarea class="text_pole zwb-json-textarea" data-sensor-key="prompt" placeholder="附加解释" style="flex:2;min-height:40px;"></textarea><div class="menu_button zwb-delete-sensor-row-btn" style="margin:0;padding:6px;display:flex;align-items:center;justify-content:center;">删</div></div>');
    });
    $("body").on("click", ".zwb-delete-sensor-row-btn", function () { $(this).parent().remove(); });
    $("body").on("click", "#zwb_save_sensor_map_btn", async () => {
        await 请求接口("/sensor/map/save", { body: { data: 收集传感映射表单() } }); toastr.success("保存成功");
    });
    $("body").on("click", "#zwb_reload_sensor_map_btn", async () => {
        await 读取传感映射(); toastr.success("读取成功");
    });

    // === 备份 ===
    $("body").on("click", "#zwb_backup_now_btn", async () => {
        const r = await 请求接口("/backup/create"); toastr.success(r.message || "备份已创建"); await 刷新备份列表();
    });
    $("body").on("click", "#zwb_refresh_backup_btn", async () => { await 刷新备份列表(); toastr.success("列表已刷新"); });
    $("body").on("click", "#zwb_restore_backup_btn", async () => {
        const bn = String($("#zwb_backup_restore_select").val() || "").trim();
        if (!bn) return toastr.warning("请选择备份");
        if(confirm(`⚠️ 警告：这将会覆盖当前工作区！\n你确定要恢复备份 ${bn} 吗？`)) {
            const r = await 请求接口("/backup/restore", { body: { backup_name: bn } });
            toastr.success(r.message || "恢复成功"); await 刷新备份列表(); await 刷新总览信息();
        }
    });
}

async function 初始化界面() {
    const panelHtml = await $.get(`${extensionFolderPath}/templates/panel.html`);
    const modalHtml = await $.get(`${extensionFolderPath}/templates/modal.html`);
    if (!$("#zwb_open_modal_btn").length) $("#extensions_settings").append(panelHtml);
    $("#zwb_modal_container").remove();
    $("body").append(modalHtml);
    渲染设置到界面();
    绑定设置事件();
    绑定按钮事件();
}

jQuery(async () => {
    try {
        配置提示层();
        获取设置();
        await 初始化界面();
    } catch (error) {
        console.error("微信 Bot 桥接中心初始化失败:", error);
    }
});
