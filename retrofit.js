import { 请求接口 } from "./api.js";
import { 获取稳定接口 } from "./st_bridge.js"; 

export async function 清洗旧名字预设() {
    const oldChar = prompt("【第一步】请输入文件中被写死的【旧】角色名（用于查找，如：小白）：");
    if (!oldChar) return;
    const oldUser = prompt("请输入文件中被写死的【旧】用户名（用于查找，如：用户）：");
    if (!oldUser) return;
    const newChar = prompt(`【第二步】请输入期望生效的【新】角色名：`, oldChar);
    if (!newChar) return;
    const newUser = prompt(`请输入期望生效的【新】用户名：`, oldUser);
    if (!newUser) return;
    if (!confirm(`即将净化预设文件，并将对话记录人名对齐。确认吗？`)) return;

    try {
        toastr.info("正在清理 IDENTITY 和 USER...");
        for (const key of ["identity", "user"]) {
            let res = await 请求接口("/workspace/read", { body: { file_key: key } });
            if (!res.data) continue;
            let text = res.data.split(oldChar).join("{{char}}").split(oldUser).join("{{user}}");
            await 请求接口("/workspace/save", { body: { file_key: key, data: text } });
        }

        toastr.info("正在清理 SOUL.md...");
        let soulRes = await 请求接口("/workspace/read", { body: { file_key: "soul" } });
        if (soulRes.data) {
            const marker = "# 动态视觉反馈系统";
            const parts = soulRes.data.split(marker);
            let upper = parts[0].split(oldChar).join("{{char}}").split(oldUser).join("{{user}}");
            let finalSoul = upper;
            if (parts.length > 1) {
                const lowerLines = parts[1].split('\n').map(line => {
                    if (line.includes('http')) return line;
                    return line.split(oldChar).join("{{char}}").split(oldUser).join("{{user}}");
                });
                finalSoul += marker + lowerLines.join('\n');
            }
            await 请求接口("/workspace/save", { body: { file_key: "soul", data: finalSoul } });
        }

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

        toastr.info("正在写入新名字配置...");
        let cfgRes = await 请求接口("/config/main/read");
        let cfg = cfgRes.data || {};
        cfg.profile = cfg.profile || {};
        cfg.profile.char_name = newChar;
        cfg.profile.user_name = newUser;
        await 请求接口("/workspace/save", { body: { file_key: "config", format: "json", data: cfg } });
        return true;
    } catch (error) {
        toastr.error(`修补失败：${error.message}`);
        return false;
    }
}

