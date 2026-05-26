import { appendFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import settings from '../../settings.js';

const ACTION_LOG_STATE = Symbol.for('mindcraft.actionLogState');

export function isActionLoggingEnabled() {
    return Boolean(settings.action_logging ?? settings.action_logging_enabled ?? false);
}

function timestampForFilename(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function safeName(name, fallback = 'andy') {
    return String(name || fallback).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getBotLogDirectory(bot) {
    const botName = safeName(bot?.username || bot?.name);
    return path.join('.', 'bots', botName, 'logs');
}

function getActionLogPath(bot) {
    if (!bot[ACTION_LOG_STATE]) {
        const logDir = getBotLogDirectory(bot);
        mkdirSync(logDir, { recursive: true });
        const logPath = path.resolve(logDir, `log_${timestampForFilename()}.txt`);
        writeFileSync(logPath, '', 'utf8');
        bot[ACTION_LOG_STATE] = { logPath };
    }
    return bot[ACTION_LOG_STATE].logPath;
}

function blockCoord(coord) {
    if (!coord) return null;
    return {
        x: Math.floor(coord.x),
        y: Math.floor(coord.y),
        z: Math.floor(coord.z),
    };
}

function entityPosition(bot) {
    const pos = bot?.entity?.position;
    if (!pos) return null;
    return { x: pos.x, y: pos.y, z: pos.z };
}

function standingState(bot) {
    const pos = bot?.entity?.position;
    if (!pos) {
        return { position: null, blockName: 'unknown' };
    }
    const standing = {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y - 0.01),
        z: Math.floor(pos.z),
    };
    const blockName = blockNameAt(bot, standing);
    return { position: standing, blockName };
}

function blockNameAt(bot, coord) {
    if (!bot || !coord) return 'unknown';
    try {
        const pos = {
            x: Math.floor(coord.x),
            y: Math.floor(coord.y),
            z: Math.floor(coord.z),
        };
        pos.floor = () => pos;
        pos.floored = () => pos;
        const block = bot.blockAt(pos);
        return block?.name || 'unknown';
    } catch (_) {
        return 'unknown';
    }
}

function heldItemName(bot) {
    return bot?.heldItem?.name || 'none';
}

function getSneakState(bot) {
    if (typeof bot?.getControlState === 'function') {
        return Boolean(bot.getControlState('sneak'));
    }
    return Boolean(bot?.controlState?.sneak);
}

function getBotTick(bot) {
    const candidates = [bot?.time?.age, bot?.time?.time, bot?.time?.timeOfDay];
    return candidates.find(value => Number.isFinite(value)) ?? 'unknown';
}

function radToDeg(radians) {
    return radians * 180 / Math.PI;
}

function actualYawDegrees(bot) {
    return Number.isFinite(bot?.entity?.yaw) ? radToDeg(bot.entity.yaw) : null;
}

function actualPitchDegrees(bot) {
    return Number.isFinite(bot?.entity?.pitch) ? radToDeg(bot.entity.pitch) : null;
}

function actionValue(value) {
    if (value === null || value === undefined || value === '') return 'unknown';
    return String(value);
}

function intCoordText(coord) {
    if (!coord) return 'unknown';
    return `[${Math.floor(coord.x)},${Math.floor(coord.y)},${Math.floor(coord.z)}]`;
}

function floatText(value, precision = 6) {
    return Number.isFinite(value) ? Number(value).toFixed(precision) : 'unknown';
}

function floatCoordText(coord, precision = 6) {
    if (!coord) return 'unknown';
    return `[${floatText(coord.x, precision)},${floatText(coord.y, precision)},${floatText(coord.z, precision)}]`;
}

function actionNumber(value, precision = 3) {
    return Number.isFinite(value) ? Number(value).toFixed(precision) : 'unknown';
}

export function faceNameFromVector(vec) {
    if (!vec) return 'unknown';
    if (vec.x === 1 && vec.y === 0 && vec.z === 0) return 'east';
    if (vec.x === -1 && vec.y === 0 && vec.z === 0) return 'west';
    if (vec.x === 0 && vec.y === 1 && vec.z === 0) return 'up';
    if (vec.x === 0 && vec.y === -1 && vec.z === 0) return 'down';
    if (vec.x === 0 && vec.y === 0 && vec.z === 1) return 'south';
    if (vec.x === 0 && vec.y === 0 && vec.z === -1) return 'north';
    return 'unknown';
}

export function formatActionLogLine(record) {
    return [
        `ACTION ${record.type}`,
        `item=${actionValue(record.item)}`,
        `previous_block=${actionValue(record.previousBlock)}`,
        `result_block=${actionValue(record.resultBlock)}`,
        `result_coord=${intCoordText(record.resultCoord)}`,
        `clicked_block=${intCoordText(record.clickedBlock)}`,
        `clicked_face=${actionValue(record.clickedFace)}`,
        `player_pos=${floatCoordText(record.playerPos, 6)}`,
        `yaw=${actionNumber(record.yaw, 3)}`,
        `pitch=${actionNumber(record.pitch, 3)}`,
        `sneaking=${record.sneaking === null || record.sneaking === undefined ? 'unknown' : String(Boolean(record.sneaking))}`,
        `standing_on=${intCoordText(record.standingOn)}`,
        `standing_on_block=${actionValue(record.standingOnBlock)}`,
        `hand=${actionValue(record.hand)}`,
        `tick=${actionValue(record.tick)}`,
        `timestamp=${actionValue(record.timestamp)}`,
    ].join(' ');
}

export function appendActionLog(bot, action) {
    if (!bot || !isActionLoggingEnabled()) {
        return false;
    }

    try {
        const standing = standingState(bot);
        const resultCoord = blockCoord(action.resultCoord);
        const record = {
            type: action.type,
            item: action.item || heldItemName(bot),
            previousBlock: action.previousBlock,
            resultBlock: action.resultBlock ?? blockNameAt(bot, resultCoord),
            resultCoord,
            clickedBlock: blockCoord(action.clickedBlock),
            clickedFace: action.clickedFace,
            playerPos: entityPosition(bot),
            yaw: actualYawDegrees(bot),
            pitch: actualPitchDegrees(bot),
            sneaking: getSneakState(bot),
            standingOn: standing.position,
            standingOnBlock: standing.blockName,
            hand: action.hand || 'main_hand',
            tick: getBotTick(bot),
            timestamp: new Date().toISOString(),
        };
        appendFileSync(getActionLogPath(bot), `${formatActionLogLine(record)}\n`, 'utf8');
        return true;
    } catch (error) {
        console.warn(`Failed to append action log: ${error.message}`);
        return false;
    }
}
