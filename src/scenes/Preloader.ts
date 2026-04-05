import Phaser from 'phaser';

export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  preload(): void {
    // No external assets — everything is procedural
  }

  create(): void {
    this.scene.start('Game');
  }
}
