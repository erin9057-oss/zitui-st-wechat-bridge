#!/bin/bash
set -e

REPO_RAW_BASE="https://raw.githubusercontent.com/erin9057-oss/zitui-st-wechat-bridge/main"
PLUGIN_NAME="zitui-st-wechat-bridge"
DEFAULT_ONE="$HOME/SillyTavern/plugins"
DEFAULT_TWO="$HOME/ST/plugins"

打印标题() {
    echo "==================================================="
    echo "🚀 微信 Bot 桥接插件服务端安装脚本"
    echo "==================================================="
}

展开路径() {
    local input_path="$1"
    if [ -z "$input_path" ]; then
        return 0
    fi
    if [ "$input_path" = "~" ]; then
        printf '%s\n' "$HOME"
        return 0
    fi
    case "$input_path" in
        ~/*)
            printf '%s/%s\n' "$HOME" "${input_path#~/}"
            ;;
        *)
            printf '%s\n' "$input_path"
            ;;
    esac
}

规范化酒馆根目录() {
    local input_root="$1"
    local expanded
    expanded="$(展开路径 "$input_root")"
    expanded="${expanded%/}"

    if [ -z "$expanded" ]; then
        return 0
    fi

    if [[ "$expanded" == */plugins ]]; then
        expanded="${expanded%/plugins}"
    fi

    printf '%s\n' "$expanded"
}

检查是否为有效酒馆目录() {
    local root_dir="$1"
    [ -d "$root_dir" ] || return 1
    [ -d "$root_dir/public" ] || [ -d "$root_dir/plugins" ] || [ -f "$root_dir/package.json" ]
}

自动发现酒馆根目录() {
    local candidate
    for candidate in "$HOME/SillyTavern" "$HOME/ST"; do
        if 检查是否为有效酒馆目录 "$candidate"; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    return 1
}

获取酒馆根目录() {
    local manual_root="${ST_ROOT:-}"
    local found_root=""

    if [ -n "$manual_root" ]; then
        found_root="$(规范化酒馆根目录 "$manual_root")"
        if 检查是否为有效酒馆目录 "$found_root"; then
            printf '%s\n' "$found_root"
            return 0
        fi
        echo "⚠️ 你通过 ST_ROOT 指定的目录看起来不是有效的酒馆根目录：$found_root"
    fi

    if found_root="$(自动发现酒馆根目录)"; then
        printf '%s\n' "$found_root"
        return 0
    fi

    echo "未自动找到 SillyTavern 安装目录。"
    echo "常见目录已检查："
    echo "  1. $HOME/SillyTavern/plugins"
    echo "  2. $HOME/ST/plugins"
    echo ""
    echo "请直接输入酒馆根目录，不需要输入 /plugins，脚本会自动补全。"

    while true; do
        read -r -p "👉 请输入 SillyTavern 根目录: " user_input < /dev/tty
        user_input="$(规范化酒馆根目录 "$user_input")"

        if [ -z "$user_input" ]; then
            echo "❌ 输入不能为空，请重新输入。"
            continue
        fi

        if 检查是否为有效酒馆目录 "$user_input"; then
            printf '%s\n' "$user_input"
            return 0
        fi

        echo "❌ 该目录不是有效的 SillyTavern 根目录：$user_input"
        echo "   提示：请传酒馆根目录，例如 ~/SillyTavern 或 ~/ST，而不是 /plugins。"
    done
}

下载服务端插件() {
    local install_dir="$1"
    mkdir -p "$install_dir"

    echo "📥 正在下载 server-plugin 到：$install_dir"
    curl -fsSL "$REPO_RAW_BASE/server-plugin/index.js" -o "$install_dir/index.js"
    curl -fsSL "$REPO_RAW_BASE/server-plugin/package.json" -o "$install_dir/package.json"
}

打印完成说明() {
    local root_dir="$1"
    local plugins_dir="$2"
    local install_dir="$3"

    echo "==================================================="
    echo "✅ 安装完成"
    echo "酒馆根目录：$root_dir"
    echo "插件目录：$plugins_dir"
    echo "本插件目录：$install_dir"
    echo ""
    echo "下一步请操作："
    echo "1. 重启 SillyTavern 服务端。"
    echo "2. 回到酒馆页面后强制刷新一次。"
    echo "3. 再到前端扩展中点击“检测桥接状态”。"
    echo ""
    echo "如果你要手动指定酒馆位置，也可以这样运行："
    echo "ST_ROOT=/绝对路径/到/SillyTavern bash <(curl -sSL $REPO_RAW_BASE/install-server-plugin.sh)"
    echo "==================================================="
}

打印标题

ROOT_DIR="$(获取酒馆根目录)"
PLUGINS_DIR="$ROOT_DIR/plugins"
INSTALL_DIR="$PLUGINS_DIR/$PLUGIN_NAME"

mkdir -p "$PLUGINS_DIR"
下载服务端插件 "$INSTALL_DIR"
打印完成说明 "$ROOT_DIR" "$PLUGINS_DIR" "$INSTALL_DIR"
