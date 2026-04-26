import { extensionFolderPath, 获取设置, 保存设置, 请求接口, defaultSettings } from "./api.js";
import { 解析键路径, 设置键路径, 毫秒转秒输入值, 友好化Jsonl内容, 解析友好Jsonl文本, 解析Summary文本, 合并Soul草稿与现有尾段, 格式化单条消息, 格式化Summary条目 } from "./utils.js";
import { 获取酒馆上下文, 获取稳定接口, 获取当前聊天消息列表, 读取世界书名称列表, 读取世界书条目, 格式化世界书条目, 提取当前角色信息, 提取当前User信息, 生成Identity候选文本, 生成Soul候选文本, 生成User候选文本 } from "./st_bridge.js";
import { igModelDict, 创建基础输入块, 创建文本域块, 创建小时选择块, 创建生图高阶控制区, 渲染修补控制台 } from "./ui_components.js";
import { 清洗旧名字预设, 对话记录修补 } from "./retrofit.js";

let 当前主配置 = null;
let 当前运行配置 = null;
let 当前记忆列表 = null;
let 当前记忆文件数据 = null;
let 当前Summary文件数据 = null;
let 当前传感映射 = {};
let 当前备份列表 = [];

// 🌟 清理了全部内联 style，改用 css class
function 创建滑块块(label, key, value) {
    return `<div class="zwb-form-item zwb-form-item-full">
        <label class="zwb-slider-label">
            <span>${label}</span>
            <span class="zwb-slider-val zwb-slider-val-tag">${value}</span>
        </label>
        <input type="range" class="zwb-slider" data-key="${key}" min="0" max="10" step="1" value="${value}">
    </div>`;
}

function 渲染主配置表单() {
    if (!当前主配置) return;
    const container = $("#zwb_config_form").empty();
    
    container.append(创建基础输入块("他的名字", "profile.char_name", 解析键路径(当前主配置, ["profile", "char_name"], "")));
    container.append(创建基础输入块("你的名字", "profile.user_name", 解析键路径(当前主配置, ["profile", "user_name"], "")));
    container.append('<div class="zwb-panel-actions"><div id="zwb_migrate_data_btn" class="menu_button">🔥 一键清理预设名字 (转化为占位符)</div></div>');

    const 字段定义 = [
        ["对话 API Base URL", "chat_llm.api_base_url", 解析键路径(当前主配置, ["chat_llm", "api_base_url"], "")],
        ["对话 API Key", "chat_llm.api_key", 解析键路径(当前主配置, ["chat_llm", "api_key"], "")],
        ["对话模型名", "chat_llm.model_name", 解析键路径(当前主配置, ["chat_llm", "model_name"], "")],
        ["向量 API Base URL", "embedding.api_base_url", 解析键路径(当前主配置, ["embedding", "api_base_url"], "")],
        ["向量 API Key", "embedding.api_key", 解析键路径(当前主配置, ["embedding", "api_key"], "")],
        ["向量模型名", "embedding.model_name", 解析键路径(当前主配置, ["embedding", "model_name"], "")],
        ["图片服务地址", "services.image_server_url", 解析键路径(当前主配置, ["services", "image_server_url"], "")],
        ["语音服务地址", "services.voice_server_url", 解析键路径(当前主配置, ["services", "voice_server_url"], "")],
        ["TTS URL", "tts.url", 解析键路径(当前主配置, ["tts", "url"], "")],
        ["语音封面图路径", "voice_generation.cover_image_path", 解析键路径(当前主配置, ["voice_generation", "cover_image_path"], "")],
        ["字体路径", "voice_generation.font_path", 解析键路径(当前主配置, ["voice_generation", "font_path"], "")],
        ["智能家居设备 IP", "miio.ip", 解析键路径(当前主配置, ["miio", "ip"], "")],
        ["智能家居Token", "miio.token", 解析键路径(当前主配置, ["miio", "token"], "")],
    ];

    for (const [label, key, value] of 字段定义) {
        if (key === "embedding.api_base_url") {
            const tabMemoryName = $('.zwb-tab-btn[data-tab="zwb_tab_memory"]').text().trim() || "对话记录";
            const tabSummaryName = $('.zwb-tab-btn[data-tab="zwb_tab_summary"]').text().trim() || "他的日记";
            
            // 提示框样式保持使用类名以符合规范
            container.append(`
                <div class="zwb-form-item-full zwb-vector-notice">
                    <strong class="zwb-vector-notice-title">⚠️ 历史记录向量化说明</strong>
                    <div class="zwb-vector-notice-text">
                        <strong>新用户：</strong>直接填入 API 配置即可，后续记录会自动向量化。<br>
                        <strong>老用户（若开启向量前已有对话记录），请按以下步骤初始化：</strong><br>
                        1. 在上方【${tabMemoryName}】和【${tabSummaryName}】菜单中，运行<strong>“对话记录标签修补”</strong>。<br>
                        2. 在终端运行 <code>node build_index.js</code> 构建初始索引（详见飞书教程）。
                    </div>
                </div>
            `);
        }
        container.append(创建基础输入块(label, key, value));
    }
    
    container.append(创建生图高阶控制区(当前主配置));

    const ttsBlock = $('<div class="zwb-form-item-full zwb-tts-block"></div>');
    ttsBlock.append('<label>语音轮询节点（最多 10 个）</label>');
    ttsBlock.append('<div id="zwb_tts_credentials_editor" class="zwb-tts-editor"></div>');
    ttsBlock.append('<div class="zwb-panel-actions"><div id="zwb_add_tts_cred_btn" class="menu_button">新增节点</div><div id="zwb_save_main_config_btn" class="menu_button zwb-btn-success">保存基础配置</div><div id="zwb_reload_main_config_btn" class="menu_button">重新读取</div></div>');
    
    container.append(ttsBlock);
    渲染语音节点编辑器();
    $('input[name="zwb_ig_mode_radio"]:checked').trigger('change');
}

