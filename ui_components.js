import { 解析键路径 } from "./utils.js";

export const igModelDict = {
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

export function 创建基础输入块(labelText, keyPath, value, type = "text", placeholder = "") {
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

export function 创建文本域块(labelText, keyPath, value, placeholder = "") {
    const wrapper = $('<div class="zwb-form-item zwb-form-item-full"></div>');
    wrapper.append(`<label>${labelText}</label>`);
    const textarea = $(`<textarea class="text_pole zwb-json-textarea" data-key="${keyPath}" placeholder="${placeholder}"></textarea>`);
    textarea.val(value ?? "");
    wrapper.append(textarea);
    return wrapper;
}

export function 创建小时选择块(labelText, keyPath, value) {
    const wrapper = $('<div class="zwb-form-item"></div>');
    wrapper.append(`<label>${labelText}</label>`);
    const select = $(`<select class="text_pole" data-key="${keyPath}"></select>`);
    for (let hour = 0; hour <= 24; hour += 1) select.append(`<option value="${hour}">${hour}</option>`);
    select.val(String(value ?? 0));
    wrapper.append(select);
    return wrapper;
}

export function 创建生图高阶控制区(主配置) {
    const mode = 解析键路径(主配置, ["image_generation", "mode"], "bridge");
    const model = 解析键路径(主配置, ["image_generation", "model_name"], "");
    const url = 解析键路径(主配置, ["image_generation", "api_base_url"], "");
    const key = 解析键路径(主配置, ["image_generation", "api_key"], "");
    const ref = 解析键路径(主配置, ["image_generation", "reference_image_path"], "");
    const luma_realm = 解析键路径(主配置, ["image_generation", "luma_realm_id"], "");
    const luma_wos = 解析键路径(主配置, ["image_generation", "luma_wos_session"], "");

    return $(`
        <div class="zwb-form-item-full zwb-ig-config-panel">
            <div class="zwb-ig-title">生图配置</div>
            <input type="hidden" data-key="image_generation.mode" id="zwb_ig_mode_hidden" value="${mode}">
            <div class="zwb-ig-radios">
                <label class="zwb-ig-radio-label"><input type="radio" name="zwb_ig_mode_radio" value="api" ${mode === 'api' ? 'checked' : ''}> 付费官key/公益站</label>
                <label class="zwb-ig-radio-label"><input type="radio" name="zwb_ig_mode_radio" value="bridge" ${mode === 'bridge' ? 'checked' : ''}> AI Studio</label>
                <label class="zwb-ig-radio-label"><input type="radio" name="zwb_ig_mode_radio" value="luma" ${mode === 'luma' ? 'checked' : ''}> 本地LUMA反代</label>
            </div>
            <div class="zwb-form-item">
                <label>模型</label><select class="text_pole" data-key="image_generation.model_name" id="zwb_ig_model_select" data-initial="${model}"></select>
            </div>
            <div class="zwb-form-item" id="zwb_ig_url_block">
                <label id="zwb_ig_url_label">URL 地址</label><input class="text_pole" type="text" data-key="image_generation.api_base_url" id="zwb_ig_url" value="${url}" placeholder="https://..." />
            </div>
            <div class="zwb-form-item" id="zwb_ig_key_block">
                <label>API 密钥</label><input class="text_pole" type="password" data-key="image_generation.api_key" value="${key}" placeholder="sk-..." />
            </div>
            <div id="zwb_ig_luma_auth" class="zwb-ig-luma-auth" style="display: none;">
                <div class="zwb-form-item">
                    <label>👤 Luma Realm ID</label><input class="text_pole" type="text" data-key="image_generation.luma_realm_id" value="${luma_realm}" />
                </div>
                <div class="zwb-form-item">
                    <label>🍪 Luma WOS Session</label><input class="text_pole" type="password" data-key="image_generation.luma_wos_session" value="${luma_wos}" />
                </div>
            </div>
            <div class="zwb-form-item">
                <label>自推参考图路径</label><input class="text_pole" type="text" data-key="image_generation.reference_image_path" value="${ref}" />
            </div>
        </div>
    `);
}

export function 渲染修补控制台() {
    // 🌟 强力 CSS 补丁，专治各种手机端按钮换行被挤压变形
    if (!$('#zwb-retrofit-style').length) {
        $('head').append(`<style id="zwb-retrofit-style">
            .zwb-retrofit-controls .menu_button { white-space: nowrap !important; margin: 0 4px; }
            .zwb-retrofit-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        </style>`);
    }

    const getPanelHtml = (title, labelText) => `
    <div class="zwb-retrofit-panel">
        <div class="zwb-retrofit-title">🎯 ${title}</div>
        <div class="zwb-retrofit-controls">
            <label>${labelText}:</label>
            <input type="number" class="text_pole zwb-retrofit-batch-size" />
            <div class="menu_button zwb-retrofit-calc-btn">计算批次</div>
            <span class="zwb-retrofit-info"></span>
            <div class="menu_button zwb-retrofit-run-btn" style="display: none;">执行整理</div>
        </div>
        <div class="zwb-retrofit-progress"></div>
        <textarea class="text_pole zwb-json-textarea zwb-retrofit-log" style="display:none; margin-top:10px; height:160px; width:100%; font-size:12px; color:#ff9800; background:rgba(0,0,0,0.6); font-family: monospace; border:1px solid #f44336;" readonly></textarea>
    </div>`;

    if ($("#zwb_memory_preview_editor").length && !$("#zwb_tab_memory .zwb-retrofit-panel").length) {
        $("#zwb_memory_preview_editor").before(getPanelHtml("对话记录标签修补", "每批处理对话数"));
        $("#zwb_tab_memory .zwb-retrofit-batch-size").val(50); 
    }
    if ($("#zwb_summary_preview_editor").length && !$("#zwb_tab_summary .zwb-retrofit-panel").length) {
        $("#zwb_summary_preview_editor").before(getPanelHtml("日记总结标签修补", "每批处理天数"));
        $("#zwb_tab_summary .zwb-retrofit-batch-size").val(15); 
    }
}
