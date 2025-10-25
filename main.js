import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';

/**
 * コマンドライン引数をyargsを使ってパースします。
 * @returns {object} パースされた引数オブジェクト。
 */
function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}

// --- 引数と環境変数の処理 ---

const args = parseArguments();

// コマンドライン引数の適用
if (args.profiles) {
    settings.profiles = args.profiles;
}
if (args.task_path) {
    // タスクファイルを読み込み、指定されたタスクを抽出
    const tasks = JSON.parse(readFileSync(args.task_path, 'utf8'));
    if (args.task_id) {
        settings.task = tasks[args.task_id];
        // タスクIDをタスクオブジェクトに注入
        if (settings.task) {
             settings.task.task_id = args.task_id;
        } else {
             throw new Error(`Task ID '${args.task_id}' not found in task file.`);
        }
    }
    else {
        throw new Error('task_id is required when task_path is provided');
    }
}

// 環境変数を適用し、既存の設定を上書き
if (process.env.MINECRAFT_PORT) {
    settings.port = process.env.MINECRAFT_PORT;
}
if (process.env.MINDSERVER_PORT) {
    settings.mindserver_port = process.env.MINDSERVER_PORT;
}
if (process.env.PROFILES) {
    try {
        const envProfiles = JSON.parse(process.env.PROFILES);
        if (Array.isArray(envProfiles) && envProfiles.length > 0) {
            settings.profiles = envProfiles;
        }
    } catch (e) {
        console.error('Error parsing PROFILES environment variable:', e.message);
    }
}
if (process.env.INSECURE_CODING) {
    settings.allow_insecure_coding = true;
}
if (process.env.BLOCKED_ACTIONS) {
    try {
        settings.blocked_actions = JSON.parse(process.env.BLOCKED_ACTIONS);
    } catch (e) {
        console.error('Error parsing BLOCKED_ACTIONS environment variable:', e.message);
    }
}
if (process.env.MAX_MESSAGES) {
    // 文字列として受け取った値を数値に変換
    settings.max_messages = Number(process.env.MAX_MESSAGES);
}
if (process.env.NUM_EXAMPLES) {
    // 文字列として受け取った値を数値に変換
    settings.num_examples = Number(process.env.NUM_EXAMPLES);
}
if (process.env.LOG_ALL) {
    // 環境変数の値をブール値として解釈
    settings.log_all_prompts = process.env.LOG_ALL === 'true' || process.env.LOG_ALL === '1';
}

// --- Mindcraftの初期化とエージェントの作成 ---

// Mindcraftのコアサービスを初期化
Mindcraft.init(false, settings.mindserver_port, settings.auto_open_ui);

// 全てのプロファイルパスを反復処理し、それぞれを読み込んで固有のエージェントインスタンスを作成します。
for (const profilePath of settings.profiles) {
    console.log(`Loading profile from: ${profilePath}`);

    try {
        // プロファイル設定ファイルを読み込み
        const profile_json = JSON.parse(readFileSync(profilePath, 'utf8'));

        // 現在のエージェントのための新しい、個別の設定オブジェクトを作成します。
        // これにより、グローバルな`settings`オブジェクト内の一つのプロファイルオブジェクトが、
        // 異なるエージェントの初期化フェーズで共有・変異することを防ぎます。
        const agentSettings = {
            ...settings, // ベース設定をコピー
            profile: profile_json // このエージェント固有のプロファイルを注入
        };

        // 専用の設定でエージェントを作成
        Mindcraft.createAgent(agentSettings);
        console.log(`Agent created for profile: ${profilePath}`);

    } catch (error) {
        console.error(`Failed to load or create agent for profile path: ${profilePath}. Error: ${error.message}`);
        // アプリケーションを停止せずに次のプロファイルへ続行
    }
}

// プロファイルが読み込まれなかった場合の警告
if (settings.profiles.length === 0) {
    console.warn("No agent profiles were provided or loaded. No agents were created.");
}