function 渲染语音节点编辑器() {
    const editor = $("#zwb_tts_credentials_editor").empty();
    const list = Array.isArray(当前主配置?.tts?.credentials) ? 当前主配置.tts.credentials : [];
    if (!list.length) return editor.append('<div class="zwb-empty-state">当前尚未配置语音节点。</div>');

    list.forEach((item, index) => {
        editor.append(
            `<div class="zwb-tts-row">
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="appid" value="${item.appid || ""}" placeholder="appid" />
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="token" value="${item.token || ""}" placeholder="token" />
                <input class="text_pole" type="text" data-tts-index="${index}" data-tts-key="voiceId" value="${item.voiceId || ""}" placeholder="voiceId" />
                <div class="menu_button zwb-delete-tts-btn" data-tts-index="${index}">删</div>
            </div>`
        );
    });
}

function 读取主配置表单() {
    const result = structuredClone(当前主配置 || {});
    $("#zwb_config_form [data-key]").each(function () {
        let value = $(this).val();
        if ($(this).attr("type") === "number") value = Number(value || 0);
        设置键路径(result, $(this).data("key"), value);
    });

    result.tts = result.tts || { credentials: [] };
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
    const container = $("#zwb_runtime_form").empty();
    
    const ctxTitle = $('<div class="zwb-form-item-full zwb-ctx-title-box"><h3 class="zwb-ctx-title">🧠 上下文记忆容量配置</h3><div class="zwb-text-muted zwb-ctx-desc">调整大模型每轮回复时可参考的记忆数量。数量越多，回忆起的细节越丰富；但设置过高可能会导致注意力分散（建议默认值 3）。</div></div>');
    container.append(ctxTitle);
    
    container.append(创建滑块块("近期连续场景数 (动态情景滑动窗口)", "chat_context.recent_scenes", 解析键路径(当前运行配置, ["chat_context", "recent_scenes"], 3)));
    container.append(创建滑块块("潜意识关联场景数 (向量引擎召回)", "chat_context.recall_scenes", 解析键路径(当前运行配置, ["chat_context", "recall_scenes"], 3)));
    container.append(创建滑块块("核心日记回忆篇数 (向量引擎召回)", "chat_context.recall_diaries", 解析键路径(当前运行配置, ["chat_context", "recall_diaries"], 3)));
    
    container.append('<div class="zwb-form-item-full zwb-divider"></div>'); 
    
    container.append(创建基础输入块("留给自己的打字时间，最多几秒没有新消息再发送给他", "wait_time_seconds", 毫秒转秒输入值(当前运行配置.wait_time_ms, 7), "number"));
    container.append(创建基础输入块("你多久没收到消息后，才允许他主动联系你（秒）", "idle_limit_seconds", 毫秒转秒输入值(当前运行配置.idle_limit_ms, 1800), "number"));
    container.append(创建小时选择块("睡眠守护：他几点开始可以主动发消息（24 时制）", "wake_window.start_hour", 解析键路径(当前运行配置, ["wake_window", "start_hour"], 9)));
    container.append(创建小时选择块("睡眠守护：他几点之后不再主动发消息（24 时制）", "wake_window.end_hour", 解析键路径(当前运行配置, ["wake_window", "end_hour"], 3)));
    container.append(创建文本域块("那些你一用他就响起警报的应用（每行一个）", "sensor.urgent_apps", (解析键路径(当前运行配置, ["sensor", "urgent_apps"], []) || []).join("\n"), "例如：爱发电"));
    container.append('<div class="zwb-form-item-full zwb-panel-actions"><div id="zwb_save_runtime_config_btn" class="menu_button">保存运行策略</div><div id="zwb_reload_runtime_config_btn" class="menu_button">重新读取</div></div>');
}

