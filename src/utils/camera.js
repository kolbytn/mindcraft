import { Viewer } from 'prismarine-viewer/viewer/lib/viewer.js';
import { WorldView } from 'prismarine-viewer/viewer/lib/worldview.js';
import { getBufferFromStream } from 'prismarine-viewer/viewer/lib/simpleUtils.js';

import THREE from 'three';
import { createCanvas } from 'node-canvas-webgl/lib/index.js';
import fs from 'fs/promises';
import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';

import worker_threads from 'worker_threads';
global.Worker = worker_threads.Worker;


export class Camera extends EventEmitter {
    constructor (bot) {
      super()
      this.bot = bot
      this.viewDistance = 4
      this.width = 800
      this.height = 512
      this.canvas = createCanvas(this.width, this.height)
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas })
      this.viewer = new Viewer(this.renderer)
      this._init().then(() => {
        this.emit('ready')
      })
    }
  
    async _init () {
      const botPos = this.bot.entity.position
      const center = new Vec3(botPos.x, botPos.y+this.bot.entity.height, botPos.z)
      this.viewer.setVersion(this.bot.version)      
      // Load world
      const worldView = new WorldView(this.bot.world, this.viewDistance, center)
      this.viewer.listen(worldView)
  
      this.viewer.camera.position.set(center.x, center.y, center.z)
  
      await worldView.init(center)
    }
  
    async captureTargetPoint(x, y, z) {  
        this.viewer.camera.lookAt(x, y, z);
        const filename = await this._capture();
        return filename;
    }
  
    async captureDirection(yaw, pitch) {
        this.viewer.camera.rotation.y = yaw;
        this.viewer.camera.rotation.x = pitch;
        const filename = await this._capture();
        return filename;
    }

    async _capture() {
        console.info('Waiting for camera to load');
        await new Promise(resolve => setTimeout(resolve, 5000));
        this.renderer.render(this.viewer.scene, this.viewer.camera);

        const imageStream = this.canvas.createJPEGStream({
            bufsize: 4096,
            quality: 100,
            progressive: false
        });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot_${timestamp}`;

        const buf = await getBufferFromStream(imageStream);
        await this._ensureScreenshotDirectory();
        await fs.writeFile(`bots/${this.bot.username}/screenshots/${filename}.jpg`, buf);
        console.log('saved', filename);
        return filename;
    }

    async _ensureScreenshotDirectory() {
        let stats;
        try {
            stats = await fs.stat(`bots/${this.bot.username}/screenshots`);
        } catch (e) {
            if (!stats?.isDirectory()) {
                await fs.mkdir(`bots/${this.bot.username}/screenshots`);
            }
        }
    }
}
  