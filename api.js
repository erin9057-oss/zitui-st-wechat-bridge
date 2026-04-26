import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, getRequestHeaders } from "../../../../script.js";

export const extensionName = "zitui-st-wechat-bridge";
export const extensionFolderPath = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

export const defaultSettings = {
    local_base_dir: "~/WechatAI/openclaw-weixin",
    enable_http_mode: false,
    remote_base_url: "http://127.0.0.1:7860",
};

export function 获取设置() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    return extension_settings[extensionName];
}

export function 保存设置() {
    saveSettingsDebounced();
}

export function 获取请求配置() {
    const settings = 获取设置();
    return {
        local_base_dir: settings.local_base_dir || defaultSettings.local_base_dir,
        enable_http_mode: Boolean(settings.enable_http_mode),
        remote_base_url: settings.remote_base_url || defaultSettings.remote_base_url,
    };
}

export function 获取服务端基础地址() {
    return "/api/plugins/zitui-st-wechat-bridge";
}

export async function 请求接口(pathname, options = {}) {
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
