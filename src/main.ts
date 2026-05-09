import Phaser from 'phaser';
import { config } from './config';
import { validateUnitDefinitions } from './core/unitDefinitionValidator';

validateUnitDefinitions();
new Phaser.Game(config);
