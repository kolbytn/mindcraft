import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('dependencies patched by patch-package are pinned to their patch versions', () => {
    assert.equal(pkg.dependencies['minecraft-data'], '3.97.0');
    assert.equal(pkg.dependencies.mineflayer, '4.33.0');
    assert.equal(pkg.dependencies['mineflayer-pathfinder'], '2.4.5');
    assert.equal(pkg.dependencies['mineflayer-pvp'], '1.3.2');
    assert.equal(pkg.dependencies['prismarine-viewer'], '1.33.0');
    assert.equal(pkg.overrides.protodef, '1.19.0');
});