function 读取运行配置表单() {
    const result = structuredClone(当前运行配置 || {});
    
    result.chat_context = result.chat_context || {};
    result.chat_context.recent_scenes = Number($("#zwb_runtime_form [data-key='chat_context.recent_scenes']").val()) || 0;
    result.chat_context.recall_scenes = Number($("#zwb_runtime_form [data-key='chat_context.recall_scenes']").val()) || 0;
    result.chat_context.recall_diaries = Number($("#zwb_runtime_form [data-key='chat_context.recall_diaries']").val()) || 0;
    
    result.wait_time_ms = Math.max(0, Number($("#zwb_runtime_form [data-key='wait_time_seconds']").val() || 0)) * 1000;
    result.idle_limit_ms = Math.max(0, Number($("#zwb_runtime_form [data-key='idle_limit_seconds']").val() || 0)) * 1000;
    result.wake_window = result.wake_window || {};
    result.wake_window.start_hour = Math.min(24, Math.max(0, Number($("#zwb_runtime_form [data-key='wake_window.start_hour']").val() || 0)));
    result.wake_window.end_hour = Math.min(24, Math.max(0, Number($("#zwb_runtime_form [data-key='wake_window.end_hour']").val() || 0)));
    result.sensor = result.sensor || {};
    result.sensor.urgent_apps = String($("#zwb_runtime_form [data-key='sensor.urgent_apps']").val() || "").split("\n").map(v => v.trim()).filter(Boolean);
    return result;
}

// ================= API 交互与刷新 =================
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
        $("#zwb_character_preview_editor").val(生成Identity候选文本(role));
        $("#zwb_user_preview_editor").val(生成User候选文本(userInfo));
    } catch (e) {}
}