export async function 对话记录修补(options) {
    const { items, batchSize, $progress, $runBtn, 当前主配置, onComplete, isSummary } = options;

    if (!当前主配置?.chat_llm?.api_key) return toastr.error("请先填写大模型 API 密钥。");

    const charName = 当前主配置?.profile?.char_name;
    const userName = 当前主配置?.profile?.user_name;
    const apiUrl = `${当前主配置.chat_llm.api_base_url.replace(/\/$/, '')}/chat/completions`;
    const apiKey = 当前主配置.chat_llm.api_key;
    const modelName = 当前主配置.chat_llm.model_name;

    // ==========================================
    // 🎭 模式 1：日记 (Summary) 专属 Prompt
    // ==========================================
    const systemPromptDiary = `你是一个高级情感分析与记忆梳理专家。你的任务是为 ${charName} 的日记补充情绪标签。
你将收到带有 [ID: xxx] 编号的日记记录。
请为每一个ID找出【情绪发生显著转变】、【产生记忆锚点（Zeigarnik未完成事件 / Salient情感显著物）】、或【日期逻辑明显错乱】的节点，并以 JSON 格式返回对应 ID 的更新数据**不得跳过任何ID**。
【分析维度】：
1. memory_anchors: 包含 zeigarnik (约定/悬念) 和 salient (纪念物/雷点/特有情绪小事)。
2. active_shifts: ["面具剥离", "软性策略", "理智让渡", "依恋渴望", "权力疲惫", "边界溶解"]，给本ID显著触发的所有维度打分(0-100)。
3. corrected_date: 若发现日期错乱，提供修正后的 ISO 日期前缀(如 "2026-02-17")。
【输出要求】：
- 仅输出纯 JSON 字典，键为 ID 字符串，值为更新的数据。memory_anchors内容要1简洁2使用 ${charName} 和 ${userName} 指代，不用你我她避免混淆
- 没有明显锚点的日常废话，绝对不要包含在 JSON 中。`;

    // ==========================================
    // 🎬 模式 2：聊天记录 (Full Log) 专属 Prompt -> EST 连续场景切片
    // ==========================================
    // 🌟 修复：变量名必须是 systemPromptChat，绝不能叫 systemPrompt！
    const systemPromptChat = `你是一位融合了认知心理学与人工智能架构的“记忆工程专家”，深谙【情景记忆与语义记忆协同机制】以及【Event Segmentation Theory, EST】。
你的任务是将 ${charName} 与 ${userName} 的连续对话流切分成“场景记忆块”，为未来的父子块检索系统提供溯源靶点。

【切片要求】
根据事件分割理论，人类会将连续的信息流划分为独立事件。请依据以下特征划分“Scene”：
1. 时间/空间或话题发生实质性转移（如从吃饭切换到打游戏）。
2. 单个场景通常包含若干句连贯的上下文，不要逐句切分！一整段连贯的话题算作一个场景。

【边界约束】（系统崩溃红线！）
1. 你返回的场景列表，其 start_id 到 end_id 必须【完美连续】，无缝覆盖用户发送给你的所有 ID！
2. 例如：如果你收到了 ID 10 到 40 的话语。那么场景1必须从10开始，假设到22结束。场景2必须从23开始... 最后一个场景必须在40结束。绝对不允许跳过任何一句话！

【情绪与元数据标注】
对于每个场景，**必须标注**：
1. title: 场景短标题（如“孵蛋小游戏”）。
2. zeigarnik: 蔡加尼克效应（如：未完事件、约定）。如果没有则返回空数组 []。
3. salient: 显著情感物（必须符合${charName}人设！不同人设显著物不同 如：感性人标注纪念物、追星人标注自推被黑事件、乐子人标注八卦）。如果没有则返回空数组 []。
4. active_shifts: 显著触发的情感维度打分(0-100)。可选：["面具剥离", "软性策略", "理智让渡", "依恋渴望", "权力疲惫", "边界溶解"]。如果没有则返回 {}。

【输出格式示例】
假设你收到了 ID 1 到 40 的对话，你必须输出类似如下完美连续的多模块 JSON 对象：
{
  "scenes": [
    {
      "start_id": 1,
      "end_id": 15,
      "title": "清晨寒暄与早餐讨论",
      "zeigarnik": [],
      "salient": ["${charName}为${userName}点了蜜汁叉烧"],
      "active_shifts": {}
    },
    {
      "start_id": 16,
      "end_id": 34,
      "title": "孵蛋小游戏",
      "zeigarnik": ["约定明天看蛋破壳"],
      "salient": ["游戏规则：需要保持37度，拍三下"],
      "active_shifts": { "理智让渡": 80 }
    },
    {
      "start_id": 35,
      "end_id": 40,
      "title": "午休前的温存",
      "zeigarnik": [],
      "salient": [],
      "active_shifts": { "依恋渴望": 90 }
    }
  ]
}`;

    // 🌟 正常分配，语法错误解除！
    const systemPrompt = isSummary ? systemPromptDiary : systemPromptChat;

    $runBtn.prop("disabled", true).text("处理中...");
    
    const $logBox = $progress.siblings(".zwb-retrofit-log");
    $logBox.val("").hide();

    const appendLog = (msg) => {
        $logBox.show();
        const time = new Date().toLocaleTimeString('zh-CN');
        $logBox.val($logBox.val() + `[${time}] ${msg}\n`);
        $logBox.scrollTop($logBox[0].scrollHeight);
    };

    let successCount = 0;
    let failCount = 0;
    let currentStrategy = 1; 

    try {
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const currentBatchIndex = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(items.length / batchSize);
            
            let retryCount = 0;
            const maxRetries = 3;
            let batchSuccess = false;
            let resultDict = {};

            while (retryCount < maxRetries && !batchSuccess) {
                try {
                    let statusText = `正在提交第 ${currentBatchIndex} / ${totalBatches} 批... (Tier ${currentStrategy})`;
                    if (retryCount > 0) statusText += ` <span class="zwb-text-warning">(重试 ${retryCount}/3)</span>`;
                    $progress.html(statusText);

                    let contextText = isSummary 
                        ? "" 
                        : `【本次必须覆盖的ID范围：从 ${i + 1} 到 ${i + batch.length}】\n\n`;

                    batch.forEach((item, idx) => {
                        const absIdx = i + idx + 1; 
                        const d = new Date(item.send_date);
                        const timeStr = isNaN(d) ? "未知时间" : d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                        let role = item.is_system ? "System" : (item.name || "Unknown");
                        let text = String(item.mes || "").replace(/\n/g, ' '); 
                        contextText += `[ID: ${absIdx}] ${role}(${timeStr}): ${text}\n`;
                    });

                    let rawContent = "";
                    let requestResolved = false;

                    if (currentStrategy === 1 && !requestResolved) {
                        try {
                            const response = await fetch(apiUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                                body: JSON.stringify({ 
                                    model: modelName, 
                                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请返回符合格式的 JSON：\n\n${contextText}` }] 
                                })
                            });

                            if (!response.ok) {
                                let errText = await response.text().catch(()=>"");
                                throw new Error(`TIER1_HTTP_${response.status}_${errText}`);
                            }

                            const data = await response.json();
                            rawContent = data.choices?.[0]?.message?.content || "{}";
                            requestResolved = true;
                        } catch (e) {
                            if (e.message.includes('TIER1_HTTP_429')) {
                                throw e; 
                            } else {
                                appendLog(`⚠️ [嗅探] Tier 1 直连受阻，自动降级至 Tier 2 (后端代理)...`);
                                currentStrategy = 2; 
                            }
                        }
                    }

                    if (currentStrategy === 2 && !requestResolved) {
                        try {
                            const proxyResponse = await 请求接口("/llm/proxy", {
                                body: {
                                    url: apiUrl, key: apiKey, model: modelName,
                                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请返回符合格式的 JSON：\n\n${contextText}` }]
                                }
                            });

                            if (!proxyResponse.success) throw new Error(`PROXY_LLM_ERR_${JSON.stringify(proxyResponse.error)}`);
                            
                            rawContent = proxyResponse.data?.choices?.[0]?.message?.content || "{}";
                            requestResolved = true;
                        } catch (e) {
                            if (e.message.includes('PROXY_LLM_ERR_')) {
                                throw e; 
                            } else {
                                appendLog(`⚠️ [嗅探] Tier 2 代理异常，自动降级至 Tier 3 (酒馆原生 API)...`);
                                currentStrategy = 3;
                            }
                        }
                    }

                    if (currentStrategy === 3 && !requestResolved) {
                        const fnGenerateRaw = 获取稳定接口('generateRaw');
                        if (!fnGenerateRaw) throw new Error("所有通道均已耗尽！未找到酒馆底层接口。");
                        
                        rawContent = await fnGenerateRaw({
                            ordered_prompts: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: `请返回符合格式的 JSON：\n\n${contextText}` }
                            ]
                        });
                        requestResolved = true;
                    }

                    let cleanedString = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
                    cleanedString = cleanedString.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); 
                    cleanedString = cleanedString.replace(/```json/gi, '').replace(/```/g, '').trim();
                    const firstBrace = cleanedString.indexOf('{');
                    const lastBrace = cleanedString.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        cleanedString = cleanedString.substring(firstBrace, lastBrace + 1);
                    }

                    resultDict = JSON.parse(cleanedString);
                    batchSuccess = true; 

                } catch (err) {
                    retryCount++;
                    appendLog(`❌ 批次 ${currentBatchIndex} 报错:\n -> ${err.message}`);
                    
                    if (err.name === 'SyntaxError') {
                        appendLog(`🚨 诊断: 大模型发癫，返回了不符合规范的垃圾数据。`);
                    } else if (err.message.includes('429')) {
                        appendLog(`🚨 诊断: 请求太快或额度不足。`);
                    }

                    if (retryCount < maxRetries) {
                        $progress.html(`<span class="zwb-text-warning">重试中 (${retryCount}/${maxRetries})...</span>`);
                        await new Promise(r => setTimeout(r, 2000 * retryCount)); 
                    } else { 
                        failCount++; 
                        toastr.warning(`第 ${currentBatchIndex} 批次彻底失败，已跳过。`); 
                    }
                }
            }

            // 🧵 数据缝合 (双模自适应)
            if (batchSuccess) {
                if (isSummary) {
                    batch.forEach((item, idx) => {
                        const absIdx = i + idx + 1;
                        const updates = resultDict[String(absIdx)];
                        if (updates) {
                            let z = updates.memory_anchors?.zeigarnik || [];
                            if (typeof z === 'string') z = [z];
                            let s = updates.memory_anchors?.salient || [];
                            if (typeof s === 'string') s = [s];

                            item.memory_anchors = { zeigarnik: z, salient: s };
                            if (updates.active_shifts) item.active_shifts = updates.active_shifts;
                            if (updates.corrected_date) {
                                try { item.send_date = `${updates.corrected_date}T${item.send_date.substring(11)}`; } catch(e) {}
                            }
                        }
                    });
                } else {
                    if (resultDict.scenes && Array.isArray(resultDict.scenes)) {
                        resultDict.scenes.forEach(scene => {
                            const startIdx = scene.start_id - 1; 
                            const endIdx = scene.end_id - 1;
                            
                            if (startIdx >= i && startIdx < i + batchSize) {
                                const targetItem = items[startIdx];
                                if (targetItem) {
                                    targetItem.scene_end_id = endIdx + 1; 
                                    targetItem.scene_title = scene.title || "未知场景";
                                    targetItem.memory_anchors = {
                                        zeigarnik: Array.isArray(scene.zeigarnik) ? scene.zeigarnik : [],
                                        salient: Array.isArray(scene.salient) ? scene.salient : []
                                    };
                                    targetItem.active_shifts = scene.active_shifts || {};
                                }
                            }
                        });
                    }
                }
                successCount++;
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        if (failCount === 0) {
            $progress.html(`<span class="zwb-text-success">🎉 全批次修补完成！请点击“保存修改”。</span>`);
            toastr.success("完美成功！别忘了点保存！");
        } else {
            $progress.html(`<span class="zwb-text-warning">⚠️ 完成 ${successCount} 批，跳过 ${failCount} 批。请查看日志。</span>`);
        }
    } catch (err) {
        appendLog(`💣 致命中断异常: ${err.message}`);
        $progress.html(`<span class="zwb-text-danger">❌ 处理中断: ${err.message}</span>`);
        toastr.error("修补中断，进度已保留在视图中！");
    } finally {
        if (onComplete) onComplete();
        $runBtn.prop("disabled", false).text("执行整理").hide();
    }
}
