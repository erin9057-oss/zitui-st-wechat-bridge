export function 解析键路径(obj, segments, defaultValue = undefined) {
    let current = obj;
    for (const segment of segments) {
        if (current == null || !(segment in current)) return defaultValue;
        current = current[segment];
    }
    return current;
}

export function 设置键路径(obj, pathText, value) {
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

export function 毫秒转秒输入值(value, fallbackSeconds) {
    const ms = Number(value);
    if (Number.isFinite(ms) && ms >= 0) return Math.round(ms / 1000);
    return fallbackSeconds;
}

// 🌟 全新格式化：加入 [场景: 标题 (至 #ID)] 显示
function formatMood(item) {
    // 只有带有场景结束 ID 或其他标签的首句，才配拥有 Mood 块
    if (!item.scene_end_id && !item.memory_anchors && !item.active_shifts) return "";

    let titleText = item.scene_title ? `[场景: ${item.scene_title} (至 #${item.scene_end_id})]\n` : "";
    
    let zArray = item.memory_anchors?.zeigarnik || [];
    if (typeof zArray === 'string') zArray = [zArray];
    let z = Array.isArray(zArray) ? zArray.join(" | ") : "";

    let sArray = item.memory_anchors?.salient || [];
    if (typeof sArray === 'string') sArray = [sArray];
    let s = Array.isArray(sArray) ? sArray.join(" | ") : "";

    let shifts = "";
    if (item.active_shifts && typeof item.active_shifts === 'object') {
        shifts = Object.entries(item.active_shifts).map(([k, v]) => `${k}:${v}`).join(", ");
    }

    if (!titleText && !z && !s && !shifts) return "";
    
    return `[Mood]\n${titleText}Z: ${z || '无'}\nS: ${s || '无'}\nShifts: ${shifts || '无'}\n[/Mood]\n`;
}

// 🌟 全新解析：从用户文本框提取场景边界
function parseMood(text, itemObj) {
    const moodRegex = /\[Mood\]\s*\n([\s\S]*?)\n\[\/Mood\]\s*\n?/;
    const match = text.match(moodRegex);
    if (match) {
        const moodContent = match[1];
        itemObj.memory_anchors = { zeigarnik: [], salient: [] };
        itemObj.active_shifts = {};

        const titleMatch = moodContent.match(/\[场景:\s*(.*?)\s*\(至\s*#(\d+)\)\]/);
        if (titleMatch) {
            itemObj.scene_title = titleMatch[1].trim();
            itemObj.scene_end_id = Number(titleMatch[2]);
        }

        const zMatch = moodContent.match(/Z:\s*(.*)/);
        if (zMatch && zMatch[1].trim() !== '无') itemObj.memory_anchors.zeigarnik = zMatch[1].split('|').map(v=>v.trim()).filter(Boolean);

        const sMatch = moodContent.match(/S:\s*(.*)/);
        if (sMatch && sMatch[1].trim() !== '无') itemObj.memory_anchors.salient = sMatch[1].split('|').map(v=>v.trim()).filter(Boolean);

        const shMatch = moodContent.match(/Shifts:\s*(.*)/);
        if (shMatch && shMatch[1].trim() !== '无') {
            shMatch[1].split(',').forEach(pair => {
                const [k, v] = pair.split(':');
                if (k && v) itemObj.active_shifts[k.trim()] = Number(v.trim());
            });
        }
        return text.replace(match[0], ''); // 剥离标签，留下干净正文
    }
    return text;
}

export function 格式化单条消息(item, index) {
    let role = "NPC";
    if (item.is_system) role = "System";
    else if (item.is_user) role = "User";

    let d = new Date(item.send_date || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    
    const moodText = formatMood(item);
    return `# ${index}\n${dateStr}\n${timeStr}\n${item.name || "未命名"} (${role})：\n${moodText}${item.mes || item.raw || ""}`;
}

export function 友好化Jsonl内容(payload) {
    const metadataText = JSON.stringify(payload?.metadata || {}, null, 2);
    const itemTexts = (payload?.items || []).map((item, index) => 格式化单条消息(item, index + 1));
    return [`#METADATA\n${metadataText}`, `#MESSAGES`, ...itemTexts].join("\n\n");
}

export function 解析友好Jsonl文本(text, 当前记忆文件数据) {
    const source = String(text || "");
    const metadataMatch = source.match(/#METADATA\s+([\s\S]*?)\s+#MESSAGES/);
    let metadata = {};
    if (metadataMatch) {
        try { metadata = JSON.parse(metadataMatch[1].trim() || "{}"); } catch(e) {}
    }

    const messagesText = source.includes('#MESSAGES') ? source.split('#MESSAGES')[1] : source;
    const blocks = messagesText.split(/\n?(?:^# \d+\r?\n)/m).filter(b => b.trim() !== '');
    
    const items = blocks.map((block, index) => {
        const lines = block.trim().split('\n');
        let send_date = new Date().toISOString();
        let name = "未命名", is_user = false, is_system = false, mesLines = [];

        if (lines.length >= 4) {
            const dateStr = lines[0].trim(), timeStr = lines[1].trim();
            // 🌟 强行锁定北京时间后缀，拒绝 JS 自动转为 Z 时区！
            try { send_date = `${dateStr}T${timeStr}:00.000+08:00`; } catch(e) {}
            
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
        
        let origItem = JSON.parse(JSON.stringify(当前记忆文件数据?.items?.[index] || {}));
        let mesText = mesLines.join('\n').trim();
        
        mesText = parseMood(mesText, origItem);

        return { ...origItem, name, is_user, is_system, send_date, mes: mesText.trim() };
    });

    return { metadata, items };
}

export function 格式化Summary条目(item) {
    const moodText = formatMood(item);
    return `【${item.send_date || '无时间'}】\n${item.name || (item.is_user ? '你' : '他')}：\n${moodText}${item.mes || item.raw || ''}`;
}

export function 解析Summary文本(text, 当前Summary文件数据) {
    const blocks = String(text || "").split(/【(.*?)】\n/).filter(b => b.trim() !== '');
    const items = [];
    let origIndex = 0;
    for (let i = 0; i < blocks.length; i += 2) {
        const send_date = blocks[i] ? blocks[i].trim() : new Date().toISOString();
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
        
        let origItem = JSON.parse(JSON.stringify(当前Summary文件数据?.items?.[origIndex] || {}));
        mes = parseMood(mes, origItem);

        items.push({
            ...origItem, send_date, name, is_user: name === "你" || name === "用户", is_system: false, mes: mes.trim()
        });
        origIndex++;
    }
    return { metadata: {}, items };
}

export function 合并Soul草稿与现有尾段(newText, currentSoulText) {
    const marker = "# 动态视觉反馈系统";
    const normalizedCurrent = String(currentSoulText || "");
    const markerIndex = normalizedCurrent.indexOf(marker);
    if (markerIndex === -1) return newText;
    const tail = normalizedCurrent.slice(markerIndex).trim();
    const head = String(newText || "").split(marker)[0].trim();
    return [head, tail].filter(Boolean).join("\n\n");
}