function 渲染记忆列表(data) {
    当前记忆列表 = data || { full_logs: [], summary_logs: [] };

    const memoryContainer = $("#zwb_memory_list").empty();
    if (!当前记忆列表.full_logs.length) memoryContainer.append('<div class="zwb-empty-state">暂无 full log 文件。</div>');
    else {
        const actions = $('<div class="zwb-memory-btn-group"></div>');
        当前记忆列表.full_logs.forEach(item => {
            const activeText = item.is_active ? '[已启用] ' : '';
            actions.append(`<div class="menu_button zwb-memory-open-btn ${item.is_active ? 'active-memory' : ''}" data-file-name="${item.name}">${activeText}${item.name}</div>`);
        });
        memoryContainer.append(actions);
    }

    const summaryContainer = $("#zwb_summary_list").empty();
    if (!当前记忆列表.summary_logs.length) summaryContainer.append('<div class="zwb-empty-state">暂无 Summary 文件。</div>');
    else {
        const actions = $('<div class="zwb-memory-btn-group"></div>');
        当前记忆列表.summary_logs.forEach(item => actions.append(`<div class="menu_button zwb-summary-open-btn" data-file-name="${item.name}">${item.name}</div>`));
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
    const content = result.data?.content || { metadata: {}, items: [] };
    
    if (content.metadata && (content.metadata.mes !== undefined || content.metadata.send_date !== undefined)) {
        content.items.unshift(content.metadata);
        content.metadata = {}; 
    }
    
    当前记忆文件数据 = content;
    $("#zwb_memory_file_input").val(fileName);
    $("#zwb_memory_preview_editor").val(友好化Jsonl内容(当前记忆文件数据));
}

async function 打开Summary文件(fileName) {
    const result = await 请求接口("/memory/read", { body: { file_name: fileName } });
    const content = result.data?.content || { metadata: {}, items: [] };

    if (content.metadata && (content.metadata.mes !== undefined || content.metadata.send_date !== undefined)) {
        content.items.unshift(content.metadata);
        content.metadata = {};
    }

    当前Summary文件数据 = content;
    const previewLines = (当前Summary文件数据.items || []).map(item => 格式化Summary条目(item));
    $("#zwb_summary_file_input").val(fileName);
    $("#zwb_summary_preview_editor").val(previewLines.join("\n\n"));
}

function 刷新酒馆聊天显示() {
    const editor = $("#zwb_st_chat_preview_editor");
    if (!editor.length) return;
    const messages = 获取当前聊天消息列表();
    if (!messages || messages.length === 0) return editor.val("当前酒馆聊天记录为空，或未选中任何对话。");
    
    const items = messages.map(m => ({
        name: m.name || (m.is_user ? "用户" : "角色"),
        is_user: Boolean(m.is_user || m.role === "user"),
        is_system: Boolean(m.is_system || m.role === "system"),
        send_date: m.send_date || new Date().toISOString(),
        mes: m.message || m.mes || m.raw || ""
    })).filter(i => i.mes);
    editor.val(items.map((item, index) => 格式化单条消息(item, index + 1)).join("\n\n"));
}

async function 刷新MEMORYMarkdown与世界书() {
    const memoryMarkdownResult = await 请求接口("/workspace/read", { body: { file_key: "memory_markdown" } });
    $("#zwb_memory_markdown_editor").val(memoryMarkdownResult.data || "");

    const names = await 读取世界书名称列表();
    const container = $("#zwb_worldbook_names_container");
    
    if (!names.length) {
        container.html('<div class="zwb-empty-state">未检测到可用世界书。</div>');
        $("#zwb_worldbook_entries_wrapper").html('<div class="zwb-empty-state">无内容。</div>');
        return;
    }

    let htmlStr = "";
    names.forEach(name => {
        htmlStr += `<label class="zwb-wb-name-label"><input type="checkbox" class="zwb-wb-name-checkbox" value="${name}"><span class="zwb-wb-name-tag">[书]</span> <span class="zwb-wb-name-text">${name}</span></label>`;
    });
    container.html(htmlStr);
    $("#zwb_worldbook_entries_wrapper").html('<div class="zwb-text-muted">请先在上方勾选世界书。</div>');
}

async function 刷新多个世界书条目显示(worldbookNames) {
    const wrapper = $("#zwb_worldbook_entries_wrapper");
    if (!worldbookNames || worldbookNames.length === 0) return wrapper.html('<div class="zwb-text-muted">请先在上方勾选世界书。</div>');

    wrapper.html('<div class="zwb-text-muted">正在读取所选世界书条目...</div>');
    let allEntries = [];
    for (const name of worldbookNames) {
        const entries = await 读取世界书条目(name);
        entries.forEach(e => e._sourceWB = name); 
        allEntries = allEntries.concat(entries);
    }
    if (!allEntries.length) return wrapper.html('<div class="zwb-empty-state">所选的世界书中没有任何条目。</div>');

    let cbHtml = '<div class="zwb-wb-entry-list">';
    allEntries.forEach((entry, index) => {
        const keys = Array.isArray(entry.key) ? entry.key.join('、') : (entry.key || '');
        const title = entry.comment || entry.name || keys || '无名条目';
        cbHtml += `<label class="zwb-wb-entry-label"><input type="checkbox" class="zwb-wb-entry-checkbox" data-index="${index}"><div style="flex:1; min-width:0;"><span class="zwb-wb-entry-tag">[${entry._sourceWB}]</span> <span>${title}</span><div class="zwb-wb-entry-keys">关键词: ${keys || '无'}</div></div></label>`;
    });
    cbHtml += '</div>';

    wrapper.html(cbHtml);
    const previewArea = $('<textarea class="text_pole zwb-json-textarea" style="margin-top:10px; width:100%; height:120px; display:none; box-sizing:border-box;" readonly></textarea>');
    const actionBtn = $('<div class="menu_button full-width" style="display:none; margin-top:10px; justify-content:center;">追加勾选设定到 MEMORY.md</div>');
    wrapper.append(previewArea).append(actionBtn);

    wrapper.off('change', '.zwb-wb-entry-checkbox').on('change', '.zwb-wb-entry-checkbox', function() {
        const selectedIndexes = [];
        wrapper.find('.zwb-wb-entry-checkbox:checked').each(function() { selectedIndexes.push(Number($(this).data('index'))); });
        if (selectedIndexes.length > 0) {
            previewArea.val(selectedIndexes.map(idx => 格式化世界书条目(allEntries[idx])).join("\n\n")).show();
            actionBtn.show().data('selected-entries', selectedIndexes.map(idx => allEntries[idx]));
        } else {
            previewArea.hide(); actionBtn.hide();
        }
    });

    actionBtn.off('click').on('click', function() {
        const entries = $(this).data('selected-entries') || [];
        if (!entries.length) return;
        const currentText = String($("#zwb_memory_markdown_editor").val() || "").trim();
        $("#zwb_memory_markdown_editor").val([currentText, ...entries.map(e => 格式化世界书条目(e))].filter(Boolean).join("\n\n"));
        toastr.success(`已追加 ${entries.length} 个条目到 MEMORY.md 编辑区！`);
    });
}

function 渲染传感映射编辑器() {
    const container = $("#zwb_sensor_map_editor").empty();
    const entries = Object.entries(当前传感映射 || {});
    if (!entries.length) return container.append('<div class="zwb-sensor-row"><input class="text_pole" data-sensor-key="name" type="text" placeholder="APP 名称" /><textarea class="text_pole zwb-json-textarea zwb-sensor-desc" data-sensor-key="prompt" placeholder="附加解释"></textarea></div>');

    entries.forEach(([appName, prompt]) => {
        container.append(
            `<div class="zwb-sensor-row">
                <input class="text_pole" data-sensor-key="name" type="text" value="${appName}" placeholder="APP" />
                <textarea class="text_pole zwb-json-textarea zwb-sensor-desc" data-sensor-key="prompt" placeholder="附加解释">${prompt || ""}</textarea>
                <div class="menu_button zwb-delete-sensor-row-btn">删</div>
            </div>`
        );
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
    try { 当前传感映射 = (await 请求接口("/sensor/map/read")).data || {}; 渲染传感映射编辑器(); } catch (e) {}
}

async function 刷新备份列表() {
    try {
        当前备份列表 = (await 请求接口("/backup/list")).items || [];
        const lines = 当前备份列表.map(item => `- ${item.name} (${item.created_at})`);
        $("#zwb_backup_list").text(lines.length ? lines.join("\n") : "暂无备份。");
        const select = $("#zwb_backup_restore_select").empty();
        if (!当前备份列表.length) return select.append('<option value="">无可用备份</option>');
        当前备份列表.forEach(item => select.append(`<option value="${item.name}">${item.name}</option>`));
    } catch (e) {}
}

async function 加载全部核心数据() {
    await Promise.all([ 检测连接状态(), 刷新总览信息(), 读取基础配置(), 读取运行配置(), 读取角色相关内容(), 读取传感映射(), 刷新备份列表() ].map(p => p.catch(e => console.warn(e))));
    await 读取记忆列表().catch(e => {});
    if (当前记忆列表?.full_logs?.length) await 打开记忆文件(当前记忆列表.full_logs[0].name).catch(e => {});
    if (当前记忆列表?.summary_logs?.length) await 打开Summary文件(当前记忆列表.summary_logs[0].name).catch(e => {});
    await 刷新MEMORYMarkdown与世界书().catch(e => {});
    刷新酒馆聊天显示();
}

function 渲染设置到界面() {
    const settings = 获取设置();
    $("#zwb_local_base_dir").val(settings.local_base_dir || defaultSettings.local_base_dir);
    $("#zwb_enable_http_mode").prop("checked", Boolean(settings.enable_http_mode));
    $("#zwb_remote_base_url").val(settings.remote_base_url || defaultSettings.remote_base_url);
}

function 绑定设置事件() {
    $("#zwb_local_base_dir").on("input", function () { 获取设置().local_base_dir = String($(this).val() || "").trim(); 保存设置(); });
    $("#zwb_enable_http_mode").on("input", function () { 获取设置().enable_http_mode = Boolean($(this).prop("checked")); 保存设置(); });
    $("#zwb_remote_base_url").on("input", function () { 获取设置().remote_base_url = String($(this).val() || "").trim(); 保存设置(); });
    
    $("body").on("input", ".zwb-slider", function() {
        $(this).siblings("label").find(".zwb-slider-val").text($(this).val());
    });
}

function 绑定按钮事件() {
    $("body").on("click", "#zwb_open_modal_btn", async (e) => {
        e.preventDefault(); $("#zwb_modal_container").show();
        try { await 加载全部核心数据(); toastr.success("桥接中心加载完毕"); } catch (error) { toastr.error(`加载异常：${error.message}`); }
    });

    $("body").on("click", "#zwb_modal_close", () => $("#zwb_modal_container").hide());
    $("body").on("click", ".zwb-tab-btn", function () {
        $(".zwb-tab-btn, .zwb-tab-content").removeClass("active");
        $(this).addClass("active");
        $(`#${$(this).data("tab")}`).addClass("active");
    });

    $("body").on("click", "#zwb_ping_btn", async () => { await 检测连接状态(); toastr.success("检测完成"); });
    $("body").on("click", "#zwb_save_main_config_btn", async () => {
        当前主配置 = 读取主配置表单();
        await 请求接口("/workspace/save", { body: { file_key: "config", format: "json", data: 当前主配置 } }); toastr.success("保存成功");
    });
    $("body").on("click", "#zwb_reload_main_config_btn", async () => { await 读取基础配置(); toastr.success("重新读取成功"); });
    $("body").on("click", "#zwb_save_runtime_config_btn", async () => {
        当前运行配置 = 读取运行配置表单();
        await 请求接口("/workspace/save", { body: { file_key: "runtime", format: "json", data: 当前运行配置 } }); toastr.success("策略已保存");
    });
    $("body").on("click", "#zwb_reload_runtime_config_btn", async () => { await 读取运行配置(); toastr.success("重新读取成功"); });

    $("body").on("click", "#zwb_add_tts_cred_btn", () => {
        当前主配置 = 当前主配置 || {}; 当前主配置.tts = 当前主配置.tts || { credentials: [] };
        if (当前主配置.tts.credentials.length >= 10) return toastr.warning("最多10个节点");
        当前主配置.tts.credentials.push({ appid: "", token: "", voiceId: "" });
        渲染语音节点编辑器();
    });
    $("body").on("click", ".zwb-delete-tts-btn", function () {
        当前主配置.tts.credentials.splice(Number($(this).data("tts-index")), 1); 渲染语音节点编辑器();
    });
    $("body").on("change", 'input[name="zwb_ig_mode_radio"]', function () {
        const mode = $(this).val();
        $("#zwb_ig_mode_hidden").val(mode);
        const $select = $("#zwb_ig_model_select");
        const currentModel = $select.data("initial") || $select.val();
        $select.empty();
        igModelDict[mode].forEach(m => $select.append(`<option value="${m.value}" ${m.value === currentModel ? "selected" : ""}>${m.text}</option>`));
        $select.data("initial", "");

        if (mode === 'api') {
            $("#zwb_ig_url_block, #zwb_ig_key_block").show(); $("#zwb_ig_luma_auth").hide(); $("#zwb_ig_url_label").text("API URL:");
        } else if (mode === 'bridge') {
            $("#zwb_ig_url_block, #zwb_ig_key_block, #zwb_ig_luma_auth").hide();
        } else if (mode === 'luma') {
            $("#zwb_ig_url_block, #zwb_ig_luma_auth").show(); $("#zwb_ig_key_block").hide(); 
            $("#zwb_ig_url_label").text("Luma 反代地址 (端口通常为 8188):");
            if (!$("#zwb_ig_url").val()) $("#zwb_ig_url").val("http://127.0.0.1:8188/v1/chat/completions");
        }
    });

    $("body").on("click", "#zwb_generate_identity_btn", () => { $("#zwb_character_target_select").val("identity"); $("#zwb_character_preview_editor").val(生成Identity候选文本(提取当前角色信息())); toastr.success("已生成"); });
    $("body").on("click", "#zwb_generate_soul_btn", () => { $("#zwb_character_target_select").val("soul"); $("#zwb_character_preview_editor").val(生成Soul候选文本(提取当前角色信息())); toastr.success("已生成"); });
    $("body").on("click", "#zwb_generate_user_btn", () => { $("#zwb_user_preview_editor").val(生成User候选文本(提取当前User信息())); toastr.success("已生成"); });
    $("body").on("click", "#zwb_save_character_btn", async () => {
        const fileKey = $("#zwb_character_target_select").val();
        let content = $("#zwb_character_preview_editor").val();
        if (fileKey === "soul") content = 合并Soul草稿与现有尾段(content, String($("#zwb_character_current").val().split("【当前 SOUL.md】\n")[1] || ""));
        await 请求接口("/workspace/save", { body: { file_key: fileKey, data: content } }); await 读取角色相关内容(); toastr.success("保存成功");
    });
    $("body").on("click", "#zwb_save_user_btn", async () => {
        await 请求接口("/workspace/save", { body: { file_key: "user", data: $("#zwb_user_preview_editor").val() } }); await 读取角色相关内容(); toastr.success("保存成功");
    });

    $("body").on("click", "#zwb_migrate_data_btn", async () => {
        if (await 清洗旧名字预设(请求接口, toastr)) {
            await 读取基础配置(); await 读取角色相关内容(); await 读取记忆列表();
        }
    });
    
    $("body").on("click", ".zwb-retrofit-calc-btn", function() {
        const isSummary = $(this).closest("#zwb_tab_summary").length > 0;
        let itemsToPatch = [];
        
        if (isSummary) {
            const parsed = 解析Summary文本($("#zwb_summary_preview_editor").val(), 当前Summary文件数据);
            itemsToPatch = parsed.items;
        } else {
            const parsed = 解析友好Jsonl文本($("#zwb_memory_preview_editor").val(), 当前记忆文件数据);
            itemsToPatch = parsed.items;
        }

        if (!itemsToPatch || itemsToPatch.length === 0) return toastr.warning("请先在左侧打开文件！");

        const batchSize = Number($(this).siblings(".zwb-retrofit-batch-size").val()) || (isSummary ? 15 : 50);
        const batches = Math.ceil(itemsToPatch.length / batchSize);
        $(this).siblings(".zwb-retrofit-info").text(`共 ${itemsToPatch.length} 条记录，分为 ${batches} 批。耗时约 ${Math.ceil(batches * 10 / 60)} 分钟。`);
        
        $(this).siblings(".zwb-retrofit-run-btn").show().data("batchSize", batchSize).data("items", itemsToPatch);
    });

    $("body").on("click", ".zwb-retrofit-run-btn", async function() {
        const isSummary = $(this).closest("#zwb_tab_summary").length > 0;
        const itemsToPatch = $(this).data("items");
        
        if (!itemsToPatch) return toastr.warning("请先点击【计算批次】！");

        await 对话记录修补({
            items: itemsToPatch,
            batchSize: $(this).data("batchSize"),
            $runBtn: $(this),
            $progress: $(this).closest(".zwb-retrofit-panel").find(".zwb-retrofit-progress"),
            当前主配置,
            onComplete: () => {
                if (isSummary) {
                    当前Summary文件数据.items = itemsToPatch; 
                    const lines = itemsToPatch.map(i => 格式化Summary条目(i));
                    $("#zwb_summary_preview_editor").val(lines.join("\n\n"));
                } else {
                    当前记忆文件数据.items = itemsToPatch;
                    $("#zwb_memory_preview_editor").val(友好化Jsonl内容(当前记忆文件数据));
                }
            }
        });
    });

    $("body").on("click", ".zwb-memory-open-btn", async function () { await 打开记忆文件($(this).data("file-name")); toastr.success("读取成功"); });
    $("body").on("click", ".zwb-summary-open-btn", async function () { await 打开Summary文件($(this).data("file-name")); toastr.success("读取成功"); });
    $("body").on("click", "#zwb_reload_memory_btn", async () => { await 读取记忆列表(); await 刷新MEMORYMarkdown与世界书(); toastr.success("已刷新"); });
    $("body").on("click", "#zwb_activate_memory_btn", async () => {
        const fn = String($("#zwb_memory_file_input").val() || "").trim();
        if (!fn) return toastr.warning("请选择文件");
        await 请求接口("/memory/activate", { body: { file_name: fn } }); await 读取记忆列表(); await 刷新总览信息(); toastr.success("已生效");
    });
    
    $("body").on("click", "#zwb_save_memory_btn", async () => {
        const fn = String($("#zwb_memory_file_input").val() || "").trim();
        if (!fn) return toastr.warning("请选择文件");
        const parsed = 解析友好Jsonl文本($("#zwb_memory_preview_editor").val(), 当前记忆文件数据);
        await 请求接口("/memory/save", { body: { file_name: fn, metadata: parsed.metadata, items: parsed.items } }); toastr.success("保存成功");
    });
    $("body").on("click", "#zwb_save_summary_btn", async () => {
        const fn = String($("#zwb_summary_file_input").val() || "").trim();
        if (!fn) return toastr.warning("请先选择日记");
        const parsed = 解析Summary文本($("#zwb_summary_preview_editor").val(), 当前Summary文件数据);
        await 请求接口("/memory/save", { body: { file_name: fn, metadata: parsed.metadata, items: parsed.items } }); toastr.success("保存成功");
    });

    $("body").on("click", "#zwb_refresh_st_chat_btn", () => { 刷新酒馆聊天显示(); toastr.success("已抓取"); });
    $("body").on("click", "#zwb_import_st_to_wechat_btn", async () => {
        const parsed = 解析友好Jsonl文本($("#zwb_st_chat_preview_editor").val(), null);
        if (!parsed.items.length) return toastr.warning("没有可识别的消息");
        let defaultName = `ST_Import_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jsonl`;
        let fn = prompt("请输入新微信文件名：", defaultName);
        if (!fn) return;
        if (!fn.endsWith(".jsonl")) fn += ".jsonl";
        const meta = 当前记忆文件数据?.metadata || {};
        meta.imported_from = "sillytavern"; meta.source_chat_id = 获取酒馆上下文()?.chatId || "unknown";
        await 请求接口("/memory/save", { body: { file_name: fn, metadata: meta, items: parsed.items } });
        await 打开记忆文件(fn); await 读取记忆列表(); toastr.success("导入成功");
    });
    $("body").on("click", "#zwb_import_wechat_memory_to_st_btn", async () => {
        const parsed = 解析友好Jsonl文本($("#zwb_memory_preview_editor").val(), 当前记忆文件数据);
        if (!parsed.items.length) return toastr.warning("没有可识别的消息");
        const converted = parsed.items.map(i => ({ name: i.name, is_user: Boolean(i.is_user), is_system: Boolean(i.is_system), role: i.is_system ? "system" : (i.is_user ? "user" : "assistant"), message: i.mes }));
        if (!confirm(`将创建一个【新的酒馆聊天室】并导入 ${converted.length} 条消息。确认吗？`)) return;
        const newChatStarter = 获取稳定接口("startNewChat") || window.startNewChat;
        if (newChatStarter) { try { await newChatStarter(); } catch(e) {} }
        setTimeout(async () => {
            const creator = 获取稳定接口("createChatMessages");
            if (!creator) return toastr.error("酒馆接口不可用");
            await creator(converted, { insert_before: "end", refresh: "all" });
            刷新酒馆聊天显示(); toastr.success("灌入成功");
        }, 600);
    });

    $("body").on("change", ".zwb-wb-name-checkbox", async function () {
        const sel = []; $(".zwb-wb-name-checkbox:checked").each(function() { sel.push($(this).val()); });
        await 刷新多个世界书条目显示(sel);
    });
    $("body").on("click", "#zwb_save_memory_markdown_btn", async () => {
        await 请求接口("/workspace/save", { body: { file_key: "memory_markdown", data: $("#zwb_memory_markdown_editor").val() } }); toastr.success("保存成功");
    });

    $("body").on("click", "#zwb_add_sensor_row_btn", () => {
        $("#zwb_sensor_map_editor").append('<div class="zwb-sensor-row"><input class="text_pole" data-sensor-key="name" type="text" placeholder="APP" /><textarea class="text_pole zwb-json-textarea zwb-sensor-desc" data-sensor-key="prompt" placeholder="附加解释"></textarea><div class="menu_button zwb-delete-sensor-row-btn">删</div></div>');
    });
    $("body").on("click", ".zwb-delete-sensor-row-btn", function () { $(this).parent().remove(); });
    $("body").on("click", "#zwb_save_sensor_map_btn", async () => { await 请求接口("/sensor/map/save", { body: { data: 收集传感映射表单() } }); toastr.success("保存成功"); });
    $("body").on("click", "#zwb_reload_sensor_map_btn", async () => { await 读取传感映射(); toastr.success("读取成功"); });

    $("body").on("click", "#zwb_backup_now_btn", async () => { const r = await 请求接口("/backup/create"); toastr.success(r.message || "备份已创建"); await 刷新备份列表(); });
    $("body").on("click", "#zwb_refresh_backup_btn", async () => { await 刷新备份列表(); toastr.success("刷新成功"); });
    $("body").on("click", "#zwb_restore_backup_btn", async () => {
        const bn = String($("#zwb_backup_restore_select").val() || "").trim();
        if (!bn) return toastr.warning("请选择备份");
        if(confirm(`⚠️ 将覆盖当前工作区！\n确定恢复 ${bn} 吗？`)) {
            const r = await 请求接口("/backup/restore", { body: { backup_name: bn } });
            toastr.success(r.message || "恢复成功"); await 刷新备份列表(); await 刷新总览信息();
        }
    });
}

async function 初始化界面() {
    if (!window.toastr) console.warn("Toastr 未完全加载，部分提示可能无法显示");
    else toastr.options = { newestOnTop: true, timeOut: 2000, positionClass: "toast-top-center" };
    
    获取设置();
    const panelHtml = await $.get(`${extensionFolderPath}/templates/panel.html`);
    const modalHtml = await $.get(`${extensionFolderPath}/templates/modal.html`);
    if (!$("#zwb_open_modal_btn").length) $("#extensions_settings").append(panelHtml);
    $("#zwb_modal_container").remove();
    $("body").append(modalHtml);
    
    渲染设置到界面();
    渲染修补控制台(); 
    绑定设置事件();
    绑定按钮事件();
}

jQuery(async () => {
    try { await 初始化界面(); } catch (error) { console.error("微信 Bot 桥接中心初始化失败:", error); }
});
