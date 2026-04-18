const fs = require('fs');
const os = require('os');
const path = require('path');

const 插件信息 = {
    id: 'zitui-st-wechat-bridge',
    name: '微信 Bot 桥接中心',
    description: '为 SillyTavern 提供与 zitui Wechat bot 的受控桥接能力。',
};

const 默认基础目录 = '/data/data/com.termux/files/home/WechatAI/openclaw-weixin';

function 获取当前时间字符串() {
    return new Date().toISOString();
}

function 展开用户目录(inputPath) {
    if (!inputPath) return 默认基础目录;
    if (inputPath === '~') return os.homedir();
    if (inputPath.startsWith('~/')) return path.join(os.homedir(), inputPath.slice(2));
    return inputPath;
}

function 读取请求配置(req) {
    const body = req.body || {};
    const query = req.query || {};
    return {
        enable_http_mode: Boolean(body.enable_http_mode ?? query.enable_http_mode ?? false),
        remote_base_url: String(body.remote_base_url ?? query.remote_base_url ?? '').trim(),
        local_base_dir: 展开用户目录(String(body.local_base_dir ?? query.local_base_dir ?? 默认基础目录).trim()),
    };
}

function 构建路径集合(baseDir) {
    const workspaceDir = path.join(baseDir, 'workspace');
    const memoryDir = path.join(baseDir, 'Memory');
    const accountsDir = path.join(baseDir, 'accounts');
    return {
        baseDir,
        workspaceDir,
        memoryDir,
        accountsDir,
        configPath: path.join(baseDir, 'config.json'),
        sensorMapPath: path.join(baseDir, 'sensor_map.json'),
        runtimeConfigPath: path.join(workspaceDir, 'plugin_runtime.json'),
        activeMemoryPath: path.join(workspaceDir, 'active_memory.json'),
        identityPath: path.join(workspaceDir, 'IDENTITY.md'),
        soulPath: path.join(workspaceDir, 'SOUL.md'),
        userPath: path.join(workspaceDir, 'USER.md'),
        memoryMarkdownPath: path.join(workspaceDir, 'MEMORY.md'),
        dreamEventsPath: path.join(workspaceDir, 'dream_events.json'),
    };
}

function 读取文本(filePath, fallback = '') {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return fs.readFileSync(filePath, 'utf-8');
    } catch (_error) {
        return fallback;
    }
}

function 读取JSON(filePath, fallback = {}) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (_error) {
        return fallback;
    }
}

function 写入文本(filePath, content) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
}

function 写入JSON(filePath, data) {
    写入文本(filePath, JSON.stringify(data, null, 2));
}

function 从Markdown提取名字(content, fallbackValue) {
    const match = String(content || '').match(/-\s*\*\*Name:\*\*\s*(.+)/i);
    return match ? match[1].trim() : fallbackValue;
}

function 获取活跃记忆(paths) {
    const activeConfig = 读取JSON(paths.activeMemoryPath, { active_full_log: null });
    const explicitName = activeConfig.active_full_log;
    const charName = 从Markdown提取名字(读取文本(paths.identityPath, ''), '小白');

    const allFiles = fs.existsSync(paths.memoryDir)
        ? fs.readdirSync(paths.memoryDir).filter(name => name.endsWith('.jsonl'))
        : [];

    const fullLogs = allFiles
        .filter(name => name.startsWith(charName) && !name.includes('summary'))
        .sort((a, b) => {
            const aTime = fs.statSync(path.join(paths.memoryDir, a)).mtimeMs;
            const bTime = fs.statSync(path.join(paths.memoryDir, b)).mtimeMs;
            return bTime - aTime;
        });

    const fallbackName = fullLogs.length ? fullLogs[0] : null;
    const activeName = explicitName || fallbackName;
    return { charName, activeName, explicitName, fallbackName };
}

function 读取记忆列表(paths) {
    if (!fs.existsSync(paths.memoryDir)) {
        return { full_logs: [], summary_logs: [] };
    }

    const activeInfo = 获取活跃记忆(paths);
    const allFiles = fs.readdirSync(paths.memoryDir).filter(name => name.endsWith('.jsonl'));

    const full_logs = allFiles
        .filter(name => !name.includes('summary'))
        .map(name => {
            const filePath = path.join(paths.memoryDir, name);
            const stat = fs.statSync(filePath);
            return {
                name,
                kind: 'full',
                is_active: name === activeInfo.activeName,
                updated_at: new Date(stat.mtimeMs).toISOString(),
                size: stat.size,
            };
        })
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    const summary_logs = allFiles
        .filter(name => name.includes('summary'))
        .map(name => {
            const filePath = path.join(paths.memoryDir, name);
            const stat = fs.statSync(filePath);
            return {
                name,
                kind: 'summary',
                updated_at: new Date(stat.mtimeMs).toISOString(),
                size: stat.size,
            };
        })
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return {
        active: activeInfo,
        full_logs,
        summary_logs,
    };
}

function 读取Jsonl文件(filePath) {
    const lines = 读取文本(filePath, '').split('\n').filter(Boolean);
    if (!lines.length) {
        return { metadata: null, items: [] };
    }

    let metadata = null;
    try {
        metadata = JSON.parse(lines[0]);
    } catch (_error) {
        metadata = null;
    }

    const items = lines.slice(1).map((line, index) => {
        try {
            return { index, ...JSON.parse(line) };
        } catch (_error) {
            return { index, raw: line, parse_error: true };
        }
    });

    return { metadata, items };
}

function 序列化Jsonl(metadata, items) {
    const lines = [];
    if (metadata) lines.push(JSON.stringify(metadata));
    for (const item of items || []) {
        const { index, ...rest } = item;
        lines.push(JSON.stringify(rest));
    }
    return `${lines.join('\n')}\n`;
}

function 获取白名单文件路径(paths, fileKey) {
    const table = {
        config: paths.configPath,
        sensor_map: paths.sensorMapPath,
        runtime: paths.runtimeConfigPath,
        active_memory: paths.activeMemoryPath,
        identity: paths.identityPath,
        soul: paths.soulPath,
        user: paths.userPath,
        memory_markdown: paths.memoryMarkdownPath,
        dream_events: paths.dreamEventsPath,
    };
    return table[fileKey] || null;
}

function 验证记忆文件名(fileName) {
    return Boolean(fileName) && !String(fileName).includes('/') && !String(fileName).includes('\\') && String(fileName).endsWith('.jsonl');
}

async function init(router) {
    router.get('/health', async (_req, res) => {
        res.json({
            ok: true,
            message: '本地桥接服务可用',
            plugin: 插件信息.id,
            generated_at: 获取当前时间字符串(),
        });
    });

    router.post('/health', async (req, res) => {
        const requestConfig = 读取请求配置(req);
        const paths = 构建路径集合(requestConfig.local_base_dir);
        res.json({
            ok: true,
            mode: requestConfig.enable_http_mode ? 'http' : 'local',
            message: requestConfig.enable_http_mode
                ? `远端 HTTP 模式已启用：${requestConfig.remote_base_url || '未填写地址'}`
                : `本地路径模式可用：${paths.baseDir}`,
            generated_at: 获取当前时间字符串(),
        });
    });

    router.post('/overview', async (req, res) => {
        const requestConfig = 读取请求配置(req);
        const paths = 构建路径集合(requestConfig.local_base_dir);
        const memoryState = 读取记忆列表(paths);
        const activeMemory = memoryState.active.activeName || '未找到可用 full log';
        const summary = [
            `基础目录：${paths.baseDir}`,
            `工作区：${fs.existsSync(paths.workspaceDir) ? '已找到' : '未找到'}`,
            `Memory：${fs.existsSync(paths.memoryDir) ? '已找到' : '未找到'}`,
            `accounts：${fs.existsSync(paths.accountsDir) ? '已找到' : '未找到'}`,
            `主配置：${fs.existsSync(paths.configPath) ? '已找到' : '未找到'}`,
        ].join('\n');

        res.json({
            mode_label: requestConfig.enable_http_mode ? '远端 HTTP 模式' : '本地路径模式',
            active_memory: activeMemory,
            summary,
            accounts_notice: 'accounts/ 将作为最高优先级备份对象，默认强制纳入备份。',
            generated_at: 获取当前时间字符串(),
        });
    });

    router.post('/config/main/read', async (req, res) => {
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        res.json({ ok: true, data: 读取JSON(paths.configPath, {}) });
    });

    router.post('/config/runtime/read', async (req, res) => {
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        res.json({ ok: true, data: 读取JSON(paths.runtimeConfigPath, {}) });
    });

    router.post('/workspace/read', async (req, res) => {
        const body = req.body || {};
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        const targetPath = 获取白名单文件路径(paths, body.file_key);
        if (!targetPath) {
            return res.status(400).json({ ok: false, error: '不支持的文件键。' });
        }

        const isJson = String(body.format || '').toLowerCase() === 'json';
        if (isJson) {
            return res.json({ ok: true, data: 读取JSON(targetPath, {}) });
        }

        res.json({ ok: true, data: 读取文本(targetPath, '') });
    });

    router.post('/workspace/save', async (req, res) => {
        const body = req.body || {};
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        const targetPath = 获取白名单文件路径(paths, body.file_key);
        if (!targetPath) {
            return res.status(400).json({ ok: false, error: '不支持的文件键。' });
        }

        if (String(body.format || '').toLowerCase() === 'json') {
            写入JSON(targetPath, body.data || {});
        } else {
            写入文本(targetPath, String(body.data || ''));
        }

        res.json({ ok: true, message: '文件已保存。', path: targetPath });
    });

    router.post('/memory/list', async (req, res) => {
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        res.json({ ok: true, data: 读取记忆列表(paths) });
    });

    router.post('/memory/read', async (req, res) => {
        const body = req.body || {};
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        const targetName = String(body.file_name || '').trim();
        if (!targetName || targetName.includes('/') || targetName.includes('\\')) {
            return res.status(400).json({ ok: false, error: '非法文件名。' });
        }

        const targetPath = path.join(paths.memoryDir, targetName);
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ ok: false, error: '目标记忆文件不存在。' });
        }

        res.json({
            ok: true,
            data: {
                file_name: targetName,
                content: 读取Jsonl文件(targetPath),
            },
        });
    });

    router.post('/memory/save', async (req, res) => {
        const body = req.body || {};
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        const targetName = String(body.file_name || '').trim();
        if (!验证记忆文件名(targetName)) {
            return res.status(400).json({ ok: false, error: '非法文件名。' });
        }

        const targetPath = path.join(paths.memoryDir, targetName);
        const metadata = body.metadata || null;
        const items = Array.isArray(body.items) ? body.items : [];
        写入文本(targetPath, 序列化Jsonl(metadata, items));
        res.json({ ok: true, message: '记忆文件已保存。' });
    });

    router.post('/memory/activate', async (req, res) => {
        const body = req.body || {};
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        const targetName = String(body.file_name || '').trim();
        if (!验证记忆文件名(targetName)) {
            return res.status(400).json({ ok: false, error: '非法文件名。' });
        }

        const targetPath = path.join(paths.memoryDir, targetName);
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ ok: false, error: '目标记忆文件不存在。' });
        }

        写入JSON(paths.activeMemoryPath, {
            active_full_log: targetName,
            updated_at: 获取当前时间字符串(),
        });
        res.json({ ok: true, message: '当前启用的 Memory 文件已更新。', file_name: targetName });
    });

    router.post('/sensor/map/read', async (req, res) => {
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        res.json({ ok: true, data: 读取JSON(paths.sensorMapPath, {}) });
    });

    router.post('/sensor/map/save', async (req, res) => {
        const body = req.body || {};
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        写入JSON(paths.sensorMapPath, body.data || {});
        res.json({ ok: true, message: 'sensor_map.json 已保存。' });
    });

    router.post('/backup/create', async (req, res) => {
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        const backupRoot = path.join(paths.baseDir, 'backups');
        const timestamp = 获取当前时间字符串().replace(/[.:]/g, '-');
        const backupDir = path.join(backupRoot, timestamp);
        fs.mkdirSync(backupDir, { recursive: true });

        const copyTargets = [
            { source: paths.accountsDir, name: 'accounts' },
            { source: paths.configPath, name: 'config.json' },
            { source: paths.sensorMapPath, name: 'sensor_map.json' },
            { source: paths.workspaceDir, name: 'workspace' },
            { source: paths.memoryDir, name: 'Memory' },
        ];

        const copied = [];
        const skipped = [];
        for (const item of copyTargets) {
            if (!fs.existsSync(item.source)) {
                skipped.push(item.name);
                continue;
            }
            const destination = path.join(backupDir, item.name);
            fs.cpSync(item.source, destination, { recursive: true });
            copied.push(item.name);
        }

        const manifest = {
            created_at: 获取当前时间字符串(),
            base_dir: paths.baseDir,
            copied,
            skipped,
            highest_priority: 'accounts',
        };
        写入JSON(path.join(backupDir, 'manifest.json'), manifest);

        res.json({
            ok: true,
            message: '备份已创建。',
            data: {
                name: path.basename(backupDir),
                copied,
                skipped,
            },
        });
    });

    router.post('/backup/list', async (req, res) => {
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        const backupRoot = path.join(paths.baseDir, 'backups');
        if (!fs.existsSync(backupRoot)) {
            return res.json({ ok: true, items: [] });
        }

        const items = fs.readdirSync(backupRoot)
            .map(name => {
                const dirPath = path.join(backupRoot, name);
                if (!fs.statSync(dirPath).isDirectory()) return null;
                const manifest = 读取JSON(path.join(dirPath, 'manifest.json'), {});
                return {
                    name,
                    created_at: manifest.created_at || new Date(fs.statSync(dirPath).mtimeMs).toISOString(),
                    copied: manifest.copied || [],
                    highest_priority: manifest.highest_priority || 'accounts',
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        res.json({ ok: true, items });
    });

    router.post('/backup/restore', async (req, res) => {
        const body = req.body || {};
        const paths = 构建路径集合(读取请求配置(req).local_base_dir);
        const backupName = String(body.backup_name || '').trim();
        if (!backupName || backupName.includes('/') || backupName.includes('\\')) {
            return res.status(400).json({ ok: false, error: '非法备份名称。' });
        }

        const backupDir = path.join(paths.baseDir, 'backups', backupName);
        if (!fs.existsSync(backupDir) || !fs.statSync(backupDir).isDirectory()) {
            return res.status(404).json({ ok: false, error: '备份目录不存在。' });
        }

        const restoreTargets = [
            { source: path.join(backupDir, 'accounts'), destination: paths.accountsDir, name: 'accounts' },
            { source: path.join(backupDir, 'config.json'), destination: paths.configPath, name: 'config.json' },
            { source: path.join(backupDir, 'sensor_map.json'), destination: paths.sensorMapPath, name: 'sensor_map.json' },
            { source: path.join(backupDir, 'workspace'), destination: paths.workspaceDir, name: 'workspace' },
            { source: path.join(backupDir, 'Memory'), destination: paths.memoryDir, name: 'Memory' },
        ];

        const restored = [];
        const skipped = [];
        for (const item of restoreTargets) {
            if (!fs.existsSync(item.source)) {
                skipped.push(item.name);
                continue;
            }
            if (fs.existsSync(item.destination)) {
                fs.rmSync(item.destination, { recursive: true, force: true });
            }
            fs.cpSync(item.source, item.destination, { recursive: true });
            restored.push(item.name);
        }

        res.json({
            ok: true,
            message: '备份已恢复。accounts/ 已按最高优先级一并恢复。',
            data: { restored, skipped },
        });
    });
}

async function exit() {
    return Promise.resolve();
}

module.exports = {
    init,
    exit,
    info: 插件信息,
};
